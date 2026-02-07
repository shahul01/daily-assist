import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	RememberAgentInputSchema,
	MedicationInputSchema,
	AppointmentInputSchema,
	rememberAgent
} from './rememberAgent';

vi.mock('$lib/server/supabase', () => ({
	supabaseServer: {
		from: vi.fn(() => ({
			insert: vi.fn(() => ({
				select: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: null, error: null })) }))
			})),
			select: vi.fn(() => ({
				eq: vi.fn(() => ({
					eq: vi.fn(() => ({ order: vi.fn(() => Promise.resolve({ data: [], error: null })) })),
					order: vi.fn(() => Promise.resolve({ data: [], error: null })),
					gte: vi.fn(() => Promise.resolve({ data: [], error: null })),
					limit: vi.fn(() => Promise.resolve({ data: [], error: null }))
				})),
				update: vi.fn(() => ({
					eq: vi.fn(() => ({
						eq: vi.fn(() => ({
							select: vi.fn(() => ({
								single: vi.fn(() => Promise.resolve({ data: null, error: null }))
							}))
						}))
					}))
				}))
			}))
		}))
	}
}));

vi.mock('$lib/utils/gemini', () => ({
	callGemini: vi.fn().mockResolvedValue({
		text: '{"task":"Take medicine","time":"2026-02-08T20:00:00.000Z","priority":"high"}',
		thoughtSignature: undefined
	}),
	parseGeminiJson: vi.fn((t: string) => JSON.parse(t))
}));

describe('RememberAgentInputSchema', () => {
	it('accepts valid create_reminder input', () => {
		const out = RememberAgentInputSchema.parse({
			action: 'create_reminder',
			userId: 'user-1',
			task: 'Take Metformin'
		});
		expect(out.action).toBe('create_reminder');
		expect(out.userId).toBe('user-1');
		expect(out.task).toBe('Take Metformin');
	});

	it('rejects missing userId', () => {
		expect(() =>
			RememberAgentInputSchema.parse({ action: 'list_reminders', userId: '' })
		).toThrow();
	});

	it('accepts list_reminders and analyze_patterns', () => {
		const a = RememberAgentInputSchema.parse({ action: 'list_reminders', userId: 'u1' });
		const b = RememberAgentInputSchema.parse({ action: 'analyze_patterns', userId: 'u1' });
		expect(a.action).toBe('list_reminders');
		expect(b.action).toBe('analyze_patterns');
	});
});

describe('MedicationInputSchema', () => {
	it('accepts minimal input', () => {
		const out = MedicationInputSchema.parse({ userId: 'u1', name: 'Metformin' });
		expect(out.name).toBe('Metformin');
		expect(out.userId).toBe('u1');
	});

	it('accepts scheduleText and isCritical', () => {
		const out = MedicationInputSchema.parse({
			userId: 'u1',
			name: 'Aspirin',
			scheduleText: '8am and 8pm',
			isCritical: true
		});
		expect(out.scheduleText).toBe('8am and 8pm');
		expect(out.isCritical).toBe(true);
	});
});

describe('AppointmentInputSchema', () => {
	it('accepts valid appointment input', () => {
		const out = AppointmentInputSchema.parse({
			userId: 'u1',
			title: 'Doctor visit',
			appointmentTime: '2026-02-10T14:00:00Z'
		});
		expect(out.title).toBe('Doctor visit');
		expect(out.appointmentTime).toBe('2026-02-10T14:00:00Z');
	});

	it('rejects missing title', () => {
		expect(() =>
			AppointmentInputSchema.parse({
				userId: 'u1',
				title: '',
				appointmentTime: '2026-02-10T14:00:00Z'
			})
		).toThrow();
	});
});

describe('RememberAgent', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('listReminders returns array', async () => {
		const list = await rememberAgent.listReminders('user-1');
		expect(Array.isArray(list)).toBe(true);
	});
});
