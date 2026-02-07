import { z } from 'zod';
import { callGeminiWithAudio, parseGeminiJson } from '$lib/utils/gemini';

/** Sound types for accessibility alerts (deaf/hard-of-hearing). */
export const SOUND_TYPES = [
	'doorbell',
	'alarm',
	'crying',
	'knock',
	'phone',
	'glass_breaking',
	'smoke_alarm',
	'other'
] as const;

export const URGENCY_LEVELS = ['low', 'medium', 'high', 'critical'] as const;
export const SENTIMENT_EMOTIONS = ['happy', 'sad', 'angry', 'calm', 'anxious', 'neutral'] as const;
export const TONE_TYPES = ['friendly', 'hostile', 'urgent', 'casual', 'neutral'] as const;

export type SoundType = (typeof SOUND_TYPES)[number];
export type Urgency = (typeof URGENCY_LEVELS)[number];
export type SentimentEmotion = (typeof SENTIMENT_EMOTIONS)[number];
export type ToneType = (typeof TONE_TYPES)[number];

export interface DetectedSound {
	type: SoundType | string;
	confidence: number;
	urgency: Urgency;
	timestamp: string;
	description?: string;
}

export interface SpeakerInfo {
	speakerId: string;
	confidence: number;
	gender?: 'male' | 'female' | 'unknown';
	ageRange?: string;
	isNewSpeaker: boolean;
}

export interface Sentiment {
	emotion: SentimentEmotion;
	intensity: number;
	confidence: number;
	tone: ToneType;
}

export type HearAgentMode = 'transcription' | 'sounds' | 'speaker' | 'sentiment' | 'full';

export const HearAgentInputSchema = z.object({
	audioChunk: z.string().min(1, 'Audio chunk required'),
	mode: z.enum(['transcription', 'sounds', 'speaker', 'sentiment', 'full']).default('full'),
	userId: z.string().min(1).default('anonymous'),
	mimeType: z.string().max(50).optional().default('audio/webm'),
	/** Client can send transcript from Web Speech API; agent can also transcribe via Gemini. */
	clientTranscript: z.string().optional()
});

export type HearAgentInput = z.infer<typeof HearAgentInputSchema>;

export interface HearAgentOutput {
	transcript?: string;
	sounds: DetectedSound[];
	speaker?: SpeakerInfo;
	sentiment?: Sentiment;
	shouldAlert: boolean;
	alertPriority: 'emergency' | 'high' | 'normal';
	alertText: string;
	timestamp: string;
}

const DetectedSoundSchema = z.object({
	type: z.string().default('other'),
	confidence: z.number().min(0).max(1).default(0.5),
	urgency: z.enum(['low', 'medium', 'high', 'critical']).default('low'),
	timestamp: z.string().optional(),
	description: z.string().optional()
});

const SpeakerInfoSchema = z.object({
	speakerId: z.string(),
	confidence: z.number().min(0).max(1),
	gender: z.enum(['male', 'female', 'unknown']).optional(),
	ageRange: z.string().optional(),
	isNewSpeaker: z.boolean().optional()
});

const SentimentSchema = z.object({
	emotion: z.enum(['happy', 'sad', 'angry', 'calm', 'anxious', 'neutral']),
	intensity: z.number().min(0).max(1),
	confidence: z.number().min(0).max(1),
	tone: z.enum(['friendly', 'hostile', 'urgent', 'casual', 'neutral'])
});

const FullAnalysisSchema = z.object({
	transcript: z.string().optional(),
	sounds: z.array(DetectedSoundSchema),
	speaker: SpeakerInfoSchema.optional(),
	sentiment: SentimentSchema.optional()
});

const SYSTEM_PROMPT = `You are a Hear-For-Me assistant for deaf and hard-of-hearing users.
Analyze the audio and return a single JSON object (no markdown, no code fences).
Filter background noise and focus on speech and important environmental sounds.
Sound types: doorbell, alarm, crying, knock, phone, glass_breaking, smoke_alarm, other.
Urgency: critical (smoke_alarm, glass_breaking, baby crying alone), high (doorbell, alarm), medium (knock, phone), low (other).
Return only valid JSON.`;

function buildModePrompt(mode: HearAgentMode): string {
	switch (mode) {
		case 'transcription':
			return 'Focus only on transcribing all speech. Return JSON: { "transcript": "..." }.';
		case 'sounds':
			return 'Focus only on detecting environmental sounds. Return JSON: { "sounds": [{ "type", "confidence", "urgency", "description" }] }.';
		case 'speaker':
			return 'Focus only on speaker characteristics (voice). Return JSON: { "speaker": { "speakerId", "confidence", "gender?", "ageRange?", "isNewSpeaker" } }.';
		case 'sentiment':
			return 'Focus only on emotion and tone from voice. Return JSON: { "sentiment": { "emotion", "intensity", "confidence", "tone" } }.';
		default:
			return `Return JSON with all of: transcript (any speech), sounds (array), speaker (object), sentiment (object). Use urgency "critical" for smoke_alarm or glass_breaking.`;
	}
}

/**
 * Hear-For-Me Agent: real-time audio for deaf/hard-of-hearing users.
 * Thinking level: LOW for speed.
 */
