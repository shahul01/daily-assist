<script lang="ts">
	import { goto } from '$app/navigation';
	import type { WebSearchResult, DrugInfoResult } from '$lib/agents/findItAgent';
	import { getAgentResult, storeAgentResult } from '$lib/stores/agentResultsStore';

	interface Props {
		userId?: string;
		resultId?: string;
	}
	let { userId = '', resultId }: Props = $props();

	let query = $state('');
	let loading = $state(false);
	let error = $state('');
	let result = $state<WebSearchResult | null>(null);
	/** Drug info from chat (resultId); shown when action was search_drug_info. */
	let drugResult = $state<DrugInfoResult | null>(null);

	$effect(() => {
		if (!resultId) {
			drugResult = null;
			return;
		}
		const stored = getAgentResult(resultId);
		if (
			stored?.action === 'search_drug_info' &&
			stored.result &&
			typeof stored.result === 'object'
		) {
			const r = stored.result as DrugInfoResult;
			if (r.medicineName != null) drugResult = r;
			else drugResult = null;
		} else {
			drugResult = null;
		}
	});

	async function handleWebSearch() {
		error = '';
		result = null;
		const q = query.trim();
		if (!q) {
			error = 'Enter a search query.';
			return;
		}
		loading = true;
		try {
			const res = await fetch('/api/agents/find-it', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'web_search',
					query: q,
					...(userId && { userId })
				})
			});
			const data = await res.json();
			if (!res.ok) {
				throw new Error(data.error ?? data.message ?? 'Search failed');
			}
			result = data as WebSearchResult;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Something went wrong';
		} finally {
			loading = false;
		}
	}

	/** Send drug result (from resultId) to chat. */
	function sendToChat() {
		const q =
			'tab=chat&group=communication&agent=read' +
			(resultId ? `&resultId=${encodeURIComponent(resultId)}` : '');
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- in-app nav to chat tab
		goto(`?${q}`, { replaceState: false });
	}

	/** Store web search result and navigate to chat with resultId. */
	function sendWebSearchToChat() {
		if (!result || !userId) return;
		const id = storeAgentResult({
			agent: 'Find-It',
			action: 'web_search',
			result,
			userId
		});
		/* eslint-disable svelte/no-navigation-without-resolve -- in-app nav to chat tab */
		goto(`?tab=chat&group=communication&agent=read&resultId=${encodeURIComponent(id)}`, {
			replaceState: false
		});
		/* eslint-enable svelte/no-navigation-without-resolve */
	}

	function dangerLevelClass(level: DrugInfoResult['dangerLevel']): string {
		if (level === 'critical' || level === 'high')
			return 'bg-red-200 text-red-900 dark:bg-red-900/50 dark:text-red-200';
		if (level === 'medium')
			return 'bg-amber-200 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200';
		return 'bg-neutral-200 text-neutral-700 dark:bg-neutral-600 dark:text-neutral-200';
	}
</script>

<div
	class="find-it-panel rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900"
