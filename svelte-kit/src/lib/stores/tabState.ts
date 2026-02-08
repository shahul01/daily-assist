/**
 * Tab navigation types and constants.
 * Actual state is held by +page.svelte and synced with URL search params.
 */

export type PrimaryTab = 'home' | 'chat' | 'tools' | 'dashboard';
export type FunctionGroup = 'communication' | 'sense' | 'memory';
export type AgentId = 'read' | 'write' | 'say' | 'create' | 'see' | 'hear' | 'remember';

export interface TabState {
	primary: PrimaryTab;
	group: FunctionGroup | undefined;
	agent: AgentId | undefined;
}

export const PRIMARY_TABS: Array<{ id: PrimaryTab; label: string; icon: string }> = [
	{ id: 'home', label: 'Home', icon: '🏠' },
	{ id: 'chat', label: 'Chat', icon: '💬' },
	{ id: 'tools', label: 'Tools', icon: '🔧' },
	{ id: 'dashboard', label: 'Dashboard', icon: '📊' }
];

export const FUNCTION_GROUPS: Array<{ id: FunctionGroup; label: string; icon: string }> = [
	{ id: 'communication', label: 'Communication', icon: '🗣️' },
	{ id: 'sense', label: 'Sense', icon: '👁️' },
	{ id: 'memory', label: 'Memory', icon: '🧠' }
];

export const AGENTS_BY_GROUP: Record<
	FunctionGroup,
	Array<{ id: AgentId; label: string; icon: string }>
> = {
	communication: [
		{ id: 'read', label: 'Read', icon: '📖' },
		{ id: 'write', label: 'Write', icon: '✍️' },
		{ id: 'say', label: 'Say', icon: '🗣️' },
		{ id: 'create', label: 'Create', icon: '🎨' }
	],
	sense: [
		{ id: 'see', label: 'See', icon: '👁️' },
		{ id: 'hear', label: 'Hear', icon: '👂' }
	],
	memory: [{ id: 'remember', label: 'Remember', icon: '🧠' }]
};

/** All agents in flat list for Tools tab */
export const ALL_AGENTS_IDS: AgentId[] = [
	'read',
	'write',
	'say',
	'create',
	'see',
	'hear',
	'remember'
];

const AGENT_LABELS: Record<AgentId, string> = {
	read: 'Read-To-Me',
	write: 'Write-For-Me',
	say: 'Say-It-For-Me',
	create: 'Create-For-Me',
	see: 'See-For-Me',
	hear: 'Hear-For-Me',
	remember: 'Remember-For-Me'
};

export function getAgentLabel(id: AgentId): string {
	return AGENT_LABELS[id];
}

const STORAGE_KEY = 'dailyassist-tab-state';

export function loadPersistedTabState(): Partial<TabState> | null {
	if (typeof window === 'undefined') return null;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Partial<TabState>;
		if (parsed.primary && PRIMARY_TABS.some((t) => t.id === parsed.primary)) return parsed;
	} catch {
		// ignore
	}
	return null;
}

export function persistTabState(state: TabState): void {
	if (typeof window === 'undefined') return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch {
		// ignore
	}
}

export function parseTabStateFromUrl(params: URLSearchParams): TabState {
	const primary = (params.get('tab') as PrimaryTab) || 'home';
	const group = (params.get('group') as FunctionGroup) || undefined;
	const agent = (params.get('agent') as AgentId) || undefined;
	const validPrimary = PRIMARY_TABS.some((t) => t.id === primary) ? primary : 'home';
	const validGroup = group && FUNCTION_GROUPS.some((g) => g.id === group) ? group : undefined;
	const validAgent = agent && ALL_AGENTS_IDS.includes(agent) ? agent : undefined;
	return {
		primary: validPrimary,
		group: validGroup,
		agent: validAgent
	};
}

export function tabStateToSearchParams(state: TabState): URLSearchParams {
	const p = new URLSearchParams();
	p.set('tab', state.primary);
	if (state.group) p.set('group', state.group);
	if (state.agent) p.set('agent', state.agent);
	return p;
}
