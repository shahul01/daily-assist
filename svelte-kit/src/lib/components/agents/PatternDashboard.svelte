<script lang="ts">
	interface AdherenceItem {
		medicationId: string;
		medicationName: string;
		daysChecked: number;
		taken: number;
		missed: number;
		late: number;
		adherencePercent: number;
	}

	interface Pattern {
		id: string;
		patternType: string;
		confidenceScore: number;
		suggestion: string | null;
		occurrencesCount: number;
	}

	interface Props {
		userId: string | null;
	}

	let { userId }: Props = $props();

	let adherence = $state<AdherenceItem[]>([]);
	let patterns = $state<Pattern[]>([]);
	let summary = $state('');
	let loading = $state(true);
	let analyzing = $state(false);

	$effect(() => {
		if (userId) load();
		else {
			adherence = [];
			patterns = [];
			summary = '';
			loading = false;
		}
	});

	async function load() {
		if (!userId) return;
		loading = true;
		try {
			const [adRes, analysisRes] = await Promise.all([
				fetch('/api/agents/remember', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ action: 'medication_adherence', userId, days: 30 })
				}),
				fetch('/api/agents/remember', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ action: 'analyze_adherence', userId })
				})
			]);
			const adData = await adRes.json();
			const analysisData = await analysisRes.json();
			if (adRes.ok && adData.adherence) adherence = adData.adherence;
			else adherence = [];
			if (analysisRes.ok && analysisData) {
				summary = analysisData.summary ?? '';
				patterns = (analysisData.patterns ?? []).map(
					(p: {
						id: string;
						patternType: string;
						confidenceScore: number;
						suggestion: string | null;
						occurrencesCount: number;
					}) => ({
						id: p.id,
						patternType: p.patternType,
						confidenceScore: p.confidenceScore,
						suggestion: p.suggestion,
						occurrencesCount: p.occurrencesCount
					})
				);
			} else {
				summary = '';
				patterns = [];
			}
		} catch {
			adherence = [];
			patterns = [];
			summary = '';
		} finally {
			loading = false;
		}
	}

	async function runDetection() {
		if (!userId) return;
		analyzing = true;
		try {
			await fetch('/api/agents/remember', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'detect_patterns', userId, days: 30 })
			});
			load();
		} finally {
			analyzing = false;
		}
	}
</script>

<div
	class="pattern-dashboard rounded-xl border border-neutral-200 bg-white/80 p-4 dark:border-neutral-700 dark:bg-neutral-800/80"
>
	<h3 class="mb-3 text-sm font-medium text-neutral-800 dark:text-neutral-200">
		Patterns & adherence
	</h3>
	{#if !userId}
		<p class="text-sm text-neutral-500 dark:text-neutral-400">Sign in to see patterns.</p>
	{:else if loading}
		<p class="text-sm text-neutral-500 dark:text-neutral-400">Loading…</p>
	{:else}
		{#if summary}
			<p class="mb-3 text-sm text-neutral-700 dark:text-neutral-300">{summary}</p>
		{/if}
		{#if adherence.length > 0}
			<div class="mb-4">
				<p class="mb-2 text-xs font-medium text-neutral-600 dark:text-neutral-400">
					Adherence (30 days)
				</p>
				<ul class="flex flex-col gap-1.5">
					{#each adherence as a (a.medicationId)}
						<li
							class="flex items-center justify-between rounded-lg bg-neutral-100 px-3 py-2 dark:bg-neutral-700/50"
						>
							<span class="text-sm text-neutral-900 dark:text-neutral-100">{a.medicationName}</span>
							<span
								class="text-sm font-medium {a.adherencePercent >= 80
									? 'text-green-600 dark:text-green-400'
									: a.adherencePercent >= 50
										? 'text-amber-600 dark:text-amber-400'
										: 'text-red-600 dark:text-red-400'}"
							>
								{a.adherencePercent}%
							</span>
						</li>
					{/each}
				</ul>
			</div>
		{/if}
		{#if patterns.length > 0}
			<div class="mb-4">
				<p class="mb-2 text-xs font-medium text-neutral-600 dark:text-neutral-400">
					Detected patterns
				</p>
				<ul class="flex flex-col gap-2">
					{#each patterns as p (p.id)}
						<li class="rounded-lg border border-neutral-200 p-2 dark:border-neutral-600">
							<p class="text-xs text-neutral-500 dark:text-neutral-400">
								{p.patternType} ({(p.confidenceScore * 100).toFixed(0)}%, n={p.occurrencesCount})
							</p>
							{#if p.suggestion}
								<p class="text-sm text-neutral-700 dark:text-neutral-300">{p.suggestion}</p>
							{/if}
						</li>
					{/each}
				</ul>
			</div>
		{/if}
		<button
			type="button"
			class="rounded-lg bg-teal-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-teal-700 disabled:opacity-50 dark:bg-teal-500 dark:hover:bg-teal-600"
			disabled={analyzing}
			onclick={runDetection}
		>
			{analyzing ? 'Analyzing…' : 'Detect patterns'}
		</button>
	{/if}
</div>
