import type { AgentId } from '$lib/stores/tabState';
import { getAgentLabel } from '$lib/stores/tabState';

/** Orchestrator agent label (e.g. "Find-It") to route AgentId. */
export const AGENT_LABEL_TO_ID: Record<string, AgentId> = {
	'Read-To-Me': 'read',
	'Write-For-Me': 'write',
	'Say-It-For-Me': 'say',
	'Create-For-Me': 'create',
	'See-For-Me': 'see',
	'Hear-For-Me': 'hear',
	'Remember-For-Me': 'remember',
	'Find-It': 'find-it'
};

/** Agent ID to tab/group mapping for Tools tab. */
const AGENT_TO_ROUTE: Record<
	AgentId,
	{ primary: 'tools' | 'chat'; group: string; agent: AgentId }
> = {
	read: { primary: 'tools', group: 'communication', agent: 'read' },
	write: { primary: 'tools', group: 'communication', agent: 'write' },
	say: { primary: 'tools', group: 'communication', agent: 'say' },
	create: { primary: 'tools', group: 'communication', agent: 'create' },
	see: { primary: 'tools', group: 'sense', agent: 'see' },
	hear: { primary: 'tools', group: 'sense', agent: 'hear' },
	'find-it': { primary: 'tools', group: 'sense', agent: 'find-it' },
	remember: { primary: 'tools', group: 'memory', agent: 'remember' }
};

export interface AgentPanelUrlOptions {
	resultId?: string;
}

/**
 * Build URL search string to navigate to a specific agent panel.
 * Use with goto or link href: `?${getAgentPanelUrl('see')}` or with resultId for pre-loaded result.
 */
export function getAgentPanelUrl(agent: AgentId, options: AgentPanelUrlOptions = {}): string {
	const route = AGENT_TO_ROUTE[agent];
	const params = new URLSearchParams();
	params.set('tab', route.primary);
	params.set('group', route.group);
	params.set('agent', route.agent);
	if (options.resultId) params.set('resultId', options.resultId);
	return params.toString();
}

/**
 * Human-readable instruction for opening an agent panel (for synthesis prompts).
 */
export function getNavigationInstruction(agent: AgentId, purpose: string): string {
	const label = getAgentLabel(agent);
	const route = AGENT_TO_ROUTE[agent];
	const path = `Tools → ${route.group === 'communication' ? 'Communication' : route.group === 'sense' ? 'Sense' : 'Memory'} → ${label}`;
	return `${purpose}: open ${label} panel (${path}).`;
}

/** Instructions for common flows (camera, drug info, speak). */
export const PANEL_INSTRUCTIONS = {
	captureMedicine:
		'To capture the medicine for identification: open See-For-Me panel (Tools → Sense → See icon, then tap Start Camera).',
	viewDrugInfo:
		'View detailed drug information in the Find-It panel (click the link below to open it).',
	speakMessage: 'To hear this message spoken: open Say-For-Me panel (Tools → Communication → Say).',
	doctorLetter:
		'Review or send the doctor letter in Write-For-Me panel (Tools → Communication → Write).'
} as const;
