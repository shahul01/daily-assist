import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { orchestrator } from '$lib/agents/orchestrator';
import { getIterativeChatSessions } from '../helpers/database-helpers';
import {
	getSupabaseTestClient,
	createTestUser,
	deleteTestUser,
	shouldRunE2EReal
} from '../helpers/test-utils';

const GEMINI_KEY_ENV = 'GEMINI_API_KEY';
const VITE_GEMINI_KEY_ENV = 'VITE_GEMINI_API_KEY';

function getGeminiKey(): string {
	const v = process.env[VITE_GEMINI_KEY_ENV] ?? process.env[GEMINI_KEY_ENV];
	return typeof v === 'string' && v.trim() ? v.trim() : '';
}

const shouldRun = shouldRunE2EReal() && !!getGeminiKey();

describe('Iterative orchestration (E2E, real backend)', () => {
	let userId: string | null = null;
	const supabase = getSupabaseTestClient();

	beforeAll(async () => {
		if (!shouldRun) return;
		userId = await createTestUser();
	});

	afterAll(async () => {
		if (!shouldRun || !userId) return;
		await deleteTestUser(userId);
	});

	it.skipIf(!shouldRun)('processIterative yields plan, iteration, and done events', async () => {
		if (!userId) throw new Error('Test user not created');

		const events: Array<{ type: string }> = [];
		for await (const event of orchestrator.processIterative(
			{
				userInput: 'List my reminders.',
				userId,
				conversationHistory: []
			},
			{ maxIterations: 3 }
		)) {
			events.push(event as { type: string });
		}

		expect(events.length).toBeGreaterThan(0);
		expect(events.some((e) => e.type === 'iteration_start')).toBe(true);
		expect(events.some((e) => e.type === 'plan')).toBe(true);
		expect(events.some((e) => e.type === 'done')).toBe(true);

		const doneEvent = events.find((e) => e.type === 'done') as
			| { type: 'done'; finalResponse: string; totalIterations: number }
			| undefined;
		expect(doneEvent).toBeDefined();
		expect(typeof (doneEvent?.finalResponse ?? '')).toBe('string');
		expect(typeof (doneEvent?.totalIterations ?? 0)).toBe('number');
	});

	it.skipIf(!shouldRun)('getIterativeChatSessions returns array for user', async () => {
		if (!userId) throw new Error('Test user not created');

		const sessions = await getIterativeChatSessions(supabase, userId);
		expect(Array.isArray(sessions)).toBe(true);
	});
});
