/**
 * Audio capture for Hear-For-Me agent: MediaRecorder API for chunk-based capture.
 * Use with getUserMedia for microphone access; chunks are base64 for Gemini analysis.
 */

export const HEAR_AGENT_CHUNK_MS = 3000;
export const HEAR_AGENT_DEFAULT_MIME = 'audio/webm;codecs=opus';

export interface AudioCaptureResult {
	stream: MediaStream;
	stop: () => void;
	/** Capture a single chunk of audio; returns base64 (no data URL prefix). */
	captureChunk: (durationMs?: number) => Promise<string>;
	/** MIME type of recorded chunks (from MediaRecorder). */
	mimeType: string;
}

/**
 * Request microphone access and return stream + chunk capture.
 * Caller must handle permissions; captureChunk records for durationMs then resolves with base64.
 */
export async function startAudioCapture(
	constraints: MediaStreamConstraints = { audio: true }
): Promise<AudioCaptureResult> {
	const stream = await navigator.mediaDevices.getUserMedia(constraints);
	const mimeType = getSupportedMimeType();

	function stop() {
		stream.getTracks().forEach((t) => t.stop());
	}

	function captureChunk(durationMs: number = HEAR_AGENT_CHUNK_MS): Promise<string> {
		return new Promise((resolve, reject) => {
			const recorder = new MediaRecorder(stream, {
				mimeType: mimeType || undefined,
				audioBitsPerSecond: 128000
			});
			const chunks: Blob[] = [];

			recorder.ondataavailable = (e) => {
				if (e.data.size > 0) chunks.push(e.data);
			};

			recorder.onstop = () => {
				const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
				const reader = new FileReader();
				reader.onloadend = () => {
					const dataUrl = reader.result as string;
					const base64 = dataUrl.indexOf(',') >= 0 ? dataUrl.split(',')[1] : dataUrl;
					resolve(base64 ?? '');
				};
				reader.onerror = () => reject(new Error('Failed to read audio blob'));
				reader.readAsDataURL(blob);
			};

			recorder.onerror = () => reject(new Error('MediaRecorder error'));
			recorder.start(100);
			setTimeout(() => {
				if (recorder.state === 'recording') recorder.stop();
			}, durationMs);
		});
	}

	return { stream, stop, captureChunk, mimeType: mimeType || 'audio/webm' };
}

/** Get MediaRecorder-supported MIME type for audio (prefer opus). */
function getSupportedMimeType(): string {
	const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
	for (const type of types) {
		if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
			return type;
		}
	}
	return 'audio/webm';
}

/** Check if audio capture (getUserMedia + MediaRecorder) is available. */
export function isAudioCaptureSupported(): boolean {
	if (typeof navigator === 'undefined') return false;
	const hasMedia = !!navigator.mediaDevices?.getUserMedia;
	const hasRecorder = typeof MediaRecorder !== 'undefined';
	return hasMedia && hasRecorder;
}

/** Normalize audio base64 for API: strip data URL prefix if present. */
export function normalizeAudioBase64(input: string): string {
	const comma = input.indexOf(',');
	return comma >= 0 ? input.slice(comma + 1) : input;
}
