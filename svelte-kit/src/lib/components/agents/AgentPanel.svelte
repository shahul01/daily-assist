<script lang="ts">
	import { onMount } from 'svelte';
	import MarkdownRenderer from '../MarkdownRenderer.svelte';
	import { markdownToPlainTextForTts } from '$lib/utils/markdown';
	import { getOrCreateUserId } from '$lib/supabase';
	import ThoughtSignatureViewer from './ThoughtSignatureViewer.svelte';
	import PlanDisplay from './PlanDisplay.svelte';
	import ExecutionLog, { type LogEntry } from './ExecutionLog.svelte';
	import ConversationHistoryModal from './ConversationHistoryModal.svelte';
	import { saveConversation } from '$lib/utils/conversationStorage';
	import type { PlannerPlan } from '$lib/agents/orchestrator';
	import type { StoredConversation } from '$lib/types/conversation';
	import { storeAgentResult } from '$lib/stores/agentResultsStore';
	import { getAgentPanelUrl, AGENT_LABEL_TO_ID } from '$lib/utils/navigationHelper';
	import type { AgentId } from '$lib/stores/tabState';
	import { getAgentLabel } from '$lib/stores/tabState';
	import { getAgentResult } from '$lib/stores/agentResultsStore';

	interface Props {
		returnResultId?: string;
		onClearReturnResult?: () => void;
	}
	let { returnResultId, onClearReturnResult }: Props = $props();

	let userInput = $state('');
	let response = $state('');
	/** Last message sent by the user, shown in the conversation area above the response. */
	let lastUserMessage = $state('');
	let loading = $state(false);
	let agentsUsed = $state<string[]>([]);
	type AgentAction = { agent: string; action: string; result?: unknown };
	let actions = $state<AgentAction[]>([]);
	/** Result IDs stored for this turn; used to show "Open X panel" links with pre-loaded data. */
	let navigationResultIds = $state<Array<{ agentId: AgentId; resultId: string }>>([]);
	/** One link per agent (latest resultId) for navigation buttons. */
	const uniquePanelLinks = $derived.by(() => {
		const seen: Record<string, string> = {};
		for (const { agentId, resultId } of navigationResultIds) seen[agentId] = resultId;
		return Object.entries(seen).map(([agentId, resultId]) => ({
			agentId: agentId as AgentId,
			resultId
		}));
	});
	/** Valid Supabase auth user id (from anonymous sign-in). Required for reminders/memory. */
	let userId = $state<string | null>(null);

	/** Stored result when returning from a panel (e.g. Find-It Send to Chat). */
	const returnResult = $derived.by(() =>
		returnResultId ? getAgentResult(returnResultId) : null
	);

	/** Summary of return result for display in chat (drug, scene, search, or generic). */
	const returnResultSummary = $derived.by(() => {
		const r = returnResult;
		if (!r?.result || typeof r.result !== 'object') return null;
		const res = r.result as Record<string, unknown>;
		if (r.action === 'search_drug_info' && res.medicineName != null) {
			return {
				type: 'drug' as const,
				title: String(res.medicineName),
				summary: res.synthesizedSummary != null ? String(res.synthesizedSummary) : '',
				dangerLevel: res.dangerLevel != null ? String(res.dangerLevel) : undefined
			};
		}
		if (r.action === 'scene_analysis' && typeof res.description === 'string') {
			const dangers = Array.isArray(res.dangers)
				? (res.dangers as Array<{ warning?: string; location?: string }>).map(
						(d) => `${d.warning ?? ''} ${d.location ?? ''}`.trim()
					)
				: [];
			return {
				type: 'scene' as const,
				description: String(res.description),
				dangers,
				text: Array.isArray(res.text) ? (res.text as string[]) : []
			};
		}
		if (r.action === 'web_search' && typeof res.synthesizedAnswer === 'string') {
			return {
				type: 'search' as const,
				answer: String(res.synthesizedAnswer)
			};
		}
		if (res.message && typeof res.message === 'string') return { type: 'message' as const, text: res.message };
		if (res.synthesizedAnswer && typeof res.synthesizedAnswer === 'string')
			return { type: 'message' as const, text: (res.synthesizedAnswer as string).slice(0, 300) };
		return { type: 'message' as const, text: '' };
	});

	/** Text to pre-fill chat input when arriving from Send to Chat. */
	const returnResultPrefillText = $derived.by(() => {
		const s = returnResultSummary;
		if (!s) return '';
		if (s.type === 'drug') return `Tell me more about ${s.title}.`;
		if (s.type === 'scene') {
			const parts = [s.description];
			if (s.dangers.length) parts.push(...s.dangers.map((d) => `Warning: ${d}`));
			if (s.text.length) parts.push(`Visible text: ${s.text.join(', ')}`);
			return parts.filter(Boolean).join(' ');
		}
		if (s.type === 'search') return s.answer;
		if (s.type === 'message' && s.text) return s.text;
		return '';
	});

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

	$effect(() => {
		const prefill = returnResultPrefillText;
		const id = returnResultId;
		if (id && prefill) userInput = prefill;
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
	/** When set, show marathon suggestion with Accept/Decline. */
	let marathonSuggestion = $state<{ reasoning: string; userGuidance?: string } | null>(null);
	let showHistory = $state(false);

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
		if (typeof result === 'object' && 'synthesizedAnswer' in (result as object))
			return 'web search';
		if (typeof result === 'object' && 'correctedText' in (result as object)) return 'corrected';
		if (typeof result === 'object' && 'adjustedText' in (result as object)) return 'adjusted';
		return 'ok';
	}

	/** Latest web search result from actions, for showing sources in chat. */
	interface WebSearchResultLike {
		query?: string;
		synthesizedAnswer?: string;
		sources?: Array<{ title: string; url: string; snippet?: string; summary?: string }>;
		provider?: string;
	}
	const webSearchResult = $derived.by(() => {
		for (let i = actions.length - 1; i >= 0; i--) {
			const r = actions[i]?.result;
			if (
				r &&
				typeof r === 'object' &&
				'synthesizedAnswer' in r &&
				Array.isArray((r as WebSearchResultLike).sources)
			) {
				return r as WebSearchResultLike;
			}
		}
		return null;
	});

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

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		event.stopPropagation();
		if (!userInput.trim()) return;
		void runSubmit();
	}

	async function runSubmit() {

		const uid = userId ?? (await getOrCreateUserId());
		if (uid && !userId) userId = uid;
		if (!uid) {
			response =
				'Reminders and memory require Supabase. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to .env and enable Anonymous sign-in in Supabase Dashboard → Authentication → Providers.';
			return;
		}
		const inputToSend = userInput.trim();
		lastUserMessage = inputToSend;

		loading = true;
		isStreaming = false;
		response = '';
		agentsUsed = [];
		actions = [];
		navigationResultIds = [];
		playbackText = '';
		clearPlanAndLog();
		marathonSuggestion = null;
		abortController = new AbortController();

		try {
			const res = await fetch('/api/agents/orchestrate-iterative', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					userInput: inputToSend,
					userId: uid,
					maxIterations,
					allowMarathonSuggestion: true
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
							if (userId) {
								const resultId = storeAgentResult({
									agent: String(event.agent),
									action: String(event.action),
									result: event.result,
									userId
								});
								const agentId = AGENT_LABEL_TO_ID[String(event.agent)];
								if (agentId)
									navigationResultIds = [
										...navigationResultIds,
										{ agentId, resultId }
									];
							}
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
						} else if (event.type === 'marathon_suggestion' && event.reasoning) {
							marathonSuggestion = {
								reasoning: String(event.reasoning),
								userGuidance: event.userGuidance != null ? String(event.userGuidance) : undefined
							};
							executionLogEntries = [
								...executionLogEntries,
								{ type: 'final', message: 'Marathon suggested for this task.', status: 'running' }
							];
						} else if (event.type === 'parallel_start' && Array.isArray(event.actions)) {
							const labels = (event.actions as Array<{ agent: string; action: string }>).map(
								(a) => `${a.agent} ${a.action}`
							);
							executionLogEntries = [
								...executionLogEntries,
								{
									type: 'parallel_start',
									iteration: Number(event.iteration),
									parallelActions: labels.join(', ')
								}
							];
						} else if (event.type === 'parallel_complete') {
							executionLogEntries = [
								...executionLogEntries,
								{
									type: 'parallel_complete',
									iteration: Number(event.iteration),
									message: 'Parallel batch complete'
								}
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
			if (response && inputToSend) {
				try {
					saveConversation({
						userInput: inputToSend,
						finalResponse: response,
						plan: currentPlan,
						executionLog: executionLogEntries,
						iterationsCount: currentIteration,
						agentsUsed: [...agentsUsed]
					});
				} catch (err) {
					console.warn('Failed to save conversation to localStorage:', err);
				}
			}
		}
	}

	const thoughtFlowItems = $derived(
		actions.map((a) => ({ context: String(a.action), agent_used: a.agent }))
	);

	async function acceptMarathon() {
		const uid = userId ?? (await getOrCreateUserId());
		if (!uid) return;
		try {
			await fetch('/api/marathon/start', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ userId: uid })
			});
		} finally {
			marathonSuggestion = null;
		}
	}

	function declineMarathon() {
		marathonSuggestion = null;
	}

	function handleRestoreConversation(data: StoredConversation) {
		userInput = '';
		lastUserMessage = data.userInput ?? '';
		response = data.finalResponse ?? '';
		const log = Array.isArray(data.executionLog) ? data.executionLog : [];
		currentPlan = data.plan ?? null;
		executionLogEntries = log as LogEntry[];
		showPlan = data.plan != null;
		showExecutionLog = log.length > 0;
		currentIteration = Math.max(0, Number(data.iterationsCount) || 0);
		agentsUsed = Array.isArray(data.agentsUsed) ? [...data.agentsUsed] : [];
		const actionEntries = log.filter((e) => e && e.type === 'action');
		actions = actionEntries.map((e) => ({
			agent: e.agent ?? '',
			action: e.action ?? '',
			result: undefined
		}));
		playbackText = response ? markdownToPlainTextForTts(response) : '';
		marathonSuggestion = null;
		if (conversationAreaEl) {
			conversationAreaEl.scrollTop = 0;
		}
	}

	let conversationAreaEl: HTMLDivElement | null = $state(null);

	$effect(() => {
		if (!conversationAreaEl) return;
		void response;
		void executionLogEntries.length;
		void loading;
		conversationAreaEl.scrollTo({ top: conversationAreaEl.scrollHeight, behavior: 'smooth' });
	});