>
	<h2 class="mb-3 text-lg font-medium text-neutral-800 dark:text-neutral-200">Find-It</h2>
	<p class="mb-3 text-sm text-neutral-500 dark:text-neutral-400">
		Search the web: top 3 pages are read and summarized. You can also use the chat to ask for web
		search.
	</p>

	<div class="mb-3 flex flex-wrap gap-2">
		<input
			type="search"
			bind:value={query}
			placeholder="e.g. best practices for accessibility"
			class="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-neutral-900 placeholder-neutral-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder-neutral-400"
			aria-label="Web search query"
			disabled={loading}
			onkeydown={(e) => e.key === 'Enter' && handleWebSearch()}
		/>
		<button
			type="button"
			onclick={handleWebSearch}
			disabled={loading}
			class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow transition hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50 dark:focus:ring-offset-neutral-900"
			aria-label="Search web"
		>
			{loading ? 'Searching…' : 'Search Web'}
		</button>
	</div>

	{#if drugResult}
		<div
			class="mb-4 space-y-3 rounded-lg border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-800 dark:bg-amber-950/30"
			role="region"
			aria-label="Drug information"
		>
			<h3 class="text-sm font-semibold text-amber-900 dark:text-amber-200">
				{drugResult.medicineName}
			</h3>
			<p class="text-sm text-neutral-800 dark:text-neutral-200">
				{drugResult.synthesizedSummary}
			</p>
			{#if drugResult.commonUses?.length}
				<p class="text-xs">
					<span class="font-medium text-neutral-700 dark:text-neutral-300">Uses:</span>
					{drugResult.commonUses.join('; ')}
				</p>
			{/if}
			{#if drugResult.sideEffects?.length}
				<p class="text-xs">
					<span class="font-medium text-neutral-700 dark:text-neutral-300">Side effects:</span>
					{drugResult.sideEffects.join('; ')}
				</p>
			{/if}
			{#if drugResult.interactions?.length}
				<p class="text-xs">
					<span class="font-medium text-neutral-700 dark:text-neutral-300">Interactions:</span>
					{drugResult.interactions.join('; ')}
				</p>
			{/if}
			<p class="text-xs">
				<span class="rounded px-1.5 py-0.5 font-medium {dangerLevelClass(drugResult.dangerLevel)}">
					{drugResult.dangerLevel}
				</span>
			</p>
			{#if drugResult.emergencyIndicators?.length}
				<p class="text-xs text-red-700 dark:text-red-300">
					{drugResult.emergencyIndicators.join('; ')}
				</p>
			{/if}
			<button
				type="button"
				onclick={sendToChat}
				class="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
				aria-label="Send to chat"
			>
				Send to Chat
			</button>
		</div>
	{/if}

	{#if error}
		<p class="mb-3 text-sm text-red-600 dark:text-red-400" role="alert">
			{error}
		</p>
	{/if}

	{#if loading && !result}
		<div
			class="animate-pulse space-y-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-800"
			aria-busy="true"
		>
			<div class="h-4 w-3/4 rounded bg-neutral-200 dark:bg-neutral-600"></div>
			<div class="h-4 w-full rounded bg-neutral-200 dark:bg-neutral-600"></div>
			<div class="h-4 w-5/6 rounded bg-neutral-200 dark:bg-neutral-600"></div>
		</div>
	{/if}

	{#if result && !loading}
		<div class="space-y-4" role="region" aria-label="Search results">
			<div
				class="rounded-lg border border-blue-100 bg-blue-50/80 p-4 dark:border-blue-900/50 dark:bg-blue-950/30"
			>
				<p class="text-sm font-medium text-blue-900 dark:text-blue-200">Answer</p>
				<p class="mt-1 text-neutral-800 dark:text-neutral-200">{result.synthesizedAnswer}</p>
			</div>
			<div class="flex flex-wrap items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
				<span>Sources</span>
				<span
					class="rounded bg-neutral-200 px-1.5 py-0.5 dark:bg-neutral-600"
					aria-label="Search provider"
				>
					{result.provider}
				</span>
				<button
					type="button"
					onclick={sendWebSearchToChat}
					class="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
					aria-label="Send to chat"
				>
					Send to Chat
				</button>
			</div>
			<!-- eslint-disable svelte/no-navigation-without-resolve -- external source URLs -->
			<ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{#each result.sources as source, i (`${source.url}-${i}`)}
					<li>
						<a
							href={source.url}
							target="_blank"
							rel="noopener noreferrer"
							class="block rounded-lg border border-neutral-200 bg-neutral-50 p-3 shadow-sm transition hover:border-blue-300 hover:shadow dark:border-neutral-700 dark:bg-neutral-800 dark:hover:border-blue-700"
						>
							<span class="text-sm font-medium text-blue-600 dark:text-blue-400">
								{source.title || `Source ${i + 1}`}
							</span>
							<p class="mt-1 line-clamp-2 text-xs text-neutral-600 dark:text-neutral-400">
								{source.summary || source.snippet}
							</p>
						</a>
					</li>
				{/each}
			</ul>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		</div>
	{/if}

	{#if !result && !loading && !error}
		<p class="text-sm text-neutral-500 dark:text-neutral-400">
			Search, navigate, and locate files. Use the chat to ask for file search—you’ll be directed
			here. Pick a folder to search from this panel when available.
		</p>
	{/if}
</div>
