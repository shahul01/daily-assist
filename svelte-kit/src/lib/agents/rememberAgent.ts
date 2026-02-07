import { z } from 'zod';
import { callGemini, parseGeminiJson } from '$lib/utils/gemini';
import { supabaseServer } from '$lib/server/supabase';
import type { Database, Json } from '$lib/types/database.types';

/**
 * Input validation
 */
export const RememberAgentInputSchema = z.object({
	action: z.enum([
		'create_reminder',
		'list_reminders',
		'analyze_patterns',
		'create_medication',
		'list_medications',
		'log_medication',
		'medication_adherence',
		'create_appointment',
		'list_appointments',
		'update_appointment'
	]),
	task: z.string().optional(),
	time: z.string().optional(),
	userId: z.string().min(1, 'User ID required'),
	context: z.string().optional()
});

export type RememberAgentInput = z.infer<typeof RememberAgentInputSchema>;

/**
 * Reminder type (maps to todos table + memory)
 */
export interface Reminder {
	id: string;
	task: string;
	time: string;
	created: string;
	thoughtSignature?: string;
}

/** Medication input from natural language or structured */
export const MedicationInputSchema = z.object({
	userId: z.string().min(1),
	name: z.string().min(1),
	dosage: z.string().optional(),
	scheduleText: z.string().optional(),
	scheduleTimes: z.array(z.string()).optional(),
	frequency: z
		.enum(['once_daily', 'twice_daily', 'three_times_daily', 'as_needed', 'weekly', 'custom'])
		.optional(),
	isCritical: z.boolean().optional(),
	notes: z.string().optional()
});
export type MedicationInput = z.infer<typeof MedicationInputSchema>;

