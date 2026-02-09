import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseServer } from '$lib/server/supabase';
import type { Database } from '$lib/types/database.types';
import type { SupabaseClient } from '@supabase/supabase-js';

const client = supabaseServer as SupabaseClient<Database>;

export const GET: RequestHandler = async ({ url }) => {
	const userId = url.searchParams.get('userId');
	if (!userId || typeof userId !== 'string') {
		return json({ error: 'Missing userId' }, { status: 400 });
	}
	try {
		const { data, error: err } = await client
			.from('iterative_chat_sessions')
			.select('id, user_input, iterations_count, final_response, created_at')
			.eq('user_id', userId)
			.order('created_at', { ascending: false })
			.limit(50);

		if (err) {
			return json({ sessions: [] });
		}
		return json({ sessions: data ?? [] });
	} catch {
		return json({ sessions: [] });
	}
};
