import { json } from '@sveltejs/kit';
import { supabaseServer } from '$lib/server/supabase';
import type { Database } from '$lib/types/database.types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RequestHandler } from './$types';

type MarathonSessionRow = Database['public']['Tables']['marathon_sessions']['Row'];

const TRANSPORT_DISCONNECTED = 'transport was disconnected';

function isTransportDisconnected(e: unknown): boolean {
	return e instanceof Error && e.message.includes(TRANSPORT_DISCONNECTED);
}

export const GET: RequestHandler = async ({ url }) => {
	try {
		const userId = url.searchParams.get('userId');
		if (!userId) {
			return json({ error: 'Missing query: userId' }, { status: 400 });
		}

		let sessionId: string | null = null;
		try {
			const { marathonOrchestrator } = await import('$lib/agents/marathonOrchestrator');
			sessionId = marathonOrchestrator.getSessionId();
		} catch (loadErr) {
			if (isTransportDisconnected(loadErr)) {
				return json({ error: 'Unavailable', message: 'Server is shutting down.' }, { status: 503 });
			}
			throw loadErr;
		}

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

		const typedSessions = (sessions ?? []) as MarathonSessionRow[];
		const activeFromDb = typedSessions.find((s) => s.status === 'running') ?? null;
		const activeSessionId = sessionId ?? activeFromDb?.id ?? null;
		const running = !!activeSessionId;

		return json({
			activeSessionId,
			running,
			sessions: typedSessions.map((s) => ({
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
