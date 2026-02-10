/**
 * Thinking level selection for Gemini calls.
 * Safety-critical and complex reasoning use higher levels; simple tasks use lower.
 */

export type ThinkingLevel = 'low' | 'medium' | 'high' | 'minimal';

export interface ThinkingLevelContext {
	safetyCritical?: boolean;
	complexReasoning?: boolean;
}

/** Action types used by orchestrator and agents */
const ACTION_LEVEL_MAP: Record<string, ThinkingLevel> = {
	// Safety-critical
	identify_medicine: 'high',
	search_drug_info: 'high',
	emergency_assessment: 'high',
	// Complex writing
	compose_email: 'high',
	compose_letter: 'high',
	refine_text: 'medium',
	adjust_tone: 'medium',
	correct_grammar: 'low',
	// Read/OCR
	read_text: 'low',
	read_image: 'medium',
	read_visible_text: 'low',
	analyze_frame: 'low',
	// Remember
	create_reminder: 'low',
	list_reminders: 'low',
	create_medication: 'low',
	list_medications: 'low',
	create_appointment: 'low',
	list_appointments: 'low',
	analyze_patterns: 'medium',
	// Find-It
	search_files: 'low',
	locate_document: 'low',
	list_directory: 'low',
	// Say
	speak_message: 'minimal',
	// Orchestration (use 'low' for gemini-3-pro-preview; MEDIUM not supported by this model)
	orchestration_plan: 'low',
	synthesis: 'low',
	verification: 'high',
	marathon_reason: 'low'
};

const DEFAULT_LEVEL: ThinkingLevel = 'low';

/**
 * Select thinking level for an action type and optional context.
 * @param actionType - e.g. 'identify_medicine', 'compose_email', 'orchestration_plan'
 * @param context - optional overrides (safetyCritical => high, complexReasoning => medium)
 * @returns ThinkingLevel for Gemini generationConfig
 */
export function selectThinkingLevel(
	actionType: string,
	context?: ThinkingLevelContext
): ThinkingLevel {
	if (context?.safetyCritical) return 'high';
	if (context?.complexReasoning) return 'medium';
	const normalized = actionType.trim().toLowerCase().replace(/\s+/g, '_');
	return ACTION_LEVEL_MAP[normalized] ?? DEFAULT_LEVEL;
}
