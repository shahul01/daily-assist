import { z } from 'zod';

export const ErrorRecoveryStrategySchema = z.enum([
	'retry_same',
	'retry_improved',
	'fallback_agent',
	'graceful_degradation',
	'notify_user'
]);
export type ErrorRecoveryStrategy = z.infer<typeof ErrorRecoveryStrategySchema>;

export interface RecoveryDecision {
	strategy: ErrorRecoveryStrategy;
	fallbackAgent?: string;
	improvedPromptHint?: string;
	retryAfterMs?: number;
}

const TRANSIENT_PATTERNS = [
	/timeout/i,
	/rate limit/i,
	/network/i,
	/ECONNRESET/i,
	/503/,
	/429/
];

const PROMPT_PATTERNS = [
	/could not extract/i,
	/invalid.*format/i,
	/parse/i,
	/unable to locate JSON/i
];

/** Agent fallbacks: primary -> list of alternatives */
export const AGENT_FALLBACKS: Record<string, string[]> = {
	'Read-To-Me': ['Write-For-Me'],
	'Remember-For-Me': ['Read-To-Me'],
	'Write-For-Me': ['Read-To-Me'],
	'Find-It': ['Remember-For-Me'],
	'Say-It-For-Me': ['Read-To-Me']
};

/**
 * Decide recovery strategy from error and context.
 */
export function decideRecovery(
	error: unknown,
	retryCount: number,
	agentName: string,
	maxRetries: number = 3
): RecoveryDecision {
	const message = error instanceof Error ? error.message : String(error);
	const isTransient = TRANSIENT_PATTERNS.some((p) => p.test(message));
	const isPromptError = PROMPT_PATTERNS.some((p) => p.test(message));

	if (retryCount >= maxRetries) {
		return { strategy: 'notify_user' };
	}

	if (isTransient) {
		const retryAfterMs = Math.min(1000 * 2 ** retryCount, 8000);
		return { strategy: 'retry_same', retryAfterMs };
	}

	if (isPromptError) {
		return {
			strategy: 'retry_improved',
			improvedPromptHint: 'Extract structured data more carefully; validate format.',
			retryAfterMs: 500
		};
	}

	const fallbacks = AGENT_FALLBACKS[agentName];
	if (fallbacks?.length && retryCount >= 1) {
		return {
			strategy: 'fallback_agent',
			fallbackAgent: fallbacks[0],
			retryAfterMs: 500
		};
	}

	return {
		strategy: 'graceful_degradation',
		retryAfterMs: 1000 * (retryCount + 1)
	};
}

/**
 * Sleep for retry backoff (exponential cap 8s).
 */
export function getBackoffMs(attempt: number): number {
	return Math.min(1000 * 2 ** attempt, 8000);
}

export async function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
