import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { supabaseServer } from '$lib/server/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database.types';
import type { UsageStatsResponse } from '$lib/types/usage';
import type { RequestHandler } from './$types';

const bodySchema = z.object({
	userId: z.string().min(1, 'userId is required'),
	days: z.number().int().min(1).max(365).optional().default(30)
});

const client = supabaseServer as SupabaseClient<Database>;

function sinceIso(userId: string, days: number): string {
	const d = new Date();
	d.setDate(d.getDate() - days);
	return d.toISOString();
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const raw = await request.json();
		const parsed = bodySchema.safeParse(raw);
		if (!parsed.success) {
			return json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
		}
		const { userId, days } = parsed.data;
		const since = sinceIso(userId, days);

		const [
			marathonSessionsRes,
			marathonActionsRes,
			convSessionsRes,
			memoriesRes,
			patternsRes,
			generationsRes,
			draftsRes,
			usageLogRes
		] = await Promise.all([
			client
				.from('marathon_sessions')
				.select('id, status, mode, started_at, duration_hours')
				.eq('user_id', userId)
				.gte('started_at', since)
				.order('started_at', { ascending: false })
				.limit(50),
			client
				.from('marathon_actions')
				.select('id, agent_name, success, created_at')
				.eq('user_id', userId)
				.gte('created_at', since)
				.order('created_at', { ascending: false })
				.limit(500),
			client
				.from('conversation_sessions')
				.select('id, started_at, turn_count, duration_seconds')
				.eq('user_id', userId)
				.gte('started_at', since)
				.order('started_at', { ascending: false })
				.limit(50),
			client
				.from('memories')
				.select('id', { count: 'exact', head: true })
				.eq('user_id', userId)
				.eq('is_active', true),
			client
				.from('pattern_analysis')
				.select('id', { count: 'exact', head: true })
				.eq('user_id', userId)
				.eq('is_active', true),
			client
				.from('create_agent_generations')
				.select('id, created_at')
				.eq('user_id', userId)
				.gte('created_at', since)
				.eq('deleted', false),
			client.from('drafts').select('id', { count: 'exact', head: true }).eq('user_id', userId),
			client
				.from('agent_usage_log')
				.select('agent_name, created_at')
				.eq('user_id', userId)
				.gte('created_at', since)
				.order('created_at', { ascending: false })
				.limit(1000)
		]);

		const marathonSessions = (marathonSessionsRes.data ?? []) as Array<{
			id: string;
			status: string;
			mode: string;
			started_at: string;
			duration_hours: number | null;
		}>;
		const marathonActions = (marathonActionsRes.data ?? []) as Array<{
			id: string;
			agent_name: string;
			success: boolean;
			created_at: string;
		}>;
		const convSessions = (convSessionsRes.data ?? []) as Array<{
			id: string;
			started_at: string;
			turn_count: number;
			duration_seconds: number | null;
		}>;
		const totalMemories = memoriesRes.count ?? 0;
		const totalPatterns = patternsRes.count ?? 0;
		const generations = (generationsRes.data ?? []) as Array<{ id: string; created_at: string }>;
		const draftCount = draftsRes.count ?? 0;
		const usageLog = (usageLogRes.data ?? []) as Array<{ agent_name: string; created_at: string }>;

		const successCount = marathonActions.filter((a) => a.success).length;
		const successRate =
			marathonActions.length > 0 ? Math.round((successCount / marathonActions.length) * 100) : 0;

		const agentCounts: Record<string, number> = {};
		for (const a of marathonActions) {
			agentCounts[a.agent_name] = (agentCounts[a.agent_name] ?? 0) + 1;
		}
		for (const u of usageLog) {
			agentCounts[u.agent_name] = (agentCounts[u.agent_name] ?? 0) + 1;
		}
		const topAgents = Object.entries(agentCounts)
			.map(([name, executionCount]) => ({ name, executionCount }))
			.sort((a, b) => b.executionCount - a.executionCount)
			.slice(0, 8);

		const totalTurns = convSessions.reduce((s, c) => s + c.turn_count, 0);
		const avgTurns =
			convSessions.length > 0 ? Math.round((totalTurns / convSessions.length) * 10) / 10 : 0;
		const totalDuration = convSessions.reduce((s, c) => s + (c.duration_seconds ?? 0), 0);
		const avgDurationSeconds =
			convSessions.length > 0 ? Math.round(totalDuration / convSessions.length) : 0;

		const uniqueAgents = new Set([
			...marathonActions.map((a) => a.agent_name),
			...usageLog.map((u) => u.agent_name)
		]);
		const lastUsedByAgent: Record<string, string> = {};
		for (const a of marathonActions) {
			if (!lastUsedByAgent[a.agent_name] || a.created_at > lastUsedByAgent[a.agent_name]) {
				lastUsedByAgent[a.agent_name] = a.created_at;
			}
		}
		for (const u of usageLog) {
			if (!lastUsedByAgent[u.agent_name] || u.created_at > lastUsedByAgent[u.agent_name]) {
				lastUsedByAgent[u.agent_name] = u.created_at;
			}
		}

		const agentUsageList = topAgents.length
			? topAgents.map(({ name, executionCount }) => ({
					agentName: name,
					totalActions: executionCount,
					successRate: marathonActions.length > 0 ? successRate : 100,
					lastUsed: lastUsedByAgent[name] ?? null,
					specificMetric: undefined
				}))
			: [
					{
						agentName: 'create',
						totalActions: generations.length,
						successRate: 100,
						lastUsed: generations[0]?.created_at ?? null,
						specificMetric: generations.length
					},
					{
						agentName: 'write',
						totalActions: draftCount,
						successRate: 100,
						lastUsed: null,
						specificMetric: draftCount
					},
					{
						agentName: 'remember',
						totalActions: totalPatterns,
						successRate: 100,
						lastUsed: null,
						specificMetric: totalPatterns
					}
				].filter((a) => a.totalActions > 0);

		const dateCounts: Record<string, { sessions: number; actions: number }> = {};
		for (const s of marathonSessions) {
			const date = s.started_at.slice(0, 10);
			if (!dateCounts[date]) dateCounts[date] = { sessions: 0, actions: 0 };
			dateCounts[date].sessions += 1;
		}
		for (const a of marathonActions) {
			const date = a.created_at.slice(0, 10);
			if (!dateCounts[date]) dateCounts[date] = { sessions: 0, actions: 0 };
			dateCounts[date].actions += 1;
		}
		for (const u of usageLog) {
			const date = u.created_at.slice(0, 10);
			if (!dateCounts[date]) dateCounts[date] = { sessions: 0, actions: 0 };
			dateCounts[date].actions += 1;
		}
		const sortedDates = Object.keys(dateCounts).sort();
		const timeline = sortedDates.slice(-14).map((date) => ({
			date,
			sessionCount: dateCounts[date].sessions,
			actionCount: dateCounts[date].actions
		}));

		const totalLoggedActions = marathonActions.length + usageLog.length;
		const response: UsageStatsResponse = {
			overall: {
				totalSessions: marathonSessions.length + convSessions.length,
				totalActions: totalLoggedActions,
				activeAgentsCount: uniqueAgents.size,
				totalMemories
			},
			marathon: {
				sessionCount: marathonSessions.length,
				avgDurationHours:
					marathonSessions.length > 0
						? Math.round(
								(marathonSessions.reduce((s, x) => s + (x.duration_hours ?? 0), 0) /
									marathonSessions.length) *
									100
							) / 100
						: 0,
				successRate,
				topAgents,
				recentSessions: marathonSessions.slice(0, 10).map((s) => ({
					id: s.id,
					status: s.status,
					mode: s.mode,
					started_at: s.started_at,
					duration_hours: s.duration_hours
				}))
			},
			conversations: {
				sessionCount: convSessions.length,
				totalTurns,
				avgTurnsPerSession: avgTurns,
				avgDurationSeconds,
				recentSessions: convSessions.slice(0, 10).map((s) => ({
					id: s.id,
					started_at: s.started_at,
					turn_count: s.turn_count,
					duration_seconds: s.duration_seconds
				}))
			},
			agentUsage: agentUsageList,
			timeline
		};

		return json(response);
	} catch (err) {
		console.error('Usage stats API error:', err);
		return json(
			{
				error: 'Failed to load usage stats',
				message: err instanceof Error ? err.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
