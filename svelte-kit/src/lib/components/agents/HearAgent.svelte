<script lang="ts">
	import { onDestroy } from 'svelte';
	import {
		startAudioCapture,
		isAudioCaptureSupported,
		HEAR_AGENT_CHUNK_MS
	} from '$lib/utils/audio';
	import { startVoiceInput, isVoiceInputSupported } from '$lib/utils/voiceInput';
	import { speakWithSpeed, stopSpeaking, isSpeaking } from '$lib/utils/speech';
	import type { SpeechRate } from '$lib/utils/speech';
	import type { AudioCaptureResult } from '$lib/utils/audio';
	import type { HearAgentOutput, DetectedSound } from '$lib/agents/hearAgent';

	const SPEECH_RATE: SpeechRate = 'normal';
	const MAX_RECENT_SOUNDS = 10;

	interface Props {
		userId?: string;
	}

	let { userId = 'anonymous' }: Props = $props();

	let audioCapture = $state<AudioCaptureResult | null>(null);
	let voiceStop = $state<(() => void) | null>(null);
	let active = $state(false);
	let error = $state('');
	let loading = $state(false);
	let transcript = $state('');
	let analysis = $state<HearAgentOutput | null>(null);
	let recentSounds = $state<DetectedSound[]>([]);
	let speakAlerts = $state(true);
	let intervalId = $state<ReturnType<typeof setInterval> | null>(null);

	async function processChunk() {
		if (!audioCapture?.captureChunk || !active || loading) return;
		loading = true;
		try {
			const base64 = await audioCapture.captureChunk(HEAR_AGENT_CHUNK_MS);
			if (!base64) {
				loading = false;
				return;
			}
			const res = await fetch('/api/agents/hear', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					audioChunk: base64,
					mode: 'full',
					userId,
					mimeType: audioCapture.mimeType,
					clientTranscript: transcript || undefined
				})
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data?.message ?? data?.error ?? 'Failed');
			analysis = data as HearAgentOutput;
			if (data.sounds?.length) {
				recentSounds = [...data.sounds, ...recentSounds].slice(0, MAX_RECENT_SOUNDS);
			}
			if (data.shouldAlert && data.alertText && speakAlerts) {
				speakWithSpeed(data.alertText, SPEECH_RATE);
			}
		} catch (e) {
			console.warn('Hear agent chunk error:', e);
		} finally {
			loading = false;
		}
	}

	async function start() {
		error = '';
		if (!isAudioCaptureSupported()) {
			error = 'Microphone and MediaRecorder are not supported in this browser.';
			return;
		}
		try {
			audioCapture = await startAudioCapture();
			active = true;
			transcript = '';
			recentSounds = [];
			analysis = null;

			if (isVoiceInputSupported()) {
				const control = startVoiceInput({
					continuous: true,
					interimResults: true,
					onResult: (text, isFinal) => {
						if (isFinal && text.trim()) {
							transcript = transcript ? `${transcript} ${text.trim()}` : text.trim();
						}
					},
					onError: (e) => console.warn('Voice input error:', e)
				});
				voiceStop = control.stop;
			}

			processChunk();
			intervalId = setInterval(processChunk, HEAR_AGENT_CHUNK_MS);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not start microphone';
		}
	}

	function stop() {
		if (intervalId) {
			clearInterval(intervalId);
			intervalId = null;
		}
		voiceStop?.();
		voiceStop = null;
		stopSpeaking();
		audioCapture?.stop();
		audioCapture = null;
		active = false;
		analysis = null;
		transcript = '';
	}

	function speakLastAlert() {
		if (analysis?.alertText) speakWithSpeed(analysis.alertText, SPEECH_RATE);
	}

	function urgencyClass(urgency: string): string {
		switch (urgency) {
			case 'critical':
				return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
			case 'high':
				return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
			case 'medium':
				return 'bg-neutral-100 text-neutral-700 dark:bg-neutral-700/50 dark:text-neutral-300';
			default:
				return 'bg-neutral-50 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400';
		}
	}

	onDestroy(stop);
</script>

<div
	class="hear-agent rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900"
