import { supabaseServer } from '$lib/server/supabase';
import { callGemini } from '$lib/utils/gemini';
import {
	EMOTION_TO_VOICE,
	SUPPORTED_LANGUAGES,
	SpeakInputSchema,
	QuickPhraseInputSchema,
	EmergencyInputSchema,
	SaveQuickPhraseInputSchema,
	DeleteQuickPhraseInputSchema,
	SaveVoicePreferencesInputSchema,
	SaveVoiceProfileInputSchema,
	type Emotion,
	type SpeakInputRaw,
	type EmergencyInputRaw,
	type SpeakPayload,
	type QuickPhraseInput,
	type SaveQuickPhraseInput,
	type DeleteQuickPhraseInput,
	type SaveVoicePreferencesInput,
	type SaveVoiceProfileInput,
	type QuickPhraseRow,
	type VoicePreferencesRow,
	type VoiceProfileRow,
	type PhraseCategory
} from '$lib/agents/sayAgent';

/**
 * Say-It-For-Me Agent (server-only).
 * Purpose: Help speech disabilities by speaking for the user (TTS, quick phrases, emergency mode).
 * Thinking Level: LOW (immediate response). Server returns speak payloads; client runs Web Speech API.
 */
class SayAgentServer {
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

	async detectLanguage(text: string): Promise<string> {
		if (!text.trim()) return 'en-US';
		const result = await callGemini({
			prompt: `Detect the language of this text. Reply with ONLY a BCP-47 language code (e.g. en-US, es-ES). No other text.\n\nText: ${text.slice(0, 500)}`,
			model: 'gemini-3-flash-preview',
			thinkingLevel: 'low'
		});
		const code = result.text.trim().slice(0, 10);
		const found = SUPPORTED_LANGUAGES.some(
			(l) => l.code === code || code.startsWith(l.code.split('-')[0])
		);
		return found ? code : 'en-US';
	}

	async listVoiceProfiles(userId: string): Promise<VoiceProfileRow[]> {
		if (!userId) return [];
		const { data, error } = await supabaseServer
			.from('voice_profiles')
			.select('*')
			.eq('user_id', userId)
			.order('created_at', { ascending: false });
		if (error) throw new Error(`Load voice profiles failed: ${error.message}`);
		return (data ?? []) as VoiceProfileRow[];
	}

	async saveVoiceProfile(input: SaveVoiceProfileInput): Promise<VoiceProfileRow> {
		const validated = SaveVoiceProfileInputSchema.parse(input);
		const insert = {
			user_id: validated.userId,
			name: validated.name,
			pitch: validated.pitch ?? 1,
			rate: validated.rate ?? 1,
			volume: validated.volume ?? 1,
			language: validated.language ?? 'en-US',
			voice_uri: validated.voiceUri ?? null,
			is_active: false
		};
		const { data, error } = await supabaseServer
			.from('voice_profiles')
			// @ts-expect-error - voice_profiles Insert type from Database
			.insert(insert)
			.select()
			.single();
		if (error) throw new Error(`Save voice profile failed: ${error.message}`);
		return data as VoiceProfileRow;
	}

	async deleteVoiceProfile(profileId: string, userId: string): Promise<void> {
		const { error } = await supabaseServer
			.from('voice_profiles')
			.delete()
			.eq('id', profileId)
			.eq('user_id', userId);
		if (error) throw new Error(`Delete voice profile failed: ${error.message}`);
	}

	async getVoiceProfile(profileId: string, userId: string): Promise<VoiceProfileRow | null> {
		const { data, error } = await supabaseServer
			.from('voice_profiles')
			.select('*')
			.eq('id', profileId)
			.eq('user_id', userId)
			.single();
		if (error && error.code !== 'PGRST116')
			throw new Error(`Get voice profile failed: ${error.message}`);
		return (data as VoiceProfileRow | null) ?? null;
	}
}

export const sayAgent = new SayAgentServer();
