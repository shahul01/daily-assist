/**
 * Tier 3: Conversation session and turns persistence for live conversation mode.
 */
import { supabaseServer } from '$lib/server/supabase';

export interface ConversationSession {
	id: string;
	user_id: string;
	started_at: string;
	ended_at: string | null;
	duration_seconds: number | null;
	turn_count: number;
	summary: string | null;
	created_at: string;
}

export interface ConversationTurn {
	id: string;
	session_id: string;
	turn_number: number;
	speaker: 'user' | 'assistant';
	text: string | null;
	audio_url: string | null;
	emotion: string | null;
	created_at: string;
}

/**
 * Start a new conversation session.
 */
export async function startSession(userId: string): Promise<ConversationSession> {
	const { data, error } = await supabaseServer
		.from('conversation_sessions')
		// @ts-expect-error - conversation_sessions Insert type from Database
		.insert({
			user_id: userId,
			started_at: new Date().toISOString(),
			turn_count: 0
		})
		.select()
		.single();
	if (error) throw new Error(`Start conversation session failed: ${error.message}`);
	return data as ConversationSession;
}

/**
 * End a session and set duration.
 */
export async function endSession(sessionId: string, userId: string): Promise<void> {
	const { data: session } = await supabaseServer
		.from('conversation_sessions')
		.select('started_at, turn_count')
		.eq('id', sessionId)
		.eq('user_id', userId)
		.single();
	if (!session) throw new Error('Session not found');
	const started = new Date((session as { started_at: string }).started_at).getTime();
	const durationSeconds = Math.floor((Date.now() - started) / 1000);
	const { error } = await supabaseServer
		.from('conversation_sessions')
		// @ts-expect-error - conversation_sessions Update type from Database
		.update({
			ended_at: new Date().toISOString(),
			duration_seconds: durationSeconds
		})
		.eq('id', sessionId)
		.eq('user_id', userId);
	if (error) throw new Error(`End conversation session failed: ${error.message}`);
}

/**
 * Add a turn to a session.
 */
export async function addTurn(
	sessionId: string,
	speaker: 'user' | 'assistant',
	text: string | null,
	options?: { audioUrl?: string; emotion?: string }
): Promise<ConversationTurn> {
	const { data: session } = await supabaseServer
		.from('conversation_sessions')
		.select('turn_count')
		.eq('id', sessionId)
		.single();
	if (!session) throw new Error('Session not found');
	const turnNumber = ((session as { turn_count: number }).turn_count ?? 0) + 1;
	const { data, error } = await supabaseServer
		.from('conversation_turns')
		// @ts-expect-error - conversation_turns Insert type from Database
		.insert({
			session_id: sessionId,
			turn_number: turnNumber,
			speaker,
			text: text ?? null,
			audio_url: options?.audioUrl ?? null,
			emotion: options?.emotion ?? null
		})
		.select()
		.single();
	if (error) throw new Error(`Add conversation turn failed: ${error.message}`);
	await supabaseServer
		.from('conversation_sessions')
		// @ts-expect-error - conversation_sessions Update type from Database
		.update({ turn_count: turnNumber })
		.eq('id', sessionId);
	return data as ConversationTurn;
}

/**
 * Get session with turns (history).
 */
export async function getSessionHistory(
	sessionId: string,
	userId: string
): Promise<{ session: ConversationSession; turns: ConversationTurn[] } | null> {
	const { data: session, error: e1 } = await supabaseServer
		.from('conversation_sessions')
		.select('*')
		.eq('id', sessionId)
		.eq('user_id', userId)
		.single();
	if (e1 || !session) return null;
	const { data: turns, error: e2 } = await supabaseServer
		.from('conversation_turns')
		.select('*')
		.eq('session_id', sessionId)
		.order('turn_number', { ascending: true });
	if (e2) throw new Error(`Get conversation turns failed: ${e2.message}`);
	return {
		session: session as ConversationSession,
		turns: (turns ?? []) as ConversationTurn[]
	};
}

/**
 * List recent sessions for user.
 */
export async function listSessions(userId: string, limit = 10): Promise<ConversationSession[]> {
	const { data, error } = await supabaseServer
		.from('conversation_sessions')
		.select('*')
		.eq('user_id', userId)
		.order('started_at', { ascending: false })
		.limit(limit);
	if (error) throw new Error(`List conversation sessions failed: ${error.message}`);
	return (data ?? []) as ConversationSession[];
}
