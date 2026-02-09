<script lang="ts">
	import { onMount } from 'svelte';
	import {
		speakFromPayload,
		speakRepeatedly,
		stopSpeaking,
		pauseSpeaking,
		resumeSpeaking,
		isSpeaking,
		isPaused,
		whenVoicesReady
	} from '$lib/utils/speech';
	import { SUPPORTED_LANGUAGES } from '$lib/agents/sayAgent';
	import { getOrCreateUserId } from '$lib/supabase';

	type Emotion =
		| 'happy'
		| 'sad'
		| 'urgent'
		| 'calm'
		| 'neutral'
		| 'excited'
		| 'worried'
		| 'tired'
		| 'confident';
	type PhraseCategory = 'greeting' | 'need' | 'emergency' | 'emotion' | 'custom';

	interface QuickPhraseRow {
		id: string;
		phrase: string;
		category: string | null;
		emotion: string | null;
		language: string | null;
		is_default: boolean;
		usage_count: number;
	}

	interface VoiceProfileRow {
		id: string;
		name: string;
		pitch: number;
		rate: number;
		volume: number;
		language: string;
		voice_uri: string | null;
	}

	/** Default quick phrases when user has none (client-side fallback) */
	const DEFAULT_PHRASES: { phrase: string; category: PhraseCategory; emotion?: Emotion }[] = [
		{ phrase: 'Hello', category: 'greeting', emotion: 'happy' },
		{ phrase: 'Thank you', category: 'greeting', emotion: 'happy' },
		{ phrase: 'I need help', category: 'need', emotion: 'urgent' },
		{ phrase: 'Please wait', category: 'need', emotion: 'calm' },
		{ phrase: 'Yes', category: 'emotion', emotion: 'happy' },
		{ phrase: 'No', category: 'emotion', emotion: 'calm' },
		{ phrase: 'I am not feeling well', category: 'need', emotion: 'sad' },
		{ phrase: 'Call 911', category: 'emergency', emotion: 'urgent' },
		{ phrase: 'Where is the bathroom?', category: 'need', emotion: 'neutral' },
		{ phrase: 'I need water', category: 'need', emotion: 'neutral' }
	];

	let userId = $state<string | null>(null);
	let textInput = $state('');
	let error = $state('');
	let loading = $state(false);
	let emotion = $state<Emotion>('neutral');
	let customPhrase = $state('');
	let phrases = $state<QuickPhraseRow[]>([]);
	let pitch = $state(1);
	let rate = $state(1);
	let volume = $state(1);
	let selectedLang = $state('en-US');
	let voiceUri = $state('');
	let emergencyMessage = $state('I need help immediately');
	// Tier 2
	let voiceProfiles = $state<VoiceProfileRow[]>([]);
	let newProfileName = $state('');
	let selectedProfileId = $state('');
	// Tier 3
	let cloneReady = $state(false);
	let activeSessionId = $state<string | null>(null);
	let sessionTurns = $state<{ id: string; speaker: string; text: string | null }[]>([]);

	onMount(() => {
		whenVoicesReady();
		getOrCreateUserId().then((id) => {
			userId = id;
			if (id) {
				loadQuickPhrases(id);
				loadVoicePreferences(id);
				loadVoiceProfiles(id);
				loadCloneStatus(id);
			}
		});
	});

	async function loadQuickPhrases(uid: string) {
		try {
			const res = await fetch('/api/agents/say', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ loadQuickPhrases: { userId: uid } })
			});
			const data = await res.json();
			if (res.ok && Array.isArray(data.phrases)) phrases = data.phrases;
		} catch {
			// keep default or existing
		}
	}

	async function loadVoicePreferences(uid: string) {
		try {
			const res = await fetch('/api/agents/say', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ loadVoicePreferences: { userId: uid } })
			});
			const data = await res.json();
			if (res.ok && data && typeof data.pitch === 'number') {
				pitch = data.pitch;
				rate = data.rate;
				volume = data.volume;
				if (data.language) selectedLang = data.language;
				if (data.voice_uri) voiceUri = data.voice_uri;
			}
		} catch {
			// keep defaults
		}
	}

	async function saveVoicePreferences() {
		if (!userId) return;
		try {
			await fetch('/api/agents/say', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					saveVoicePreferences: {
						userId,
						pitch,
						rate,
						volume,
						language: selectedLang,
						voiceUri: voiceUri || undefined
					}
				})
			});
		} catch {
			// ignore
		}
	}

	async function loadVoiceProfiles(uid: string) {
		try {
			const res = await fetch('/api/agents/say', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ loadVoiceProfiles: { userId: uid } })
			});
			const data = await res.json();
			if (res.ok && Array.isArray(data.profiles)) voiceProfiles = data.profiles;
		} catch {
			// keep default
		}
	}

	async function applyVoiceProfile(profileId: string) {
		if (!userId) return;
		try {
			const res = await fetch('/api/agents/say', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ getVoiceProfile: { profileId, userId } })
			});
			const data = await res.json();
			if (res.ok && data && data.pitch != null) {
				pitch = data.pitch;
				rate = data.rate;
				volume = data.volume;
				if (data.language) selectedLang = data.language;
				voiceUri = data.voice_uri ?? '';
				saveVoicePreferences();
			}
		} catch {
			// ignore
		}
	}

	async function saveCurrentAsProfile() {
		const name = newProfileName.trim() || 'My profile';
		if (!userId) return;
		try {
			const res = await fetch('/api/agents/say', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					saveVoiceProfile: {
						userId,
						name,
						pitch,
						rate,
						volume,
						language: selectedLang,
						voiceUri: voiceUri || undefined
					}
				})
			});
			const data = await res.json();
			if (res.ok && data) {
				voiceProfiles = [data, ...voiceProfiles];
				newProfileName = '';
			}
		} catch {
			// ignore
		}
	}

	async function deleteVoiceProfileById(profileId: string) {
		if (!userId) return;
		try {
			await fetch('/api/agents/say', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ deleteVoiceProfile: { profileId, userId } })
			});
			voiceProfiles = voiceProfiles.filter((p) => p.id !== profileId);
			if (selectedProfileId === profileId) selectedProfileId = '';
		} catch {
			// ignore
		}
	}

	async function loadCloneStatus(uid: string) {
		try {
			const res = await fetch('/api/agents/say', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ getVoiceCloneStatus: { userId: uid } })
			});
			const data = await res.json();
			if (res.ok && data) cloneReady = !!data.ready;
		} catch {
			cloneReady = false;
		}
	}

	async function handleSpeakWithClone() {
		const text = textInput.trim() || 'Hello';
		if (!userId) return;
		error = '';
		loading = true;
		try {
			const res = await fetch('/api/agents/say', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ speakWithClone: { text, userId } })
			});
			const data = await res.json();
			if (res.ok && data.audioBase64) {
				const audio = new Audio(
					'data:' + (data.contentType || 'audio/mpeg') + ';base64,' + data.audioBase64
				);
				await audio.play();
			} else if (data.error) error = data.error;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Clone speak failed';
		} finally {
			loading = false;
		}
	}

	async function startConversation() {
		if (!userId) return;
		try {
			const res = await fetch('/api/agents/say', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ conversationStart: { userId } })
			});
			const data = await res.json();
			if (res.ok && data?.id) {
				activeSessionId = data.id;
				sessionTurns = [];
			}
		} catch {
			// ignore
		}
	}

	async function endConversation() {
		if (!activeSessionId || !userId) return;
		try {
			await fetch('/api/agents/say', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					conversationEnd: { sessionId: activeSessionId, userId }
				})
			});
			activeSessionId = null;
			sessionTurns = [];
		} catch {
			// ignore
		}
	}

	async function loadSessionHistory() {
		if (!activeSessionId || !userId) return;
		try {
			const res = await fetch('/api/agents/say', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					conversationHistory: { sessionId: activeSessionId, userId }
				})
			});
			const data = await res.json();
			if (res.ok && data?.turns)
				sessionTurns = data.turns.map(
					(t: { id: string; speaker: string; text: string | null }) => ({
						id: t.id,
						speaker: t.speaker,
						text: t.text
					})
				);
		} catch {
			// ignore
		}
	}

	async function handleSpeak() {
		error = '';
		const text = textInput.trim();
		if (!text) {
			error = 'Enter text to speak.';
			return;
		}
		loading = true;
		try {
			const res = await fetch('/api/agents/say', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					speak: {
						text,
						emotion,
						pitch,
						rate,
						volume,
						lang: selectedLang,
						voiceUri: voiceUri || undefined,
						userId: userId ?? undefined
					}
				})
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.message ?? data.error ?? 'Speak failed');
			speakFromPayload(data);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Something went wrong';
		} finally {
			loading = false;
		}
	}

	async function handleQuickPhrase(phraseId: string) {
		if (!userId) return;
		error = '';
		loading = true;
		try {
			const res = await fetch('/api/agents/say', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ quickPhrase: { phraseId, userId } })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.message ?? data.error ?? 'Failed');
			if (data.repeatCount && data.repeatCount > 1) {
				speakRepeatedly(
					data.text,
					{
						rate: data.rate,
						pitch: data.pitch,
						volume: data.volume,
						lang: data.lang,
						voiceUri: data.voiceUri
					},
					data.repeatCount
				);
			} else {
				speakFromPayload(data);
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			loading = false;
		}
	}

	async function handleDefaultPhrase(phrase: string, emo?: Emotion) {
		error = '';
		loading = true;
		try {
			const res = await fetch('/api/agents/say', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					speak: {
						text: phrase,
						emotion: emo,
						pitch,
						rate,
						volume,
						lang: selectedLang,
						voiceUri: voiceUri || undefined,
						userId: userId ?? undefined
					}
				})
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.message ?? data.error ?? 'Failed');
			speakFromPayload(data);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			loading = false;
		}
	}

	async function handleEmergency() {
		error = '';
		loading = true;
		try {
			const res = await fetch('/api/agents/say', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					emergency: {
						message: emergencyMessage.trim() || 'I need help immediately',
						repeatCount: 3,
						userId: userId ?? undefined
					}
				})
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.message ?? data.error ?? 'Failed');
			speakRepeatedly(
				data.text,
				{
					rate: data.rate,
					pitch: data.pitch,
					volume: data.volume,
					lang: data.lang,
					voiceUri: data.voiceUri
				},
				data.repeatCount ?? 3
			);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Emergency speak failed';
		} finally {
			loading = false;
		}
	}

	async function handleAddCustomPhrase() {
		const text = customPhrase.trim();
		if (!text || !userId) return;
		error = '';
		loading = true;
		try {
			const res = await fetch('/api/agents/say', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					saveQuickPhrase: {
						userId,
						phrase: text,
						category: 'custom',
						language: selectedLang
					}
				})
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.message ?? data.error ?? 'Failed to save');
			phrases = [data, ...phrases];
			customPhrase = '';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to save phrase';
		} finally {
			loading = false;
		}
	}

	function handleStopSpeaking() {
		stopSpeaking();
	}

	const displayPhrases = $derived(
		phrases.length > 0
			? phrases
			: DEFAULT_PHRASES.map((p, i) => ({
					id: `default-${i}`,
					phrase: p.phrase,
					category: p.category,
					emotion: p.emotion ?? null,
					language: null,
					is_default: true,
					usage_count: 0
				}))
	);
	const isDefaultPhrase = (id: string) => id.startsWith('default-');
