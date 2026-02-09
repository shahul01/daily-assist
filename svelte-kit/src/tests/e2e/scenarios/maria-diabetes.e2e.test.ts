import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { processConversation, retrieve } from '$lib/memory';
import { marathonOrchestrator, type MarathonConfig } from '$lib/agents/marathonOrchestrator';
import {
	getSupabaseTestClient,
	createTestUser,
	deleteTestUser,
	shouldRunE2EReal
} from '../helpers/test-utils';
import { getMemoriesForUser, getRelationshipsForUser } from '../helpers/database-helpers';
import { MARIA_DIABETES_MESSAGES, MARIA_REMINDER_REQUEST } from '../fixtures/test-data';

// These tests exercise the real database (including vector + graph) and real Gemini 3 API.
// They are opt-in because they are slower and require proper environment variables.

const GEMINI_KEY_ENV = 'GEMINI_API_KEY';

describe('Maria diabetes marathon scenario (E2E, real backend)', () => {
	let userId: string | null = null;

	const supabase = getSupabaseTestClient();

	const shouldRun =
		shouldRunE2EReal() &&
		typeof process.env[GEMINI_KEY_ENV] === 'string' &&
		!!process.env[GEMINI_KEY_ENV];

	beforeAll(async () => {
		if (!shouldRun) return;
		userId = await createTestUser();
	});

	afterAll(async () => {
		if (!shouldRun || !userId) return;
		await deleteTestUser(userId);
	});

	it.skipIf(!shouldRun)(
		'should store Maria conversation into vector + graph memory and retrieve it semantically',
		async () => {
			if (!userId) throw new Error('Test user not created');

			const storedMemories = await processConversation({
				userId,
				messages: MARIA_DIABETES_MESSAGES.map((m) => ({
					role: m.role,
					content: m.content
				}))
			});

			expect(storedMemories.length).toBeGreaterThan(0);

			const allMemories = await getMemoriesForUser(supabase, userId);
			expect(allMemories.length).toBeGreaterThan(0);

			const query = 'dizzy after morning medication';
			const retrieved = await retrieve(userId, query, { limit: 5, includeRelated: true });

			expect(retrieved.length).toBeGreaterThan(0);
			const hasSymptom = retrieved.some((m) =>
				(m.text_content ?? '').toLowerCase().includes('dizzy')
			);
			expect(hasSymptom).toBe(true);

			// Graph store should have created relationships between memories from the same conversation.
			const relationships = await getRelationshipsForUser(supabase, userId);
			expect(relationships.length).toBeGreaterThan(0);
		}
	);

	it.skipIf(!shouldRun)(
		'should run a single marathon reasoning + action cycle for Maria and update memory',
		async () => {
			if (!userId) throw new Error('Test user not created');

			const userState = await marathonOrchestrator.observe(
				userId,
				MARIA_REMINDER_REQUEST,
				'on_demand'
			);
			expect(userState.userId).toBe(userId);
			expect(userState.lastInput).toBe(MARIA_REMINDER_REQUEST);

			const decision = await marathonOrchestrator.reason(userState);
			expect(decision).not.toBeNull();
			if (!decision) return;

			// Config uses minimal durations but still respects validation constraints.
			const config: MarathonConfig = {
				userId,
				durationHours: 0.1,
				mode: 'on_demand',
				observeIntervalSeconds: 60,
				checkpointEveryNActions: 10,
				maxRetriesPerAction: 1
			};

			const results = await marathonOrchestrator.act(decision, config);
			expect(results.actions.length).toBeGreaterThanOrEqual(decision.actions.length);

			// Even if some actions fall back or fail, verify() should return a structured status.
			const verification = await marathonOrchestrator.verify(MARIA_REMINDER_REQUEST, results);
			expect(typeof verification.passed).toBe('boolean');

			// Memory update should persist a thought signature + conversation and not throw.
			await marathonOrchestrator.updateMemory(userId, decision, results);
		}
	);
});
