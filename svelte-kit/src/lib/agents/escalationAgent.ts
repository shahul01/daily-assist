import { supabaseServer } from '$lib/server/supabase';
import type { Database } from '$lib/types/database.types';
import type { Reminder } from './rememberAgent';
import type { Medication } from './rememberAgent';

export type EscalationType = 'reminder' | 'medication' | 'appointment';
export type EscalationSeverity = 'low' | 'medium' | 'high' | 'critical';
export type EscalationStatus = 'pending' | 'sent' | 'resolved' | 'dismissed';

export interface Escalation {
	id: string;
	userId: string;
	reminderId: string | null;
	medicationId: string | null;
	appointmentId: string | null;
	escalationType: EscalationType;
	severity: EscalationSeverity;
	status: EscalationStatus;
	triggeredAt: string;
	resolvedAt: string | null;
	contactMethod: string | null;
	message: string | null;
	createdAt: string;
}

export interface EscalationDecision {
	shouldEscalate: boolean;
	severity: EscalationSeverity;
	message: string;
	contactMethod: 'in_app' | 'email' | 'sms' | 'call';
}

/**
 * EscalationAgent: evaluate when to escalate reminders/medications and record/send escalations.
 */
export class EscalationAgent {
	/**
	 * Evaluate whether a reminder or medication should be escalated and at what level.
	 */
	evaluateEscalation(
		item:
			| { id: string; task?: string; time?: string }
			| { id: string; name: string; isCritical?: boolean },
		type: EscalationType
	): EscalationDecision {
		const isMed = 'name' in item;
		const isCritical = isMed && (item as Medication).isCritical === true;
		const severity: EscalationSeverity = isCritical ? 'critical' : 'high';
		const subject = isMed ? (item as Medication).name : ((item as Reminder).task ?? 'Reminder');
		const message =
			type === 'medication'
				? `Missed or overdue medication: ${subject}. Please take it as soon as possible.`
				: `Reminder not completed: ${subject}.`;
		return {
			shouldEscalate: true,
			severity,
			message,
			contactMethod: isCritical ? 'call' : 'in_app'
		};
	}

	/**
	 * Create escalation record and optionally send (in_app only by default; email/sms/call require config).
	 */
	async sendEscalation(input: {
		userId: string;
		escalationType: EscalationType;
		severity: EscalationSeverity;
		message: string;
		contactMethod?: 'in_app' | 'email' | 'sms' | 'call';
		reminderId?: string | null;
		medicationId?: string | null;
		appointmentId?: string | null;
		contactInfo?: string | null;
	}): Promise<Escalation> {
		const contactMethod = input.contactMethod ?? 'in_app';
		type EscInsert = Database['public']['Tables']['escalations']['Insert'];
		const now = new Date().toISOString();
		const payload: EscInsert = {
			user_id: input.userId,
			reminder_id: input.reminderId ?? null,
			medication_id: input.medicationId ?? null,
			appointment_id: input.appointmentId ?? null,
			escalation_type: input.escalationType,
			severity: input.severity,
			status: 'sent',
			triggered_at: now,
			contact_method: contactMethod,
			contact_info: input.contactInfo ?? null,
			message: input.message,
			created_at: now
		};
		const { data: row, error } = await supabaseServer
			.from('escalations')
			// @ts-expect-error Supabase client generic
			.insert(payload)
			.select(
				'id, user_id, reminder_id, medication_id, appointment_id, escalation_type, severity, status, triggered_at, resolved_at, contact_method, message, created_at'
			)
			.single();
		if (error) throw new Error(`Send escalation failed: ${error.message}`);
		const r = row as Database['public']['Tables']['escalations']['Row'];
		return mapEscalationRow(r);
	}

	/**
	 * Mark escalation as resolved.
	 */
	async resolveEscalation(escalationId: string, userId: string): Promise<Escalation> {
		const now = new Date().toISOString();
		const { data: row, error } = await supabaseServer
			.from('escalations')
			// @ts-expect-error Supabase client generic
			.update({ status: 'resolved', resolved_at: now })
			.eq('id', escalationId)
			.eq('user_id', userId)
			.select(
				'id, user_id, reminder_id, medication_id, appointment_id, escalation_type, severity, status, triggered_at, resolved_at, contact_method, message, created_at'
			)
			.single();
		if (error) throw new Error(`Resolve escalation failed: ${error.message}`);
		return mapEscalationRow(row as Database['public']['Tables']['escalations']['Row']);
	}

	/**
	 * List pending/sent escalations for user.
	 */
	async listEscalations(userId: string, statusFilter?: EscalationStatus): Promise<Escalation[]> {
		let q = supabaseServer
			.from('escalations')
			.select(
				'id, user_id, reminder_id, medication_id, appointment_id, escalation_type, severity, status, triggered_at, resolved_at, contact_method, message, created_at'
			)
			.eq('user_id', userId)
			.order('triggered_at', { ascending: false });
		if (statusFilter) q = q.eq('status', statusFilter);
		const { data, error } = await q;
		if (error) throw new Error(`List escalations failed: ${error.message}`);
		return ((data ?? []) as Database['public']['Tables']['escalations']['Row'][]).map(
			mapEscalationRow
		);
	}
}

function mapEscalationRow(r: Database['public']['Tables']['escalations']['Row']): Escalation {
	return {
		id: r.id,
		userId: r.user_id,
		reminderId: r.reminder_id,
		medicationId: r.medication_id,
		appointmentId: r.appointment_id,
		escalationType: r.escalation_type as EscalationType,
		severity: r.severity as EscalationSeverity,
		status: r.status as EscalationStatus,
		triggeredAt: r.triggered_at,
		resolvedAt: r.resolved_at,
		contactMethod: r.contact_method,
		message: r.message,
		createdAt: r.created_at
	};
}

export const escalationAgent = new EscalationAgent();