export interface Medication {
	id: string;
	userId: string;
	name: string;
	dosage: string | null;
	scheduleTimes: string[];
	frequency: string | null;
	isActive: boolean;
	isCritical: boolean;
	notes: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface MedicationLog {
	id: string;
	medicationId: string;
	userId: string;
	scheduledTime: string;
	takenAt: string | null;
	status: 'taken' | 'missed' | 'late' | 'skipped';
	createdAt: string;
}

export interface AdherenceStats {
	medicationId: string;
	medicationName: string;
	daysChecked: number;
	taken: number;
	missed: number;
	late: number;
	adherencePercent: number;
}

/** Appointment input */
export const AppointmentInputSchema = z.object({
	userId: z.string().min(1),
	title: z.string().min(1),
	description: z.string().optional(),
	appointmentTime: z.string(),
	durationMinutes: z.number().int().min(1).optional(),
	location: z.string().optional(),
	appointmentType: z.enum(['doctor', 'therapy', 'personal', 'other']).optional(),
	reminderMinutesBefore: z.array(z.number().int()).optional()
});
export type AppointmentInput = z.infer<typeof AppointmentInputSchema>;

export interface Appointment {
	id: string;
	userId: string;
	title: string;
	description: string | null;
	appointmentTime: string;
	durationMinutes: number | null;
	location: string | null;
	appointmentType: string | null;
	status: string;
	createdAt: string;
	updatedAt: string;
}

export type PatternType =
	| 'missed_medication'
	| 'late_task'
	| 'appointment_pattern'
	| 'adherence_trend';

export interface Pattern {
	id: string;
	userId: string;
	patternType: PatternType;
	patternData: Record<string, unknown>;
	confidenceScore: number;
	detectedAt: string;
	occurrencesCount: number;
	lastOccurrence: string | null;
	suggestion: string | null;
	isActive: boolean;
}

export interface PatternAnalysis {
	summary: string;
	patterns: Pattern[];
	adherenceTrend: string | null;
}

/**
 * Remember-For-Me Agent
 * Persists reminders to Supabase todos table and memory system.
 */
export class RememberAgent {
	/**
	 * Create a reminder from natural language; store in todos and memory.
	 */
	async createReminder(input: RememberAgentInput): Promise<Reminder> {
		const validatedInput = RememberAgentInputSchema.parse(input);

		const systemPrompt = `You are a Remember-For-Me assistant for people with memory disabilities.
Your job: Extract structured reminder information from natural language.

Extract:
1. Task description (what to do)
2. Time (when to do it - be specific)
3. Priority (how urgent)

Output format: JSON only
{
  "task": "clear description",
  "time": "ISO 8601 timestamp",
  "priority": "low|medium|high"
}`;

		const prompt = `Extract reminder from: "${validatedInput.task}"
${validatedInput.time ? `User mentioned time: ${validatedInput.time}` : ''}
${validatedInput.context ? `Context: ${validatedInput.context}` : ''}`;

		const result = await callGemini({
			prompt,
			model: 'gemini-3-pro-preview',
			thinkingLevel: 'low',
			systemPrompt
		});

		const reminderData = parseGeminiJson(result.text) as {
			task?: string;
			time?: string;
			priority?: string;
		};
		const task =
			reminderData.task != null ? String(reminderData.task).trim() : validatedInput.task?.trim();
		if (!task) throw new Error('Remember agent failed: could not extract a task description');
		const dueDate = parseDueDate(reminderData.time);

		type TodoInsert = Database['public']['Tables']['todos']['Insert'];
		const now = new Date().toISOString();
		const insertPayload: TodoInsert = {
			user_id: validatedInput.userId,
			memory_id: null,
			goal_id: null,
			task,
			description: null,
			completed: false,
			created_at: now,
			updated_at: now,
			due_date: dueDate,
			completed_at: null,
			priority: reminderData.priority ?? null,
			estimated_hours: null,
			tags: {}
		};
		const { data: row, error } = await supabaseServer
			.from('todos')
			// @ts-expect-error Supabase client generic flows as never; payload matches todos Insert
			.insert(insertPayload)
			.select('id, task, due_date, created_at')
			.single();

		if (error) {
			const isFkViolation = error.code === '23503';
			const message = isFkViolation
				? 'User not found. Sign in with Supabase Auth (or use anonymous sign-in) so the user ID exists in the database.'
				: error.message;
			throw new Error(`Remember agent failed: ${message}`);
		}
		const r = row as { id: string; task: string; due_date: string | null; created_at: string };
		return {
			id: r.id,
			task: r.task,
			time: r.due_date ?? reminderData.time ?? r.created_at,
			created: r.created_at,
			thoughtSignature: result.thoughtSignature
		};
	}

	/**
	 * Mark a reminder (todo) as complete.
	 */
	async completeReminder(reminderId: string, userId: string): Promise<void> {
		const now = new Date().toISOString();
		const { error } = await supabaseServer
			.from('todos')
			// @ts-expect-error Supabase client generic
			.update({ completed: true, completed_at: now, updated_at: now })
			.eq('id', reminderId)
			.eq('user_id', userId);
		if (error) throw new Error(`Complete reminder failed: ${error.message}`);
	}

	/**
	 * List all reminders for user from Supabase todos.
	 */
	async listReminders(userId: string): Promise<Reminder[]> {
		const { data, error } = await supabaseServer
			.from('todos')
			.select('id, task, due_date, created_at')
			.eq('user_id', userId)
			.eq('completed', false)
			.order('due_date', { ascending: true, nullsFirst: false });
		if (error) throw new Error(`List reminders failed: ${error.message}`);
		type TodoRow = { id: string; task: string; due_date: string | null; created_at: string };
		return ((data ?? []) as TodoRow[]).map((r) => ({
			id: r.id,
			task: r.task,
			time: r.due_date ?? r.created_at,
			created: r.created_at
		}));
	}

