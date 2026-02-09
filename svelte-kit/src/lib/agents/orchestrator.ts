import { z } from 'zod';
import { callGemini, callGeminiStream, parseGeminiJson } from '$lib/utils/gemini';
import { readAgent } from './readAgent';
import { rememberAgent } from './rememberAgent';
import { writeAgent } from './writeAgent';
import { findItAgent } from './findItAgent';
import { sayAgent } from './sayAgent.server';
import { seeAgent } from './seeAgent';
import { getMemorySummary, processConversation } from '$lib/memory';
import {
	verify,
	hasObviousFailure,
	type VerificationStatus,
	type ActionResultItem
} from './verification';
import { selectThinkingLevel } from '$lib/utils/thinkingLevels';
import { analyzeTaskComplexity } from './taskComplexity';

/**
 * Orchestrator input
 */
export const OrchestratorInputSchema = z.object({
	userInput: z.string().min(1, 'Input cannot be empty'),
	userId: z.string().min(1, 'User ID required'),
	conversationHistory: z.array(z.record(z.string(), z.unknown())).optional().default([])
});

export type OrchestratorInput = z.infer<typeof OrchestratorInputSchema>;

/**
 * Orchestrator output
 */
export interface OrchestratorOutput {
	response: string;
	agentsUsed: string[];
	thoughtSignature?: string;
	actions: Array<{
		agent: string;
		action: string;
		result: unknown;
	}>;
}

/** Events yielded by processStream (NDJSON over the wire) */
export type OrchestratorStreamEvent =
	| { type: 'meta'; agentsUsed: string[]; actions: OrchestratorOutput['actions'] }
	| { type: 'chunk'; text: string }
	| { type: 'done'; thoughtSignature?: string }
	| { type: 'error'; message: string };

/** Planner action params (Gemini may omit or vary) */
interface PlannerActionParams {
	text?: string;
	speed?: 'slow' | 'normal' | 'fast';
	format?: 'plain' | 'structured';
	task?: string;
	time?: string;
	topic?: string;
	tone?: string;
	context?: string;
	name?: string;
	scheduleText?: string;
	isCritical?: boolean;
	title?: string;
	appointmentTime?: string;
	description?: string;
	location?: string;
	days?: number;
	query?: string;
	imageBase64?: string;
	mimeType?: string;
	medicineName?: string;
}

/** Planner action; optional parallelGroup groups actions that can run in parallel (same number = same batch). */
export interface PlannerAction {
	agent: string;
	action: string;
	params?: PlannerActionParams;
	parallelGroup?: number;
}

/** Planner JSON shape from Gemini (exported for UI and API) */
export interface PlannerPlan {
	agents: string[];
	reasoning?: string;
	actions: Array<PlannerAction>;
}

/** Events yielded by processIterative (SSE/NDJSON) */
export type OrchestratorIterativeEvent =
	| { type: 'plan'; plan: PlannerPlan; iteration: number }
	| { type: 'iteration_start'; iteration: number; maxIterations: number }
	| { type: 'action_result'; agent: string; action: string; result: unknown; iteration: number }
	| {
			type: 'iteration_complete';
			iteration: number;
			actions: ActionResultItem[];
			tasksComplete: boolean;
			reasoning?: string;
	  }
	| { type: 'verification'; iteration: number; status: VerificationStatus }
	| { type: 'chunk'; text: string }
	| { type: 'done'; finalResponse: string; totalIterations: number; thoughtSignature?: string }
	| { type: 'error'; message: string }
	| { type: 'marathon_suggestion'; reasoning: string; userGuidance?: string }
	| { type: 'parallel_start'; actions: Array<{ agent: string; action: string }>; iteration: number }
	| { type: 'parallel_complete'; results: ActionResultItem[]; iteration: number };

/**
 * Normalize agent names coming from the planner so we can
 * robustly match them against implemented agents.
 */
function normalizeAgentName(agent: string): string {
	const trimmed = agent.trim();

	// Allow names like "Read-To-Me Agent" to map to "Read-To-Me"
	if (trimmed.endsWith(' Agent')) {
		return trimmed.slice(0, -' Agent'.length);
	}

	return trimmed;
}

/** Group actions into batches: same parallelGroup runs in parallel; no group or different = sequential. */
function groupActionsIntoBatches(actions: PlannerAction[]): PlannerAction[][] {
	const batches: PlannerAction[][] = [];
	let currentBatch: PlannerAction[] = [];
	let currentGroup: number | undefined = undefined;
	for (const action of actions) {
		const g = action.parallelGroup;
		if (g === undefined) {
			if (currentBatch.length) {
				batches.push(currentBatch);
				currentBatch = [];
				currentGroup = undefined;
			}
			batches.push([action]);
		} else if (g === currentGroup && currentBatch.length) {
			currentBatch.push(action);
		} else {
			if (currentBatch.length) batches.push(currentBatch);
			currentBatch = [action];
			currentGroup = g;
		}
	}
	if (currentBatch.length) batches.push(currentBatch);
	return batches;
}

