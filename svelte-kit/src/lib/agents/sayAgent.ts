import { z } from 'zod';
import { supabaseServer } from '$lib/server/supabase';

/** Emotion types for voice expression */
export const EMOTION_VALUES = [
	'happy',
	'sad',
	'urgent',
	'calm',
	'neutral',
	'excited',
	'worried',
	'tired',
	'confident'
] as const;
export type Emotion = (typeof EMOTION_VALUES)[number];

/** Quick phrase categories */
export const PHRASE_CATEGORIES = ['greeting', 'need', 'emergency', 'emotion', 'custom'] as const;
export type PhraseCategory = (typeof PHRASE_CATEGORIES)[number];

/** Voice params derived from emotion (rate, pitch, volume) for client-side TTS */
export interface SpeakPayload {
	text: string;
	rate: number;
	pitch: number;
	volume: number;
	lang: string;
	voiceUri?: string;
	repeatCount?: number;
	emotion?: Emotion;
}

/** Input schemas */
export const SpeakInputSchema = z.object({
	text: z.string().min(1, 'Text cannot be empty'),
	emotion: z.enum(EMOTION_VALUES).optional(),
	pitch: z.number().min(0).max(2).optional(),
	rate: z.number().min(0.1).max(10).optional(),
	volume: z.number().min(0).max(1).optional(),
	lang: z.string().max(20).optional(),
	voiceUri: z.string().optional(),
	userId: z.string().optional()
});

export const QuickPhraseInputSchema = z.object({
	phraseId: z.string().uuid(),
	userId: z.string().min(1, 'User ID required')
});

export const EmergencyInputSchema = z.object({
	message: z.string().min(1, 'Message cannot be empty'),
	repeatCount: z.number().int().min(1).max(10).optional().default(3),
	userId: z.string().optional()
});

export const SaveQuickPhraseInputSchema = z.object({
	userId: z.string().min(1, 'User ID required'),
	phrase: z.string().min(1, 'Phrase cannot be empty'),
	category: z.enum(PHRASE_CATEGORIES).optional(),
	emotion: z.enum(EMOTION_VALUES).optional(),
	language: z.string().max(20).optional(),
	isDefault: z.boolean().optional().default(false)
});

export const DeleteQuickPhraseInputSchema = z.object({
	phraseId: z.string().uuid(),
	userId: z.string().min(1, 'User ID required')
});

export const SaveVoicePreferencesInputSchema = z.object({
	userId: z.string().min(1, 'User ID required'),
	pitch: z.number().min(0).max(2).optional(),
	rate: z.number().min(0.1).max(10).optional(),
	volume: z.number().min(0).max(1).optional(),
	language: z.string().max(20).optional(),
	voiceUri: z.string().optional(),
	emergencyVolume: z.number().min(0).max(1).optional(),
	emergencyRate: z.number().min(0.5).max(2).optional()
});

export type SpeakInput = z.infer<typeof SpeakInputSchema>;
export type QuickPhraseInput = z.infer<typeof QuickPhraseInputSchema>;
export type EmergencyInput = z.infer<typeof EmergencyInputSchema>;
export type SaveQuickPhraseInput = z.infer<typeof SaveQuickPhraseInputSchema>;
export type DeleteQuickPhraseInput = z.infer<typeof DeleteQuickPhraseInputSchema>;
export type SaveVoicePreferencesInput = z.infer<typeof SaveVoicePreferencesInputSchema>;

/** Output types */
export interface QuickPhraseRow {
	id: string;
	user_id: string;
	phrase: string;
	category: string | null;
	emotion: string | null;
	language: string | null;
	is_default: boolean;
	usage_count: number;
	created_at: string;
	updated_at: string;
}

export interface VoicePreferencesRow {
	user_id: string;
	pitch: number;
	rate: number;
	volume: number;
	language: string;
	voice_uri: string | null;
	emergency_volume: number;
	emergency_rate: number;
	updated_at: string;
}

