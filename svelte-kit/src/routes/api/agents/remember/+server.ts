import { json } from '@sveltejs/kit';
import { rememberAgent } from '$lib/agents/rememberAgent';
import { escalationAgent } from '$lib/agents/escalationAgent';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();

		if (!body.userId) {
			return json({ error: 'Missing userId' }, { status: 400 });
		}

		const userId = body.userId as string;

		// Create reminder
		if (body.action === 'create_reminder') {
			const result = await rememberAgent.createReminder({
				action: 'create_reminder',
				task: body.task,
				time: body.time,
				userId,
				context: body.context
			});
			return json(result);
		}

		// List reminders
		if (body.action === 'list_reminders') {
			const result = await rememberAgent.listReminders(userId);
			return json({ reminders: result });
		}

		// Complete reminder
		if (body.action === 'complete_reminder') {
			if (!body.reminderId) return json({ error: 'Missing reminderId' }, { status: 400 });
			await rememberAgent.completeReminder(body.reminderId, userId);
			return json({ ok: true });
		}

		// Analyze patterns (conversation-based)
		if (body.action === 'analyze_patterns') {
			const result = await rememberAgent.analyzePatterns(userId, body.conversationHistory || []);
			return json({ analysis: result });
		}

		// Create medication
		if (body.action === 'create_medication') {
			const result = await rememberAgent.createMedication({
				userId,
				name: body.name,
				dosage: body.dosage,
				scheduleText: body.scheduleText,
				scheduleTimes: body.scheduleTimes,
				frequency: body.frequency,
				isCritical: body.isCritical,
				notes: body.notes
			});
			return json(result);
		}

		// List medications
		if (body.action === 'list_medications') {
			const result = await rememberAgent.listMedications(userId);
			return json({ medications: result });
		}

		// Log medication
		if (body.action === 'log_medication') {
			const result = await rememberAgent.logMedicationTaken(body.medicationId, userId, {
				scheduledTime: body.scheduledTime,
				status: body.status,
				takenAt: body.takenAt
			});
			return json(result);
		}

		// Medication adherence
		if (body.action === 'medication_adherence') {
			const result = await rememberAgent.getMedicationAdherence(userId, body.days ?? 30);
			return json({ adherence: result });
		}

		// Create appointment
		if (body.action === 'create_appointment') {
			const result = await rememberAgent.createAppointment({
				userId,
				title: body.title,
				description: body.description,
				appointmentTime: body.appointmentTime,
				durationMinutes: body.durationMinutes,
				location: body.location,
				appointmentType: body.appointmentType,
				reminderMinutesBefore: body.reminderMinutesBefore
			});
			return json(result);
		}

		// List appointments
		if (body.action === 'list_appointments') {
			const result = await rememberAgent.listAppointments(userId, body.days);
			return json({ appointments: result });
		}

		// Update appointment
		if (body.action === 'update_appointment') {
			const result = await rememberAgent.updateAppointment(body.id, userId, {
				title: body.title,
				description: body.description,
				appointmentTime: body.appointmentTime,
				status: body.status,
				location: body.location
			});
			return json(result);
		}

		// Detect patterns (store in DB)
		if (body.action === 'detect_patterns') {
			const result = await rememberAgent.detectPatterns(userId, body.days ?? 30);
			return json({ patterns: result });
		}

		// Analyze adherence patterns
		if (body.action === 'analyze_adherence') {
			const result = await rememberAgent.analyzeAdherencePatterns(userId);
			return json(result);
		}

		// Check escalations (list)
		if (body.action === 'check_escalations') {
			const result = await escalationAgent.listEscalations(userId, body.status);
			return json({ escalations: result });
		}

		// Resolve escalation
		if (body.action === 'resolve_escalation') {
			const result = await escalationAgent.resolveEscalation(body.escalationId, userId);
			return json(result);
		}

		return json({ error: 'Invalid action' }, { status: 400 });
	} catch (error) {
		console.error('Remember agent API error:', error);
		return json(
			{
				error: 'Remember agent failed',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
