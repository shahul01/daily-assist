import { z } from 'zod';
import { callGemini, parseGeminiJson } from '$lib/utils/gemini';
import { supabaseServer } from '$lib/server/supabase';
import type { Database } from '$lib/types/database.types';

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
 * Reminder type (maps to todos table + memory)
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
 * Persists reminders to Supabase todos table and memory system.
 */
export class RememberAgent {
	/**
	 * Create a reminder from natural language; store in todos and memory.
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

		const result = await callGemini({
			prompt,
			model: 'gemini-3-pro-preview',
			thinkingLevel: 'low',
			systemPrompt
		});

		const reminderData = parseGeminiJson(result.text) as {
			task?: string;
			time?: string;
			priority?: string;
		};
		const task =
			reminderData.task != null ? String(reminderData.task).trim() : validatedInput.task?.trim();
		if (!task) throw new Error('Remember agent failed: could not extract a task description');
		const dueDate = parseDueDate(reminderData.time);

		type TodoInsert = Database['public']['Tables']['todos']['Insert'];
		const now = new Date().toISOString();
		const insertPayload: TodoInsert = {
			user_id: validatedInput.userId,
			memory_id: null,
			goal_id: null,
			task,
			description: null,
			completed: false,
			created_at: now,
			updated_at: now,
			due_date: dueDate,
			completed_at: null,
			priority: reminderData.priority ?? null,
			estimated_hours: null,
			tags: {}
		};
		const { data: row, error } = await supabaseServer
			.from('todos')
			// @ts-expect-error Supabase client generic flows as never; payload matches todos Insert
			.insert(insertPayload)
			.select('id, task, due_date, created_at')
			.single();

		if (error) {
			const isFkViolation = error.code === '23503';
			const message = isFkViolation
				? 'User not found. Sign in with Supabase Auth (or use anonymous sign-in) so the user ID exists in the database.'
				: error.message;
			throw new Error(`Remember agent failed: ${message}`);
		}
		const r = row as { id: string; task: string; due_date: string | null; created_at: string };
		return {
			id: r.id,
			task: r.task,
			time: r.due_date ?? reminderData.time ?? r.created_at,
			created: r.created_at,
			thoughtSignature: result.thoughtSignature
		};
	}

	/**
	 * List all reminders for user from Supabase todos.
	 */
	async listReminders(userId: string): Promise<Reminder[]> {
		const { data, error } = await supabaseServer
			.from('todos')
			.select('id, task, due_date, created_at')
			.eq('user_id', userId)
			.eq('completed', false)
			.order('due_date', { ascending: true, nullsFirst: false });
		if (error) throw new Error(`List reminders failed: ${error.message}`);
		type TodoRow = { id: string; task: string; due_date: string | null; created_at: string };
		return ((data ?? []) as TodoRow[]).map((r) => ({
			id: r.id,
			task: r.task,
			time: r.due_date ?? r.created_at,
			created: r.created_at
		}));
	}

	/**
	 * Analyze user patterns using persisted reminders.
	 */
	async analyzePatterns(
		userId: string,
		conversationHistory: Array<{ role: string; parts?: Array<{ text: string }> }>
	): Promise<string> {
		const userReminders = await this.listReminders(userId);
		const systemPrompt = `You are a Remember-For-Me assistant analyzing user patterns.
Identify: recurring tasks, times user struggles, forgotten tasks, medication adherence.`;
		const prompt = `Reminders: ${JSON.stringify(userReminders, null, 2)}\nWhat patterns do you notice? What suggestions can help them remember better?`;
		const result = await callGemini({
			prompt,
			model: 'gemini-3-pro-preview',
			thinkingLevel: 'high',
			systemPrompt,
			conversationHistory: conversationHistory.map((m) => ({
				role: m.role as 'user' | 'model',
				parts: m.parts ?? [{ text: (m as { content?: string }).content ?? '' }]
			}))
		});
		return result.text;
	}
}

function parseDueDate(timeStr: string | undefined): string | null {
	if (timeStr == null || typeof timeStr !== 'string') return null;
	const trimmed = timeStr.trim();
	if (!trimmed) return null;
	const d = new Date(trimmed);
	return isNaN(d.getTime()) ? null : d.toISOString();
}

// Singleton instance
export const rememberAgent = new RememberAgent();