const EMOTION_TO_VOICE: Record<Emotion, { rate: number; pitch: number; volume: number }> = {
	urgent: { rate: 0.85, pitch: 1.15, volume: 1 },
	calm: { rate: 0.9, pitch: 0.95, volume: 0.9 },
	happy: { rate: 1.1, pitch: 1.15, volume: 1 },
	excited: { rate: 1.2, pitch: 1.2, volume: 1 },
	sad: { rate: 0.85, pitch: 0.9, volume: 0.95 },
	worried: { rate: 0.9, pitch: 1.05, volume: 0.95 },
	tired: { rate: 0.8, pitch: 0.9, volume: 0.9 },
	confident: { rate: 1.0, pitch: 1.05, volume: 1 },
	neutral: { rate: 1, pitch: 1, volume: 1 }
};

/**
 * Say-It-For-Me Agent
 * Purpose: Help speech disabilities by speaking for the user (TTS, quick phrases, emergency mode).
 * Thinking Level: LOW (immediate response). Server returns speak payloads; client runs Web Speech API.
 */
export class SayAgent {
	/**
	 * Build speak payload for client. Client should call speech.speak(payload.text, payload).
	 */
	async speak(input: SpeakInputRaw): Promise<SpeakPayload> {
		const validated = SpeakInputSchema.parse(input);
		const prefs = validated.userId
			? await this.loadVoicePreferencesInternal(validated.userId)
			: null;
		const lang = validated.lang ?? prefs?.language ?? 'en-US';
		const baseRate = validated.rate ?? prefs?.rate ?? 1;
		const basePitch = validated.pitch ?? prefs?.pitch ?? 1;
		const baseVolume = validated.volume ?? prefs?.volume ?? 1;
		const voice = validated.emotion ? EMOTION_TO_VOICE[validated.emotion] : null;
		return {
			text: validated.text,
			rate: voice ? baseRate * voice.rate : baseRate,
			pitch: voice ? basePitch * voice.pitch : basePitch,
			volume: baseVolume,
			lang,
			voiceUri: validated.voiceUri ?? prefs?.voice_uri ?? undefined,
			emotion: validated.emotion
		};
	}

	/**
	 * Get phrase by ID and return speak payload; optionally increment usage_count.
	 */
	async quickPhrase(input: QuickPhraseInput): Promise<SpeakPayload> {
		const validated = QuickPhraseInputSchema.parse(input);
		const { data: row, error } = await supabaseServer
			.from('quick_phrases')
			.select('*')
			.eq('id', validated.phraseId)
			.eq('user_id', validated.userId)
			.single();
		if (error || !row) {
			throw new Error('Quick phrase not found or access denied');
		}
		const phraseRow = row as QuickPhraseRow;
		const prefs = await this.loadVoicePreferencesInternal(validated.userId);
		const lang = phraseRow.language ?? prefs?.language ?? 'en-US';
		const emotion = (phraseRow.emotion as Emotion | null) ?? undefined;
		const voice = emotion ? EMOTION_TO_VOICE[emotion] : { rate: 1, pitch: 1, volume: 1 };
		await supabaseServer
			.from('quick_phrases')
			// @ts-expect-error - quick_phrases table types not in generated Database until schema regen
			.update({ usage_count: phraseRow.usage_count + 1, updated_at: new Date().toISOString() })
			.eq('id', validated.phraseId)
			.eq('user_id', validated.userId);
		return {
			text: phraseRow.phrase,
			rate: (prefs?.rate ?? 1) * voice.rate,
			pitch: (prefs?.pitch ?? 1) * voice.pitch,
			volume: prefs?.volume ?? 1,
			lang,
			voiceUri: prefs?.voice_uri ?? undefined,
			emotion: emotion ?? undefined
		};
	}

	/**
	 * Emergency mode: loud, clear, repeated. Returns payload with repeatCount for client.
	 */
	async emergency(input: EmergencyInputRaw): Promise<SpeakPayload & { repeatCount: number }> {
		const validated = EmergencyInputSchema.parse(input);
		const prefs = validated.userId
			? await this.loadVoicePreferencesInternal(validated.userId)
			: null;
		const rate = prefs?.emergency_rate ?? 0.9;
		const volume = prefs?.emergency_volume ?? 1;
		const lang = prefs?.language ?? 'en-US';
		return {
			text: validated.message,
			rate,
			pitch: 1.1,
			volume,
			lang,
			voiceUri: prefs?.voice_uri ?? undefined,
			repeatCount: validated.repeatCount,
			emotion: 'urgent'
		};
	}

