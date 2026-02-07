import { z } from 'zod';
import { callGemini, callGeminiStream, parseGeminiJson } from '$lib/utils/gemini';
import { readAgent } from './readAgent';
import { rememberAgent } from './rememberAgent';
import { writeAgent } from './writeAgent';
import { getMemorySummary, processConversation } from '$lib/memory';

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
}

/** Planner JSON shape from Gemini */
interface PlannerPlan {
	agents: string[];
	reasoning?: string;
	actions: Array<{ agent: string; action: string; params?: PlannerActionParams }>;
}

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
1. Read-To-Me Agent: Read text aloud, OCR images
2. Write-For-Me Agent: Write emails, correct grammar, adjust tone
3. Find-It Agent: Search, navigate, locate files (NOT IMPLEMENTED YET)
4. Remember-For-Me Agent: Create reminders, track tasks
5. Say-It-For-Me Agent: Text-to-speech for communication (NOT IMPLEMENTED YET)
6. See-For-Me Agent: Real-time vision—scene description, object detection, danger detection, navigation. Use for: "What do you see?", "Is it safe?", "What's ahead?", "Read that sign". User must use the See-For-Me panel with camera; you can direct them to it.
7. Hear-For-Me Agent: Real-time audio transcription, sound detection (doorbell, alarm, crying), speaker identification. Use for: "What's that sound?", "Who's speaking?", "Transcribe this conversation". User must use the Hear-For-Me panel with microphone.

Your job: Decide which agent(s) to use based on user intent.
Available agents RIGHT NOW: Read-To-Me, Write-For-Me, Remember-For-Me, See-For-Me (direct user to panel), Hear-For-Me (direct user to panel)

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
				// TODO: set thinkingLevel as 'medium' later
				prompt: `User request: "${validatedInput.userInput}"

What agents should I use? What actions should they take?`,
				model: 'gemini-3-pro-preview',
				thinkingLevel: 'low', // Medium thinking for orchestration
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
				thinkingLevel: 'low', // Fast response synthesis
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
1. Read-To-Me Agent: Read text aloud, OCR images
2. Write-For-Me Agent: Write emails, correct grammar, adjust tone
3. Find-It Agent: Search, navigate, locate files (NOT IMPLEMENTED YET)
4. Remember-For-Me Agent: Create reminders, track tasks
5. Say-It-For-Me Agent: Text-to-speech for communication (NOT IMPLEMENTED YET)
6. See-For-Me Agent: Real-time vision—scene description, dangers, navigation. Use for "What do you see?", "Is it safe?". Direct user to the See-For-Me panel.
7. Hear-For-Me Agent: Real-time audio transcription, sound detection, speaker ID. Use for "What's that sound?", "Transcribe this". Direct user to the Hear-For-Me panel.

Your job: Decide which agent(s) to use based on user intent.

Available agents RIGHT NOW: Read-To-Me, Write-For-Me, Remember-For-Me, See-For-Me (direct user to panel), Hear-For-Me (direct user to panel)

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
				thinkingLevel: 'low',
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
				thinkingLevel: 'low',
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
	 * Clear conversation history (for testing/reset)
	 */
	clearHistory(userId: string): void {
		this.conversationHistory.delete(userId);
	}
}

// Singleton instance
export const orchestrator = new Orchestrator();
