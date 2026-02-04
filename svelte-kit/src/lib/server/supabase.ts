import { env } from '$env/dynamic/private';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database.types';

/**
 * Server-side Supabase client with service role key.
 * Use for API routes that need to read/write on behalf of any user (e.g. when userId is in request body).
 * Never expose this client or service role key to the browser.
 */
function getSupabaseServerClient(): SupabaseClient<Database> {
	const url = env.SUPABASE_URL;
	const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !serviceRoleKey) {
		throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
	}
	return createClient<Database>(url, serviceRoleKey, {
		auth: { persistSession: false }
	});
}

export const supabaseServer = getSupabaseServerClient();
