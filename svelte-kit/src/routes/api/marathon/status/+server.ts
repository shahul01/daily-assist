import { json } from '@sveltejs/kit';
import { marathonOrchestrator } from '$lib/agents/marathonOrchestrator';
import { supabaseServer } from '$lib/server/supabase';
import type { Database } from '$lib/types/database.types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RequestHandler } from './$types';

type MarathonSessionRow = Database['public']['Tables']['marathon_sessions']['Row'];

export const GET: RequestHandler = async ({ url }) => {
	try {
		const userId = url.searchParams.get('userId');
		if (!userId) {
			return json({ error: 'Missing query: userId' }, { status: 400 });
		}

		const sessionId = marathonOrchestrator.getSessionId();

		const client = supabaseServer as SupabaseClient<Database>;
		const { data: sessions, error } = await client
			.from('marathon_sessions')
			.select('id, status, mode, started_at, last_activity_at, duration_hours')
			.eq('user_id', userId)
			.order('started_at', { ascending: false })
			.limit(5);

		if (error) {
			console.warn('Marathon status fetch error', error);
			return json({
				activeSessionId: sessionId,
				running: !!sessionId,
				sessions: [],
				message: 'Could not load session history.'
			});
		}

		return json({
			activeSessionId: sessionId,
			running: !!sessionId,
			sessions: (sessions ?? []).map((s: MarathonSessionRow) => ({
				id: s.id,
				status: s.status,
				mode: s.mode,
				started_at: s.started_at,
				last_activity_at: s.last_activity_at,
				duration_hours: s.duration_hours
			}))
		});
	} catch (error) {
		console.error('Marathon status API error:', error);
		return json(
			{
				error: 'Failed to get status',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
