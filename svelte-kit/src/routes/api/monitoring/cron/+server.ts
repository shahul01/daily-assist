import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import { supabaseServer } from '$lib/server/supabase';
import { runBackgroundTick } from '$lib/agents/backgroundMonitor';
import type { RequestHandler } from './$types';

const MAX_USERS_PER_RUN = 50;

/**
 * Cron endpoint for reminder monitoring.
 * Call daily (e.g. Vercel Cron; Hobby plan allows once/day). Requires CRON_SECRET in env.
 * Runs background tick for users with user_preferences key "background_monitoring" = true.
 */
export const GET: RequestHandler = async ({ request }) => {
	const secret = env.CRON_SECRET;
	if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const { data } = await supabaseServer
			.from('user_preferences')
			.select('user_id, value')
			.eq('key', 'background_monitoring')
			.limit(MAX_USERS_PER_RUN * 2);

		type PrefRow = { user_id: string; value: unknown };
		const prefs = (data ?? []) as PrefRow[];
		const userIds: string[] = [];
		for (const row of prefs) {
			const v = row.value;
			if (
				v === true ||
				(typeof v === 'object' && v !== null && (v as { enabled?: boolean }).enabled === true)
			) {
				userIds.push(row.user_id);
			}
		}
		const toRun = userIds.slice(0, MAX_USERS_PER_RUN);

		let ok = 0;
		let err = 0;
		for (const userId of toRun) {
			try {
				await runBackgroundTick(userId);
				ok += 1;
			} catch (e) {
				console.error('runBackgroundTick failed for', userId, e);
				err += 1;
			}
		}

		return json({
			ok: true,
			usersProcessed: ok,
			usersFailed: err,
			totalEligible: userIds.length
		});
	} catch (e) {
		console.error('Cron monitoring error:', e);
		return json(
			{ error: 'Cron failed', message: e instanceof Error ? e.message : 'Unknown' },
			{ status: 500 }
		);
	}
};
