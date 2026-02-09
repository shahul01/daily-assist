import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database.types';

/**
 * Log one agent usage for the Usage dashboard. Call after a successful agent API response.
 * No-op if userId is missing or insert fails (log only, do not fail the request).
 */
export async function logAgentUsage(
	client: SupabaseClient<Database>,
	userId: string,
	agentName: string
): Promise<void> {
	if (!userId || !agentName) return;
	try {
		// Table added via migration; types regenerated may not include it yet
		await (client as unknown as { from: (t: string) => { insert: (r: object) => Promise<unknown> } })
			.from('agent_usage_log')
			.insert({ user_id: userId, agent_name: agentName });
	} catch {
		// Do not fail the request if logging fails
	}
}
