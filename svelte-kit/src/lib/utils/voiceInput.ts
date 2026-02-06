/**
 * Voice input for Write-For-Me: dictation via Web Speech API.
 * Use for real-time voice-to-document. Gemini Live can be added later as primary.
 */

export interface VoiceInputOptions {
	/** BCP 47 language code */
	lang?: string;
	/** If true, keep listening and emit partial/final transcripts */
	continuous?: boolean;
	/** Emit interim (partial) results */
	interimResults?: boolean;
	/** Called with transcript; isFinal true when segment is final */
	onResult?: (transcript: string, isFinal: boolean) => void;
	onError?: (error: Error) => void;
	onEnd?: () => void;
}

const PUNCTUATION_COMMANDS: Record<string, string> = {
	period: '.',
	comma: ',',
	'question mark': '?',
	'exclamation point': '!',
	'exclamation mark': '!',
	'new line': '\n',
	'new paragraph': '\n\n'
};

function normalizePunctuationCommand(text: string): string {
	const lower = text.trim().toLowerCase();
	return PUNCTUATION_COMMANDS[lower] ?? text;
}

interface SpeechRecognitionConstructor {
	new (): SpeechRecognitionInstance;
}

interface SpeechRecognitionInstance extends EventTarget {
	continuous: boolean;
	interimResults: boolean;
	lang: string;
	start(): void;
	abort(): void;
	onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
	onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
	onend: (() => void) | null;
}

interface SpeechRecognitionResultItem {
	isFinal: boolean;
	length: number;
	0?: { transcript?: string };
}

interface SpeechRecognitionResultEvent {
	resultIndex: number;
	results: { length: number; [i: number]: SpeechRecognitionResultItem };
}

interface SpeechRecognitionErrorEvent {
	error: string;
}

function getSpeechRecognition(): SpeechRecognitionConstructor | undefined {
	if (typeof window === 'undefined') return undefined;
	const w = window as Window & {
		SpeechRecognition?: SpeechRecognitionConstructor;
		webkitSpeechRecognition?: SpeechRecognitionConstructor;
	};
	return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

/**
 * Start listening for voice input. Browser-only; no-op on server.
 * @returns Object with stop() to stop listening, and isSupported flag
 */
export function startVoiceInput(options: VoiceInputOptions = {}): {
	stop: () => void;
	isSupported: boolean;
} {
	const {
		lang = 'en-US',
		continuous = true,
		interimResults = true,
		onResult,
		onError,
		onEnd
	} = options;

	const Recognition = getSpeechRecognition();
	if (!Recognition) {
		onError?.(new Error('Speech recognition not supported in this browser'));
		return { stop: () => {}, isSupported: false };
	}

	const recognition = new Recognition();
	recognition.continuous = continuous;
	recognition.interimResults = interimResults;
	recognition.lang = lang;

	let lastFinal = '';
	recognition.onresult = (event: SpeechRecognitionResultEvent) => {
		let interim = '';
		let finalSegment = lastFinal;
		for (let i = event.resultIndex; i < event.results.length; i++) {
			const result = event.results[i];
			const text = result[0]?.transcript ?? '';
			const cmd = normalizePunctuationCommand(text);
			if (result.isFinal) {
				finalSegment += (finalSegment ? ' ' : '') + (cmd.length === 1 ? cmd : text);
				lastFinal = finalSegment;
				onResult?.(finalSegment, true);
			} else {
				interim = text;
				onResult?.(finalSegment + (finalSegment && interim ? ' ' : '') + interim, false);
			}
		}
	};

	recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
		if (event.error === 'aborted') return;
		onError?.(new Error(`Speech recognition: ${event.error}`));
	};

	recognition.onend = () => {
		onEnd?.();
	};

	try {
		recognition.start();
	} catch (e) {
		onError?.(e instanceof Error ? e : new Error('Failed to start recognition'));
	}

	return {
		stop: () => {
			try {
				recognition.abort();
			} catch {
				// ignore
			}
		},
		isSupported: true
	};
}

/**
 * One-shot listen: resolve with final transcript when user stops (or after one result in non-continuous).
 * Rejects if not supported or on error.
 */
export function listenOnce(options: { lang?: string } = {}): Promise<string> {
	return new Promise((resolve, reject) => {
		const Recognition = getSpeechRecognition();
		if (!Recognition) {
			reject(new Error('Speech recognition not supported'));
			return;
		}
		const recognition = new Recognition();
		recognition.continuous = false;
		recognition.interimResults = false;
		recognition.lang = options.lang ?? 'en-US';
		recognition.onresult = (event: SpeechRecognitionResultEvent) => {
			const result = event.results[event.resultIndex];
			const transcript = result?.[0]?.transcript ?? '';
			resolve(transcript.trim());
		};
		recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
			if (e.error === 'aborted') return;
			reject(new Error(e.error));
		};
		recognition.start();
	});
}

/**
 * Check if speech recognition is available (browser only).
 */
export function isVoiceInputSupported(): boolean {
	return getSpeechRecognition() !== undefined;
}
