import { supabaseServer } from '$lib/server/supabase';
import { extractMemories } from '$lib/memory/extractors';
import * as vectorStore from '$lib/memory/vector-store';
import * as graphStore from '$lib/memory/graph-store';
import * as kvStore from '$lib/memory/kv-store';
import * as rulesEngine from '$lib/memory/rules-engine';
import type { RetrieveOptions } from '$lib/memory/types';
import type { Database } from '$lib/types/database.types';
import type { MemoryTypeEnum } from '$lib/types/database.types';

type MemoryRow = Database['public']['Tables']['memories']['Row'];

export interface ProcessConversationInput {
	messages: Array<{ role: string; content: string; parts?: Array<{ text: string }> }>;
	userId: string;
}

export interface MemorySummary {
	preferences: Record<string, unknown>;
	activeGoals: Database['public']['Tables']['goals']['Row'][];
	pendingTodos: Database['public']['Tables']['todos']['Row'][];
	learnedPatterns: Array<{ pattern: string; confidence: number }>;
	recentMemories: Array<MemoryRow & { similarity?: number }>;
}

/**
 * Process conversation: extract memories, store in vector/graph/kv, update rules.
 */
export async function processConversation(input: ProcessConversationInput): Promise<MemoryRow[]> {
	const extracted = await extractMemories(input.messages, input.userId);
	const stored: MemoryRow[] = [];

	for (const mem of extracted) {
		try {
			const row = await vectorStore.addMemory({
				text: mem.text,
				userId: input.userId,
				memoryType: mem.type as MemoryTypeEnum,
				category: mem.category ?? null,
				summary: mem.title ?? mem.text.slice(0, 200),
				confidence: mem.confidence,
				contextTags: mem.context as Record<string, unknown> | undefined
			});
			stored.push(row);

			if (mem.relationships?.length) {
				for (const rel of mem.relationships) {
					if (rel.targetId) {
						await graphStore.addEdge({
							fromMemoryId: row.id,
							toMemoryId: rel.targetId,
							type: rel.type,
							strength: rel.strength,
							context: rel.context ?? null
						});
					}
				}
			}
			if (mem.type === 'preference' && mem.key) {
				await kvStore.kvSet(input.userId, `pref:${mem.key}`, mem.value ?? mem.text);
			}
		} catch (e) {
			console.error('[memory] store failed for extracted memory:', mem.text, e);
		}
	}

	// Link memories from the same conversation so graph store is populated and retrieve() can expand
	if (stored.length >= 2) {
		for (let i = 0; i < stored.length; i++) {
			for (let j = i + 1; j < stored.length; j++) {
				try {
					await graphStore.addEdge({
						fromMemoryId: stored[i].id,
						toMemoryId: stored[j].id,
						type: 'RELATES_TO',
						strength: 0.7,
						context: 'same_conversation'
					});
				} catch (e) {
					console.warn('[memory] graph edge failed:', e);
				}
			}
		}
	}
	return stored;
}

/**
 * Retrieve relevant memories for a query (semantic search + graph expansion + rules boost).
 */
export async function retrieve(
	userId: string,
	query: string,
	options: RetrieveOptions = {}
): Promise<Array<MemoryRow & { similarity?: number }>> {
	const { limit = 5, includeRelated = true, types = null } = options;
	const vectorResults = await vectorStore.searchMemories(userId, query, {
		limit: limit * 2,
		threshold: 0.4,
		filterType: types?.length ? types[0] : undefined
	});
	const rules = await rulesEngine.getActiveRules(userId);
	const boosted = rulesEngine.boostResults(vectorResults, rules, query);
	let memories = boosted.slice(0, limit).map((r) => ({ ...r, similarity: r.similarity }));

	if (includeRelated && memories.length > 0) {
		const relatedIds = new Set<string>();
		for (const m of memories) {
			const ids = await graphStore.getRelatedMemoryIds(m.id, { maxDepth: 1, relationshipTypes: ['REQUIRES', 'SUPPORTS', 'RELATES_TO'] });
			ids.forEach((id) => relatedIds.add(id));
		}
		for (const m of memories) {
			relatedIds.delete(m.id);
		}
		const related = await graphStore.getMemoriesByIds(Array.from(relatedIds));
		const dedup = new Map(memories.map((m) => [m.id, m]));
		for (const r of related) {
			if (!dedup.has(r.id)) dedup.set(r.id, { ...r, similarity: 0 });
		}
		memories = Array.from(dedup.values()).sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0)).slice(0, limit);
	}

	await vectorStore.trackAccess(memories.map((m) => m.id));
	return memories;
}

/**
 * Get high-level summary for context injection (preferences, goals, todos, rules).
 */
export async function getMemorySummary(userId: string, recentQuery?: string): Promise<MemorySummary> {
	const [prefs, goalsRes, todosRes, rules, recentMemories] = await Promise.all([
		kvStore.kvGetAll(userId, 'pref:'),
		supabaseServer.from('goals').select('*').eq('user_id', userId).eq('status', 'active'),
		supabaseServer.from('todos').select('*').eq('user_id', userId).eq('completed', false),
		rulesEngine.getActiveRules(userId),
		recentQuery ? retrieve(userId, recentQuery, { limit: 3, includeRelated: false }) : Promise.resolve([])
	]);

	const { data: goals } = goalsRes;
	const { data: todos } = todosRes;

	return {
		preferences: prefs as Record<string, unknown>,
		activeGoals: (goals ?? []) as Database['public']['Tables']['goals']['Row'][],
		pendingTodos: (todos ?? []) as Database['public']['Tables']['todos']['Row'][],
		learnedPatterns: rules.map((r) => ({ pattern: r.pattern, confidence: r.confidence })),
		recentMemories: recentMemories
	};
}