	/**
	 * Analyze user patterns using persisted reminders.
	 */
	async analyzePatterns(
		userId: string,
		conversationHistory: Array<{ role: string; parts?: Array<{ text: string }> }>
	): Promise<string> {
		const userReminders = await this.listReminders(userId);
		const systemPrompt = `You are a Remember-For-Me assistant analyzing user patterns.
Identify: recurring tasks, times user struggles, forgotten tasks, medication adherence.`;
		const prompt = `Reminders: ${JSON.stringify(userReminders, null, 2)}\nWhat patterns do you notice? What suggestions can help them remember better?`;
		const result = await callGemini({
			prompt,
			model: 'gemini-3-pro-preview',
			thinkingLevel: 'high',
			systemPrompt,
			conversationHistory: conversationHistory.map((m) => ({
				role: m.role as 'user' | 'model',
				parts: m.parts ?? [{ text: (m as { content?: string }).content ?? '' }]
			}))
		});
		return result.text;
	}

	/**
	 * Create medication from natural language or structured input; parse schedule with Gemini if needed.
	 */
	async createMedication(input: MedicationInput): Promise<Medication> {
		const validated = MedicationInputSchema.parse(input);
		let scheduleTimes: string[] = validated.scheduleTimes ?? [];
		let frequency: string | null = validated.frequency ?? null;

		if (scheduleTimes.length === 0 && validated.scheduleText) {
			const parsed = await this.parseMedicationSchedule(validated.scheduleText);
			scheduleTimes = parsed.times;
			frequency = parsed.frequency ?? frequency;
		}
		if (scheduleTimes.length === 0) {
			scheduleTimes = ['09:00'];
		}

		type MedInsert = Database['public']['Tables']['medications']['Insert'];
		const now = new Date().toISOString();
		const payload: MedInsert = {
			user_id: validated.userId,
			name: validated.name.trim(),
			dosage: validated.dosage?.trim() ?? null,
			schedule_times: scheduleTimes,
			frequency,
			is_active: true,
			is_critical: validated.isCritical ?? false,
			notes: validated.notes?.trim() ?? null,
			created_at: now,
			updated_at: now
		};
		const { data: row, error } = await supabaseServer
			.from('medications')
			// @ts-expect-error Supabase generic inference
			.insert(payload)
			.select(
				'id, user_id, name, dosage, schedule_times, frequency, is_active, is_critical, notes, created_at, updated_at'
			)
			.single();

		if (error) {
			const msg =
				error.code === '23503' ? 'User not found. Sign in so the user ID exists.' : error.message;
			throw new Error(`Create medication failed: ${msg}`);
		}
		const r = row as Database['public']['Tables']['medications']['Row'];
		return mapMedicationRow(r);
	}

	/**
	 * List active medications for user.
	 */
	async listMedications(userId: string): Promise<Medication[]> {
		const { data, error } = await supabaseServer
			.from('medications')
			.select(
				'id, user_id, name, dosage, schedule_times, frequency, is_active, is_critical, notes, created_at, updated_at'
			)
			.eq('user_id', userId)
			.eq('is_active', true)
			.order('name');
		if (error) throw new Error(`List medications failed: ${error.message}`);
		return ((data ?? []) as Database['public']['Tables']['medications']['Row'][]).map(
			mapMedicationRow
		);
	}

	/**
	 * Log medication as taken, missed, or late.
	 */
	async logMedicationTaken(
		medicationId: string,
		userId: string,
		opts: {
			scheduledTime: string;
			status: 'taken' | 'missed' | 'late' | 'skipped';
			takenAt?: string;
		}
	): Promise<MedicationLog> {
		const takenAt = opts.status === 'taken' ? (opts.takenAt ?? new Date().toISOString()) : null;
		type LogInsert = Database['public']['Tables']['medication_logs']['Insert'];
		const payload: LogInsert = {
			medication_id: medicationId,
			user_id: userId,
			scheduled_time: opts.scheduledTime,
			taken_at: takenAt,
			status: opts.status
		};
		const { data: row, error } = await supabaseServer
			.from('medication_logs')
			// @ts-expect-error Supabase generic inference
			.insert(payload)
			.select('id, medication_id, user_id, scheduled_time, taken_at, status, created_at')
			.single();
		if (error) throw new Error(`Log medication failed: ${error.message}`);
		const r = row as Database['public']['Tables']['medication_logs']['Row'];
		return {
			id: r.id,
			medicationId: r.medication_id,
			userId: r.user_id,
			scheduledTime: r.scheduled_time,
			takenAt: r.taken_at,
			status: r.status as MedicationLog['status'],
			createdAt: r.created_at
		};
	}

