import { z } from 'zod';
import { callGemini, parseGeminiJson } from '$lib/utils/gemini';

/**
 * Input: action results to verify
 */
export interface ActionResultItem {
	agent: string;
	action: string;
	result: unknown;
}

export const VerificationStatusSchema = z.object({
	passed: z.boolean(),
	issues: z.array(z.string()).default([]),
	suggestedCorrections: z.array(z.string()).default([]),
	shouldRetry: z.boolean().default(false),
	summary: z.string().optional()
});

export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;

const VERIFY_SYSTEM = `You are a quality verifier for an assistive AI system.
Given the user request and the actions executed, determine:
1. Did the outputs meet the user's intent?
2. Are there obvious errors (wrong time, wrong task, empty result)?
3. Should we retry with a different strategy?

Respond with JSON only (no markdown, no code fences):
{
  "passed": true or false,
  "issues": ["list of issues or empty array"],
  "suggestedCorrections": ["what to try differently if retry"],
  "shouldRetry": true or false,
  "summary": "one line summary"
}`;

/**
 * Verify action results using Gemini (Plan-Do-Verify-Act).
 * Uses HIGH thinking for thorough verification.
 */
export async function verify(
	userRequest: string,
	actions: ActionResultItem[]
): Promise<VerificationStatus> {
	const prompt = `User request: "${userRequest}"

Actions executed:
${JSON.stringify(actions, null, 2)}

Verify quality. Output JSON only.`;

	const result = await callGemini({
		prompt,
		model: 'gemini-3-pro-preview',
		thinkingLevel: 'high',
		systemPrompt: VERIFY_SYSTEM
	});

	const parsed = parseGeminiJson(result.text) as Record<string, unknown>;
	const status = VerificationStatusSchema.parse({
		passed: Boolean(parsed.passed),
		issues: Array.isArray(parsed.issues) ? parsed.issues : [],
		suggestedCorrections: Array.isArray(parsed.suggestedCorrections)
			? parsed.suggestedCorrections
			: [],
		shouldRetry: Boolean(parsed.shouldRetry),
		summary: typeof parsed.summary === 'string' ? parsed.summary : undefined
	});
	return status;
}

/**
 * Quick check: any action has error or empty result (skip Gemini call).
 */
export function hasObviousFailure(actions: ActionResultItem[]): boolean {
	return actions.some((a) => {
		const r = a.result as Record<string, unknown> | null | undefined;
		if (r == null) return true;
		if (typeof r === 'object' && 'error' in r && r.error) return true;
		return false;
	});
}
