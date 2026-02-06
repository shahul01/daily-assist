import { describe, it, expect, vi } from 'vitest';
import { MarathonConfigSchema, marathonOrchestrator } from './marathonOrchestrator';
import { hasObviousFailure, type ActionResultItem } from './verification';
import { decideRecovery, getBackoffMs } from './errorRecovery';
vi.mock('./rememberAgent', () => ({
	rememberAgent: {
		listReminders: vi.fn().mockResolvedValue([])
	}
}));

describe('MarathonConfigSchema', () => {
	it('accepts valid config with defaults', () => {
		const config = MarathonConfigSchema.parse({ userId: 'user-1' });
		expect(config.userId).toBe('user-1');
		expect(config.durationHours).toBe(24);
		expect(config.mode).toBe('hybrid');
		expect(config.observeIntervalSeconds).toBe(60);
		expect(config.maxRetriesPerAction).toBe(3);
	});

	it('rejects empty userId', () => {
		expect(() => MarathonConfigSchema.parse({ userId: '' })).toThrow();
	});

	it('clamps durationHours', () => {
		const low = MarathonConfigSchema.parse({ userId: 'u', durationHours: 0.1 });
		expect(low.durationHours).toBe(0.1);
		const high = MarathonConfigSchema.parse({ userId: 'u', durationHours: 720 });
		expect(high.durationHours).toBe(720);
		expect(() => MarathonConfigSchema.parse({ userId: 'u', durationHours: 0 })).toThrow();
	});
});

describe('marathonOrchestrator.observe', () => {
	it('returns UserState with userId and timestamp', async () => {
		const state = await marathonOrchestrator.observe('user-123', undefined, 'background');
		expect(state.userId).toBe('user-123');
		expect(state.source).toBe('background');
		expect(state.timestamp).toBeDefined();
	});

	it('includes lastInput when provided', async () => {
		const state = await marathonOrchestrator.observe('user-1', 'Remind me at 8pm', 'on_demand');
		expect(state.lastInput).toBe('Remind me at 8pm');
		expect(state.source).toBe('on_demand');
	});
});

describe('hasObviousFailure', () => {
	it('returns true when any action has error', () => {
		const actions: ActionResultItem[] = [
			{ agent: 'Read-To-Me', action: 'read_text', result: { spokenText: 'ok' } },
			{ agent: 'Remember-For-Me', action: 'create_reminder', result: { error: 'Failed' } }
		];
		expect(hasObviousFailure(actions)).toBe(true);
	});

	it('returns true when result is null', () => {
		expect(hasObviousFailure([{ agent: 'X', action: 'y', result: null }])).toBe(true);
	});

	it('returns false when all results are ok', () => {
		const actions: ActionResultItem[] = [
			{ agent: 'Read-To-Me', action: 'read_text', result: { spokenText: 'hi' } }
		];
		expect(hasObviousFailure(actions)).toBe(false);
	});
});

describe('decideRecovery', () => {
	it('returns notify_user after max retries', () => {
		const r = decideRecovery(new Error('any'), 3, 'Read-To-Me', 3);
		expect(r.strategy).toBe('notify_user');
	});

	it('returns retry_same for transient errors', () => {
		const r = decideRecovery(new Error('timeout'), 0, 'Read-To-Me', 3);
		expect(r.strategy).toBe('retry_same');
		expect(r.retryAfterMs).toBeDefined();
	});

	it('returns retry_improved for parse errors', () => {
		const r = decideRecovery(new Error('unable to locate JSON'), 0, 'Read-To-Me', 3);
		expect(r.strategy).toBe('retry_improved');
	});

	it('returns fallback_agent after one retry for known agent', () => {
		const r = decideRecovery(new Error('something failed'), 1, 'Read-To-Me', 3);
		expect(r.strategy).toBe('fallback_agent');
		expect(r.fallbackAgent).toBe('Write-For-Me');
	});
});

describe('getBackoffMs', () => {
	it('increases exponentially and caps at 8s', () => {
		expect(getBackoffMs(0)).toBe(1000);
		expect(getBackoffMs(1)).toBe(2000);
		expect(getBackoffMs(2)).toBe(4000);
		expect(getBackoffMs(3)).toBe(8000);
		expect(getBackoffMs(10)).toBe(8000);
	});
});