</script>

<div
	class="say-agent rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900"
>
	<h2 class="mb-3 text-lg font-medium text-neutral-800 dark:text-neutral-200">Say-It-For-Me</h2>
	<p class="mb-3 text-sm text-neutral-600 dark:text-neutral-400">
		Type or choose a phrase to speak aloud. Use emergency for urgent, repeated speech.
	</p>

	<!-- Quick input -->
	<div class="mb-3">
		<textarea
			bind:value={textInput}
			placeholder="Type what you want to say…"
			class="mb-2 w-full resize-y rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-neutral-900 placeholder-neutral-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder-neutral-400"
			rows="2"
			aria-label="Text to speak"
		></textarea>
		<div class="flex flex-wrap items-center gap-2">
			<label class="flex items-center gap-1.5 text-sm text-neutral-600 dark:text-neutral-400">
				Emotion
				<select
					bind:value={emotion}
					class="rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
					aria-label="Emotion for speech"
				>
					<option value="neutral">Neutral</option>
					<option value="calm">Calm</option>
					<option value="happy">Happy</option>
					<option value="sad">Sad</option>
					<option value="urgent">Urgent</option>
					<option value="excited">Excited</option>
					<option value="worried">Worried</option>
					<option value="tired">Tired</option>
					<option value="confident">Confident</option>
				</select>
			</label>
			<button
				type="button"
				onclick={handleSpeak}
				disabled={loading}
				class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow transition hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50 dark:focus:ring-offset-neutral-900"
				aria-label="Speak text aloud"
			>
				{loading ? 'Speaking…' : 'Speak'}
			</button>
			{#if isSpeaking() || isPaused()}
				<button
					type="button"
					onclick={isPaused() ? resumeSpeaking : pauseSpeaking}
					class="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
					aria-label={isPaused() ? 'Resume speaking' : 'Pause speaking'}
				>
					{isPaused() ? 'Resume' : 'Pause'}
				</button>
				<button
					type="button"
					onclick={handleStopSpeaking}
					class="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
					aria-label="Stop speaking"
				>
					Stop
				</button>
			{/if}
		</div>
	</div>

	<!-- Emergency -->
	<div class="mb-3">
		<label
			for="say-agent-emergency-msg"
			class="mb-1 block text-sm text-neutral-600 dark:text-neutral-400">Emergency message</label
		>
		<div class="flex flex-wrap gap-2">
			<input
				id="say-agent-emergency-msg"
				type="text"
				bind:value={emergencyMessage}
				placeholder="I need help immediately"
				class="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
				aria-label="Emergency message"
			/>
			<button
				type="button"
				onclick={handleEmergency}
				disabled={loading}
				class="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow transition hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50 dark:focus:ring-offset-neutral-900"
				aria-label="Speak emergency message repeatedly"
			>
				Emergency (repeats 3×)
			</button>
		</div>
	</div>

	<!-- Quick phrases grid -->
	<div class="mb-3">
		<h3 class="mb-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">Quick phrases</h3>
		<div class="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
			{#each displayPhrases as item (item.id)}
				{#if isDefaultPhrase(item.id)}
					<button
						type="button"
						onclick={() => handleDefaultPhrase(item.phrase, (item.emotion as Emotion) ?? undefined)}
						disabled={loading}
						class="rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-left text-sm font-medium text-neutral-800 transition hover:bg-neutral-100 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
						aria-label="Speak: {item.phrase}"
					>
						{item.phrase}
					</button>
				{:else}
					<button
						type="button"
						onclick={() => handleQuickPhrase(item.id)}
						disabled={loading}
						class="rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-left text-sm font-medium text-neutral-800 transition hover:bg-neutral-100 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
						aria-label="Speak: {item.phrase}"
					>
						{item.phrase}
					</button>
				{/if}
			{/each}
		</div>
	</div>

	<!-- Voice settings -->
	<div
		class="mb-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-800"
	>
		<h3 class="mb-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">Voice settings</h3>
		<div class="flex flex-wrap gap-4">
			<label class="flex flex-col gap-1 text-sm text-neutral-600 dark:text-neutral-400">
				Pitch
				<input
					type="range"
					bind:value={pitch}
					min="0.5"
					max="2"
					step="0.1"
					onchange={saveVoicePreferences}
				/>
			</label>
			<label class="flex flex-col gap-1 text-sm text-neutral-600 dark:text-neutral-400">
				Rate
				<input
					type="range"
					bind:value={rate}
					min="0.5"
					max="2"
					step="0.1"
					onchange={saveVoicePreferences}
				/>
			</label>
			<label class="flex flex-col gap-1 text-sm text-neutral-600 dark:text-neutral-400">
				Volume
				<input
					type="range"
					bind:value={volume}
					min="0"
					max="1"
					step="0.1"
					onchange={saveVoicePreferences}
				/>
			</label>
			<label class="flex flex-col gap-1 text-sm text-neutral-600 dark:text-neutral-400">
				Language
				<select
					bind:value={selectedLang}
					onchange={saveVoicePreferences}
					class="rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
					aria-label="Language"
				>
					{#each SUPPORTED_LANGUAGES as lang (lang.code)}
						<option value={lang.code}>{lang.label}</option>
					{/each}
				</select>
			</label>
		</div>
		<!-- Tier 2: Voice profiles -->
		{#if userId && voiceProfiles.length >= 0}
			<div
				class="mt-2 flex flex-wrap items-center gap-2 border-t border-neutral-200 pt-2 dark:border-neutral-600"
			>
				<label for="say-agent-voice-profile" class="text-sm text-neutral-600 dark:text-neutral-400"
					>Profile</label
				>
				<select
					id="say-agent-voice-profile"
					bind:value={selectedProfileId}
					class="rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
					aria-label="Voice profile"
					onchange={(e) => {
						const id = (e.currentTarget as HTMLSelectElement).value;
						if (id) applyVoiceProfile(id);
					}}
				>
					<option value="">— Select —</option>
					{#each voiceProfiles as profile (profile.id)}
						<option value={profile.id}>{profile.name}</option>
					{/each}
				</select>
				{#if selectedProfileId}
					<button
						type="button"
						onclick={() => deleteVoiceProfileById(selectedProfileId)}
						class="rounded border border-red-300 bg-red-50 px-2 py-1 text-sm dark:border-red-800 dark:bg-red-900/30"
						aria-label="Delete selected profile"
					>
						Delete profile
					</button>
				{/if}
				<input
					type="text"
					bind:value={newProfileName}
					placeholder="Profile name"
					class="w-28 rounded border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
					aria-label="New profile name"
				/>
				<button
					type="button"
					onclick={saveCurrentAsProfile}
					class="rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
				>
					Save as profile
				</button>
			</div>
		{/if}
	</div>

	<!-- Tier 3: Voice clone -->
	{#if userId}
		<div
			class="mb-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-800"
		>
			<h3 class="mb-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">Voice clone</h3>
			<p class="mb-2 text-xs text-neutral-500 dark:text-neutral-400">
				{cloneReady
					? 'Clone ready. Speak with cloned or default voice.'
					: 'Set ELEVENLABS_API_KEY for clone/default voice.'}
			</p>
			<button
				type="button"
				onclick={handleSpeakWithClone}
				disabled={loading}
				class="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
			>
				Speak with clone
			</button>
		</div>

		<!-- Tier 3: Conversation mode -->
		<div
			class="mb-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-800"
		>
			<h3 class="mb-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">Conversation</h3>
			{#if !activeSessionId}
				<button
					type="button"
					onclick={startConversation}
					class="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
				>
					Start conversation
				</button>
			{:else}
				<div class="flex flex-wrap gap-2">
					<button
						type="button"
						onclick={loadSessionHistory}
						class="rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-600 dark:bg-neutral-800"
					>
						Refresh history
					</button>
					<button
						type="button"
						onclick={endConversation}
						class="rounded border border-red-300 bg-red-50 px-2 py-1 text-sm dark:border-red-800 dark:bg-red-900/30"
					>
						End conversation
					</button>
				</div>
				{#if sessionTurns.length > 0}
					<ul class="mt-2 max-h-32 overflow-y-auto text-xs text-neutral-600 dark:text-neutral-400">
						{#each sessionTurns as turn (turn.id)}
							<li><strong>{turn.speaker}:</strong> {turn.text ?? ''}</li>
						{/each}
					</ul>
				{/if}
			{/if}
		</div>
	{/if}

	<!-- Add custom phrase -->
	{#if userId}
		<div class="flex flex-wrap gap-2">
			<input
				type="text"
				bind:value={customPhrase}
				placeholder="Add a custom phrase…"
				class="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
				aria-label="New phrase text"
			/>
			<button
				type="button"
				onclick={handleAddCustomPhrase}
				disabled={loading || !customPhrase.trim()}
				class="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
				aria-label="Save custom phrase"
			>
				Add phrase
			</button>
		</div>
	{/if}

	{#if error}
		<p class="mt-2 text-sm text-red-600 dark:text-red-400" role="alert">
			<span class="font-medium">Error:</span>
			{error}
		</p>
	{/if}
</div>