	/**
	 * Get medication adherence stats for the last N days.
	 */
	async getMedicationAdherence(userId: string, days: number = 30): Promise<AdherenceStats[]> {
		const meds = await this.listMedications(userId);
		const since = new Date();
		since.setDate(since.getDate() - days);
		const sinceStr = since.toISOString();

		const { data: logs, error } = await supabaseServer
			.from('medication_logs')
			.select('medication_id, status')
			.eq('user_id', userId)
			.gte('scheduled_time', sinceStr);
		if (error) throw new Error(`Adherence query failed: ${error.message}`);

		const byMed = new Map<string, { taken: number; missed: number; late: number }>();
		for (const m of meds) {
			byMed.set(m.id, { taken: 0, missed: 0, late: 0 });
		}
		for (const row of (logs ?? []) as { medication_id: string; status: string }[]) {
			const cur = byMed.get(row.medication_id);
			if (!cur) continue;
			if (row.status === 'taken') cur.taken += 1;
			else if (row.status === 'missed' || row.status === 'skipped') cur.missed += 1;
			else if (row.status === 'late') cur.late += 1;
		}

		return meds.map((m) => {
			const c = byMed.get(m.id) ?? { taken: 0, missed: 0, late: 0 };
			const total = c.taken + c.missed + c.late;
			const adherencePercent = total > 0 ? Math.round((c.taken / total) * 100) : 0;
			return {
				medicationId: m.id,
				medicationName: m.name,
				daysChecked: days,
				taken: c.taken,
				missed: c.missed,
				late: c.late,
				adherencePercent
			};
		});
	}

	/**
	 * Create appointment.
	 */
	async createAppointment(input: AppointmentInput): Promise<Appointment> {
		const validated = AppointmentInputSchema.parse(input);
		const appointmentTime = parseDueDate(validated.appointmentTime) ?? new Date().toISOString();
		type AppInsert = Database['public']['Tables']['appointments']['Insert'];
		const now = new Date().toISOString();
		const payload: AppInsert = {
			user_id: validated.userId,
			title: validated.title.trim(),
			description: validated.description?.trim() ?? null,
			appointment_time: appointmentTime,
			duration_minutes: validated.durationMinutes ?? 60,
			location: validated.location?.trim() ?? null,
			appointment_type: validated.appointmentType ?? null,
			reminder_minutes_before: validated.reminderMinutesBefore ?? [15, 60],
			status: 'upcoming',
			created_at: now,
			updated_at: now
		};
		const { data: row, error } = await supabaseServer
			.from('appointments')
			// @ts-expect-error Supabase generic inference
			.insert(payload)
			.select(
				'id, user_id, title, description, appointment_time, duration_minutes, location, appointment_type, status, created_at, updated_at'
			)
			.single();
		if (error) {
			const msg = error.code === '23503' ? 'User not found.' : error.message;
			throw new Error(`Create appointment failed: ${msg}`);
		}
		const r = row as Database['public']['Tables']['appointments']['Row'];
		return mapAppointmentRow(r);
	}

	/**
	 * Get reminders due within the next N minutes (for background monitoring).
	 */
	async getUpcomingReminders(userId: string, withinMinutes: number = 15): Promise<Reminder[]> {
		const list = await this.listReminders(userId);
		const now = Date.now();
		const end = now + withinMinutes * 60 * 1000;
		return list.filter((r) => {
			const t = new Date(r.time).getTime();
			return t >= now && t <= end;
		});
	}

