<script lang="ts">
	import { onMount } from 'svelte';
	import MarkdownRenderer from '../MarkdownRenderer.svelte';
	import { markdownToPlainTextForTts } from '$lib/utils/markdown';
	import { getOrCreateUserId } from '$lib/supabase';

	let userInput = $state('');
	let response = $state('');
	let loading = $state(false);
	let agentsUsed = $state<string[]>([]);
	let actions = $state<any[]>([]);
	/** Valid Supabase auth user id (from anonymous sign-in). Required for reminders/memory. */
	let userId = $state<string | null>(null);

	onMount(() => {
		getOrCreateUserId().then((id) => {
			userId = id;
		});
	});

	// Text that will actually be spoken by the browser TTS
	let playbackText = $state('');
	let isSpeaking = $state(false);
	let isPaused = $state(false);
	let canUseTts = $state(false);
	let voices = $state<SpeechSynthesisVoice[]>([]);
	let selectedVoiceId = $state<string>('');
	let ttsRate = $state(1);
	let ttsPitch = $state(1);
	let ttsVolume = $state(1);
	let showTtsOptions = $state(false);
	let isStreaming = $state(false);

	if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
		canUseTts = true;

		const loadVoices = () => {
			const list = window.speechSynthesis.getVoices();
			voices = list;
			if (list.length && !selectedVoiceId) {
				const preferred =
					list.find((v) => v.lang && v.lang.toLowerCase().startsWith('en')) ?? list[0];
				selectedVoiceId = preferred.name + '|' + preferred.lang;
			}
		};

		loadVoices();
		window.speechSynthesis.onvoiceschanged = loadVoices;
	}

	function getSelectedVoice(): SpeechSynthesisVoice | null {
		if (!selectedVoiceId)
			return voices.find((v) => v.lang?.toLowerCase().startsWith('en')) ?? voices[0] ?? null;
		const [name, lang] = selectedVoiceId.split('|');
		return voices.find((v) => v.name === name && v.lang === lang) ?? voices[0] ?? null;
	}

	function extractPlaybackText(allActions: any[], fallbackText: string): string {
		// Prefer the latest Read-To-Me agent spoken text, fall back to overall response
		for (let i = allActions.length - 1; i >= 0; i--) {
			const action = allActions[i];
			if (action?.agent === 'Read-To-Me' && action.result?.spokenText) {
				return String(action.result.spokenText);
			}
		}

		return fallbackText;
	}

	type StreamEvent = {
		type: string;
		agentsUsed?: string[];
		actions?: any[];
		text?: string;
		message?: string;
	};

	function parseStreamEvent(line: string): Partial<{
		agentsUsed: string[];
		actions: any[];
		appendText: string;
		error: string;
	}> | null {
		try {
			const event = JSON.parse(line) as StreamEvent;
			if (event.type === 'meta')
				return {
					agentsUsed: event.agentsUsed ?? [],
					actions: event.actions ?? []
				};
			if (event.type === 'chunk' && event.text) {
				// Log chunk granularity for debugging (Gemini streams sentence-by-sentence, not word-by-word)
				console.debug('[stream-chunk]', {
					size: event.text.length,
					preview: event.text.slice(0, 50)
				});
				return { appendText: event.text };
			}
			if (event.type === 'error' && event.message) return { error: `Error: ${event.message}` };
		} catch {
			// Skip malformed lines
		}
		return null;
	}

	function speak(text: string) {
		if (!canUseTts || !text || typeof window === 'undefined') return;

		const synth = window.speechSynthesis;
		synth.cancel();
		isPaused = false;

		const plainText = markdownToPlainTextForTts(text);
		if (!plainText) return;

		const utterance = new SpeechSynthesisUtterance(plainText);
		const voice = getSelectedVoice();
		if (voice) utterance.voice = voice;
		utterance.rate = Number(ttsRate);
		utterance.pitch = Number(ttsPitch);
		utterance.volume = Number(ttsVolume);

		utterance.onstart = () => {
			isSpeaking = true;
			isPaused = false;
		};
		const reset = () => {
			isSpeaking = false;
			isPaused = false;
		};
		utterance.onend = reset;
		utterance.onerror = reset;

		synth.speak(utterance);
	}

	function pauseSpeaking() {
		if (!canUseTts || typeof window === 'undefined') return;
		window.speechSynthesis.pause();
		isPaused = true;
	}

	function resumeSpeaking() {
		if (!canUseTts || typeof window === 'undefined') return;
		window.speechSynthesis.resume();
		isPaused = false;
	}

	function stopSpeaking() {
		if (!canUseTts || typeof window === 'undefined') return;
		window.speechSynthesis.cancel();
		isSpeaking = false;
		isPaused = false;
	}

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (!userInput.trim()) return;

		const uid = userId ?? (await getOrCreateUserId());
		if (uid && !userId) userId = uid;
		if (!uid) {
			response =
				'Reminders and memory require Supabase. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to .env and enable Anonymous sign-in in Supabase Dashboard → Authentication → Providers.';
			return;
		}

		loading = true;
		isStreaming = false;
		response = '';
		agentsUsed = [];
		actions = [];
		playbackText = '';

		try {
			const res = await fetch('/api/agents/orchestrate', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'text/event-stream'
				},
				body: JSON.stringify({
					userInput: userInput.trim(),
					userId: uid
				})
			});

			if (!res.ok) {
				throw new Error(`API error: ${res.statusText}`);
			}

			const contentType = res.headers.get('Content-Type') ?? '';
			const isStream = contentType.includes('application/x-ndjson');

			if (isStream && res.body) {
				isStreaming = true;
				const reader = res.body.getReader();
				const decoder = new TextDecoder();
				let buffer = '';
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					buffer += decoder.decode(value, { stream: true });
					const lines = buffer.split('\n');
					buffer = lines.pop() ?? '';
					for (const line of lines) {
						const update = parseStreamEvent(line);
						if (!update) continue;
						if (update.agentsUsed !== undefined) agentsUsed = update.agentsUsed;
						if (update.actions !== undefined) actions = update.actions;
						if (update.appendText) response += update.appendText;
						if (update.error) response = update.error;
					}
				}
				const last = parseStreamEvent(buffer.trim());
				if (last) {
					if (last.agentsUsed !== undefined) agentsUsed = last.agentsUsed;
					if (last.actions !== undefined) actions = last.actions;
					if (last.appendText) response += last.appendText;
					if (last.error) response = last.error;
				}
				isStreaming = false;
				playbackText = extractPlaybackText(actions, response);
			} else {
				const data = await res.json();
				response = data.response;
				agentsUsed = data.agentsUsed || [];
				actions = data.actions || [];
				playbackText = extractPlaybackText(actions, response);
			}
		} catch (error) {
			response = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
		} finally {
			loading = false;
		}
	}
