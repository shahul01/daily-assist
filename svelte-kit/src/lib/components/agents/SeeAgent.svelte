<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { storeAgentResult } from '$lib/stores/agentResultsStore';
	import {
		startCamera,
		isCameraSupported,
		SEE_AGENT_TARGET_FPS,
		SEE_AGENT_JPEG_QUALITY
	} from '$lib/utils/camera';
	import { speakWithSpeed, stopSpeaking, isSpeaking } from '$lib/utils/speech';
	import type { SpeechRate } from '$lib/utils/speech';
	import type { CameraResult } from '$lib/utils/camera';
	import type { SceneAnalysis, VoiceMode } from '$lib/agents/seeAgent';

	const SPEED: SpeechRate = 'normal';

	interface Props {
		userId?: string;
	}

	let { userId = 'anonymous' }: Props = $props();

	let videoEl = $state<HTMLVideoElement | null>(null);
	let camera = $state<CameraResult | null>(null);
	let active = $state(false);
	let error = $state('');
	let loading = $state(false);
	let analysis = $state<SceneAnalysis | null>(null);
	let voiceMode = $state<VoiceMode>('smart');
	let intervalId = $state<ReturnType<typeof setInterval> | null>(null);

	async function processFrame() {
		if (!camera?.captureFrame || !active || loading) return;
		const dataUrl = camera.captureFrame('image/jpeg', SEE_AGENT_JPEG_QUALITY);
		if (!dataUrl) return;
		loading = true;
		try {
			const res = await fetch('/api/agents/see', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					cameraFrame: dataUrl,
					cameraFrameMimeType: 'image/jpeg',
					mode: 'full',
					userId,
					preferences: { voiceMode, detailLevel: 'brief' }
				})
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.message ?? data.error ?? 'Failed');
			analysis = data.analysis ?? null;
			if (data.shouldSpeak && data.speechText) {
				speakWithSpeed(data.speechText, SPEED);
			}
		} catch (e) {
			console.warn('See agent frame error:', e);
		} finally {
			loading = false;
		}
	}

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
			intervalId = setInterval(processFrame, 1000 / SEE_AGENT_TARGET_FPS);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not start camera';
		}
	}

	function stop() {
		if (intervalId) {
			clearInterval(intervalId);
			intervalId = null;
		}
		stopSpeaking();
		camera?.stop();
		camera = null;
		active = false;
		analysis = null;
		if (videoEl) videoEl.srcObject = null;
	}

	function speakCurrent() {
		if (!analysis) return;
		const parts: string[] = [analysis.description];
		if (analysis.dangers.length > 0) {
			parts.push(...analysis.dangers.map((d) => `Warning: ${d.warning} ${d.location}`));
		}
		if (analysis.navigation && !analysis.navigation.clearPath && analysis.navigation.guidance) {
			parts.push(analysis.navigation.guidance);
		}
		if (analysis.text.length > 0) {
			parts.push(`Visible text: ${analysis.text.join(', ')}`);
		}
		const text = parts.filter(Boolean).join('. ');
		if (text) speakWithSpeed(text, SPEED);
	}

	function sendToChat() {
		if (!analysis || !userId) return;
		const resultId = storeAgentResult({
			agent: 'See-For-Me',
			action: 'scene_analysis',
			result: analysis,
			userId
		});
		/* eslint-disable svelte/no-navigation-without-resolve -- in-app nav to chat tab */
		goto(`?tab=chat&group=communication&agent=read&resultId=${encodeURIComponent(resultId)}`, {
			replaceState: false
		});
		/* eslint-enable svelte/no-navigation-without-resolve */
	}

	onDestroy(stop);
</script>

<div
	class="see-agent rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900"
>
	<h2 class="mb-3 text-lg font-medium text-neutral-800 dark:text-neutral-200">See-For-Me</h2>

	{#if !isCameraSupported()}
		<p class="text-sm text-amber-600 dark:text-amber-400">
			Camera is not supported in this browser.
		</p>
	{:else if error}
		<p class="text-sm text-red-600 dark:text-red-400" role="alert">
			<span class="font-medium">Error:</span>
			{error}
		</p>
	{:else}
		<div class="space-y-3">
			<div class="relative aspect-video w-full overflow-hidden rounded-lg bg-neutral-900">
				{#if active && videoEl}
					<video
						bind:this={videoEl}
						autoplay
						playsinline
						muted
						class="h-full w-full object-cover"
						aria-label="Live camera feed for See-For-Me"
					></video>
				{:else}
					<div
						class="flex h-full items-center justify-center text-neutral-500 dark:text-neutral-400"
					>
						Camera off
					</div>
				{/if}
				{#if loading}
					<div
						class="absolute inset-0 flex items-center justify-center bg-black/30 text-white"
						aria-hidden="true"
					>
						Analyzing…
					</div>
				{/if}
				{#if analysis?.dangers?.some((d) => d.severity === 'critical')}
					<div
						class="pointer-events-none absolute inset-0 animate-pulse rounded-lg ring-4 ring-red-500"
						aria-hidden="true"
					></div>
				{/if}
			</div>

			<div class="flex flex-wrap items-center gap-2">
				<label
					for="see-voice-mode"
					class="text-sm font-medium text-neutral-700 dark:text-neutral-300"
				>
					Voice:
				</label>
				<select
					id="see-voice-mode"
					bind:value={voiceMode}
					class="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
					aria-label="Voice output mode"
				>
					<option value="auto">Auto (all)</option>
					<option value="smart">Smart (alerts only)</option>
					<option value="manual">Manual</option>
				</select>
				<button
					type="button"
					onclick={speakCurrent}
					disabled={!analysis}
					class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-emerald-700 focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:outline-none disabled:pointer-events-none disabled:opacity-50 dark:focus:ring-offset-neutral-900"
					aria-label="Speak current scene"
				>
					Speak now
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
			</div>

			{#if analysis}
				<div
					class="space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-800/50"
				>
					<p class="text-sm font-medium text-neutral-800 dark:text-neutral-200">
						{analysis.description}
					</p>
					{#if analysis.dangers.length > 0}
						<ul class="list-inside list-disc text-sm text-red-700 dark:text-red-400">
							{#each analysis.dangers as d, i (i)}
								<li>
									{d.warning}
									{#if d.location}({d.location}){/if}
								</li>
							{/each}
						</ul>
					{/if}
					{#if analysis.navigation && !analysis.navigation.clearPath}
						<p class="text-sm text-amber-700 dark:text-amber-400">
							{analysis.navigation.guidance ?? 'Obstacles ahead.'}
						</p>
					{/if}
					{#if analysis.text.length > 0}
						<p class="text-sm text-neutral-600 dark:text-neutral-400">
							Text: {analysis.text.join(' | ')}
						</p>
					{/if}
					{#if analysis.objects.length > 0}
						<p class="text-sm text-neutral-600 dark:text-neutral-400">
							Objects: {analysis.objects
								.map((o) => o.type + (o.count ? ` (${o.count})` : ''))
								.join(', ')}
						</p>
					{/if}
					<button
						type="button"
						onclick={sendToChat}
						class="mt-2 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
						aria-label="Send to chat"
					>
						Send to Chat
					</button>
				</div>
			{/if}

			<div class="flex gap-2">
				{#if !active}
					<button
						type="button"
						onclick={start}
						class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none dark:focus:ring-offset-neutral-900"
						aria-label="Start See-For-Me camera"
					>
						Start
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
				{/if}
			</div>
		</div>
	{/if}
</div>