	/**
	 * Get medications that have a scheduled time in the past with no "taken" log (for escalation).
	 */
	async checkOverdueMedications(userId: string): Promise<Medication[]> {
		const meds = await this.listMedications(userId);
		const todayStart = new Date();
		todayStart.setHours(0, 0, 0, 0);
		const { data: logs } = await supabaseServer
			.from('medication_logs')
			.select('medication_id, scheduled_time, status')
			.eq('user_id', userId)
			.gte('scheduled_time', todayStart.toISOString());
		const logRows = (logs ?? []) as {
			medication_id: string;
			scheduled_time: string;
			status: string;
		}[];
		const takenByMedSlot = new Set<string>();
		for (const row of logRows) {
			if (row.status === 'taken') {
				takenByMedSlot.add(`${row.medication_id}:${row.scheduled_time}`);
			}
		}
		const now = new Date();
		const overdue: Medication[] = [];
		for (const m of meds) {
			for (const timeStr of m.scheduleTimes) {
				const [h, min] = timeStr.split(':').map(Number);
				const scheduled = new Date(todayStart);
				scheduled.setHours(h, min ?? 0, 0, 0);
				if (scheduled.getTime() <= now.getTime()) {
					const slotKey = `${m.id}:${scheduled.toISOString()}`;
					if (!takenByMedSlot.has(slotKey)) {
						overdue.push(m);
						break;
					}
				}
			}
		}
		return overdue;
	}

	/**
	 * List appointments for user, optionally within next N days.
	 */
	async listAppointments(userId: string, days?: number): Promise<Appointment[]> {
		let q = supabaseServer
			.from('appointments')
			.select(
				'id, user_id, title, description, appointment_time, duration_minutes, location, appointment_type, status, created_at, updated_at'
			)
			.eq('user_id', userId)
			.order('appointment_time', { ascending: true });
		if (days != null && days > 0) {
			const end = new Date();
			end.setDate(end.getDate() + days);
			q = q
				.gte('appointment_time', new Date().toISOString())
				.lte('appointment_time', end.toISOString());
		}
		const { data, error } = await q;
		if (error) throw new Error(`List appointments failed: ${error.message}`);
		return ((data ?? []) as Database['public']['Tables']['appointments']['Row'][]).map(
			mapAppointmentRow
		);
	}

	/**
	 * Update appointment (e.g. status, time).
	 */
	async updateAppointment(
		id: string,
		userId: string,
		updates: Partial<
			Pick<Appointment, 'title' | 'description' | 'appointmentTime' | 'status' | 'location'>
		>
	): Promise<Appointment> {
		type AppUpdate = Database['public']['Tables']['appointments']['Update'];
		const payload: AppUpdate = { updated_at: new Date().toISOString() };
		if (updates.title != null) payload.title = updates.title;
		if (updates.description != null) payload.description = updates.description;
		if (updates.appointmentTime != null) payload.appointment_time = updates.appointmentTime;
		if (updates.status != null) payload.status = updates.status;
		if (updates.location != null) payload.location = updates.location;

		const { data: row, error } = await supabaseServer
			.from('appointments')
			// @ts-expect-error Supabase client generic may not include new tables
			.update(payload)
			.eq('id', id)
			.eq('user_id', userId)
			.select(
				'id, user_id, title, description, appointment_time, duration_minutes, location, appointment_type, status, created_at, updated_at'
			)
			.single();
		if (error) throw new Error(`Update appointment failed: ${error.message}`);
		return mapAppointmentRow(row as Database['public']['Tables']['appointments']['Row']);
	}