	async saveQuickPhrase(input: SaveQuickPhraseInput): Promise<QuickPhraseRow> {
		const validated = SaveQuickPhraseInputSchema.parse(input);
		const now = new Date().toISOString();
		const insert = {
			user_id: validated.userId,
			phrase: validated.phrase,
			category: validated.category ?? null,
			emotion: validated.emotion ?? null,
			language: validated.language ?? 'en-US',
			is_default: validated.isDefault,
			usage_count: 0,
			created_at: now,
			updated_at: now
		};
		const { data, error } = await supabaseServer
			.from('quick_phrases')
			// @ts-expect-error - quick_phrases table types not in generated Database until schema regen
			.insert(insert)
			.select()
			.single();
		if (error) throw new Error(`Save quick phrase failed: ${error.message}`);
		return data as QuickPhraseRow;
	}

	async loadQuickPhrases(userId: string, category?: PhraseCategory): Promise<QuickPhraseRow[]> {
		if (!userId) return [];
		let q = supabaseServer
			.from('quick_phrases')
			.select('*')
			.eq('user_id', userId)
			.order('usage_count', { ascending: false });
		if (category) q = q.eq('category', category);
		const { data, error } = await q;
		if (error) throw new Error(`Load quick phrases failed: ${error.message}`);
		return (data ?? []) as QuickPhraseRow[];
	}

	async deleteQuickPhrase(input: DeleteQuickPhraseInput): Promise<void> {
		const validated = DeleteQuickPhraseInputSchema.parse(input);
		const { error } = await supabaseServer
			.from('quick_phrases')
			.delete()
			.eq('id', validated.phraseId)
			.eq('user_id', validated.userId);
		if (error) throw new Error(`Delete quick phrase failed: ${error.message}`);
	}

	async loadVoicePreferences(userId: string): Promise<VoicePreferencesRow | null> {
		return this.loadVoicePreferencesInternal(userId);
	}

	private async loadVoicePreferencesInternal(userId: string): Promise<VoicePreferencesRow | null> {
		const { data, error } = await supabaseServer
			.from('voice_preferences')
			.select('*')
			.eq('user_id', userId)
			.single();
		if (error && error.code !== 'PGRST116')
			throw new Error(`Load voice preferences failed: ${error.message}`);
		return (data as VoicePreferencesRow | null) ?? null;
	}

	async saveVoicePreferences(input: SaveVoicePreferencesInput): Promise<VoicePreferencesRow> {
		const validated = SaveVoicePreferencesInputSchema.parse(input);
		const now = new Date().toISOString();
		const row = await this.loadVoicePreferencesInternal(validated.userId);
		const payload = {
			user_id: validated.userId,
			pitch: validated.pitch ?? row?.pitch ?? 1,
			rate: validated.rate ?? row?.rate ?? 1,
			volume: validated.volume ?? row?.volume ?? 1,
			language: validated.language ?? row?.language ?? 'en-US',
			voice_uri: validated.voiceUri ?? row?.voice_uri ?? null,
			emergency_volume: validated.emergencyVolume ?? row?.emergency_volume ?? 1,
			emergency_rate: validated.emergencyRate ?? row?.emergency_rate ?? 0.9,
			updated_at: now
		};
		const { data, error } = await supabaseServer
			.from('voice_preferences')
			// @ts-expect-error - voice_preferences table types not in generated Database until schema regen
			.upsert(payload, { onConflict: 'user_id' })
			.select()
			.single();
		if (error) throw new Error(`Save voice preferences failed: ${error.message}`);
		return data as VoicePreferencesRow;
	}
}

export type SpeakInputRaw = z.input<typeof SpeakInputSchema>;
export type EmergencyInputRaw = z.input<typeof EmergencyInputSchema>;

export const sayAgent = new SayAgent();
