<script lang="ts">
	import { startVoiceInput, isVoiceInputSupported } from '$lib/utils/voiceInput';
	import type { Tone } from '$lib/agents/writeAgent';
	import type { Draft, WritingTemplate } from '$lib/agents/writeAgent';

	interface Props {
		userId?: string;
	}

	let { userId = '' }: Props = $props();

	type TabId = 'compose' | 'templates' | 'drafts';
	let activeTab = $state<TabId>('compose');
	let content = $state('');
	let output = $state('');
	let emailSubject = $state('');
	let loading = $state(false);
	let error = $state('');
	let tone = $state<Tone>('professional');
	let dictating = $state(false);
	let drafts = $state<Draft[]>([]);
	let templates = $state<WritingTemplate[]>([]);

	const TONE_OPTIONS: { value: Tone; label: string }[] = [
		{ value: 'formal', label: 'Formal' },
		{ value: 'casual', label: 'Casual' },
		{ value: 'friendly', label: 'Friendly' },
		{ value: 'professional', label: 'Professional' },
		{ value: 'persuasive', label: 'Persuasive' }
	];

	const BUILT_IN_TEMPLATES = [
		{ purpose: 'Job application email', name: 'Job application' },
		{ purpose: 'Thank you note', name: 'Thank you note' },
		{ purpose: 'Meeting request', name: 'Meeting request' },
		{ purpose: 'Follow-up email', name: 'Follow-up' },
		{ purpose: 'Professional introduction', name: 'Introduction' },
		{ purpose: 'Short project proposal', name: 'Project proposal' },
		{ purpose: 'Apology letter', name: 'Apology' },
		{ purpose: 'Recommendation request', name: 'Recommendation request' }
	];

	let voiceStop: (() => void) | null = null;

	function startDictation() {
		error = '';
		if (!isVoiceInputSupported()) {
			error = 'Voice input is not supported in this browser.';
			return;
		}
		dictating = true;
		voiceStop = startVoiceInput({
			continuous: true,
			interimResults: true,
			onResult(transcript, isFinal) {
				if (isFinal) {
					content = content ? `${content} ${transcript}` : transcript;
				}
			},
			onError(e) {
				error = e.message;
				dictating = false;
			},
			onEnd() {
				dictating = false;
				voiceStop = null;
			}
		}).stop;
	}

	function stopDictation() {
		voiceStop?.();
		voiceStop = null;
		dictating = false;
	}

	async function correctGrammar() {
		error = '';
		if (!content.trim()) {
			error = 'Enter text first.';
			return;
		}
		loading = true;
		try {
			const res = await fetch('/api/agents/write', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'correct_grammar', text: content })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.message ?? data.error ?? 'Failed');
			content = data.correctedText ?? content;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Grammar check failed';
		} finally {
			loading = false;
		}
	}

	async function adjustTone() {
		error = '';
		if (!content.trim()) {
			error = 'Enter text first.';
			return;
		}
		loading = true;
		try {
			const res = await fetch('/api/agents/write', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'adjust_tone', text: content, targetTone: tone })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.message ?? data.error ?? 'Failed');
			content = data.adjustedText ?? content;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Tone adjustment failed';
		} finally {
			loading = false;
		}
	}

	async function generateEmail() {
		error = '';
		const topic = content.trim() || 'General inquiry';
		loading = true;
		try {
			const res = await fetch('/api/agents/write', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'compose_email',
					topic,
					tone,
					userId: userId || undefined
				})
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.message ?? data.error ?? 'Failed');
			emailSubject = data.subject ?? '';
			output = data.body ?? '';
			if (!content.trim()) content = topic;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Email generation failed';
		} finally {
			loading = false;
		}
	}

	async function saveDraft() {
		if (!userId) {
			error = 'Sign in to save drafts.';
			return;
		}
		error = '';
		if (!content.trim()) {
			error = 'Enter content to save.';
			return;
		}
		loading = true;
		try {
			const res = await fetch('/api/agents/write', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'save_draft',
					userId,
					content,
					title: emailSubject || undefined,
					draftType: 'email'
				})
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.message ?? data.error ?? 'Failed');
			await loadDrafts();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Save failed';
		} finally {
			loading = false;
		}
	}

	async function loadDrafts() {
		if (!userId) return;
		error = '';
		try {
			const res = await fetch('/api/agents/write', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'load_drafts', userId })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.message ?? data.error ?? 'Failed');
			drafts = data.drafts ?? [];
		} catch (e) {
			error = e instanceof Error ? e.message : 'Load failed';
		}
	}

	function loadDraft(draft: Draft) {
		content = draft.content;
		output = '';
		emailSubject = draft.title ?? '';
		activeTab = 'compose';
	}

	async function useTemplatePurpose(purpose: string) {
		error = '';
		loading = true;
		try {
			const res = await fetch('/api/agents/write', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'generate_template', purpose })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.message ?? data.error ?? 'Failed');
			const t = data.template as WritingTemplate;
			content = t.content;
			templates = [...templates, t];
			activeTab = 'compose';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Template failed';
		} finally {
			loading = false;
		}
	}

	function goToDrafts() {
		activeTab = 'drafts';
		if (userId) loadDrafts();
	}
</script>

<div
	class="write-agent rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900"
