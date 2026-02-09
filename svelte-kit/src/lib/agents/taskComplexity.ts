/**
 * Task complexity analysis for marathon mode suggestion.
 * Used by the orchestrator to suggest enabling marathon for complex or safety-sensitive tasks.
 */

export interface ComplexityResult {
	score: number;
	suggestMarathon: boolean;
	reasoning?: string;
	userGuidance?: string;
}

const MARATHON_KEYWORDS = [
	'medicine',
	'medication',
	'pill',
	'drug',
	'unknown',
	'unidentified',
	'emergency',
	'monitor',
	'watch',
	'observe',
	'camera',
	'show',
	'identify',
	'danger',
	'safety',
	'doctor',
	'letter',
	'contact'
];

/**
 * Analyze user input to estimate task complexity and whether to suggest marathon mode.
 * @param userInput - Raw user message
 * @returns ComplexityResult with score 0–1, suggestMarathon flag, and optional reasoning
 */
export function analyzeTaskComplexity(userInput: string): ComplexityResult {
	const lower = userInput.trim().toLowerCase();
	if (lower.length < 3) {
		return { score: 0, suggestMarathon: false };
	}

	const matched = MARATHON_KEYWORDS.filter((k) => lower.includes(k));
	const keywordScore = Math.min(1, matched.length * 0.25);
	const lengthScore = Math.min(0.3, lower.length / 100);
	const score = Math.min(1, keywordScore + lengthScore);

	const suggestMarathon =
		score >= 0.25 ||
		matched.some((k) =>
			['medicine', 'medication', 'emergency', 'unknown', 'pill', 'drug'].includes(k)
		);
	let reasoning: string | undefined;
	let userGuidance: string | undefined;

	if (
		matched.includes('medicine') ||
		matched.includes('medication') ||
		matched.includes('pill') ||
		matched.includes('drug')
	) {
		reasoning =
			'This may involve identifying medicine and checking safety. Marathon can monitor and coordinate steps like camera capture, drug info, and doctor letter.';
		userGuidance =
			'Show the medicine label or pill to the camera when prompted. You can turn Marathon off later if not needed.';
	} else if (suggestMarathon) {
		reasoning =
			'This task may benefit from ongoing monitoring. Enabling Marathon allows multiple steps and follow-up.';
	}

	return { score, suggestMarathon, reasoning, userGuidance };
}

/**
 * Whether to suggest marathon for this input (convenience wrapper).
 */
export function shouldSuggestMarathon(userInput: string): boolean {
	return analyzeTaskComplexity(userInput).suggestMarathon;
}
