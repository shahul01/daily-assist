/**
 * User guidance for multi-step workflows (e.g. show medicine to camera).
 * Used by orchestrator and UI to display step-by-step instructions.
 */

export interface UserGuidanceStep {
	id: string;
	instruction: string;
	visual?: string;
	duration?: number;
	skippable: boolean;
}

export interface WorkflowGuidance {
	workflowName: string;
	steps: UserGuidanceStep[];
	currentStep: number;
}

export type GuidanceTemplateId =
	| 'camera_medicine'
	| 'camera_document'
	| 'voice_recording'
	| 'multi_step';

const GUIDANCE_TEMPLATES: Record<GuidanceTemplateId, UserGuidanceStep[]> = {
	camera_medicine: [
		{
			id: 'position',
			instruction: 'Position the medicine label or pill clearly in frame.',
			visual: 'camera',
			skippable: false
		},
		{ id: 'lighting', instruction: 'Ensure good lighting and avoid glare.', skippable: true },
		{ id: 'steady', instruction: 'Hold steady for a moment so we can read it.', skippable: false }
	],
	camera_document: [
		{
			id: 'flat',
			instruction: 'Place the document flat with text facing the camera.',
			visual: 'camera',
			skippable: false
		},
		{ id: 'lighting', instruction: 'Ensure even lighting and minimal shadows.', skippable: true },
		{ id: 'steady', instruction: 'Hold steady or place on a flat surface.', skippable: false }
	],
	voice_recording: [
		{ id: 'quiet', instruction: 'Find a quiet place to reduce background noise.', skippable: true },
		{ id: 'speak', instruction: 'Speak clearly at a normal pace.', skippable: false }
	],
	multi_step: [
		{
			id: 'step',
			instruction: 'Follow the steps shown. You can skip optional steps if needed.',
			skippable: true
		}
	]
};

/**
 * Get predefined guidance steps for a template.
 */
export function getGuidanceTemplate(templateId: GuidanceTemplateId): UserGuidanceStep[] {
	return [...(GUIDANCE_TEMPLATES[templateId] ?? GUIDANCE_TEMPLATES.multi_step)];
}

/**
 * Build workflow guidance with current step index.
 */
export function buildWorkflowGuidance(
	workflowName: string,
	templateId: GuidanceTemplateId,
	currentStep = 0
): WorkflowGuidance {
	const steps = getGuidanceTemplate(templateId);
	return {
		workflowName,
		steps,
		currentStep: Math.max(0, Math.min(currentStep, steps.length - 1))
	};
}