export class HearAgent {
	/**
	 * Analyze an audio chunk: transcription, sound detection, speaker ID, sentiment.
	 */
	async analyzeAudioChunk(input: HearAgentInput): Promise<HearAgentOutput> {
		const validated = HearAgentInputSchema.parse(input);
		const prompt = `${SYSTEM_PROMPT}\n\n${buildModePrompt(validated.mode)}\n\nReply with ONLY the JSON object.`;
		const raw = await callGeminiWithAudio(
			prompt,
			validated.audioChunk,
			validated.mimeType ?? 'audio/webm'
		);
		const parsed = parseGeminiJson(raw) as Record<string, unknown>;
		const analysis = this.normalizeFullAnalysis(parsed, validated.clientTranscript);
		const { shouldAlert, alertPriority, alertText } = this.buildAlert(analysis);
		return {
			transcript: analysis.transcript,
			sounds: analysis.sounds,
			speaker: analysis.speaker,
			sentiment: analysis.sentiment,
			shouldAlert,
			alertPriority,
			alertText,
			timestamp: new Date().toISOString()
		};
	}

	/**
	 * Transcribe speech in audio (server-side path; client can use Web Speech API for real-time).
	 */
	async transcribeAudio(audioBase64: string, mimeType: string = 'audio/webm'): Promise<string> {
		const out = await this.analyzeAudioChunk({
			audioChunk: audioBase64,
			mode: 'transcription',
			userId: 'anonymous',
			mimeType
		});
		return out.transcript ?? '';
	}

	/**
	 * Detect important environmental sounds.
	 */
	async detectSounds(
		audioBase64: string,
		mimeType: string = 'audio/webm'
	): Promise<DetectedSound[]> {
		const out = await this.analyzeAudioChunk({
			audioChunk: audioBase64,
			mode: 'sounds',
			userId: 'anonymous',
			mimeType
		});
		return out.sounds;
	}

	/**
	 * Identify speaker characteristics from voice.
	 */
	async identifySpeaker(
		audioBase64: string,
		mimeType: string = 'audio/webm'
	): Promise<SpeakerInfo | undefined> {
		const out = await this.analyzeAudioChunk({
			audioChunk: audioBase64,
			mode: 'speaker',
			userId: 'anonymous',
			mimeType
		});
		return out.speaker;
	}

	/**
	 * Analyze tone/emotion from audio.
	 */
	async analyzeSentiment(
		audioBase64: string,
		mimeType: string = 'audio/webm'
	): Promise<Sentiment | undefined> {
		const out = await this.analyzeAudioChunk({
			audioChunk: audioBase64,
			mode: 'sentiment',
			userId: 'anonymous',
			mimeType
		});
		return out.sentiment;
	}

	buildAlert(analysis: { sounds: DetectedSound[]; sentiment?: Sentiment }): {
		shouldAlert: boolean;
		alertPriority: 'emergency' | 'high' | 'normal';
		alertText: string;
	} {
		const critical = analysis.sounds.filter((s) => s.urgency === 'critical');
		const high = analysis.sounds.filter((s) => s.urgency === 'high');
		if (critical.length > 0) {
			const desc = critical.map((s) => s.description || s.type).join('; ');
			return {
				shouldAlert: true,
				alertPriority: 'emergency',
				alertText: `Emergency sound: ${desc}`
			};
		}
		if (high.length > 0) {
			const desc = high.map((s) => s.description || s.type).join('; ');
			return {
				shouldAlert: true,
				alertPriority: 'high',
				alertText: `Important: ${desc}`
			};
		}
		const urgentTone = analysis.sentiment?.tone === 'urgent' && analysis.sentiment?.intensity > 0.7;
		if (urgentTone) {
			return {
				shouldAlert: true,
				alertPriority: 'high',
				alertText: 'Urgent tone detected in conversation'
			};
		}
		return { shouldAlert: false, alertPriority: 'normal', alertText: '' };
	}

	private normalizeFullAnalysis(
		parsed: Record<string, unknown>,
		clientTranscript?: string
	): {
		transcript?: string;
		sounds: DetectedSound[];
		speaker?: SpeakerInfo;
		sentiment?: Sentiment;
	} {
		const ts = new Date().toISOString();
		const result = FullAnalysisSchema.safeParse({
			transcript: parsed.transcript ?? clientTranscript ?? '',
			sounds: Array.isArray(parsed.sounds) ? parsed.sounds : [],
			speaker: parsed.speaker ?? undefined,
			sentiment: parsed.sentiment ?? undefined
		});
		if (result.success) {
			const s = result.data;
			const speaker: SpeakerInfo | undefined = s.speaker
				? {
						speakerId: s.speaker.speakerId,
						confidence: s.speaker.confidence,
						gender: s.speaker.gender,
						ageRange: s.speaker.ageRange,
						isNewSpeaker: s.speaker.isNewSpeaker ?? false
					}
				: undefined;
			return {
				transcript: s.transcript || clientTranscript,
				sounds: s.sounds.map((x) => ({
					...x,
					timestamp: x.timestamp ?? ts,
					type: x.type || 'other',
					confidence: typeof x.confidence === 'number' ? x.confidence : 0.5,
					urgency: (x.urgency as Urgency) || 'low'
				})),
				speaker,
				sentiment: s.sentiment
			};
		}
		return {
			transcript:
				(typeof parsed.transcript === 'string' ? parsed.transcript : clientTranscript) ?? '',
			sounds: [],
			speaker: undefined,
			sentiment: undefined
		};
	}
}

export const hearAgent = new HearAgent();
