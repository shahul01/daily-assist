import { supabaseServer } from '$lib/server/supabase';
import type { Database } from '$lib/types/database.types';
import type { RelationshipType } from './types';

type RelInsert = Database['public']['Tables']['memory_relationships']['Insert'];

export interface AddEdgeInput {
	fromMemoryId: string;
	toMemoryId: string;
	type: RelationshipType | string;
	strength?: number;
	context?: string | null;
}

/**
 * Add a directed edge between two memories.
 */
export async function addEdge(input: AddEdgeInput): Promise<void> {
	const insert: RelInsert = {
		from_memory_id: input.fromMemoryId,
		to_memory_id: input.toMemoryId,
		relationship_type: input.type,
		strength: input.strength ?? 0.5,
		context: input.context ?? null
	};
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const { error } = await supabaseServer.from('memory_relationships').upsert(insert as any, {
		onConflict: 'from_memory_id,to_memory_id,relationship_type'
	});
	if (error) throw new Error(`Graph store addEdge failed: ${error.message}`);
}

/**
 * Get memory IDs related to the given node within maxDepth hops.
 */
export async function getRelatedMemoryIds(
	memoryId: string,
	options: { maxDepth?: number; relationshipTypes?: string[] } = {}
): Promise<string[]> {
	const { maxDepth = 2, relationshipTypes } = options;
	// Traverse from memoryId both directions (from->to and to->from)
	let fromQ = supabaseServer
		.from('memory_relationships')
		.select('to_memory_id')
		.eq('from_memory_id', memoryId);
	let toQ = supabaseServer
		.from('memory_relationships')
		.select('from_memory_id')
		.eq('to_memory_id', memoryId);
	if (relationshipTypes?.length) {
		fromQ = fromQ.in('relationship_type', relationshipTypes);
		toQ = toQ.in('relationship_type', relationshipTypes);
	}
	const { data: fromRows, error: e1 } = await fromQ;
	if (e1) throw new Error(`Graph getRelated failed: ${e1.message}`);
	const { data: toRows, error: e2 } = await toQ;
	if (e2) throw new Error(`Graph getRelated failed: ${e2.message}`);

	const ids = new Set<string>();
	const addWithDepth = (id: string, depth: number) => {
		if (id === memoryId || depth > maxDepth) return;
		ids.add(id);
	};
	(fromRows ?? []).forEach((r: { to_memory_id: string }) => addWithDepth(r.to_memory_id, 1));
	(toRows ?? []).forEach((r: { from_memory_id: string }) => addWithDepth(r.from_memory_id, 1));

	if (maxDepth >= 2) {
		for (const id of Array.from(ids)) {
			const { data: from2 } = await supabaseServer
				.from('memory_relationships')
				.select('to_memory_id')
				.eq('from_memory_id', id);
			const { data: to2 } = await supabaseServer
				.from('memory_relationships')
				.select('from_memory_id')
				.eq('to_memory_id', id);
			(from2 ?? []).forEach((r: { to_memory_id: string }) => ids.add(r.to_memory_id));
			(to2 ?? []).forEach((r: { from_memory_id: string }) => ids.add(r.from_memory_id));
		}
		ids.delete(memoryId);
	}
	return Array.from(ids);
}

/**
 * Fetch full memory rows by IDs.
 */
export async function getMemoriesByIds(
	ids: string[]
): Promise<Database['public']['Tables']['memories']['Row'][]> {
	if (ids.length === 0) return [];
	const { data, error } = await supabaseServer.from('memories').select('*').in('id', ids);
	if (error) throw new Error(`Graph getMemoriesByIds failed: ${error.message}`);
	return (data ?? []) as Database['public']['Tables']['memories']['Row'][];
}
