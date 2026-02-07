/**
 * Web Speech API wrapper for text-to-speech (Read-To-Me accessibility).
 * Handles speak, voice selection, rate/pitch, and cross-browser behavior.
 */

export type SpeechRate = 'slow' | 'normal' | 'fast';

export interface SpeakOptions {
	/** 0.1–10; slow≈0.7, normal=1, fast≈1.3 */
	rate?: number;
	/** 0–2; default 1 */
	pitch?: number;
	/** 0–1 */
	volume?: number;
	/** BCP 47 lang code, e.g. 'en-US', 'es-ES' */
	lang?: string;
	/** Voice URI from listVoices() */
	voiceUri?: string;
}

export interface VoiceInfo {
	name: string;
	lang: string;
	localService: boolean;
	voiceUri: string;
}

const RATE_MAP: Record<SpeechRate, number> = {
	slow: 0.75,
	normal: 1,
	fast: 1.25
};

function getSpeechSynth(): SpeechSynthesis | null {
	if (typeof window === 'undefined') return null;
	return window.speechSynthesis;
}

/**
 * List available voices (for language/voice picker).
 * Call after voiceschanged if needed (some browsers load async).
 */
export function listVoices(): VoiceInfo[] {
	const synth = getSpeechSynth();
	if (!synth) return [];
	return synth.getVoices().map((v) => ({
		name: v.name,
		lang: v.lang,
		localService: v.localService,
		voiceUri: v.voiceURI
	}));
}

/**
 * Speak text using the Web Speech API.
 * @param text - Text to speak
 * @param options - Rate, pitch, volume, lang, voice
 */
export function speak(text: string, options: SpeakOptions = {}): void {
	const synth = getSpeechSynth();
	if (!synth) {
		console.warn('[speech] speechSynthesis not available');
		return;
	}
	synth.cancel();
	const u = new SpeechSynthesisUtterance(text);
	u.rate = options.rate ?? 1;
	u.pitch = options.pitch ?? 1;
	u.volume = options.volume ?? 1;
	u.lang = options.lang ?? 'en-US';
	if (options.voiceUri) {
		const voice = listVoices().find((v) => v.voiceUri === options.voiceUri);
		if (voice) {
			const v = getSpeechSynth()
				?.getVoices()
				.find((x) => x.voiceURI === options.voiceUri);
			if (v) u.voice = v;
		}
	}
	synth.speak(u);
}

/**
 * Speak with a named speed preset.
 */
export function speakWithSpeed(
	text: string,
	speed: SpeechRate,
	options: Omit<SpeakOptions, 'rate'> = {}
): void {
	speak(text, { ...options, rate: RATE_MAP[speed] });
}

/**
 * Stop current and queued speech.
 */
export function stopSpeaking(): void {
	const synth = getSpeechSynth();
	if (synth) synth.cancel();
}

/**
 * Pause current speech (Tier 2). No-op if not speaking.
 */
export function pauseSpeaking(): void {
	const synth = getSpeechSynth();
	if (synth?.speaking) synth.pause();
}

/**
 * Resume paused speech (Tier 2).
 */
export function resumeSpeaking(): void {
	const synth = getSpeechSynth();
	if (synth?.paused) synth.resume();
}

/**
 * Whether speech is currently playing.
 */
export function isSpeaking(): boolean {
	const synth = getSpeechSynth();
	return synth?.speaking ?? false;
}

/**
 * Whether speech is paused (Tier 2).
 */
export function isPaused(): boolean {
	const synth = getSpeechSynth();
	return synth?.paused ?? false;
}

/**
 * Speak from a payload (e.g. from Say-It-For-Me API). Same as speak() with an object.
 */
export function speakFromPayload(payload: {
	text: string;
	rate?: number;
	pitch?: number;
	volume?: number;
	lang?: string;
	voiceUri?: string;
}): void {
	speak(payload.text, {
		rate: payload.rate,
		pitch: payload.pitch,
		volume: payload.volume,
		lang: payload.lang,
		voiceUri: payload.voiceUri
	});
}

/**
 * Speak text repeatedly (e.g. emergency mode). Chains via onend; optional delay between repeats.
 */
export function speakRepeatedly(
	text: string,
	options: SpeakOptions,
	count: number,
	delayMs = 800
): void {
	const synth = getSpeechSynth();
	if (!synth || count < 1) return;
	synth.cancel();
	let n = 0;
	const next = (): void => {
		if (n >= count) return;
		n += 1;
		const u = new SpeechSynthesisUtterance(text);
		u.rate = options.rate ?? 1;
		u.pitch = options.pitch ?? 1;
		u.volume = options.volume ?? 1;
		u.lang = options.lang ?? 'en-US';
		if (options.voiceUri) {
			const v = getSpeechSynth()
				?.getVoices()
				.find((x) => x.voiceURI === options.voiceUri);
			if (v) u.voice = v;
		}
		u.onend = () => {
			if (n < count) setTimeout(next, delayMs);
		};
		synth.speak(u);
	};
	next();
}

/**
 * Ensure voices are loaded (Chrome loads them async). Resolves when getVoices().length > 0 or after timeout.
 */
export function whenVoicesReady(timeoutMs = 2000): Promise<VoiceInfo[]> {
	const synth = getSpeechSynth();
	if (!synth) return Promise.resolve([]);
	const voices = listVoices();
	if (voices.length > 0) return Promise.resolve(voices);
	return new Promise((resolve) => {
		const done = () => resolve(listVoices());
		synth.addEventListener('voiceschanged', done, { once: true });
		setTimeout(done, timeoutMs);
	});
}
