import { supabaseServer } from '$lib/server/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database.types';

const supabase = supabaseServer as SupabaseClient<Database>;

export interface MarathonCheckpointState {
	sequenceNumber: number;
	conversationHistory?: unknown[];
	lastThoughtSignatureIds?: string[];
	lastActionId?: string;
	metadata?: Record<string, unknown>;
}

/**
 * Save a checkpoint for a marathon session (every N actions or minutes).
 * Call from server context only.
 */
export async function saveCheckpoint(
	sessionId: string,
	state: MarathonCheckpointState
): Promise<void> {
	type CheckpointInsert = Database['public']['Tables']['marathon_checkpoints']['Insert'];
	const { error } = await supabase
		.from('marathon_checkpoints')
		// @ts-expect-error Supabase client infers never for marathon_checkpoints insert
		.insert({
			marathon_session_id: sessionId,
			sequence_number: state.sequenceNumber,
			full_state: state.conversationHistory ?? state.metadata ?? null,
			thought_signature_ids: state.lastThoughtSignatureIds ?? [],
			last_action_id: state.lastActionId ?? null
		} as CheckpointInsert);
	if (error) {
		console.error('[stateManager] saveCheckpoint failed', { sessionId, error: error.message });
		throw error;
	}
}

/**
 * Load latest checkpoint for a session (for recovery).
 */
export async function loadLatestCheckpoint(
	sessionId: string
): Promise<MarathonCheckpointState | null> {
	const { data, error } = await supabase
		.from('marathon_checkpoints')
		.select('sequence_number, full_state, thought_signature_ids, last_action_id')
		.eq('marathon_session_id', sessionId)
		.order('sequence_number', { ascending: false })
		.limit(1)
		.maybeSingle();

	if (error || !data) return null;
	const row = data as {
		sequence_number: number;
		full_state: unknown;
		thought_signature_ids: string[] | null;
		last_action_id: string | null;
	};
	return {
		sequenceNumber: row.sequence_number,
		conversationHistory: (row.full_state as unknown[]) ?? undefined,
		lastThoughtSignatureIds: row.thought_signature_ids ?? undefined,
		lastActionId: row.last_action_id ?? undefined
	};
}

/**
 * Persist thought signature to DB for continuity across sessions.
 */
export async function persistThoughtSignature(
	userId: string,
	sessionId: string | null,
	signature: string,
	context: string,
	agentUsed: string,
	taskCompleted: boolean
): Promise<string> {
	type ThoughtSigInsert = Database['public']['Tables']['thought_signatures']['Insert'];
	const { data, error } = await supabase
		.from('thought_signatures')
		// @ts-expect-error Supabase client infers never for thought_signatures insert
		.insert({
			user_id: userId,
			marathon_session_id: sessionId,
			signature,
			context,
			agent_used: agentUsed,
			task_completed: taskCompleted
		} as ThoughtSigInsert)
		.select('id')
		.single();

	if (error) {
		console.error('[stateManager] persistThoughtSignature failed', {
			userId,
			error: error.message
		});
		throw error;
	}
	return (data as { id: string }).id;
}

/**
 * Load recent thought signatures for a user (for context in next request).
 */
export async function loadRecentThoughtSignatures(
	userId: string,
	sessionId: string | null,
	limit: number = 20
): Promise<
	Array<{ id: string; signature: string; context: string | null; agent_used: string | null }>
> {
	let q = supabase
		.from('thought_signatures')
		.select('id, signature, context, agent_used')
		.eq('user_id', userId)
		.order('created_at', { ascending: false })
		.limit(limit);
	if (sessionId) {
		q = q.or(`marathon_session_id.eq.${sessionId},marathon_session_id.is.null`);
	}
	const { data, error } = await q;
	if (error) {
		console.warn('[stateManager] loadRecentThoughtSignatures failed', error.message);
		return [];
	}
	return (data ?? []) as Array<{
		id: string;
		signature: string;
		context: string | null;
		agent_used: string | null;
	}>;
}

/**
 * Run 14-day pruning (call from cron or periodically).
 */
export async function pruneOldMarathonData(): Promise<void> {
	const { error } = await supabase.rpc('prune_old_marathon_data');
	if (error) {
		console.error('[stateManager] pruneOldMarathonData failed', error.message);
		throw error;
	}
}
