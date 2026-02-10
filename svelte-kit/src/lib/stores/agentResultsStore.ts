import { writable } from 'svelte/store';

export interface AgentResult {
	id: string;
	agent: string;
	action: string;
	result: unknown;
	timestamp: string;
	userId: string;
}

const STORAGE_KEY = 'dailyassist-agent-results';
const MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

function loadFromStorage(): Map<string, AgentResult> {
	if (typeof window === 'undefined') return new Map();
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return new Map();
		const arr = JSON.parse(raw) as AgentResult[];
		const map = new Map<string, AgentResult>();
		const cutoff = Date.now() - MAX_AGE_MS;
		for (const r of arr) {
			if (r.id && new Date(r.timestamp).getTime() > cutoff) map.set(r.id, r);
		}
		return map;
	} catch {
		return new Map();
	}
}

function saveToStorage(map: Map<string, AgentResult>): void {
	if (typeof window === 'undefined') return;
	try {
		const arr = Array.from(map.values());
		localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
	} catch {
		// ignore
	}
}

const initial = loadFromStorage();
export const recentAgentResults = writable<Map<string, AgentResult>>(initial);

let currentMap: Map<string, AgentResult> = initial;
recentAgentResults.subscribe((m) => {
	currentMap = m;
});

export function storeAgentResult(
	payload: Omit<AgentResult, 'id' | 'timestamp'> & { id?: string; timestamp?: string }
): string {
	const id = payload.id ?? crypto.randomUUID();
	const result: AgentResult = {
		id,
		agent: payload.agent,
		action: payload.action,
		result: payload.result,
		timestamp: payload.timestamp ?? new Date().toISOString(),
		userId: payload.userId
	};
	recentAgentResults.update((m) => {
		const next = new Map(m);
		next.set(id, result);
		saveToStorage(next);
		return next;
	});
	return id;
}

export function getAgentResult(id: string): AgentResult | null {
	return currentMap.get(id) ?? null;
}

/** Prune entries older than MAX_AGE_MS. */
export function clearOldAgentResults(): void {
	const cutoff = Date.now() - MAX_AGE_MS;
	recentAgentResults.update((m) => {
		const next = new Map(m);
		for (const [k, v] of next) {
			if (new Date(v.timestamp).getTime() < cutoff) next.delete(k);
		}
		saveToStorage(next);
		return next;
	});
}
