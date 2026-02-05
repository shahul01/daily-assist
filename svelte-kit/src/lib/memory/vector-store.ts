import { supabaseServer } from '$lib/server/supabase';
import { generateEmbedding } from '$lib/server/embeddings';
import type { MemoryTypeEnum } from '$lib/types/database.types';
import type { Database } from '$lib/types/database.types';

type MemoryRow = Database['public']['Tables']['memories']['Row'];
type MemoryInsert = Database['public']['Tables']['memories']['Insert'];

export interface VectorStoreAddInput {
	text: string;
	userId: string;
	memoryType: MemoryTypeEnum;
	category?: string | null;
	summary?: string | null;
	confidence?: number;
	extractionSource?: string | null;
	contextTags?: Record<string, unknown>;
}

export interface VectorStoreSearchOptions {
	limit?: number;
	threshold?: number;
	filterType?: MemoryTypeEnum | null;
}

/**
 * Vector store using Supabase pgvector. All operations are scoped by userId.
 */
export async function addMemory(data: VectorStoreAddInput): Promise<MemoryRow> {
	const embedding = await generateEmbedding(data.text);
	const insert: MemoryInsert = {
		user_id: data.userId,
		memory_type: data.memoryType,
		category: data.category ?? null,
		text_content: data.text,
		summary: data.summary ?? null,
		embedding,
		confidence: data.confidence ?? 0.5,
		extraction_source: data.extractionSource ?? null,
		context_tags:
			(data.contextTags as Database['public']['Tables']['memories']['Row']['context_tags']) ?? {}
	};
	const { data: row, error } = await supabaseServer
		.from('memories')
		// @ts-expect-error Supabase client generic flows as never; insert matches MemoryInsert
		.insert(insert)
		.select()
		.single();
	if (error) throw new Error(`Vector store add failed: ${error.message}`);
	return row as MemoryRow;
}

/**
 * Semantic search over user's memories.
 */
export async function searchMemories(
	userId: string,
	query: string,
	options: VectorStoreSearchOptions = {}
): Promise<Array<MemoryRow & { similarity: number }>> {
	const { limit = 5, threshold = 0.5, filterType = null } = options;
	const queryEmbedding = await generateEmbedding(query);
	type MatchMemoriesArgs = Database['public']['Functions']['match_memories']['Args'];
	const rpcPayload: MatchMemoriesArgs = {
		query_embedding: queryEmbedding,
		match_user_id: userId,
		match_threshold: threshold,
		match_count: limit,
		filter_type: filterType
	};
	// @ts-expect-error Supabase RPC generic flows as undefined in this project; payload matches match_memories Args
	const { data, error } = await supabaseServer.rpc('match_memories', rpcPayload);
	if (error) throw new Error(`Vector store search failed: ${error.message}`);
	return (data ?? []) as Array<MemoryRow & { similarity: number }>;
}

/**
 * Update last_accessed for retrieved memories.
 */
export async function trackAccess(memoryIds: string[]): Promise<void> {
	if (memoryIds.length === 0) return;
	const now = new Date().toISOString();
	for (const id of memoryIds) {
		const { data: row } = await supabaseServer
			.from('memories')
			.select('access_count')
			.eq('id', id)
			.single();
		const next = (row as { access_count?: number } | null)?.access_count ?? 0;
		type MemoryUpdate = Database['public']['Tables']['memories']['Update'];
		const updatePayload: MemoryUpdate = { last_accessed: now, access_count: next + 1 };
		// @ts-expect-error Supabase client generic flows as never in this project; payload matches Table update type
		await supabaseServer.from('memories').update(updatePayload).eq('id', id);
	}
}
