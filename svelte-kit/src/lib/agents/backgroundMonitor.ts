import { marathonOrchestrator } from './marathonOrchestrator';
import { rememberAgent } from './rememberAgent';
import { escalationAgent } from './escalationAgent';
import type { MarathonConfig } from './marathonOrchestrator';

export interface MonitoringResult {
	checked: number;
	escalated: number;
	upcomingReminders: number;
}

/**
 * Run Remember-For-Me monitoring: overdue medications, upcoming reminders, escalate if needed.
 * Call from cron or background tick for users with monitoring enabled.
 */
export async function monitorReminders(userId: string): Promise<MonitoringResult> {
	const result: MonitoringResult = { checked: 0, escalated: 0, upcomingReminders: 0 };
	try {
		const [overdueMeds, upcoming] = await Promise.all([
			rememberAgent.checkOverdueMedications(userId),
			rememberAgent.getUpcomingReminders(userId, 15)
		]);
		result.checked = overdueMeds.length + upcoming.length;
		result.upcomingReminders = upcoming.length;

		for (const med of overdueMeds) {
			const decision = escalationAgent.evaluateEscalation(med, 'medication');
			if (decision.shouldEscalate) {
				await escalationAgent.sendEscalation({
					userId,
					escalationType: 'medication',
					severity: decision.severity,
					message: decision.message,
					contactMethod: decision.contactMethod,
					medicationId: med.id
				});
				result.escalated += 1;
			}
		}
	} catch (e) {
		console.error('monitorReminders error:', e);
	}
	return result;
}

/**
 * Run one background cycle: observe (reminders, etc.) -> reason -> act.
 * Also runs Remember-For-Me monitoring (overdue meds, escalations).
 * Call from cron or periodically for users with background monitoring enabled.
 */
export async function runBackgroundTick(userId: string): Promise<void> {
	await monitorReminders(userId);
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
