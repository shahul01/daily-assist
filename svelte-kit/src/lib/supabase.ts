import { createClient } from '@supabase/supabase-js';
import { browser } from '$app/environment';

const url = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_SUPABASE_URL : '';
const key = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY : '';

/** Client-side Supabase (publishable key only). Use for anonymous auth so API calls have a valid auth.users id. */
export const supabase = browser && url && key ? createClient(url, key) : null;

/**
 * Get a valid user ID for API calls: from anonymous session, or null if Supabase isn't configured.
 * Call this before sending userId to /api/agents/orchestrate or /api/agents/remember.
 */
export async function getOrCreateUserId(): Promise<string | null> {
	if (!supabase) return null;
	const {
		data: { session }
	} = await supabase.auth.getSession();
	if (session?.user?.id) return session.user.id;
	const { data, error } = await supabase.auth.signInAnonymously();
	if (error || !data.user?.id) return null;
	return data.user.id;
}
