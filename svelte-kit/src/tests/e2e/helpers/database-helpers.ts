import type { Database } from '$lib/types/database.types';
import type { SupabaseClient } from '@supabase/supabase-js';

type MemoriesRow = Database['public']['Tables']['memories']['Row'];
type RelationshipsRow = Database['public']['Tables']['memory_relationships']['Row'];
type MarathonSessionRow = Database['public']['Tables']['marathon_sessions']['Row'];
type IterativeChatSessionRow = Database['public']['Tables']['iterative_chat_sessions']['Row'];

export async function getMemoriesForUser(
	client: SupabaseClient<Database>,
	userId: string
): Promise<MemoriesRow[]> {
	const { data, error } = await client
		.from('memories')
		.select('*')
		.eq('user_id', userId)
		.order('created_at', { ascending: false })
		.limit(50);

	if (error) {
		throw new Error(`Failed to fetch memories: ${error.message}`);
	}

	return (data ?? []) as MemoriesRow[];
}

export async function getRelationshipsForUser(
	client: SupabaseClient<Database>,
	userId: string
): Promise<RelationshipsRow[]> {
	const memories = await getMemoriesForUser(client, userId);
	const memoryIds = new Set(memories.map((m) => m.id));
	if (memoryIds.size === 0) return [];

	const ids = Array.from(memoryIds);
	const [fromRes, toRes] = await Promise.all([
		client.from('memory_relationships').select('*').in('from_memory_id', ids),
		client.from('memory_relationships').select('*').in('to_memory_id', ids)
	]);

	if (fromRes.error)
		throw new Error(`Failed to fetch relationships (from): ${fromRes.error.message}`);
	if (toRes.error) throw new Error(`Failed to fetch relationships (to): ${toRes.error.message}`);

	const seen = new Set<string>();
	const merged: RelationshipsRow[] = [];
	for (const r of (fromRes.data ?? []) as RelationshipsRow[]) {
		if (!seen.has(r.id)) {
			seen.add(r.id);
			merged.push(r);
		}
	}
	for (const r of (toRes.data ?? []) as RelationshipsRow[]) {
		if (!seen.has(r.id)) {
			seen.add(r.id);
			merged.push(r);
		}
	}
	return merged;
}

export async function getMarathonSessionsForUser(
	client: SupabaseClient<Database>,
	userId: string
): Promise<MarathonSessionRow[]> {
	const { data, error } = await client
		.from('marathon_sessions')
		.select('*')
		.eq('user_id', userId)
		.order('started_at', { ascending: false });

	if (error) {
		throw new Error(`Failed to fetch marathon_sessions: ${error.message}`);
	}

	return (data ?? []) as MarathonSessionRow[];
}

export async function getIterativeChatSessions(
	client: SupabaseClient<Database>,
	userId: string
): Promise<IterativeChatSessionRow[]> {
	const { data, error } = await client
		.from('iterative_chat_sessions')
		.select('*')
		.eq('user_id', userId)
		.order('created_at', { ascending: false });

	if (error) {
		throw new Error(`Failed to fetch iterative_chat_sessions: ${error.message}`);
	}

	return (data ?? []) as IterativeChatSessionRow[];
}
