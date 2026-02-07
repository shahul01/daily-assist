import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EscalationAgent, escalationAgent } from './escalationAgent';
import type { Medication } from './rememberAgent';
import type { Reminder } from './rememberAgent';

vi.mock('$lib/server/supabase', () => ({
	supabaseServer: {
		from: vi.fn(() => ({
			insert: vi.fn(() => ({
				select: vi.fn(() => ({
					single: vi.fn(() =>
						Promise.resolve({
							data: {
								id: 'esc-1',
								user_id: 'u1',
								reminder_id: null,
								medication_id: null,
								appointment_id: null,
								escalation_type: 'medication',
								severity: 'high',
								status: 'sent',
								triggered_at: new Date().toISOString(),
								resolved_at: null,
								contact_method: 'in_app',
								message: 'Missed medication',
								created_at: new Date().toISOString()
							},
							error: null
						})
					)
				}))
			})),
			update: vi.fn(() => ({
				eq: vi.fn(() => ({
					eq: vi.fn(() => ({
						select: vi.fn(() => ({
							single: vi.fn(() => Promise.resolve({ data: {}, error: null }))
						}))
					}))
				}))
			})),
			select: vi.fn(() => ({
				eq: vi.fn(() => ({
					order: vi.fn(() => Promise.resolve({ data: [], error: null }))
				}))
			}))
		}))
	}
}));

describe('EscalationAgent', () => {
	const agent = new EscalationAgent();

	describe('evaluateEscalation', () => {
		it('returns escalation for reminder', () => {
			const reminder: Reminder = {
				id: 'r1',
				task: 'Take pill',
				time: '2026-02-07T20:00:00Z',
				created: ''
			};
			const decision = agent.evaluateEscalation(reminder, 'reminder');
			expect(decision.shouldEscalate).toBe(true);
			expect(decision.severity).toBe('high');
			expect(decision.message).toContain('Reminder not completed');
		});

		it('returns critical severity for critical medication', () => {
			const med: Medication = {
				id: 'm1',
				userId: 'u1',
				name: 'Insulin',
				dosage: '10 units',
				scheduleTimes: ['08:00', '20:00'],
				frequency: 'twice_daily',
				isActive: true,
				isCritical: true,
				notes: null,
				createdAt: '',
				updatedAt: ''
			};
			const decision = agent.evaluateEscalation(med, 'medication');
			expect(decision.shouldEscalate).toBe(true);
			expect(decision.severity).toBe('critical');
			expect(decision.contactMethod).toBe('call');
		});
	});

	describe('sendEscalation', () => {
		beforeEach(() => {
			vi.clearAllMocks();
		});

		it('returns escalation record', async () => {
			const result = await escalationAgent.sendEscalation({
				userId: 'u1',
				escalationType: 'medication',
				severity: 'high',
				message: 'Missed medication: Metformin'
			});
			expect(result).toHaveProperty('id');
			expect(result.userId).toBe('u1');
			expect(result.status).toBe('sent');
		});
	});
});
