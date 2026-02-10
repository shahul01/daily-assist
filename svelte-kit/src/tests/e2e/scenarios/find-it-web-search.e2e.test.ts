import { describe, it, expect, beforeAll } from 'vitest';
import { findItAgent } from '$lib/agents/findItAgent';
import { shouldRunE2EReal } from '../helpers/test-utils';

const GEMINI_KEY_ENV = 'VITE_GEMINI_API_KEY';

function getGeminiKey(): string {
	const v = process.env[GEMINI_KEY_ENV];
	return typeof v === 'string' && v.trim() ? v.trim() : '';
}

/** Skip when not running real E2E or when required keys are missing (web search uses Gemini + Brave or DDG). */
function getSkipReason(): string | null {
	if (!shouldRunE2EReal()) return 'Set RUN_E2E_REAL=1 to run';
	if (!getGeminiKey()) return 'Set VITE_GEMINI_API_KEY in .env to run';
	return null;
}

describe('Find-It web search (E2E, real backend)', () => {
	beforeAll(() => {
		const reason = getSkipReason();
		if (reason) {
			console.warn(`[e2e] Find-It web search skipped: ${reason}`);
		}
	});

	it.skipIf(!!getSkipReason())(
		'webSearch returns synthesizedAnswer and sources',
		async () => {
			const result = await findItAgent.webSearch({
				query: 'accessibility best practices',
				userId: 'e2e-find-it'
			});
			expect(result).toHaveProperty('query', 'accessibility best practices');
			expect(result).toHaveProperty('synthesizedAnswer');
			expect(typeof result.synthesizedAnswer).toBe('string');
			expect(result.synthesizedAnswer.length).toBeGreaterThan(0);
			expect(result).toHaveProperty('sources');
			expect(Array.isArray(result.sources)).toBe(true);
			expect(result.sources.length).toBeLessThanOrEqual(3);
			expect(result).toMatchObject({
				provider: expect.stringMatching(/^brave|duckduckgo$/)
			});
			for (const source of result.sources) {
				expect(source).toHaveProperty('title');
				expect(source).toHaveProperty('url');
				expect(source).toHaveProperty('summary');
			}
		},
		60_000
	);
});
