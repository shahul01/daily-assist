<script lang="ts">
	let userInput = $state('');
	let response = $state('');
	let loading = $state(false);
	let agentsUsed = $state<string[]>([]);
	let actions = $state<any[]>([]);

	// Text that will actually be spoken by the browser TTS
	let playbackText = $state('');
	let isSpeaking = $state(false);
	let canUseTts = $state(false);
	let preferredVoice: SpeechSynthesisVoice | null = null;

	if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
		canUseTts = true;

		const selectVoice = () => {
			const voices = window.speechSynthesis.getVoices();
			if (!voices.length) return;

			// Prefer an English voice if available, otherwise first available
			preferredVoice =
				voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('en')) ?? voices[0];
		};

		selectVoice();
		window.speechSynthesis.onvoiceschanged = selectVoice;
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

	function speak(text: string) {
		if (!canUseTts || !text || typeof window === 'undefined') return;

		const synth = window.speechSynthesis;
		synth.cancel();

		const utterance = new SpeechSynthesisUtterance(text);

		if (preferredVoice) {
			utterance.voice = preferredVoice;
		}

		// Tune for a more natural delivery
		utterance.rate = 0.95;
		utterance.pitch = 1.0;
		utterance.volume = 1.0;
		utterance.onstart = () => {
			isSpeaking = true;
		};
		const reset = () => {
			isSpeaking = false;
		};
		utterance.onend = reset;
		utterance.onerror = reset;

		synth.speak(utterance);
	}

	function stopSpeaking() {
		if (!canUseTts || typeof window === 'undefined') return;
		window.speechSynthesis.cancel();
		isSpeaking = false;
	}

	// Generate simple user ID (in production, use proper auth)
	const userId = crypto.randomUUID();

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (!userInput.trim()) return;

		loading = true;
		response = '';
		agentsUsed = [];
		actions = [];
		playbackText = '';

		try {
			const res = await fetch('/api/agents/orchestrate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					userInput: userInput.trim(),
					userId
				})
			});

			if (!res.ok) {
				throw new Error(`API error: ${res.statusText}`);
			}

			const data = await res.json();
			response = data.response;
			agentsUsed = data.agentsUsed || [];
			actions = data.actions || [];
			playbackText = extractPlaybackText(actions, response);
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
		<label for="user-input">
			What can I help you with today?
		</label>

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

	{#if response}
		<div class="response">
			<strong>DailyAssist:</strong>
			<p>{response}</p>
		</div>
	{/if}

	{#if playbackText && canUseTts}
		<div class="tts-controls">
			<button
				type="button"
				onclick={() => (isSpeaking ? stopSpeaking() : speak(playbackText))}
			>
				{isSpeaking ? 'Stop reading' : 'Read this aloud'}
			</button>
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
	}

	:global(body.dark) .response strong {
		color: hsl(210 60% 60%);
	}

	.response p {
		margin-top: 0.5rem;
		line-height: 1.6;
		white-space: pre-wrap;
	}

	.tts-controls {
		margin-top: 1rem;
		display: flex;
		justify-content: flex-start;
	}

	.tts-controls button {
		padding: 0.5rem 1rem;
		background: hsl(150 60% 45%);
		color: white;
		border: none;
		border-radius: 999px;
		font-size: 0.9rem;
		font-weight: 500;
		cursor: pointer;
		box-shadow: 0 1px 4px hsla(150 60% 20% / 0.25);
		transition: background 0.15s ease, transform 0.1s ease, box-shadow 0.15s ease;
	}

	.tts-controls button:hover {
		background: hsl(150 60% 40%);
		transform: translateY(-1px);
		box-shadow: 0 3px 8px hsla(150 60% 20% / 0.35);
	}

	.tts-controls button:active {
		transform: translateY(0);
		box-shadow: 0 1px 4px hsla(150 60% 20% / 0.25);
	}
</style>