>
	<h2 class="mb-3 text-lg font-medium text-neutral-800 dark:text-neutral-200">Write-For-Me</h2>

	<div class="mb-3 flex gap-2 border-b border-neutral-200 dark:border-neutral-700" role="tablist">
		<button
			type="button"
			role="tab"
			aria-selected={activeTab === 'compose'}
			class="rounded-t px-3 py-2 text-sm font-medium transition {activeTab === 'compose'
				? 'border-b-2 border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
				: 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200'}"
			onclick={() => (activeTab = 'compose')}
		>
			Compose
		</button>
		<button
			type="button"
			role="tab"
			aria-selected={activeTab === 'templates'}
			class="rounded-t px-3 py-2 text-sm font-medium transition {activeTab === 'templates'
				? 'border-b-2 border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
				: 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200'}"
			onclick={() => (activeTab = 'templates')}
		>
			Templates
		</button>
		<button
			type="button"
			role="tab"
			aria-selected={activeTab === 'drafts'}
			class="rounded-t px-3 py-2 text-sm font-medium transition {activeTab === 'drafts'
				? 'border-b-2 border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
				: 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200'}"
			onclick={goToDrafts}
		>
			Drafts
		</button>
	</div>

	{#if activeTab === 'compose'}
		<div class="compose-area">
			<div class="mb-2 flex flex-wrap items-center gap-2">
				<label class="flex items-center gap-1.5 text-sm text-neutral-600 dark:text-neutral-400">
					Tone
					<select
						bind:value={tone}
						class="rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
						aria-label="Tone"
					>
						{#each TONE_OPTIONS as opt (opt.value)}
							<option value={opt.value}>{opt.label}</option>
						{/each}
					</select>
				</label>
				{#if isVoiceInputSupported()}
					{#if dictating}
						<button
							type="button"
							onclick={stopDictation}
							class="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 dark:border-red-700 dark:bg-red-900/20 dark:text-red-300"
							aria-label="Stop dictation"
						>
							Stop dictation
						</button>
					{:else}
						<button
							type="button"
							onclick={startDictation}
							class="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
							aria-label="Start dictation"
						>
							Dictate
						</button>
					{/if}
				{/if}
				<button
					type="button"
					onclick={correctGrammar}
					disabled={loading || !content.trim()}
					class="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
					aria-label="Check grammar"
				>
					Check grammar
				</button>
			</div>
			<textarea
				bind:value={content}
				placeholder="Type or dictate your text. Describe the email topic to generate one."
				class="mb-3 w-full resize-y rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-neutral-900 placeholder-neutral-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder-neutral-400"
				rows="8"
				aria-label="Content"
			></textarea>
			<div class="mb-3 flex flex-wrap gap-2">
				<button
					type="button"
					onclick={generateEmail}
					disabled={loading}
					class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow transition hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50 dark:focus:ring-offset-neutral-900"
					aria-label="Generate email"
				>
					{loading ? 'Generating…' : 'Generate email'}
				</button>
				<button
					type="button"
					onclick={adjustTone}
					disabled={loading || !content.trim()}
					class="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
					aria-label="Adjust tone"
				>
					Adjust tone
				</button>
				<button
					type="button"
					onclick={saveDraft}
					disabled={loading || !userId || !content.trim()}
					class="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
					aria-label="Save draft"
				>
					Save draft
				</button>
			</div>
			{#if emailSubject}
				<p class="mb-1 text-sm font-medium text-neutral-700 dark:text-neutral-300">
					Subject: {emailSubject}
				</p>
			{/if}
			{#if output}
				<div
					class="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-800 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
					role="region"
					aria-label="Generated content"
				>
					{output}
				</div>
			{/if}
		</div>
	{:else if activeTab === 'templates'}
		<div class="templates-grid grid gap-2 sm:grid-cols-2">
			{#each BUILT_IN_TEMPLATES as t (t.purpose)}
				<button
					type="button"
					onclick={() => useTemplatePurpose(t.purpose)}
					disabled={loading}
					class="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-left text-sm transition hover:border-blue-400 hover:bg-blue-50/50 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:border-blue-600 dark:hover:bg-blue-900/20"
				>
					<span class="font-medium text-neutral-800 dark:text-neutral-200">{t.name}</span>
				</button>
			{/each}
		</div>
	{:else}
		<div class="drafts-list">
			{#if !userId}
				<p class="text-sm text-neutral-500 dark:text-neutral-400">Sign in to see your drafts.</p>
			{:else if drafts.length === 0}
				<p class="text-sm text-neutral-500 dark:text-neutral-400">No drafts yet.</p>
			{:else}
				<ul class="space-y-2">
					{#each drafts as draft (draft.id)}
						<li>
							<button
								type="button"
								onclick={() => loadDraft(draft)}
								class="w-full rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-left text-sm hover:border-blue-400 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:border-blue-600"
							>
								<span class="font-medium text-neutral-800 dark:text-neutral-200">
									{draft.title || 'Untitled'}
								</span>
								<span class="ml-2 text-neutral-500 dark:text-neutral-400">
									{new Date(draft.updatedAt).toLocaleDateString()}
								</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}

	{#if error}
		<p class="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
			<span class="font-medium">Error:</span>
			{error}
		</p>
	{/if}
</div>
