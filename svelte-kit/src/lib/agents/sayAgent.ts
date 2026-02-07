import { z } from 'zod';

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

/** Tier 2: Supported languages (BCP 47) for multi-language TTS */
export const SUPPORTED_LANGUAGES: { code: string; label: string }[] = [
	{ code: 'en-US', label: 'English (US)' },
	{ code: 'en-GB', label: 'English (UK)' },
	{ code: 'es-ES', label: 'Spanish' },
	{ code: 'fr-FR', label: 'French' },
	{ code: 'de-DE', label: 'German' },
	{ code: 'it-IT', label: 'Italian' },
	{ code: 'pt-BR', label: 'Portuguese (Brazil)' },
	{ code: 'pt-PT', label: 'Portuguese (Portugal)' },
	{ code: 'hi-IN', label: 'Hindi' },
	{ code: 'ar-SA', label: 'Arabic' },
	{ code: 'zh-CN', label: 'Chinese (Simplified)' },
	{ code: 'zh-TW', label: 'Chinese (Traditional)' },
	{ code: 'ja-JP', label: 'Japanese' },
	{ code: 'ko-KR', label: 'Korean' },
	{ code: 'ru-RU', label: 'Russian' },
	{ code: 'nl-NL', label: 'Dutch' },
	{ code: 'pl-PL', label: 'Polish' },
	{ code: 'tr-TR', label: 'Turkish' },
	{ code: 'vi-VN', label: 'Vietnamese' },
	{ code: 'th-TH', label: 'Thai' },
	{ code: 'id-ID', label: 'Indonesian' },
	{ code: 'sv-SE', label: 'Swedish' }
];

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

/** Tier 2: Save voice profile */
export const SaveVoiceProfileInputSchema = z.object({
	userId: z.string().min(1, 'User ID required'),
	name: z.string().min(1, 'Profile name required'),
	pitch: z.number().min(0).max(2).optional(),
	rate: z.number().min(0.1).max(10).optional(),
	volume: z.number().min(0).max(1).optional(),
	language: z.string().max(20).optional(),
	voiceUri: z.string().optional()
});
export type SaveVoiceProfileInput = z.infer<typeof SaveVoiceProfileInputSchema>;

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

/** Tier 2: Voice profile row */
export interface VoiceProfileRow {
	id: string;
	user_id: string;
	name: string;
	pitch: number;
	rate: number;
	volume: number;
	language: string;
	voice_uri: string | null;
	is_active: boolean;
	created_at: string;
}

/** Emotion-to-voice params (rate, pitch, volume). Used by server agent. */
export const EMOTION_TO_VOICE: Record<Emotion, { rate: number; pitch: number; volume: number }> = {
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

export type SpeakInputRaw = z.input<typeof SpeakInputSchema>;
export type EmergencyInputRaw = z.input<typeof EmergencyInputSchema>;