	/**
	 * Detect patterns from reminders, medications, and logs over the last N days; store in pattern_analysis.
	 */
	async detectPatterns(userId: string, days: number = 30): Promise<Pattern[]> {
		const [reminders, meds, adherence] = await Promise.all([
			this.listReminders(userId),
			this.listMedications(userId),
			this.getMedicationAdherence(userId, days)
		]);

		const since = new Date();
		since.setDate(since.getDate() - days);
		const { data: logs } = await supabaseServer
			.from('medication_logs')
			.select('medication_id, scheduled_time, status')
			.eq('user_id', userId)
			.gte('scheduled_time', since.toISOString());
		const logRows = (logs ?? []) as {
			medication_id: string;
			scheduled_time: string;
			status: string;
		}[];

		const systemPrompt = `You are a Remember-For-Me assistant analyzing user behavior over ${days} days.
Identify patterns: missed_medication (when/how often), late_task (reminders completed late), adherence_trend (improving/declining).
Output JSON only: { "patterns": [ { "patternType": "missed_medication"|"late_task"|"adherence_trend", "patternData": { ... }, "confidenceScore": 0-1, "occurrencesCount": number, "suggestion": "string" } ] }.`;
		const prompt = `Reminders: ${JSON.stringify(reminders)}\nMedications: ${JSON.stringify(meds.map((m) => ({ name: m.name, scheduleTimes: m.scheduleTimes })))}\nAdherence: ${JSON.stringify(adherence)}\nMedication logs (sample): ${JSON.stringify(logRows.slice(0, 100))}\nDetect patterns and suggest improvements.`;
		const result = await callGemini({
			prompt,
			model: 'gemini-3-pro-preview',
			thinkingLevel: 'high',
			systemPrompt
		});
		const parsed = parseGeminiJson(result.text) as {
			patterns?: Array<{
				patternType?: PatternType;
				patternData?: Record<string, unknown>;
				confidenceScore?: number;
				occurrencesCount?: number;
				suggestion?: string;
			}>;
		};
		const detected = Array.isArray(parsed?.patterns) ? parsed.patterns : [];
		const now = new Date().toISOString();
		const stored: Pattern[] = [];

		for (const p of detected) {
			const patternType = p.patternType ?? 'adherence_trend';
			if (
				!['missed_medication', 'late_task', 'appointment_pattern', 'adherence_trend'].includes(
					patternType
				)
			)
				continue;
			type PatternInsert = Database['public']['Tables']['pattern_analysis']['Insert'];
			const payload: PatternInsert = {
				user_id: userId,
				pattern_type: patternType,
				pattern_data: (p.patternData ?? {}) as Json,
				confidence_score: Math.min(1, Math.max(0, p.confidenceScore ?? 0.5)),
				occurrences_count: p.occurrencesCount ?? 0,
				suggestion: p.suggestion ?? null,
				is_active: true,
				created_at: now,
				updated_at: now
			};
			const { data: row, error } = await supabaseServer
				.from('pattern_analysis')
				// @ts-expect-error Supabase generic inference
				.insert(payload)
				.select(
					'id, user_id, pattern_type, pattern_data, confidence_score, detected_at, occurrences_count, last_occurrence, suggestion, is_active'
				)
				.single();
			if (!error && row) {
				const r = row as Database['public']['Tables']['pattern_analysis']['Row'];
				stored.push({
					id: r.id,
					userId: r.user_id,
					patternType: r.pattern_type as PatternType,
					patternData: (r.pattern_data as Record<string, unknown>) ?? {},
					confidenceScore: r.confidence_score,
					detectedAt: r.detected_at,
					occurrencesCount: r.occurrences_count,
					lastOccurrence: r.last_occurrence,
					suggestion: r.suggestion,
					isActive: r.is_active
				});
			}
		}
		return stored;
	}