</script>

<div class="agent-panel">
	<header class="agent-panel-header">
		<h2>DailyAssist - Your AI Companion</h2>
		<button
			type="button"
			class="history-btn"
			onclick={() => (showHistory = !showHistory)}
			aria-expanded={showHistory}
			aria-label="Conversation history"
		>
			History
		</button>
	</header>
	<ConversationHistoryModal
		open={showHistory}
		onClose={() => (showHistory = false)}
		onRestore={handleRestoreConversation}
	/>

	<div
		class="conversation-area"
		bind:this={conversationAreaEl}
		role="region"
		aria-label="Chat conversation"
	>
		{#if returnResult && onClearReturnResult}
			<div class="return-result-banner" role="region" aria-label="Data from panel">
				<div class="return-result-head">
					<span>From {returnResult.agent}</span>
					<button type="button" onclick={onClearReturnResult} class="return-result-dismiss">
						Dismiss
					</button>
				</div>
				{#if returnResultSummary?.type === 'drug'}
					<div class="return-result-data drug">
						<p class="return-result-title">{returnResultSummary.title}</p>
						{#if returnResultSummary.summary}
							<p class="return-result-summary">{returnResultSummary.summary}</p>
						{/if}
						{#if returnResultSummary.dangerLevel}
							<span class="return-result-badge">{returnResultSummary.dangerLevel}</span>
						{/if}
					</div>
				{:else if returnResultSummary?.type === 'scene'}
					<div class="return-result-data scene">
						<p class="return-result-summary">{returnResultSummary.description}</p>
						{#if returnResultSummary.dangers.length}
							<ul class="return-result-dangers">
								{#each returnResultSummary.dangers as d, i (i)}
									<li>{d}</li>
								{/each}
							</ul>
						{/if}
						{#if returnResultSummary.text.length}
							<p class="return-result-summary">Text: {returnResultSummary.text.join(' | ')}</p>
						{/if}
					</div>
				{:else if returnResultSummary?.type === 'search'}
					<p class="return-result-summary">{returnResultSummary.answer}</p>
				{:else if returnResultSummary?.type === 'message' && returnResultSummary.text}
					<p class="return-result-summary">{returnResultSummary.text}</p>
				{:else}
					<p class="return-result-summary">Data loaded. You can ask a follow-up below.</p>
				{/if}
			</div>
		{/if}

		{#if marathonSuggestion}
			<div class="marathon-suggestion" role="alert">
				<p class="marathon-suggestion-reasoning">{marathonSuggestion.reasoning}</p>
				{#if marathonSuggestion.userGuidance}
					<p class="marathon-suggestion-guidance">{marathonSuggestion.userGuidance}</p>
				{/if}
				<div class="marathon-suggestion-actions">
					<button type="button" onclick={acceptMarathon}>Enable Marathon</button>
					<button type="button" class="secondary" onclick={declineMarathon}>No thanks</button>
				</div>
			</div>
		{/if}

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

		{#if lastUserMessage && (loading || response || isStreaming)}
			<div class="user-message" role="region" aria-label="Your message">
				<strong>You:</strong>
				<p class="user-message-text">{lastUserMessage}</p>
			</div>
		{/if}

		{#if response || isStreaming}
			<div class="response">
				<strong>DailyAssist:</strong>
				<MarkdownRenderer content={response} {isStreaming} />
			</div>
		{/if}
		{#if response && uniquePanelLinks.length > 0}
			<!-- eslint-disable svelte/no-navigation-without-resolve -- in-app panel query nav -->
			<div class="panel-links" role="navigation" aria-label="Open agent panels">
				{#each uniquePanelLinks as { agentId, resultId } (agentId)}
					<a
						href="?{getAgentPanelUrl(agentId, { resultId })}"
						class="panel-link"
					>
						Open {getAgentLabel(agentId)} panel
					</a>
				{/each}
			</div>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		{/if}

		{#if webSearchResult && webSearchResult.sources?.length}
			<!-- eslint-disable svelte/no-navigation-without-resolve -- external source URLs -->
			<div class="web-search-sources" role="region" aria-label="Web search sources">
				<strong>Sources</strong>
				<ul class="web-search-sources-list">
					{#each webSearchResult.sources as source (source.url)}
						<li>
							<a
								href={source.url}
								target="_blank"
								rel="noopener noreferrer"
								class="web-search-source-link"
							>
								{source.title || source.url}
							</a>
						</li>
					{/each}
				</ul>
			</div>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		{/if}


		{#if loading}
			<div class="status-bubble" role="status" aria-live="polite">
				<span class="status-text">
					{executionLogEntries.length > 0 ? 'Answering' : 'Thinking'}
				</span>
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

	<div class="input-area">
		<form
			action="javascript:void(0)"
			method="get"
			onsubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				handleSubmit(e);
				return false;
			}}
		>
			<label for="user-input">What can I help you with?</label>
			<textarea
				id="user-input"
				bind:value={userInput}
				placeholder="Examples:
- Read this text to me: [paste text]
- Remind me to take medication at 8 PM
- What are my reminders?"
				rows="3"
			></textarea>
			<div class="input-actions">
				<button type="submit" disabled={loading}>
					{loading ? 'Processing...' : 'Ask DailyAssist'}
				</button>
				{#if isIterating}
					<button
						type="button"
						class="stop-btn"
						onclick={stopIteration}
						aria-label="Stop execution"
					>
						Stop
					</button>
				{/if}
			</div>
		</form>
	</div>
</div>

<style>
	.agent-panel {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		max-width: 600px;
		margin: 0 auto;
		padding: 0;
		background: hsl(210 20% 98%);
		border-radius: 12px;
		box-shadow: 0 2px 8px hsla(210 20% 20% / 0.1);
	}

	.agent-panel-header {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 1rem 1rem 0.5rem;
	}
	.agent-panel-header h2 {
		flex: 1;
		min-width: 0;
	}
	.history-btn {
		flex-shrink: 0;
		padding: 0.4rem 0.75rem;
		font-size: 0.875rem;
		background: hsl(210 25% 92%);
		color: hsl(210 50% 35%);
		border: 1px solid hsl(210 30% 85%);
		border-radius: 8px;
		cursor: pointer;
		font-weight: 500;
	}
	.history-btn:hover {
		background: hsl(210 30% 88%);
		color: hsl(210 60% 30%);
	}
	:global(body.dark) .history-btn {
		background: hsl(210 20% 22%);
		color: hsl(210 50% 70%);
		border-color: hsl(210 20% 32%);
	}
	:global(body.dark) .history-btn:hover {
		background: hsl(210 25% 28%);
		color: hsl(210 60% 80%);
	}

	.conversation-area {
		flex: 1 1 0;
		min-height: 0;
		overflow-y: auto;
		padding: 0.5rem 1rem 1rem;
	}
	.return-result-banner {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		margin-bottom: 0.75rem;
		background: hsl(210 40% 94%);
		border: 1px solid hsl(210 35% 88%);
		border-radius: 8px;
		font-size: 0.875rem;
		color: hsl(210 50% 30%);
	}
	:global(body.dark) .return-result-banner {
		background: hsl(210 25% 22%);
		border-color: hsl(210 20% 32%);
		color: hsl(210 40% 80%);
	}
	.return-result-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.return-result-data.drug {
		padding-top: 0.25rem;
		border-top: 1px solid hsl(210 30% 88%);
	}
	:global(body.dark) .return-result-data.drug {
		border-top-color: hsl(210 20% 35%);
	}
	.return-result-data.scene {
		padding-top: 0.25rem;
		border-top: 1px solid hsl(210 30% 88%);
	}
	:global(body.dark) .return-result-data.scene {
		border-top-color: hsl(210 20% 35%);
	}
	.return-result-dangers {
		margin: 0.25rem 0 0;
		padding-left: 1.25rem;
		font-size: 0.8125rem;
		color: hsl(0 60% 40%);
	}
	:global(body.dark) .return-result-dangers {
		color: hsl(0 55% 55%);
	}
	.return-result-title {
		font-weight: 600;
		margin: 0 0 0.25rem;
		font-size: 0.9375rem;
	}
	.return-result-summary {
		margin: 0;
		font-size: 0.8125rem;
		line-height: 1.4;
		opacity: 0.95;
	}
	.return-result-badge {
		display: inline-block;
		margin-top: 0.35rem;
		padding: 0.2rem 0.5rem;
		border-radius: 6px;
		font-size: 0.75rem;
		font-weight: 500;
		background: hsl(210 30% 88%);
		color: hsl(210 50% 25%);
	}
	:global(body.dark) .return-result-badge {
		background: hsl(210 20% 32%);
		color: hsl(210 40% 78%);
	}
	.return-result-dismiss {
		flex-shrink: 0;
		padding: 0.25rem 0.5rem;
		font-size: 0.8125rem;
		background: transparent;
		border: 1px solid currentColor;
		border-radius: 6px;
		cursor: pointer;
		color: inherit;
	}
	.return-result-dismiss:hover {
		background: hsl(210 30% 90%);
	}
	:global(body.dark) .return-result-dismiss:hover {
		background: hsl(210 20% 28%);
	}

	.status-bubble {
		display: inline-flex;
		align-items: center;
		padding: 0.5rem 1rem;
		margin-bottom: 0.75rem;
		background: hsl(210 40% 94%);
		border-radius: 12px;
		border: 1px solid hsl(210 30% 88%);
		font-size: 0.9rem;
		color: hsl(210 50% 35%);
	}
	:global(body.dark) .status-bubble {
		background: hsl(210 25% 22%);
		border-color: hsl(210 20% 30%);
		color: hsl(210 40% 75%);
	}
	.status-text {
		display: inline-block;
	}
	.status-text::after {
		content: '';
		animation: status-dots 1.4s steps(4, end) infinite;
	}
	@keyframes status-dots {
		0%,
		20% {
			content: '';
		}
		40% {
			content: '.';
		}
		60% {
			content: '..';
		}
		80%,
		100% {
			content: '...';
		}
	}

	.input-area {
		flex-shrink: 0;
		padding: 1rem;
		border-top: 1px solid hsl(210 10% 90%);
		background: hsl(210 15% 97%);
		border-radius: 0 0 12px 12px;
	}

	:global(body.dark) .input-area {
		border-top-color: hsl(210 20% 25%);
		background: hsl(210 20% 12%);
	}

	.input-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
		margin-top: 0.75rem;
	}

	.input-actions button {
		margin-top: 0;
	}

	:global(body.dark) .agent-panel {
		background: hsl(210 20% 15%);
		box-shadow: 0 2px 8px hsla(0 0% 0% / 0.3);
	}

	h2 {
		color: hsl(210 60% 40%);
		margin: 0 0 0.5rem;
		font-size: 1.25rem;
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

	.marathon-suggestion {
		margin-top: 1rem;
		padding: 1rem;
		background: hsl(210 30% 96%);
		border-radius: 8px;
		border: 1px solid hsl(210 50% 80%);
	}
	:global(body.dark) .marathon-suggestion {
		background: hsl(210 25% 18%);
		border-color: hsl(210 40% 35%);
	}
	.marathon-suggestion-reasoning {
		margin: 0 0 0.5rem;
		font-size: 0.95rem;
	}
	.marathon-suggestion-guidance {
		margin: 0 0 0.75rem;
		font-size: 0.9rem;
		opacity: 0.9;
	}
	.marathon-suggestion-actions {
		display: flex;
		gap: 0.5rem;
	}
	.marathon-suggestion-actions button.secondary {
		background: transparent;
		color: inherit;
		border: 1px solid currentColor;
	}

	.user-message {
		margin-top: 1rem;
		padding: 0.75rem 1rem;
		background: hsl(210 30% 96%);
		border-radius: 8px;
		border-left: 4px solid hsl(210 40% 70%);
	}
	:global(body.dark) .user-message {
		background: hsl(210 20% 20%);
		border-left-color: hsl(210 40% 55%);
	}
	.user-message strong {
		color: hsl(210 50% 35%);
		display: block;
		margin-bottom: 0.35rem;
		font-size: 0.875rem;
	}
	:global(body.dark) .user-message strong {
		color: hsl(210 50% 68%);
	}
	.user-message-text {
		margin: 0;
		font-size: 0.9375rem;
		line-height: 1.4;
		color: hsl(210 30% 25%);
		white-space: pre-wrap;
		word-break: break-word;
	}
	:global(body.dark) .user-message-text {
		color: hsl(210 20% 88%);
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

	.panel-links {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 1rem;
	}
	.panel-link {
		display: inline-block;
		padding: 0.4rem 0.75rem;
		font-size: 0.875rem;
		background: hsl(210 50% 94%);
		color: hsl(210 60% 35%);
		border-radius: 8px;
		text-decoration: none;
		border: 1px solid hsl(210 35% 88%);
		font-weight: 500;
	}
	.panel-link:hover {
		background: hsl(210 55% 90%);
		color: hsl(210 60% 28%);
	}
	:global(body.dark) .panel-link {
		background: hsl(210 25% 24%);
		color: hsl(210 50% 75%);
		border-color: hsl(210 20% 32%);
	}
	:global(body.dark) .panel-link:hover {
		background: hsl(210 28% 28%);
		color: hsl(210 55% 85%);
	}

	.web-search-sources {
		margin-top: 1rem;
		padding: 0.75rem 1rem;
		background: hsl(210 20% 97%);
		border-radius: 8px;
		border: 1px solid hsl(210 20% 90%);
		font-size: 0.9rem;
	}

	:global(body.dark) .web-search-sources {
		background: hsl(210 20% 20%);
		border-color: hsl(210 20% 28%);
	}

	.web-search-sources strong {
		display: block;
		margin-bottom: 0.5rem;
		color: hsl(210 50% 35%);
	}

	:global(body.dark) .web-search-sources strong {
		color: hsl(210 50% 65%);
	}

	.web-search-sources-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.web-search-source-link {
		color: hsl(210 70% 45%);
		text-decoration: none;
	}

	.web-search-source-link:hover {
		text-decoration: underline;
	}

	:global(body.dark) .web-search-source-link {
		color: hsl(210 70% 65%);
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