>
	<h2 class="mb-3 text-lg font-medium text-neutral-800 dark:text-neutral-200">Hear-For-Me</h2>

	{#if !isAudioCaptureSupported()}
		<p class="text-sm text-amber-600 dark:text-amber-400">
			Microphone and audio recording are not supported in this browser.
		</p>
	{:else if error}
		<p class="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>
	{:else}
		<div class="space-y-3">
			<div
				class="min-h-[80px] rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-800/50"
			>
				<p
					class="mb-1 text-xs font-medium tracking-wide text-neutral-500 uppercase dark:text-neutral-400"
				>
					Live transcript
				</p>
				<p class="text-sm text-neutral-800 dark:text-neutral-200">
					{transcript || (active ? 'Listening…' : 'Start to capture speech and sounds.')}
				</p>
			</div>

			{#if analysis?.sounds?.length}
				<div class="space-y-2">
					<p
						class="text-xs font-medium tracking-wide text-neutral-500 uppercase dark:text-neutral-400"
					>
						Detected sounds
					</p>
					<ul class="space-y-1">
						{#each analysis.sounds as s, i (i)}
							<li class="flex items-center gap-2 text-sm">
								<span class="rounded px-2 py-0.5 text-xs font-medium {urgencyClass(s.urgency)}">
									{s.urgency}
								</span>
								<span class="text-neutral-700 dark:text-neutral-300">{s.type}</span>
								{#if s.description}
									<span class="text-neutral-500 dark:text-neutral-400">— {s.description}</span>
								{/if}
							</li>
						{/each}
					</ul>
				</div>
			{/if}

			{#if analysis?.speaker}
				{@const sp = analysis.speaker}
				<div
					class="rounded-lg border border-neutral-200 bg-neutral-50 p-2 dark:border-neutral-700 dark:bg-neutral-800/50"
				>
					<p
						class="text-xs font-medium tracking-wide text-neutral-500 uppercase dark:text-neutral-400"
					>
						Speaker
					</p>
					<p class="text-sm text-neutral-800 dark:text-neutral-200">
						{sp.speakerId}
						{#if sp.isNewSpeaker}
							<span class="text-neutral-500 dark:text-neutral-400">(new)</span>
						{/if}
						{#if sp.gender}
							<span class="text-neutral-500 dark:text-neutral-400"> · {sp.gender}</span>
						{/if}
						<span class="text-neutral-500 dark:text-neutral-400">
							· {(sp.confidence * 100).toFixed(0)}%</span
						>
					</p>
				</div>
			{/if}

			{#if analysis?.sentiment}
				{@const sent = analysis.sentiment}
				<div
					class="rounded-lg border border-neutral-200 bg-neutral-50 p-2 dark:border-neutral-700 dark:bg-neutral-800/50"
				>
					<p
						class="text-xs font-medium tracking-wide text-neutral-500 uppercase dark:text-neutral-400"
					>
						Sentiment
					</p>
					<p class="text-sm text-neutral-800 dark:text-neutral-200">
						{sent.emotion}
						<span class="text-neutral-500 dark:text-neutral-400"> · {sent.tone}</span>
						<span class="text-neutral-500 dark:text-neutral-400">
							· {(sent.intensity * 100).toFixed(0)}%</span
						>
					</p>
				</div>
			{/if}

			{#if analysis?.shouldAlert && (analysis.alertPriority === 'emergency' || analysis.alertPriority === 'high')}
				<div
					class="rounded-lg border p-3 {analysis.alertPriority === 'emergency'
						? 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
						: 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20'}"
					role="alert"
				>
					<p
						class="text-sm font-medium {analysis.alertPriority === 'emergency'
							? 'text-red-800 dark:text-red-200'
							: 'text-amber-800 dark:text-amber-200'}"
					>
						{analysis.alertText}
					</p>
				</div>
			{/if}

			<div class="flex flex-wrap items-center gap-2">
				<label
					for="hear-speak-alerts"
					class="text-sm font-medium text-neutral-700 dark:text-neutral-300"
				>
					Speak alerts
				</label>
				<input
					id="hear-speak-alerts"
					type="checkbox"
					bind:checked={speakAlerts}
					class="rounded border-neutral-300 text-blue-600 focus:ring-blue-500 dark:border-neutral-600 dark:bg-neutral-800"
					aria-label="Speak sound and urgency alerts aloud"
				/>
				<button
					type="button"
					onclick={speakLastAlert}
					disabled={!analysis?.alertText}
					class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-emerald-700 focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:outline-none disabled:pointer-events-none disabled:opacity-50 dark:focus:ring-offset-neutral-900"
					aria-label="Speak last alert"
				>
					Speak alert
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

			{#if loading}
				<p class="text-sm text-neutral-500 dark:text-neutral-400">Analyzing audio…</p>
			{/if}

			<div class="flex gap-2">
				{#if !active}
					<button
						type="button"
						onclick={start}
						class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none dark:focus:ring-offset-neutral-900"
						aria-label="Start Hear-For-Me microphone"
					>
						Start
					</button>
				{:else}
					<button
						type="button"
						onclick={stop}
						class="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
						aria-label="Stop microphone"
					>
						Stop
					</button>
				{/if}
			</div>
		</div>
	{/if}
</div>
