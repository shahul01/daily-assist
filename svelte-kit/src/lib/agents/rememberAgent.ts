import { z } from 'zod';
import { callGemini } from '$lib/utils/gemini';

/**
 * Input validation
 */
export const RememberAgentInputSchema = z.object({
	action: z.enum(['create_reminder', 'list_reminders', 'analyze_patterns']),
	task: z.string().optional(),
	time: z.string().optional(),
	userId: z.string().min(1, 'User ID required'),
	context: z.string().optional()
});

export type RememberAgentInput = z.infer<typeof RememberAgentInputSchema>;

/**
 * Reminder type
 */
export interface Reminder {
	id: string;
	task: string;
	time: string;
	created: string;
	thoughtSignature?: string;
}

/**
 * Remember-For-Me Agent
 *
 * Purpose: Help users with memory disabilities track tasks, appointments, medications
 * Thinking Level: MEDIUM (balance speed and reasoning)
 */
export class RememberAgent {
	private reminders: Map<string, Reminder[]> = new Map();

	/**
	 * Create a reminder from natural language
	 */
	async createReminder(input: RememberAgentInput): Promise<Reminder> {
		const validatedInput = RememberAgentInputSchema.parse(input);

		const systemPrompt = `You are a Remember-For-Me assistant for people with memory disabilities.
Your job: Extract structured reminder information from natural language.

Extract:
1. Task description (what to do)
2. Time (when to do it - be specific)
3. Priority (how urgent)

Output format: JSON only
{
  "task": "clear description",
  "time": "ISO 8601 timestamp",
  "priority": "low|medium|high"
}`;

		const prompt = `Extract reminder from: "${validatedInput.task}"
${validatedInput.time ? `User mentioned time: ${validatedInput.time}` : ''}
${validatedInput.context ? `Context: ${validatedInput.context}` : ''}`;

		try {
			const result = await callGemini({
				prompt,
				model: 'gemini-3-pro', // Use Pro for better reasoning
				thinkingLevel: 'medium', // Balance speed and quality
				systemPrompt
			});

			// Parse JSON response
			const reminderData = JSON.parse(result.text);

			const reminder: Reminder = {
				id: crypto.randomUUID(),
				task: reminderData.task,
				time: reminderData.time,
				created: new Date().toISOString(),
				thoughtSignature: result.thoughtSignature
			};

			// Store in memory (TODO: replace with database in Tier 2)
			const userReminders = this.reminders.get(validatedInput.userId) || [];
			userReminders.push(reminder);
			this.reminders.set(validatedInput.userId, userReminders);

			return reminder;
		} catch (error) {
			throw new Error(`Remember agent failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	/**
	 * List all reminders for user
	 */
	async listReminders(userId: string): Promise<Reminder[]> {
		return this.reminders.get(userId) || [];
	}

	/**
	 * Analyze user patterns (requires thought signatures for context)
	 */
	async analyzePatterns(userId: string, conversationHistory: any[]): Promise<string> {
		const userReminders = this.reminders.get(userId) || [];

		const systemPrompt = `You are a Remember-For-Me assistant analyzing user patterns.

Your job: Identify patterns in user's reminders and behaviors.
Look for:
1. Recurring tasks
2. Times user struggles (morning/evening)
3. Forgotten tasks
4. Medication adherence patterns`;

		const prompt = `Analyze this user's reminder patterns:
Reminders: ${JSON.stringify(userReminders, null, 2)}

What patterns do you notice? What suggestions can help them remember better?`;

		try {
			const result = await callGemini({
				prompt,
				model: 'gemini-3-pro',
				thinkingLevel: 'high', // Deep analysis requires high thinking
				systemPrompt,
				conversationHistory // Maintain context across analysis
			});

			return result.text;
		} catch (error) {
			throw new Error(`Pattern analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}
}

// Singleton instance
export const rememberAgent = new RememberAgent();