/** Shared agent descriptions and proactive-use rules for planner prompts. */
const ORCHESTRATOR_AGENTS_PROMPT = `1. Read-To-Me Agent: Read text aloud, OCR images.
2. Write-For-Me Agent: Write emails, correct grammar, adjust tone, compose letters. Use compose_email with topic and tone (e.g. formal letter to doctor).
3. Find-It Agent: Search web or drug info. Use web_search (params: query or text) or search_drug_info (params: medicineName—can be name OR description like "white round pill", context?). For unknown medicine use search_drug_info with user's description.
4. Remember-For-Me Agent: Create reminders, track tasks, log medications. Use create_medication to log medicine taken (even unknown—use name "Unknown medicine"); create_reminder, create_appointment, list_medications.
5. Say-It-For-Me Agent: Text-to-speech. Use speak_message with text (e.g. safety advice, emergency guidance).
6. See-For-Me Agent: Vision and medicine ID. identify_medicine (params: imageBase64, mimeType?) only when user HAS provided a pill/label image. Without image: tell user to capture image in next message.
7. Hear-For-Me Agent: Real-time audio. Direct user to Hear-For-Me panel.

PROACTIVE USE: When user mentions unknown/unidentified medicine, emergency, or safety concern, USE multiple agents: Remember-For-Me to log (create_medication "Unknown medicine"), Find-It search_drug_info if any details, Write-For-Me to draft doctor letter (compose_email topic "Unknown medicine incident"), Say-It-For-Me for safety message. Then in your response guide user to capture medicine image or seek help if symptoms.`;

/**
 * Multi-Agent Orchestrator
 *
 * Purpose: Coordinate multiple agents to accomplish complex tasks
 * Key Feature: Uses thought signatures to maintain context across agents
 */
export class Orchestrator {
	private conversationHistory: Map<
		string,
		Array<{ role: 'user' | 'model'; parts: Array<{ text: string; thoughtSignature?: string }> }>
	> = new Map();

