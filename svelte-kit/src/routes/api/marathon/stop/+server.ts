import { json } from '@sveltejs/kit';
import { marathonOrchestrator } from '$lib/agents/marathonOrchestrator';
import { supabaseServer } from '$lib/server/supabase';
import type { Database } from '$lib/types/database.types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RequestHandler } from './$types';

type MarathonSessionRow = Database['public']['Tables']['marathon_sessions']['Row'];

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json().catch(() => ({}));
		const userId = body?.userId;
		if (!userId || typeof userId !== 'string') {
			return json({ error: 'Missing or invalid userId' }, { status: 400 });
		}

		// Best-effort signal for in-memory orchestrator (local dev / long-lived server).
		marathonOrchestrator.stop();
		const sessionId = marathonOrchestrator.getSessionId();

		// Also mark the latest running session as stopped in the database so that
		// status checks remain correct even if the orchestrator instance is not shared.
		const client = supabaseServer as SupabaseClient<Database>;
		const { data: activeSessions, error } = await client
			.from('marathon_sessions')
			.select('id, status, mode, started_at, last_activity_at, duration_hours')
			.eq('user_id', userId)
			.eq('status', 'running')
			.order('started_at', { ascending: false })
			.limit(1);

		if (!error && activeSessions && activeSessions.length > 0) {
			const typedActive = activeSessions as MarathonSessionRow[];
			const activeId = typedActive[0]?.id;
			if (activeId) {
				await client
					.from('marathon_sessions')
					// @ts-expect-error Supabase client infers never for marathon_sessions update in this SDK
					.update({
						status: 'stopped',
						ended_at: new Date().toISOString()
					} as Database['public']['Tables']['marathon_sessions']['Update'])
					.eq('id', activeId);
			}
		}

		return json({
			stopped: true,
			sessionId: sessionId ?? null,
			message: 'Marathon stop requested; session will end after current cycle.'
		});
	} catch (error) {
		console.error('Marathon stop API error:', error);
		return json(
			{
				error: 'Failed to stop marathon',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
