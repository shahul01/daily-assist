<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import { startCamera, isCameraSupported } from '$lib/utils/camera';
	import { speakWithSpeed, stopSpeaking, isSpeaking } from '$lib/utils/speech';
	import type { SpeechRate } from '$lib/utils/speech';
	import type { CameraResult } from '$lib/utils/camera';

	const FPS = 5;
	const DEBOUNCE_MS = 800;
	const SPEED: SpeechRate = 'normal';

	let videoEl = $state<HTMLVideoElement | null>(null);
	let camera = $state<CameraResult | null>(null);
	let active = $state(false);
	let error = $state('');
	let lastDetectedText = $state<string[]>([]);
	let lastSpoken = $state('');
	let loading = $state(false);
	let debounceTimer = $state<ReturnType<typeof setTimeout> | null>(null);

	function speakLines(lines: string[]) {
		const combined = lines.filter(Boolean).join('. ');
		if (!combined || combined === lastSpoken) return;
		lastSpoken = combined;
		speakWithSpeed(combined, SPEED);
	}

	async function processFrame() {
		if (!camera?.captureFrame || !active) return;
		const dataUrl = camera.captureFrame('image/jpeg', 0.7);
		if (!dataUrl) return;
		loading = true;
		try {
			const res = await fetch('/api/agents/read', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ cameraFrame: dataUrl, cameraFrameMimeType: 'image/jpeg' })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.message ?? 'Failed');
			const text = Array.isArray(data.text) ? data.text : [];
			lastDetectedText = text;
			if (text.length > 0) {
				if (debounceTimer) clearTimeout(debounceTimer);
				debounceTimer = setTimeout(() => {
					speakLines(text);
					debounceTimer = null;
				}, DEBOUNCE_MS);
			}
		} catch {
			// ignore single frame errors
		} finally {
			loading = false;
		}
	}

	let intervalId = $state<ReturnType<typeof setInterval> | null>(null);

	async function start() {
		error = '';
		if (!isCameraSupported()) {
			error = 'Camera not supported in this browser.';
			return;
		}
		try {
			camera = await startCamera();
			active = true;
			await tick();
			if (videoEl && camera?.stream) {
				videoEl.srcObject = camera.stream;
				await videoEl.play();
			}
			intervalId = setInterval(processFrame, 1000 / FPS);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not start camera';
		}
	}

	function stop() {
		if (debounceTimer) {
			clearTimeout(debounceTimer);
			debounceTimer = null;
		}
		if (intervalId) {
			clearInterval(intervalId);
			intervalId = null;
		}
		stopSpeaking();
		camera?.stop();
		camera = null;
		active = false;
		if (videoEl) videoEl.srcObject = null;
	}

	onDestroy(stop);
</script>

<div
	class="camera-reader rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900"
>
	<h2 class="mb-3 text-lg font-medium text-neutral-800 dark:text-neutral-200">Camera reader</h2>

	{#if !isCameraSupported()}
		<p class="text-sm text-amber-600 dark:text-amber-400">
			Camera is not supported in this browser.
		</p>
	{:else if error}
		<p class="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>
	{:else}
		<div class="relative aspect-video w-full overflow-hidden rounded-lg bg-neutral-900">
			{#if active && videoEl}
				<video
					bind:this={videoEl}
					autoplay
					playsinline
					muted
					class="h-full w-full object-cover"
					aria-label="Live camera feed for text detection"
				></video>
			{:else}
				<div class="flex h-full items-center justify-center text-neutral-500 dark:text-neutral-400">
					Camera off
				</div>
			{/if}
			{#if loading}
				<div
					class="absolute inset-0 flex items-center justify-center bg-black/30 text-white"
					aria-hidden="true"
				>
					Reading…
				</div>
			{/if}
		</div>

		{#if lastDetectedText.length > 0}
			<p class="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
				Detected: {lastDetectedText.join(' | ')}
			</p>
		{/if}

		<div class="mt-3 flex gap-2">
			{#if !active}
				<button
					type="button"
					onclick={start}
					class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none dark:focus:ring-offset-neutral-900"
					aria-label="Start camera reading"
				>
					Start reading
				</button>
			{:else}
				<button
					type="button"
					onclick={stop}
					class="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
					aria-label="Stop camera"
				>
					Stop
				</button>
				{#if isSpeaking()}
					<button
						type="button"
						onclick={() => stopSpeaking()}
						class="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
						aria-label="Stop speaking"
					>
						Mute
					</button>
				{/if}
			{/if}
		</div>
	{/if}
</div>
