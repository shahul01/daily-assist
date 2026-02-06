<script lang="ts">
	import { speakWithSpeed, stopSpeaking, isSpeaking, whenVoicesReady } from '$lib/utils/speech';
	import { fileToBase64 } from '$lib/utils/pdf';
	import type { SpeechRate } from '$lib/utils/speech';

	let textInput = $state('');
	let output = $state('');
	let loading = $state(false);
	let error = $state('');
	let speed = $state<SpeechRate>('normal');
	let selectedFile = $state<File | null>(null);
	let fileName = $state('');
	let voices = $state<{ name: string; lang: string; voiceUri: string }[]>([]);
	let selectedLang = $state('en-US');

	whenVoicesReady().then((v) => {
		voices = v;
	});

	async function handleReadText() {
		error = '';
		if (!textInput.trim()) {
			error = 'Enter or paste text to read.';
			return;
		}
		loading = true;
		try {
			const res = await fetch('/api/agents/read', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					text: textInput,
					speed,
					format: 'plain',
					language: selectedLang
				})
			});
			const data = await res.json();
			if (!res.ok) {
				throw new Error(data.message ?? data.error ?? 'Read failed');
			}
			output = data.spokenText ?? data.description ?? '';
			speakWithSpeed(output, speed, { lang: selectedLang });
		} catch (e) {
			error = e instanceof Error ? e.message : 'Something went wrong';
		} finally {
			loading = false;
		}
	}

	async function handleFileUpload(e: Event) {
		error = '';
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		selectedFile = file;
		fileName = file.name;
		loading = true;
		try {
			const { base64, mimeType } = await fileToBase64(file);
			const isPdf = mimeType === 'application/pdf';
			const res = await fetch('/api/agents/read', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(isPdf ? { pdfBase64: base64 } : { imageBase64: base64, mimeType })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.message ?? data.error ?? 'Read failed');
			output = data.spokenText ?? data.description ?? data.text ?? '';
			if (output) speakWithSpeed(output, speed, { lang: selectedLang });
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to read file';
		} finally {
			loading = false;
		}
		input.value = '';
	}

	function handleStopSpeaking() {
		stopSpeaking();
	}
</script>

<div
	class="read-agent rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900"
>
	<h2 class="mb-3 text-lg font-medium text-neutral-800 dark:text-neutral-200">Read-To-Me</h2>

	<textarea
		bind:value={textInput}
		placeholder="Paste text here or upload a file below…"
		class="mb-3 w-full resize-y rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-neutral-900 placeholder-neutral-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder-neutral-400"
		rows="4"
		aria-label="Text to read"
	></textarea>

	<div class="mb-3 flex flex-wrap items-center gap-2">
		<label class="flex items-center gap-1.5 text-sm text-neutral-600 dark:text-neutral-400">
			Speed
			<select
				bind:value={speed}
				class="rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
				aria-label="Reading speed"
			>
				<option value="slow">Slow</option>
				<option value="normal">Normal</option>
				<option value="fast">Fast</option>
			</select>
		</label>
		<label class="flex items-center gap-1.5 text-sm text-neutral-600 dark:text-neutral-400">
			Language
			<select
				bind:value={selectedLang}
				class="rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
				aria-label="Language for speech"
			>
				<option value="en-US">English (US)</option>
				<option value="en-GB">English (UK)</option>
				<option value="es-ES">Spanish</option>
				<option value="fr-FR">French</option>
				<option value="de-DE">German</option>
			</select>
		</label>
	</div>

	<div class="mb-3 flex flex-wrap gap-2">
		<button
			type="button"
			onclick={handleReadText}
			disabled={loading}
			class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow transition hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50 dark:focus:ring-offset-neutral-900"
			aria-label="Read text aloud"
		>
			{loading ? 'Reading…' : 'Read aloud'}
		</button>
		{#if isSpeaking()}
			<button
				type="button"
				onclick={handleStopSpeaking}
				class="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
				aria-label="Stop speaking"
			>
				Stop
			</button>
		{/if}
		<label
			class="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
		>
			<span aria-hidden="true">📄</span>
			<span>Upload PDF or image</span>
			<input
				type="file"
				accept="application/pdf,image/jpeg,image/png,image/webp"
				onchange={handleFileUpload}
				class="sr-only"
				aria-label="Upload PDF or image to read"
			/>
		</label>
	</div>

	{#if fileName}
		<p class="mb-2 text-sm text-neutral-500 dark:text-neutral-400">File: {fileName}</p>
	{/if}
	{#if error}
		<p class="mb-2 text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>
	{/if}
	{#if output}
		<div
			class="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-800 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
			role="region"
			aria-label="Read result"
		>
			{output}
		</div>
	{/if}
</div>