	/**
	 * Process user input and coordinate agents
	 */
	async process(input: OrchestratorInput): Promise<OrchestratorOutput> {
		const validatedInput = OrchestratorInputSchema.parse(input);

		const history = this.conversationHistory.get(validatedInput.userId) || [];
		let memoryContext = '';
		try {
			const summary = await getMemorySummary(validatedInput.userId, validatedInput.userInput);
			const recent = summary.recentMemories.map((m) => `- ${m.text_content}`).join('\n');
			memoryContext = [
				summary.activeGoals.length
					? `Active goals: ${summary.activeGoals.map((g) => g.title).join('; ')}`
					: '',
				summary.pendingTodos.length
					? `Pending todos: ${summary.pendingTodos.map((t) => t.task).join('; ')}`
					: '',
				Object.keys(summary.preferences).length
					? `Known preferences: ${JSON.stringify(summary.preferences)}`
					: '',
				recent ? `Relevant past context:\n${recent}` : ''
			]
				.filter(Boolean)
				.join('\n');
		} catch (e) {
			console.warn('[orchestrator] memory summary failed', e);
		}

		const systemPrompt = `You are an orchestrator for DailyAssist, coordinating AI agents.
${memoryContext ? `\nUser context (use for personalization):\n${memoryContext}\n` : ''}
${ORCHESTRATOR_AGENTS_PROMPT}

Your job: Decide which agent(s) to use based on user intent. For unknown medicine or safety concerns, use multiple agents proactively (Remember, Find-It, Write, Say).
Available agents: Read-To-Me, Write-For-Me, Remember-For-Me, Find-It, Say-It-For-Me, See-For-Me (direct to panel), Hear-For-Me (direct to panel)

Output JSON (IMPORTANT: return ONLY raw JSON, no markdown, no code fences, no comments):
{
  "agents": ["agent_name"],
  "reasoning": "why these agents",
  "actions": [
    {"agent": "agent_name", "action": "specific_action", "params": {...}}
  ]
}`;

		try {
			const planningResult = await callGemini({
				prompt: `User request: "${validatedInput.userInput}"

What agents should I use? What actions should they take?`,
				model: 'gemini-3-pro-preview',
				thinkingLevel: selectThinkingLevel('orchestration_plan'),
				systemPrompt,
				conversationHistory: history
			});

			// Parse plan (Gemini may sometimes respond with fenced JSON)
			const plan = parseGeminiJson(planningResult.text) as PlannerPlan;

			// Step 2: Execute agent actions
			const actions: OrchestratorOutput['actions'] = [];

			for (const action of plan.actions) {
				let result;
				const agentName = normalizeAgentName(action.agent);
				const params = action.params;

				switch (agentName) {
					case 'Read-To-Me':
						if (action.action === 'read_text' && params?.text?.trim()) {
							result = await readAgent.read({
								text: params.text.trim(),
								speed: params.speed ?? 'normal',
								format: params.format ?? 'plain'
							});
						}
						break;

					case 'Remember-For-Me':
						if (action.action === 'create_reminder') {
							result = await rememberAgent.createReminder({
								action: 'create_reminder',
								task: params?.task,
								time: params?.time,
								userId: validatedInput.userId
							});
						} else if (action.action === 'list_reminders') {
							result = await rememberAgent.listReminders(validatedInput.userId);
						} else if (action.action === 'create_medication') {
							result = await rememberAgent.createMedication({
								userId: validatedInput.userId,
								name: params?.name ?? '',
								scheduleText: params?.scheduleText,
								isCritical: params?.isCritical
							});
						} else if (action.action === 'create_appointment') {
							result = await rememberAgent.createAppointment({
								userId: validatedInput.userId,
								title: params?.title ?? '',
								appointmentTime: params?.appointmentTime ?? '',
								description: params?.description,
								location: params?.location
							});
						} else if (action.action === 'list_medications') {
							result = await rememberAgent.listMedications(validatedInput.userId);
						} else if (action.action === 'list_appointments') {
							result = await rememberAgent.listAppointments(validatedInput.userId, params?.days);
						} else if (action.action === 'analyze_patterns') {
							result = await rememberAgent.analyzePatterns(
								validatedInput.userId,
								validatedInput.conversationHistory as Array<{
									role: string;
									parts?: Array<{ text: string }>;
								}>
							);
						}
						break;

					case 'Write-For-Me':
						if (action.action === 'compose_email') {
							result = await writeAgent.composeEmail({
								topic: params?.topic ?? params?.text ?? validatedInput.userInput,
								tone:
									(params?.tone as
										| 'formal'
										| 'casual'
										| 'friendly'
										| 'professional'
										| 'persuasive') ?? 'professional',
								context: params?.context,
								userId: validatedInput.userId
							});
						} else if (action.action === 'correct_grammar' && params?.text?.trim()) {
							result = { correctedText: await writeAgent.correctGrammar(params.text.trim()) };
						} else if (action.action === 'adjust_tone' && params?.text?.trim()) {
							result = {
								adjustedText: await writeAgent.adjustTone(
									params.text.trim(),
									(params?.tone as
										| 'formal'
										| 'casual'
										| 'friendly'
										| 'professional'
										| 'persuasive') ?? 'professional'
								)
							};
						}
						break;

					case 'See-For-Me':
						result = {
							message:
								'Use the See-For-Me panel to start your camera for real-time scene description, object detection, and danger alerts. Open the See-For-Me section and tap Start.'
						};
						break;

					case 'Hear-For-Me':
						result = {
							message:
								'Use the Hear-For-Me panel to start your microphone for real-time transcription, sound detection (doorbell, alarm, etc.), and speaker identification. Open the Hear-For-Me section and tap Start.'
						};
						break;

					case 'Find-It':
						if (action.action === 'web_search') {
							result = await findItAgent.webSearch({
								query: (params?.query ?? params?.text ?? validatedInput.userInput) as string,
								userId: validatedInput.userId
							});
						} else if (action.action === 'search_files') {
							result = await findItAgent.searchFiles({
								query: params?.text,
								userId: validatedInput.userId
							});
						} else if (action.action === 'locate_document') {
							result = await findItAgent.locateDocument({
								name: params?.name ?? params?.text,
								userId: validatedInput.userId
							});
						} else if (action.action === 'list_directory') {
							result = await findItAgent.listDirectory({
								path: params?.task,
								userId: validatedInput.userId
							});
						}
						break;

					case 'Say-It-For-Me':
						if (
							action.action === 'speak_message' &&
							(params?.text?.trim() ?? validatedInput.userInput.trim())
						) {
							result = await sayAgent.speak({
								text: (params?.text ?? validatedInput.userInput) as string,
								emotion: 'neutral',
								userId: validatedInput.userId
							});
						}
						break;

					default:
						result = { error: `Agent ${action.agent} not implemented yet` };
				}

				actions.push({
					agent: agentName,
					action: action.action,
					result
				});
			}

			// Step 3: Synthesize final response
			const synthesisResult = await callGemini({
				prompt: `User asked: "${validatedInput.userInput}"

I executed these actions:
${JSON.stringify(actions, null, 2)}

Provide a natural, helpful response to the user explaining what was done.`,
				model: 'gemini-3-flash-preview',
				thinkingLevel: selectThinkingLevel('synthesis'),
				conversationHistory: [
					...history,
					{
						role: 'user',
						parts: [
							{
								text: validatedInput.userInput,
								thoughtSignature: planningResult.thoughtSignature
							}
						]
					}
				]
			});

			// Update conversation history
			history.push(
				{ role: 'user', parts: [{ text: validatedInput.userInput }] },
				{
					role: 'model',
					parts: [
						{
							text: synthesisResult.text,
							thoughtSignature: synthesisResult.thoughtSignature
						}
					]
				}
			);
			this.conversationHistory.set(validatedInput.userId, history);

			try {
				await processConversation({
					userId: validatedInput.userId,
					messages: [
						{ role: 'user', content: validatedInput.userInput },
						{ role: 'model', content: synthesisResult.text }
					]
				});
			} catch (e) {
				console.warn('[orchestrator] processConversation failed', e);
			}

			return {
				response: synthesisResult.text,
				agentsUsed: plan.agents,
				thoughtSignature: synthesisResult.thoughtSignature,
				actions
			};
		} catch (error) {
			console.error('Orchestrator error:', error);
			throw new Error(
				`Orchestration failed: ${error instanceof Error ? error.message : 'Unknown error'}`
			);
		}
	}

