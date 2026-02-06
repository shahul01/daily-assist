import { marathonOrchestrator } from './marathonOrchestrator';
import { rememberAgent } from './rememberAgent';
import type { MarathonConfig } from './marathonOrchestrator';

/**
 * Run one background cycle: observe (reminders, etc.) -> reason -> act.
 * Call from cron or periodically for users with background monitoring enabled.
 */
export async function runBackgroundTick(userId: string): Promise<void> {
	const userState = await marathonOrchestrator.observe(userId, undefined, 'background');
	const decision = await marathonOrchestrator.reason(userState);
	if (!decision || decision.actions.length === 0) return;

	const config: MarathonConfig = {
		userId,
		durationHours: 0.1,
		mode: 'background',
		observeIntervalSeconds: 60,
		checkpointEveryNActions: 10,
		maxRetriesPerAction: 3
	};
	const results = await marathonOrchestrator.act(decision, config);
	await marathonOrchestrator.updateMemory(userId, decision, results);
}

/**
 * Get reminder count due soon (for proactive observe state).
 */
export async function getPendingRemindersCount(userId: string): Promise<number> {
	try {
		const list = await rememberAgent.listReminders(userId);
		const now = Date.now();
		const oneHour = 60 * 60 * 1000;
		return list.filter((r) => {
			const t = new Date(r.time).getTime();
			return t >= now && t - now <= oneHour;
		}).length;
	} catch {
		return 0;
	}
}

/**
 * Default interval for background ticks (1 minute).
 */
export const DEFAULT_BACKGROUND_INTERVAL_MS = 60_000;
