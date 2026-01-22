import { z } from 'zod';
import { callGemini } from '$lib/utils/gemini';
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

Output JSON:
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
				prompt: `User request: "${validatedInput.userInput}"

What agents should I use? What actions should they take?`,
				model: 'gemini-3-pro',
				thinkingLevel: 'medium', // Medium thinking for orchestration
				systemPrompt,
				conversationHistory: history
			});

			// Parse plan
			const plan = JSON.parse(planningResult.text);

			// Step 2: Execute agent actions
			const actions: OrchestratorOutput['actions'] = [];

			for (const action of plan.actions) {
				let result;

				switch (action.agent) {
					case 'Read-To-Me':
						if (action.action === 'read_text') {
							result = await readAgent.read({
								text: action.params.text,
								speed: action.params.speed || 'normal'
							});
						}
						break;

					case 'Remember-For-Me':
						if (action.action === 'create_reminder') {
							result = await rememberAgent.createReminder({
								action: 'create_reminder',
								task: action.params.task,
								time: action.params.time,
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
					agent: action.agent,
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
				model: 'gemini-3-flash',
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
	 * Clear conversation history (for testing/reset)
	 */
	clearHistory(userId: string): void {
		this.conversationHistory.delete(userId);
	}
}

// Singleton instance
export const orchestrator = new Orchestrator();