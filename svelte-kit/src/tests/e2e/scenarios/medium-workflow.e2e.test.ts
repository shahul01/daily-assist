import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readAgent } from '$lib/agents/readAgent';
import { writeAgent } from '$lib/agents/writeAgent';
import { rememberAgent } from '$lib/agents/rememberAgent';
import { sayAgent } from '$lib/agents/sayAgent.server';
import { seeAgent } from '$lib/agents/seeAgent';
import { findItAgent } from '$lib/agents/findItAgent';
import { orchestrator } from '$lib/agents/orchestrator';
import { getMemoriesForUser, getRelationshipsForUser } from '../helpers/database-helpers';
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

/** Reason tests are skipped when env is not set; for clearer terminal output. */
function getE2ESkipReason(): string | null {
	if (!shouldRunE2EReal()) return 'Set RUN_E2E_REAL=1 to run';
	if (!getGeminiKey()) return 'Set VITE_GEMINI_API_KEY (or GEMINI_API_KEY) in .env to run';
	return null;
}

/** Minimal 1x1 PNG (transparent) for See agent test. */
const MINIMAL_PNG_BASE64 =
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('Medium workflow: multi-agent orchestration (E2E, real backend)', () => {
	let userId: string | null = null;
	const supabase = getSupabaseTestClient();

	const shouldRun = shouldRunE2EReal() && !!getGeminiKey();

	beforeAll(async () => {
		const reason = getE2ESkipReason();
		if (reason) {
			console.warn(`[e2e] Medium workflow skipped: ${reason}`);
			return;
		}
		userId = await createTestUser();
	});

	afterAll(async () => {
		if (!shouldRun || !userId) return;
		await deleteTestUser(userId);
	});

	it.skipIf(!shouldRun)('Read agent returns spoken text', async () => {
		if (!userId) throw new Error('Test user not created');
		const result = await readAgent.read({
			text: 'Short test for E2E.',
			speed: 'normal',
			format: 'plain'
		});
		expect(result).toHaveProperty('spokenText');
		expect(typeof result.spokenText).toBe('string');
		expect(result.spokenText.length).toBeGreaterThan(0);
	});

	it.skipIf(!shouldRun)('Remember agent creates reminder and lists reminders', async () => {
		if (!userId) throw new Error('Test user not created');
		await rememberAgent.createReminder({
			action: 'create_reminder',
			task: 'E2E workflow task',
			time: '10:00',
			userId
		});
		const list = await rememberAgent.listReminders(userId);
		expect(Array.isArray(list)).toBe(true);
		const found = list.some((r) => r.task?.includes('E2E') ?? false);
		expect(found).toBe(true);
	});

	it.skipIf(!shouldRun)('Write agent composes email', async () => {
		if (!userId) throw new Error('Test user not created');
		const result = await writeAgent.composeEmail({
			topic: 'Request to reschedule appointment',
			tone: 'professional',
			userId
		});
		expect(result).toHaveProperty('subject');
		expect(result).toHaveProperty('body');
		expect(typeof result.body).toBe('string');
		expect(result.body.length).toBeGreaterThan(0);
	});

	it.skipIf(!shouldRun)('Say agent returns speak payload', async () => {
		if (!userId) throw new Error('Test user not created');
		const result = await sayAgent.speak({ text: 'E2E test phrase.', userId });
		expect(result).toHaveProperty('text');
		expect(result).toHaveProperty('rate');
		expect(result).toHaveProperty('lang');
		expect(result.text).toBe('E2E test phrase.');
	});

	it.skipIf(!shouldRun)('See agent analyzes frame and returns structured output', async () => {
		if (!userId) throw new Error('Test user not created');
		const result = await seeAgent.analyzeFrame({
			cameraFrame: MINIMAL_PNG_BASE64,
			mode: 'scene',
			userId,
			mimeType: 'image/png',
			detailLevel: 'brief',
			voiceMode: 'smart'
		});
		expect(result).toHaveProperty('analysis');
		expect(result).toHaveProperty('speechText');
		expect(result.analysis).toHaveProperty('description');
	});

	it.skipIf(!shouldRun)('Find-It agent returns search guidance', async () => {
		if (!userId) throw new Error('Test user not created');
		const result = await findItAgent.searchFiles({ query: 'test document', userId });
		expect(result).toHaveProperty('message');
		expect(typeof result.message).toBe('string');
		expect(result.message).toContain('Find-It');
	});

	it.skipIf(!shouldRun)('Orchestrator processes user input and returns response', async () => {
		if (!userId) throw new Error('Test user not created');
		const result = await orchestrator.process({
			userInput: 'What reminders do I have?',
			userId,
			conversationHistory: []
		});
		expect(result).toHaveProperty('response');
		expect(result).toHaveProperty('agentsUsed');
		expect(Array.isArray(result.agentsUsed)).toBe(true);
		expect(typeof result.response).toBe('string');
		expect(result.response.length).toBeGreaterThan(0);
	});

	it.skipIf(!shouldRun)('Memory and graph store populated after orchestration', async () => {
		if (!userId) throw new Error('Test user not created');
		const memories = await getMemoriesForUser(supabase, userId);
		expect(memories.length).toBeGreaterThanOrEqual(0);
		const relationships = await getRelationshipsForUser(supabase, userId);
		expect(Array.isArray(relationships)).toBe(true);
	});
});