	/**
	 * Process user input and stream the final synthesis; yields meta then chunks then done.
	 * Planning and agent execution run first (non-streaming), then synthesis streams.
	 */
	async *processStream(
		input: OrchestratorInput
	): AsyncGenerator<OrchestratorStreamEvent, void, undefined> {
		const validatedInput = OrchestratorInputSchema.parse(input);
		const history = this.conversationHistory.get(validatedInput.userId) || [];
		let memoryContext = '';
		try {
			const summary = await getMemorySummary(validatedInput.userId, validatedInput.userInput);
			memoryContext = [
				summary.activeGoals.length
					? `Goals: ${summary.activeGoals.map((g) => g.title).join('; ')}`
					: '',
				summary.pendingTodos.length
					? `Todos: ${summary.pendingTodos.map((t) => t.task).join('; ')}`
					: '',
				summary.recentMemories.length
					? `Relevant: ${summary.recentMemories.map((m) => m.text_content).join(' | ')}`
					: ''
			]
				.filter(Boolean)
				.join('\n');
		} catch {
			// ignore
		}

		const systemPrompt = `You are an orchestrator for DailyAssist, coordinating AI agents.
${memoryContext ? `\nUser context:\n${memoryContext}\n` : ''}
${ORCHESTRATOR_AGENTS_PROMPT}

Your job: Decide which agent(s) to use based on user intent. For unknown medicine or safety concerns, use multiple agents proactively (Remember, Find-It, Write, Say).
Available agents: Read-To-Me, Write-For-Me, Remember-For-Me, Find-It, Say-It-For-Me, See-For-Me (direct to panel), Hear-For-Me (direct to panel)

Output JSON (IMPORTANT: return ONLY raw JSON, no markdown, no code fences, no comments):
{
  "agents": ["agent_name"],
  "reasoning": "why these agents",
  "actions": [
    {"agent": "agent_name", "action": "specific_action", "params": {...}}
  ]
}`;

		try {
			const planningResult = await callGemini({
				prompt: `User request: "${validatedInput.userInput}"

What agents should I use? What actions should they take?`,
				model: 'gemini-3-pro-preview',
				thinkingLevel: selectThinkingLevel('orchestration_plan'),
				systemPrompt,
				conversationHistory: history
			});

			const plan = parseGeminiJson(planningResult.text) as PlannerPlan;
			const actions: OrchestratorOutput['actions'] = [];

			for (const action of plan.actions) {
				let result;
				const agentName = normalizeAgentName(action.agent);
				const params = action.params;

				switch (agentName) {
					case 'Read-To-Me':
						if (action.action === 'read_text' && params?.text?.trim()) {
							result = await readAgent.read({
								text: params.text.trim(),
								speed: params.speed ?? 'normal',
								format: params.format ?? 'plain'
							});
						}
						break;

					case 'Remember-For-Me':
						if (action.action === 'create_reminder') {
							result = await rememberAgent.createReminder({
								action: 'create_reminder',
								task: params?.task,
								time: params?.time,
								userId: validatedInput.userId
							});
						} else if (action.action === 'list_reminders') {
							result = await rememberAgent.listReminders(validatedInput.userId);
						} else if (action.action === 'create_medication') {
							result = await rememberAgent.createMedication({
								userId: validatedInput.userId,
								name: params?.name ?? '',
								scheduleText: params?.scheduleText,
								isCritical: params?.isCritical
							});
						} else if (action.action === 'create_appointment') {
							result = await rememberAgent.createAppointment({
								userId: validatedInput.userId,
								title: params?.title ?? '',
								appointmentTime: params?.appointmentTime ?? '',
								description: params?.description,
								location: params?.location
							});
						} else if (action.action === 'list_medications') {
							result = await rememberAgent.listMedications(validatedInput.userId);
						} else if (action.action === 'list_appointments') {
							result = await rememberAgent.listAppointments(validatedInput.userId, params?.days);
						} else if (action.action === 'analyze_patterns') {
							result = await rememberAgent.analyzePatterns(
								validatedInput.userId,
								validatedInput.conversationHistory as Array<{
									role: string;
									parts?: Array<{ text: string }>;
								}>
							);
						}
						break;

					case 'Write-For-Me':
						if (action.action === 'compose_email') {
							result = await writeAgent.composeEmail({
								topic: params?.topic ?? params?.text ?? validatedInput.userInput,
								tone:
									(params?.tone as
										| 'formal'
										| 'casual'
										| 'friendly'
										| 'professional'
										| 'persuasive') ?? 'professional',
								context: params?.context,
								userId: validatedInput.userId
							});
						} else if (action.action === 'correct_grammar' && params?.text?.trim()) {
							result = { correctedText: await writeAgent.correctGrammar(params.text.trim()) };
						} else if (action.action === 'adjust_tone' && params?.text?.trim()) {
							result = {
								adjustedText: await writeAgent.adjustTone(
									params.text.trim(),
									(params?.tone as
										| 'formal'
										| 'casual'
										| 'friendly'
										| 'professional'
										| 'persuasive') ?? 'professional'
								)
							};
						}
						break;

					case 'See-For-Me':
						result = {
							message:
								'Use the See-For-Me panel to start your camera for real-time scene description, object detection, and danger alerts. Open the See-For-Me section and tap Start.'
						};
						break;

					case 'Hear-For-Me':
						result = {
							message:
								'Use the Hear-For-Me panel to start your microphone for real-time transcription, sound detection, and speaker identification. Open the Hear-For-Me section and tap Start.'
						};
						break;

					case 'Find-It':
						if (action.action === 'web_search') {
							result = await findItAgent.webSearch({
								query: (params?.query ?? params?.text ?? validatedInput.userInput) as string,
								userId: validatedInput.userId
							});
						} else if (action.action === 'search_files') {
							result = await findItAgent.searchFiles({
								query: params?.text,
								userId: validatedInput.userId
							});
						} else if (action.action === 'locate_document') {
							result = await findItAgent.locateDocument({
								name: params?.name ?? params?.text,
								userId: validatedInput.userId
							});
						} else if (action.action === 'list_directory') {
							result = await findItAgent.listDirectory({
								path: params?.task,
								userId: validatedInput.userId
							});
						}
						break;

					case 'Say-It-For-Me':
						if (
							action.action === 'speak_message' &&
							(params?.text?.trim() ?? validatedInput.userInput.trim())
						) {
							result = await sayAgent.speak({
								text: (params?.text ?? validatedInput.userInput) as string,
								emotion: 'neutral',
								userId: validatedInput.userId
							});
						}
						break;

					default:
						result = { error: `Agent ${action.agent} not implemented yet` };
				}

				actions.push({
					agent: agentName,
					action: action.action,
					result
				});
			}

			yield { type: 'meta', agentsUsed: plan.agents, actions };

			const synthesisPrompt = `User asked: "${validatedInput.userInput}"

I executed these actions:
${JSON.stringify(actions, null, 2)}

Provide a natural, helpful response to the user explaining what was done.`;

			let fullText = '';
			let finalThoughtSignature: string | undefined;

			for await (const chunk of callGeminiStream({
				prompt: synthesisPrompt,
				model: 'gemini-3-flash-preview',
				thinkingLevel: selectThinkingLevel('synthesis'),
				conversationHistory: [
					...history,
					{
						role: 'user',
						parts: [
							{
								text: validatedInput.userInput,
								thoughtSignature: planningResult.thoughtSignature
							}
						]
					}
				]
			})) {
				if ('text' in chunk && chunk.text) {
					fullText += chunk.text;
					yield { type: 'chunk', text: chunk.text };
				}
				if ('done' in chunk && chunk.done) {
					finalThoughtSignature = chunk.thoughtSignature;
				}
			}

			history.push(
				{ role: 'user', parts: [{ text: validatedInput.userInput }] },
				{
					role: 'model',
					parts: [
						{
							text: fullText,
							thoughtSignature: finalThoughtSignature
						}
					]
				}
			);
			this.conversationHistory.set(validatedInput.userId, history);

			try {
				await processConversation({
					userId: validatedInput.userId,
					messages: [
						{ role: 'user', content: validatedInput.userInput },
						{ role: 'model', content: fullText }
					]
				});
			} catch {
				// ignore
			}

			yield { type: 'done', thoughtSignature: finalThoughtSignature };

			// Single structured log per stream completion
			console.info('[orchestrator] stream completed', {
				userId: validatedInput.userId,
				agentsCount: plan.agents?.length ?? 0
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			console.error('Orchestrator stream error:', message);
			yield { type: 'error', message };
		}
	}

	/**
	 * Iterative orchestration: plan -> execute -> verify -> loop until done or max iterations / stop.
	 * Yields events for UI (plan, action_result, verification, done).
	 */
	async *processIterative(
		input: OrchestratorInput,
		options: {
			maxIterations?: number;
			signal?: AbortSignal;
			allowMarathonSuggestion?: boolean;
		} = {}
	): AsyncGenerator<OrchestratorIterativeEvent, void, undefined> {
		const { maxIterations = 10, signal, allowMarathonSuggestion = false } = options;
		const validatedInput = OrchestratorInputSchema.parse(input);
		const history = this.conversationHistory.get(validatedInput.userId) || [];
		let memoryContext = '';
		try {
			const summary = await getMemorySummary(validatedInput.userId, validatedInput.userInput);
			const recent = summary.recentMemories.map((m) => `- ${m.text_content}`).join('\n');
			memoryContext = [
				summary.activeGoals.length
					? `Active goals: ${summary.activeGoals.map((g) => g.title).join('; ')}`
					: '',
				summary.pendingTodos.length
					? `Pending todos: ${summary.pendingTodos.map((t) => t.task).join('; ')}`
					: '',
				Object.keys(summary.preferences).length
					? `Known preferences: ${JSON.stringify(summary.preferences)}`
					: '',
				recent ? `Relevant past context:\n${recent}` : ''
			]
				.filter(Boolean)
				.join('\n');
		} catch {
			// ignore
		}

		const systemPrompt = `You are an orchestrator for DailyAssist, coordinating AI agents.
${memoryContext ? `\nUser context (use for personalization):\n${memoryContext}\n` : ''}
${ORCHESTRATOR_AGENTS_PROMPT}

Your job: Decide which agent(s) to use. If the task requires multiple steps, break into subtasks. For unknown medicine (e.g. "I gulped a medicine"), plan multiple actions: log with Remember-For-Me, search_drug_info if any description, draft letter with Write-For-Me, safety message with Say-It-For-Me.
Optional: add "parallelGroup" (number) to actions that can run together; same number = same batch.
Output JSON only (no markdown, no code fences):
{ "agents": ["agent_name"], "reasoning": "why", "actions": [{"agent": "agent_name", "action": "action_name", "params": {...}, "parallelGroup": 1}] }`;

		let iteration = 0;
		let allActions: ActionResultItem[] = [];
		let lastPlanningResult: { text: string; thoughtSignature?: string } | null = null;

		try {
			if (allowMarathonSuggestion) {
				const complexity = analyzeTaskComplexity(validatedInput.userInput);
				if (complexity.suggestMarathon && complexity.reasoning) {
					yield {
						type: 'marathon_suggestion',
						reasoning: complexity.reasoning,
						userGuidance: complexity.userGuidance
					};
				}
			}

			while (iteration < maxIterations) {
				if (signal?.aborted) {
					yield { type: 'done', finalResponse: 'Stopped by user.', totalIterations: iteration };
					return;
				}

				iteration++;
				yield { type: 'iteration_start', iteration, maxIterations };

				const planningResult = await callGemini({
					prompt: `User request: "${validatedInput.userInput}"
${iteration > 1 ? `\nPrevious iteration results:\n${JSON.stringify(allActions.slice(-10), null, 2)}\n\nWhat should we do next?` : '\nWhat agents should I use? What actions?'}`,
					model: 'gemini-3-pro-preview',
					thinkingLevel: selectThinkingLevel('orchestration_plan'),
					systemPrompt,
					conversationHistory: history
				});
				lastPlanningResult = planningResult;

				const plan = parseGeminiJson(planningResult.text) as PlannerPlan;
				yield { type: 'plan', plan, iteration };

				const actions: ActionResultItem[] = [];

				async function runOne(act: PlannerAction): Promise<ActionResultItem> {
					let result: unknown;
					const agentName = normalizeAgentName(act.agent);
					const params = act.params;
					switch (agentName) {
						case 'Read-To-Me':
							if (act.action === 'read_text' && params?.text?.trim()) {
								result = await readAgent.read({
									text: String(params.text).trim(),
									speed: (params.speed as 'slow' | 'normal' | 'fast') ?? 'normal',
									format: (params.format as 'plain' | 'structured') ?? 'plain'
								});
							}
							break;
						case 'Remember-For-Me':
							if (act.action === 'create_reminder') {
								result = await rememberAgent.createReminder({
									action: 'create_reminder',
									task: params?.task,
									time: params?.time,
									userId: validatedInput.userId
								});
							} else if (act.action === 'list_reminders') {
								result = await rememberAgent.listReminders(validatedInput.userId);
							} else if (act.action === 'create_medication') {
								result = await rememberAgent.createMedication({
									userId: validatedInput.userId,
									name: params?.name ?? '',
									scheduleText: params?.scheduleText,
									isCritical: params?.isCritical
								});
							} else if (act.action === 'create_appointment') {
								result = await rememberAgent.createAppointment({
									userId: validatedInput.userId,
									title: params?.title ?? '',
									appointmentTime: params?.appointmentTime ?? '',
									description: params?.description,
									location: params?.location
								});
							} else if (act.action === 'list_medications') {
								result = await rememberAgent.listMedications(validatedInput.userId);
							} else if (act.action === 'list_appointments') {
								result = await rememberAgent.listAppointments(validatedInput.userId, params?.days);
							} else if (act.action === 'analyze_patterns') {
								result = await rememberAgent.analyzePatterns(
									validatedInput.userId,
									validatedInput.conversationHistory as Array<{
										role: string;
										parts?: Array<{ text: string }>;
									}>
								);
							}
							break;
						case 'Write-For-Me':
							if (act.action === 'compose_email') {
								result = await writeAgent.composeEmail({
									topic: params?.topic ?? params?.text ?? validatedInput.userInput,
									tone:
										(params?.tone as
											| 'formal'
											| 'casual'
											| 'friendly'
											| 'professional'
											| 'persuasive') ?? 'professional',
									context: params?.context,
									userId: validatedInput.userId
								});
							} else if (act.action === 'correct_grammar' && params?.text?.trim()) {
								result = {
									correctedText: await writeAgent.correctGrammar(String(params.text).trim())
								};
							} else if (act.action === 'adjust_tone' && params?.text?.trim()) {
								result = {
									adjustedText: await writeAgent.adjustTone(
										String(params.text).trim(),
										(params?.tone as
											| 'formal'
											| 'casual'
											| 'friendly'
											| 'professional'
											| 'persuasive') ?? 'professional'
									)
								};
							}
							break;
						case 'See-For-Me':
							if (
								act.action === 'identify_medicine' &&
								params?.imageBase64 &&
								typeof params.imageBase64 === 'string'
							) {
								result = await seeAgent.identifyMedicine(
									params.imageBase64,
									(typeof params.mimeType === 'string' ? params.mimeType : undefined) ??
										'image/jpeg'
								);
							} else {
								result = {
									message:
										'Use the See-For-Me panel to start your camera for real-time scene description and danger alerts. For medicine ID, show the pill or label and use identify_medicine with a captured image.'
								};
							}
							break;
						case 'Hear-For-Me':
							result = {
								message:
									'Use the Hear-For-Me panel to start your microphone for real-time transcription and sound detection.'
							};
							break;
						case 'Find-It':
							if (act.action === 'web_search') {
								result = await findItAgent.webSearch({
									query: (params?.query ?? params?.text ?? validatedInput.userInput) as string,
									userId: validatedInput.userId
								});
							} else if (act.action === 'search_drug_info') {
								result = await findItAgent.searchDrugInfo({
									medicineName: (params?.medicineName ??
										params?.text ??
										validatedInput.userInput) as string,
									context: params?.context as string | undefined,
									userId: validatedInput.userId
								});
							} else if (act.action === 'search_files') {
								result = await findItAgent.searchFiles({
									query: params?.text,
									userId: validatedInput.userId
								});
							} else if (act.action === 'locate_document') {
								result = await findItAgent.locateDocument({
									name: params?.name ?? params?.text,
									userId: validatedInput.userId
								});
							} else if (act.action === 'list_directory') {
								result = await findItAgent.listDirectory({
									path: params?.task,
									userId: validatedInput.userId
								});
							}
							break;
						case 'Say-It-For-Me':
							if (
								act.action === 'speak_message' &&
								(params?.text?.trim() ?? validatedInput.userInput.trim())
							) {
								result = await sayAgent.speak({
									text: (params?.text ?? validatedInput.userInput) as string,
									emotion: 'neutral',
									userId: validatedInput.userId
								});
							}
							break;
						default:
							result = { error: `Agent ${act.agent} not implemented yet` };
					}
					return { agent: agentName, action: act.action, result };
				}

				const batches = groupActionsIntoBatches(plan.actions);
				for (const batch of batches) {
					if (signal?.aborted) break;
					if (batch.length === 1) {
						const item = await runOne(batch[0]);
						actions.push(item);
						yield {
							type: 'action_result',
							agent: item.agent,
							action: item.action,
							result: item.result,
							iteration
						};
					} else {
						yield {
							type: 'parallel_start',
							actions: batch.map((a) => ({ agent: normalizeAgentName(a.agent), action: a.action })),
							iteration
						};
						const settled = await Promise.allSettled(batch.map(runOne));
						const results: ActionResultItem[] = settled.map((s, i) =>
							s.status === 'fulfilled'
								? s.value
								: {
										agent: normalizeAgentName(batch[i].agent),
										action: batch[i].action,
										result: {
											error: (s as PromiseRejectedResult).reason?.message ?? 'Action failed'
										} as unknown
									}
						);
						for (const r of results) {
							yield {
								type: 'action_result',
								agent: r.agent,
								action: r.action,
								result: r.result,
								iteration
							};
						}
						yield { type: 'parallel_complete', results, iteration };
						actions.push(...results);
					}
				}
				allActions = allActions.concat(actions);

				yield {
					type: 'iteration_complete',
					iteration,
					actions,
					tasksComplete: false,
					reasoning: plan.reasoning
				};

				const verificationStatus = await verify(validatedInput.userInput, actions);
				yield { type: 'verification', iteration, status: verificationStatus };

				if (verificationStatus.passed && !verificationStatus.shouldRetry) {
					const synthesisResult = await callGemini({
						prompt: `User asked: "${validatedInput.userInput}"\n\nI executed these actions:\n${JSON.stringify(actions, null, 2)}\n\nProvide a natural, helpful response.`,
						model: 'gemini-3-flash-preview',
						thinkingLevel: selectThinkingLevel('synthesis'),
						conversationHistory: [
							...history,
							{
								role: 'user',
								parts: [
									{
										text: validatedInput.userInput,
										thoughtSignature: lastPlanningResult?.thoughtSignature
									}
								]
							}
						]
					});
					history.push(
						{ role: 'user', parts: [{ text: validatedInput.userInput }] },
						{
							role: 'model',
							parts: [
								{ text: synthesisResult.text, thoughtSignature: synthesisResult.thoughtSignature }
							]
						}
					);
					this.conversationHistory.set(validatedInput.userId, history);
					try {
						await processConversation({
							userId: validatedInput.userId,
							messages: [
								{ role: 'user', content: validatedInput.userInput },
								{ role: 'model', content: synthesisResult.text }
							]
						});
					} catch {
						// ignore
					}
					yield {
						type: 'done',
						finalResponse: synthesisResult.text,
						totalIterations: iteration,
						thoughtSignature: synthesisResult.thoughtSignature
					};
					return;
				}

				if (hasObviousFailure(actions)) {
					const synthesisResult = await callGemini({
						prompt: `User asked: "${validatedInput.userInput}". Some actions failed:\n${JSON.stringify(actions, null, 2)}\n\nProvide a brief response explaining what happened and what the user can do.`,
						model: 'gemini-3-flash-preview',
						thinkingLevel: selectThinkingLevel('synthesis'),
						conversationHistory: history
					});
					yield { type: 'done', finalResponse: synthesisResult.text, totalIterations: iteration };
					return;
				}

				history.push(
					{ role: 'user', parts: [{ text: validatedInput.userInput }] },
					{
						role: 'model',
						parts: [
							{
								text: `Iteration ${iteration}: executed ${actions.length} action(s). ${verificationStatus.summary ?? ''}`
							}
						]
					}
				);
				this.conversationHistory.set(validatedInput.userId, history);
			}

			const synthesisResult = await callGemini({
				prompt: `User asked: "${validatedInput.userInput}". We ran ${iteration} iteration(s). Actions:\n${JSON.stringify(allActions, null, 2)}\n\nProvide a concise summary for the user.`,
				model: 'gemini-3-flash-preview',
				thinkingLevel: selectThinkingLevel('synthesis'),
				conversationHistory: history
			});
			yield {
				type: 'done',
				finalResponse: synthesisResult.text,
				totalIterations: iteration,
				thoughtSignature: synthesisResult.thoughtSignature
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			console.error('[orchestrator] processIterative error:', message);
			yield { type: 'error', message };
		}
	}

	/**
	 * Clear conversation history (for testing/reset)
	 */
	clearHistory(userId: string): void {
		this.conversationHistory.delete(userId);
	}
}

// Singleton instance
export const orchestrator = new Orchestrator();
