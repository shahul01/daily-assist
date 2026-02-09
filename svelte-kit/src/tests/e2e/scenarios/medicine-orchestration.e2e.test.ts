import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { orchestrator } from '$lib/agents/orchestrator';
import { seeAgent } from '$lib/agents/seeAgent';
import { findItAgent } from '$lib/agents/findItAgent';
import { analyzeTaskComplexity } from '$lib/agents/taskComplexity';
import { createTestUser, deleteTestUser, shouldRunE2EReal } from '../helpers/test-utils';

const GEMINI_KEY_ENV = 'GEMINI_API_KEY';
const VITE_GEMINI_KEY_ENV = 'VITE_GEMINI_API_KEY';

function getGeminiKey(): string {
	const v = process.env[VITE_GEMINI_KEY_ENV] ?? process.env[GEMINI_KEY_ENV];
	return typeof v === 'string' && v.trim() ? v.trim() : '';
}

const shouldRun = shouldRunE2EReal() && !!getGeminiKey();

/** Minimal 1x1 PNG for vision API (valid image). */
const MINIMAL_PNG_BASE64 =
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('Medicine orchestration (E2E)', () => {
	let userId: string | null = null;

	beforeAll(async () => {
		if (!shouldRun) return;
		userId = await createTestUser();
	});

	afterAll(async () => {
		if (!shouldRun || !userId) return;
		await deleteTestUser(userId);
	});

	it('analyzeTaskComplexity suggests marathon for medicine-related input', () => {
		const simple = analyzeTaskComplexity('List my reminders');
		expect(simple.suggestMarathon).toBe(false);

		const medicine = analyzeTaskComplexity('I took unknown medicine and want to check what it is');
		expect(medicine.suggestMarathon).toBe(true);
		expect(medicine.reasoning).toBeDefined();
		expect(typeof medicine.userGuidance).toBe('string');
	});

	it.skipIf(!shouldRun)(
		'processIterative with allowMarathonSuggestion yields marathon_suggestion for medicine input',
		async () => {
			if (!userId) throw new Error('Test user not created');

			const events: Array<{ type: string; reasoning?: string }> = [];
			for await (const event of orchestrator.processIterative(
				{
					userInput: 'I took a pill I cannot identify, help me find out what medicine it is',
					userId,
					conversationHistory: []
				},
				{ maxIterations: 2, allowMarathonSuggestion: true }
			)) {
				events.push(event as { type: string; reasoning?: string });
			}

			const suggestion = events.find((e) => e.type === 'marathon_suggestion');
			expect(suggestion).toBeDefined();
			expect(typeof (suggestion as { reasoning?: string })?.reasoning).toBe('string');
			expect(events.some((e) => e.type === 'done')).toBe(true);
		}
	);

	it.skipIf(!shouldRun)(
		'seeAgent.identifyMedicine returns MedicineIdentification shape',
		async () => {
			const result = await seeAgent.identifyMedicine(MINIMAL_PNG_BASE64, 'image/png');
			expect(result).toHaveProperty('confidence');
			expect(['high', 'medium', 'low']).toContain(result.confidence);
			expect(
				result.pillDescription === undefined || typeof result.pillDescription?.shape === 'string'
			).toBe(true);
		}
	);

	it.skipIf(!shouldRun)('findItAgent.searchDrugInfo returns DrugInfoResult shape', async () => {
		const result = await findItAgent.searchDrugInfo({
			medicineName: 'Paracetamol',
			userId: userId ?? undefined
		});
		expect(result.medicineName).toBe('Paracetamol');
		expect(Array.isArray(result.commonUses)).toBe(true);
		expect(Array.isArray(result.sideEffects)).toBe(true);
		expect(Array.isArray(result.interactions)).toBe(true);
		expect(['low', 'medium', 'high', 'critical']).toContain(result.dangerLevel);
		expect(typeof result.synthesizedSummary).toBe('string');
	});
});