</script>

<div class="agent-panel">
	<h2>DailyAssist - Your AI Companion</h2>

	<form onsubmit={handleSubmit}>
		<label for="user-input"> What can I help you with today? </label>

		<textarea
			id="user-input"
			bind:value={userInput}
			placeholder="Examples:
- Read this text to me: [paste text]
- Remind me to take medication at 8 PM
- What are my reminders?"
			rows="4"
		></textarea>

		<button type="submit" disabled={loading}>
			{loading ? 'Processing...' : 'Ask DailyAssist'}
		</button>
	</form>

	{#if agentsUsed.length > 0}
		<div class="agents-used">
			<strong>Agents used:</strong>
			{agentsUsed.join(', ')}
		</div>
	{/if}

	{#if response || isStreaming}
		<div class="response">
			<strong>DailyAssist:</strong>
			<MarkdownRenderer content={response} {isStreaming} />
		</div>
	{/if}

	{#if playbackText && canUseTts}
		<div class="tts-controls" role="group" aria-label="Text to speech">
			<div class="tts-buttons">
				{#if isSpeaking}
					<button
						type="button"
						onclick={isPaused ? resumeSpeaking : pauseSpeaking}
						aria-label={isPaused ? 'Resume' : 'Pause'}
					>
						{isPaused ? 'Resume' : 'Pause'}
					</button>
					<button type="button" onclick={stopSpeaking} aria-label="Stop">Stop</button>
				{:else}
					<button
						type="button"
						onclick={() => speak(playbackText)}
						aria-label="Read response aloud"
					>
						Read aloud
					</button>
				{/if}
				<button
					type="button"
					class="tts-options-toggle"
					onclick={() => (showTtsOptions = !showTtsOptions)}
					aria-expanded={showTtsOptions}
					aria-label="TTS options"
				>
					{showTtsOptions ? 'Hide options' : 'Options'}
				</button>
			</div>
			{#if showTtsOptions}
				<div class="tts-options">
					<label>
						Voice
						<select aria-label="Voice" bind:value={selectedVoiceId} disabled={isSpeaking}>
							{#each voices as v (v.name + v.lang)}
								<option value={v.name + '|' + v.lang}>
									{v.name} ({v.lang})
								</option>
							{/each}
						</select>
					</label>
					<label>
						Speed
						<select aria-label="Speed" bind:value={ttsRate} disabled={isSpeaking}>
							<option value={0.5}>0.5× Slower</option>
							<option value={0.75}>0.75×</option>
							<option value={1}>1× Normal</option>
							<option value={1.25}>1.25×</option>
							<option value={1.5}>1.5×</option>
							<option value={2}>2× Faster</option>
						</select>
					</label>
					<label>
						Volume
						<input
							type="range"
							min="0"
							max="1"
							step="0.1"
							aria-label="Volume"
							bind:value={ttsVolume}
							disabled={isSpeaking}
						/>
						<span class="tts-value">{Math.round(ttsVolume * 100)}%</span>
					</label>
					<label>
						Pitch
						<input
							type="range"
							min="0.5"
							max="2"
							step="0.1"
							aria-label="Pitch"
							bind:value={ttsPitch}
							disabled={isSpeaking}
						/>
						<span class="tts-value">{ttsPitch.toFixed(1)}</span>
					</label>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.agent-panel {
		max-width: 600px;
		margin: 2rem auto;
		padding: 2rem;
		background: hsl(210 20% 98%);
		border-radius: 12px;
		box-shadow: 0 2px 8px hsla(210 20% 20% / 0.1);
	}

	:global(body.dark) .agent-panel {
		background: hsl(210 20% 15%);
		box-shadow: 0 2px 8px hsla(0 0% 0% / 0.3);
	}

	h2 {
		color: hsl(210 60% 40%);
		margin-bottom: 1.5rem;
	}

	:global(body.dark) h2 {
		color: hsl(210 60% 60%);
	}

	label {
		display: block;
		margin-bottom: 0.5rem;
		font-weight: 500;
		color: hsl(210 10% 30%);
	}

	:global(body.dark) label {
		color: hsl(210 10% 80%);
	}

	textarea {
		width: 100%;
		padding: 0.75rem;
		border: 1px solid hsl(210 10% 85%);
		border-radius: 8px;
		font-family: inherit;
		font-size: 1rem;
		resize: vertical;
	}

	:global(body.dark) textarea {
		background: hsl(210 20% 20%);
		border-color: hsl(210 20% 30%);
		color: hsl(0 0% 95%);
	}

	button {
		margin-top: 1rem;
		padding: 0.75rem 1.5rem;
		background: hsl(210 60% 50%);
		color: white;
		border: none;
		border-radius: 8px;
		font-size: 1rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.2s;
	}

	button:hover:not(:disabled) {
		background: hsl(210 60% 45%);
	}

	button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.agents-used {
		margin-top: 1rem;
		padding: 0.75rem;
		background: hsl(210 100% 95%);
		border-radius: 6px;
		font-size: 0.9rem;
		color: hsl(210 60% 40%);
	}

	:global(body.dark) .agents-used {
		background: hsl(210 60% 20%);
		color: hsl(210 60% 70%);
	}

	.response {
		margin-top: 1.5rem;
		padding: 1rem;
		background: white;
		border-radius: 8px;
		border-left: 4px solid hsl(210 60% 50%);
	}

	:global(body.dark) .response {
		background: hsl(210 20% 18%);
	}

	.response strong {
		color: hsl(210 60% 40%);
		display: block;
		margin-bottom: 0.75rem;
	}

	:global(body.dark) .response strong {
		color: hsl(210 60% 60%);
	}

	.tts-controls {
		margin-top: 1rem;
		padding: 1rem;
		background: hsl(150 30% 96%);
		border-radius: 10px;
		border: 1px solid hsl(150 20% 90%);
	}

	:global(body.dark) .tts-controls {
		background: hsl(150 20% 18%);
		border-color: hsl(150 15% 28%);
	}

	.tts-buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
	}

	.tts-controls .tts-buttons button {
		padding: 0.5rem 1rem;
		background: hsl(150 60% 45%);
		color: white;
		border: none;
		border-radius: 999px;
		font-size: 0.9rem;
		font-weight: 500;
		cursor: pointer;
		box-shadow: 0 1px 4px hsla(150 60% 20% / 0.25);
		transition:
			background 0.15s ease,
			transform 0.1s ease,
			box-shadow 0.15s ease;
	}

	.tts-controls .tts-buttons button:hover:not(:disabled) {
		background: hsl(150 60% 40%);
		transform: translateY(-1px);
		box-shadow: 0 3px 8px hsla(150 60% 20% / 0.35);
	}

	.tts-controls .tts-buttons button:active {
		transform: translateY(0);
		box-shadow: 0 1px 4px hsla(150 60% 20% / 0.25);
	}

	.tts-options-toggle {
		background: hsl(210 20% 92%) !important;
		color: hsl(210 30% 25%);
	}

	:global(body.dark) .tts-options-toggle {
		background: hsl(210 15% 28%) !important;
		color: hsl(210 10% 85%);
	}

	.tts-options {
		margin-top: 1rem;
		display: grid;
		gap: 0.75rem;
		grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
	}

	.tts-options label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.85rem;
		color: hsl(210 10% 35%);
	}

	:global(body.dark) .tts-options label {
		color: hsl(210 10% 75%);
	}

	.tts-options select,
	.tts-options input[type='range'] {
		padding: 0.35rem 0.5rem;
		border-radius: 6px;
		border: 1px solid hsl(210 10% 85%);
		background: white;
		font-size: 0.9rem;
	}

	:global(body.dark) .tts-options select,
	:global(body.dark) .tts-options input[type='range'] {
		background: hsl(210 20% 20%);
		border-color: hsl(210 20% 30%);
		color: hsl(0 0% 95%);
	}

	.tts-options input[type='range'] {
		padding: 0;
		accent-color: hsl(150 60% 45%);
	}

	.tts-options .tts-value {
		font-size: 0.8rem;
		opacity: 0.9;
	}

	.tts-options select:disabled,
	.tts-options input:disabled {
		opacity: 0.7;
		cursor: not-allowed;
	}
</style>
