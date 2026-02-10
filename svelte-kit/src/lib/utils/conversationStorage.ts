import type { StoredConversation, SaveConversationInput } from '$lib/types/conversation';

const STORAGE_KEY = 'dailyassist-conversations';
const MAX_CONVERSATIONS = 50;

function generateId(): string {
	return typeof crypto !== 'undefined' && crypto.randomUUID
		? crypto.randomUUID()
		: `local-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function readAll(): StoredConversation[] {
	if (typeof window === 'undefined') return [];
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(
			(item): item is StoredConversation =>
				item != null &&
				typeof item === 'object' &&
				typeof item.id === 'string' &&
				typeof item.createdAt === 'string'
		);
	} catch {
		return [];
	}
}

function writeAll(list: StoredConversation[]): void {
	if (typeof window === 'undefined') return;
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
	} catch (err) {
		if (err instanceof Error && err.name === 'QuotaExceededError') {
			const pruned = list.slice(0, Math.floor(MAX_CONVERSATIONS / 2));
			try {
				window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
			} catch {
				// ignore
			}
		}
	}
}

/**
 * Save a conversation to localStorage. Prunes to keep last MAX_CONVERSATIONS.
 */
export function saveConversation(input: SaveConversationInput): void {
	const list = readAll();
	const item: StoredConversation = {
		id: generateId(),
		createdAt: new Date().toISOString(),
		...input
	};
	const next = [item, ...list].slice(0, MAX_CONVERSATIONS);
	writeAll(next);
}

/** List conversations newest first. */
export function listConversations(): StoredConversation[] {
	const list = readAll();
	return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/** Get one conversation by id. */
export function getConversation(id: string): StoredConversation | null {
	const list = readAll();
	return list.find((c) => c.id === id) ?? null;
}

/** Delete one conversation by id. */
export function deleteConversation(id: string): void {
	const list = readAll().filter((c) => c.id !== id);
	writeAll(list);
}

/** Clear all stored conversations. */
export function clearAllConversations(): void {
	if (typeof window === 'undefined') return;
	try {
		window.localStorage.removeItem(STORAGE_KEY);
	} catch {
		// ignore
	}
}
