import { z } from 'zod';
import { callGemini, callGeminiStream, parseGeminiJson } from '$lib/utils/gemini';
import { readAgent } from './readAgent';
import { rememberAgent } from './rememberAgent';

/**
 * Orchestrator input
 */
export const OrchestratorInputSchema = z.object({
	userInput: z.string().min(1, 'Input cannot be empty'),
	userId: z.string().min(1, 'User ID required'),
	conversationHistory: z.array(z.any()).optional().default([])
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
		result: any;
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
	private conversationHistory: Map<string, any[]> = new Map();

	/**
	 * Process user input and coordinate agents
	 */
	async process(input: OrchestratorInput): Promise<OrchestratorOutput> {
		const validatedInput = OrchestratorInputSchema.parse(input);

		// Load conversation history for this user
		const history = this.conversationHistory.get(validatedInput.userId) || [];

		const systemPrompt = `You are an orchestrator for DailyAssist, coordinating 5 AI agents:
1. Read-To-Me Agent: Read text aloud, OCR images
2. Write-For-Me Agent: Write emails, documents (NOT IMPLEMENTED YET)
3. Find-It Agent: Search, navigate, locate files (NOT IMPLEMENTED YET)
4. Remember-For-Me Agent: Create reminders, track tasks
5. Say-It-For-Me Agent: Text-to-speech for communication (NOT IMPLEMENTED YET)

Your job: Decide which agent(s) to use based on user intent.

Available agents RIGHT NOW: Read-To-Me, Remember-For-Me

Output JSON (IMPORTANT: return ONLY raw JSON, no markdown, no code fences, no comments):
{
  "agents": ["agent_name"],
  "reasoning": "why these agents",
  "actions": [
    {"agent": "agent_name", "action": "specific_action", "params": {...}}
  ]
}`;

		try {
			// Step 1: Decide which agents to use
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
				{
					role: 'user',
					parts: [{ text: validatedInput.userInput }]
				},
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

			return {
				response: synthesisResult.text,
				agentsUsed: plan.agents,
				thoughtSignature: synthesisResult.thoughtSignature,
				actions
			};
		} catch (error) {
			console.error('Orchestrator error:', error);
			throw new Error(`Orchestration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	/**
	 * Process user input and stream the final synthesis; yields meta then chunks then done.
	 * Planning and agent execution run first (non-streaming), then synthesis streams.
	 */
	async *processStream(input: OrchestratorInput): AsyncGenerator<OrchestratorStreamEvent, void, undefined> {
		const validatedInput = OrchestratorInputSchema.parse(input);
		const history = this.conversationHistory.get(validatedInput.userId) || [];

		const systemPrompt = `You are an orchestrator for DailyAssist, coordinating 5 AI agents:
1. Read-To-Me Agent: Read text aloud, OCR images
2. Write-For-Me Agent: Write emails, documents (NOT IMPLEMENTED YET)
3. Find-It Agent: Search, navigate, locate files (NOT IMPLEMENTED YET)
4. Remember-For-Me Agent: Create reminders, track tasks
5. Say-It-For-Me Agent: Text-to-speech for communication (NOT IMPLEMENTED YET)

Your job: Decide which agent(s) to use based on user intent.

Available agents RIGHT NOW: Read-To-Me, Remember-For-Me

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