	/**
	 * Analyze adherence patterns and return summary plus stored patterns.
	 */
	async analyzeAdherencePatterns(userId: string): Promise<PatternAnalysis> {
		const adherence = await this.getMedicationAdherence(userId, 30);
		const { data: rows } = await supabaseServer
			.from('pattern_analysis')
			.select(
				'id, user_id, pattern_type, pattern_data, confidence_score, detected_at, occurrences_count, last_occurrence, suggestion, is_active'
			)
			.eq('user_id', userId)
			.eq('is_active', true)
			.order('confidence_score', { ascending: false })
			.limit(20);
		const patterns = (
			(rows ?? []) as Database['public']['Tables']['pattern_analysis']['Row'][]
		).map((r) => ({
			id: r.id,
			userId: r.user_id,
			patternType: r.pattern_type as PatternType,
			patternData: (r.pattern_data as Record<string, unknown>) ?? {},
			confidenceScore: r.confidence_score,
			detectedAt: r.detected_at,
			occurrencesCount: r.occurrences_count,
			lastOccurrence: r.last_occurrence,
			suggestion: r.suggestion,
			isActive: r.is_active
		}));
		const systemPrompt = `You are a Remember-For-Me assistant. Summarize medication adherence in 1-2 sentences. If adherence is low, note trend.`;
		const prompt = `Adherence stats: ${JSON.stringify(adherence)}\nStored patterns count: ${patterns.length}.`;
		const result = await callGemini({
			prompt,
			model: 'gemini-3-flash-preview',
			thinkingLevel: 'low',
			systemPrompt
		});
		const summary = result.text.trim();
		const trend =
			adherence.length > 0
				? adherence.some((a) => a.adherencePercent < 80)
					? 'Some medications have low adherence; consider reminders or pattern review.'
					: null
				: null;
		return { summary, patterns, adherenceTrend: trend };
	}

	/**
	 * Multi-week pattern detection (Tier 3); analyzes 4+ weeks of data.
	 */
	async detectLongTermPatterns(userId: string, weeks: number = 4): Promise<Pattern[]> {
		const days = Math.min(90, weeks * 7);
		return this.detectPatterns(userId, days);
	}

	private async parseMedicationSchedule(
		scheduleText: string
	): Promise<{ times: string[]; frequency: string | null }> {
		const systemPrompt = `You are a Remember-For-Me assistant. Extract medication schedule from natural language.
Output JSON only: { "times": ["HH:MM", ...] in 24h format, "frequency": "once_daily"|"twice_daily"|"three_times_daily"|"as_needed"|"weekly"|"custom" or null }.
Examples: "8am and 8pm" -> {"times":["08:00","20:00"],"frequency":"twice_daily"}; "every morning" -> {"times":["09:00"],"frequency":"once_daily"}.`;
		const result = await callGemini({
			prompt: `Schedule: "${scheduleText.trim()}"`,
			model: 'gemini-3-flash-preview',
			thinkingLevel: 'low',
			systemPrompt
		});
		const parsed = parseGeminiJson(result.text) as { times?: string[]; frequency?: string };
		const times = Array.isArray(parsed?.times)
			? parsed.times.map((t) => String(t).trim()).filter(Boolean)
			: [];
		const frequency =
			parsed?.frequency && typeof parsed.frequency === 'string' ? parsed.frequency : null;
		return { times, frequency };
	}
}

function parseDueDate(timeStr: string | undefined): string | null {
	if (timeStr == null || typeof timeStr !== 'string') return null;
	const trimmed = timeStr.trim();
	if (!trimmed) return null;
	const d = new Date(trimmed);
	return isNaN(d.getTime()) ? null : d.toISOString();
}

function mapMedicationRow(r: Database['public']['Tables']['medications']['Row']): Medication {
	const times = Array.isArray(r.schedule_times)
		? (r.schedule_times as string[])
		: typeof r.schedule_times === 'object' && r.schedule_times !== null
			? (Object.values(r.schedule_times) as string[])
			: [];
	return {
		id: r.id,
		userId: r.user_id,
		name: r.name,
		dosage: r.dosage,
		scheduleTimes: times,
		frequency: r.frequency,
		isActive: r.is_active,
		isCritical: r.is_critical,
		notes: r.notes,
		createdAt: r.created_at,
		updatedAt: r.updated_at
	};
}

function mapAppointmentRow(r: Database['public']['Tables']['appointments']['Row']): Appointment {
	return {
		id: r.id,
		userId: r.user_id,
		title: r.title,
		description: r.description,
		appointmentTime: r.appointment_time,
		durationMinutes: r.duration_minutes,
		location: r.location,
		appointmentType: r.appointment_type,
		status: r.status,
		createdAt: r.created_at,
		updatedAt: r.updated_at
	};
}

// Singleton instance
export const rememberAgent = new RememberAgent();
