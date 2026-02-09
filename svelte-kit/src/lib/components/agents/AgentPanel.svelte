<script lang="ts">
	import { onMount } from 'svelte';
	import MarkdownRenderer from '../MarkdownRenderer.svelte';
	import { markdownToPlainTextForTts } from '$lib/utils/markdown';
	import { getOrCreateUserId } from '$lib/supabase';
	import ThoughtSignatureViewer from './ThoughtSignatureViewer.svelte';
	import PlanDisplay from './PlanDisplay.svelte';
	import ExecutionLog, { type LogEntry } from './ExecutionLog.svelte';
	import type { PlannerPlan } from '$lib/agents/orchestrator';

	let userInput = $state('');
	let response = $state('');
	let loading = $state(false);
	let agentsUsed = $state<string[]>([]);
	type AgentAction = { agent: string; action: string; result?: unknown };
	let actions = $state<AgentAction[]>([]);
	/** Valid Supabase auth user id (from anonymous sign-in). Required for reminders/memory. */
	let userId = $state<string | null>(null);

	/** Gemini 3 plan (shown above execution log). Cleared on close or new chat. */
	let currentPlan = $state<PlannerPlan | null>(null);
	let showPlan = $state(false);
	/** Progressive execution log. Cleared on close or new chat. */
	let executionLogEntries = $state<LogEntry[]>([]);
	let showExecutionLog = $state(false);
	let isIterating = $state(false);
	let currentIteration = $state(0);
	const maxIterations = 10;
	let abortController: AbortController | null = null;

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

	function extractPlaybackText(allActions: AgentAction[], fallbackText: string): string {
		// Prefer the latest Read-To-Me agent spoken text, fall back to overall response
		for (let i = allActions.length - 1; i >= 0; i--) {
			const action = allActions[i];
			const r = action?.result;
			if (
				action?.agent === 'Read-To-Me' &&
				r &&
				typeof r === 'object' &&
				'spokenText' in r &&
				typeof (r as { spokenText: unknown }).spokenText === 'string'
			) {
				return String((r as { spokenText: string }).spokenText);
			}
		}

		return fallbackText;
	}

	function resultSummary(result: unknown): string {
		if (result == null) return '—';
		if (typeof result === 'string') return result.slice(0, 60);
		if (typeof result === 'object' && 'error' in (result as object)) return 'error';
		if (typeof result === 'object' && 'message' in (result as object))
			return String((result as { message: string }).message).slice(0, 60);
		if (typeof result === 'object' && 'correctedText' in (result as object)) return 'corrected';
		if (typeof result === 'object' && 'adjustedText' in (result as object)) return 'adjusted';
		return 'ok';
	}

	function clearPlanAndLog() {
		currentPlan = null;
		showPlan = false;
		executionLogEntries = [];
		showExecutionLog = false;
	}

	function stopIteration() {
		if (abortController) {
			abortController.abort();
		}
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
		clearPlanAndLog();
		abortController = new AbortController();

		try {
			const res = await fetch('/api/agents/orchestrate-iterative', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					userInput: userInput.trim(),
					userId: uid,
					maxIterations
				}),
				signal: abortController.signal
			});

			if (!res.ok) {
				throw new Error(`API error: ${res.statusText}`);
			}

			const reader = res.body!.getReader();
			const decoder = new TextDecoder();
			let buffer = '';
			isIterating = true;

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';
				for (const line of lines) {
					if (!line.trim()) continue;
					try {
						const event = JSON.parse(line) as Record<string, unknown> & { type: string };
						if (event.type === 'plan' && event.plan) {
							currentPlan = event.plan as PlannerPlan;
							showPlan = true;
							showExecutionLog = true;
							currentIteration = Math.max(0, Number(event.iteration) || 0);
						} else if (event.type === 'iteration_start') {
							const iter = Math.max(0, Number(event.iteration) || 0);
							executionLogEntries = [
								...executionLogEntries,
								{ type: 'iteration_start', iteration: iter, status: 'running' }
							];
							currentIteration = iter;
						} else if (event.type === 'action_result') {
							executionLogEntries = [
								...executionLogEntries,
								{
									type: 'action',
									iteration: Number(event.iteration),
									agent: String(event.agent),
									action: String(event.action),
									resultSummary: resultSummary(event.result),
									status:
										event.result != null &&
										typeof event.result === 'object' &&
										'error' in event.result
											? 'error'
											: 'success'
								}
							];
							actions = [
								...actions,
								{ agent: String(event.agent), action: String(event.action), result: event.result }
							];
							agentsUsed = [...new Set([...agentsUsed, String(event.agent)])];
						} else if (event.type === 'iteration_complete') {
							executionLogEntries = [
								...executionLogEntries,
								{
									type: 'iteration_complete',
									iteration: Number(event.iteration),
									message: 'Iteration complete'
								}
							];
						} else if (event.type === 'verification' && event.status) {
							const status = event.status as { passed?: boolean; summary?: string };
							executionLogEntries = [
								...executionLogEntries,
								{
									type: 'verification',
									iteration: Number(event.iteration),
									message: status.summary ?? (status.passed ? 'Passed' : 'Needs retry')
								}
							];
						} else if (event.type === 'done') {
							response = String(event.finalResponse ?? '');
							executionLogEntries = [
								...executionLogEntries,
								{ type: 'final', message: String(event.finalResponse ?? '') }
							];
							playbackText = extractPlaybackText(actions, response);
						} else if (event.type === 'error' && event.message) {
							response = `Error: ${event.message}`;
							executionLogEntries = [
								...executionLogEntries,
								{ type: 'final', message: `Error: ${event.message}`, status: 'error' }
							];
						}
					} catch {
						// Skip malformed lines
					}
				}
			}
			// Flush remaining buffer
			if (buffer.trim()) {
				try {
					const event = JSON.parse(buffer.trim()) as Record<string, unknown> & { type: string };
					if (event.type === 'done') response = String(event.finalResponse ?? '');
					if (event.type === 'error' && event.message) response = `Error: ${event.message}`;
				} catch {
					// ignore
				}
			}
		} catch (error) {
			if ((error as Error).name === 'AbortError') {
				response = 'Stopped.';
			} else {
				response = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
			}
		} finally {
			loading = false;
			isIterating = false;
			abortController = null;
		}
	}

	const thoughtFlowItems = $derived(
		actions.map((a) => ({ context: String(a.action), agent_used: a.agent }))
	);
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
		{#if isIterating}
			<button type="button" class="stop-btn" onclick={stopIteration} aria-label="Stop execution">
				Stop
			</button>
		{/if}
	</form>

	{#if showPlan && currentPlan}
		<PlanDisplay plan={currentPlan} onClose={clearPlanAndLog} />
	{/if}
	{#if showExecutionLog}
		<ExecutionLog
			logEntries={executionLogEntries}
			isRunning={isIterating}
			{currentIteration}
			{maxIterations}
			onClose={clearPlanAndLog}
		/>
	{/if}

	{#if agentsUsed.length > 0}
		<div class="agents-used">
			<strong>Agents used:</strong>
			{agentsUsed.join(', ')}
		</div>
	{/if}

	{#if thoughtFlowItems.length > 0}
		<ThoughtSignatureViewer items={thoughtFlowItems} />
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

	.stop-btn {
		margin-left: 0.5rem;
		background: hsl(0 60% 50%);
	}
	.stop-btn:hover {
		background: hsl(0 60% 45%);
	}
	:global(body.dark) .stop-btn {
		background: hsl(0 55% 45%);
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
