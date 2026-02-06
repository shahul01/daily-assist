/**
 * Camera access and frame capture for Read-To-Me real-time text detection.
 * Uses MediaStream API and Canvas for snapshots.
 */

export interface CameraResult {
	stream: MediaStream;
	video: HTMLVideoElement;
	stop: () => void;
	captureFrame: (mimeType?: string, quality?: number) => string | null;
}

/**
 * Request camera access and return stream + helpers.
 * Caller must attach video to a <video> element and call video.srcObject = stream.
 */
export async function startCamera(
	constraints: MediaStreamConstraints = {
		video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
		audio: false
	}
): Promise<CameraResult> {
	const stream = await navigator.mediaDevices.getUserMedia(constraints);
	const video = document.createElement('video');
	video.srcObject = stream;
	video.muted = true;
	await video.play();

	function stop() {
		stream.getTracks().forEach((t) => t.stop());
		video.srcObject = null;
	}

	/**
	 * Capture current frame as base64 data URL (e.g. image/jpeg).
	 * Returns null if video not ready or capture fails.
	 */
	function captureFrame(mimeType: string = 'image/jpeg', quality: number = 0.8): string | null {
		if (video.readyState < 2) return null;
		const w = video.videoWidth;
		const h = video.videoHeight;
		if (!w || !h) return null;
		const canvas = document.createElement('canvas');
		canvas.width = w;
		canvas.height = h;
		const ctx = canvas.getContext('2d');
		if (!ctx) return null;
		ctx.drawImage(video, 0, 0);
		try {
			return canvas.toDataURL(mimeType, quality);
		} catch {
			return null;
		}
	}

	return { stream, video, stop, captureFrame };
}

/**
 * Check if mediaDevices and getDisplayMedia/getUserMedia are available.
 */
export function isCameraSupported(): boolean {
	if (typeof navigator === 'undefined') return false;
	return !!navigator.mediaDevices?.getUserMedia;
}
