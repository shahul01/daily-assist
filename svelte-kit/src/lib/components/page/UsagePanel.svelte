<script lang="ts">
	import StatCard from '$lib/components/charts/StatCard.svelte';
	import LineChart from '$lib/components/charts/LineChart.svelte';
	import MarathonUsageSection from '$lib/components/page/MarathonUsageSection.svelte';
	import ConversationUsageSection from '$lib/components/page/ConversationUsageSection.svelte';
	import AgentUsageSection from '$lib/components/page/AgentUsageSection.svelte';
	import type { UsageStatsResponse } from '$lib/types/usage';

	interface Props {
		userId: string;
	}
	let { userId }: Props = $props();

	let data = $state<UsageStatsResponse | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let loadInProgress = false;

	async function load() {
		if (!userId) {
			loading = false;
			return;
		}
		if (loadInProgress) return;
		loadInProgress = true;
		loading = true;
		error = null;
		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 30000);
			const res = await fetch('/api/usage/stats', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ userId, days: 30 }),
				signal: controller.signal
			});
			clearTimeout(timeoutId);
			const jsonData = await res.json();
			if (!res.ok) {
				error = jsonData.message ?? jsonData.error?.userId?.[0] ?? 'Failed to load usage';
				data = null;
				return;
			}
			const payload = jsonData as UsageStatsResponse;
			if (
				payload &&
				typeof payload === 'object' &&
				payload.overall &&
				payload.marathon &&
				payload.conversations &&
				Array.isArray(payload.agentUsage) &&
				Array.isArray(payload.timeline)
			) {
				data = payload;
			} else {
				data = null;
				error = 'Invalid usage data';
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Network error';
			data = null;
		} finally {
			loading = false;
			loadInProgress = false;
		}
	}

	$effect(() => {
		const uid = userId;
		if (uid) load();
	});

	const timelineData = $derived(
		data?.timeline?.length
			? data.timeline.map((t) => ({ x: t.date, y: t.sessionCount + t.actionCount }))
			: []
	);
</script>

<div class="usage-panel" id="panel-usage">
	<header class="usage-header">
		<h1 class="usage-title">Usage</h1>
		<button
			type="button"
			class="refresh-btn"
			aria-label="Refresh usage data"
			title="Refresh"
			onclick={() => load()}
			disabled={loading}
		>
			{loading ? '…' : '↻'}
		</button>
	</header>

	{#if loading && !data}
		<div class="loading" aria-live="polite">
			<div class="skeleton skeleton-cards"></div>
			<div class="skeleton skeleton-chart"></div>
			<div class="skeleton skeleton-sections"></div>
		</div>
	{:else if error}
		<div class="error-state" role="alert">
			<p>{error}</p>
			<button type="button" class="retry-btn" onclick={() => load()}>Retry</button>
		</div>
	{:else if data}
		<div class="summary-cards">
			<StatCard
				label="Total sessions"
				value={data.overall.totalSessions}
				icon="📊"
				subtitle="Last 30 days"
			/>
			<StatCard label="Actions" value={data.overall.totalActions} icon="⚡" />
			<StatCard label="Active agents" value={data.overall.activeAgentsCount} icon="🤖" />
			<StatCard label="Memories" value={data.overall.totalMemories} icon="🧠" />
		</div>

		{#if timelineData.length > 0}
			<section class="timeline-section" aria-labelledby="timeline-heading">
				<h2 id="timeline-heading" class="section-heading">Activity (last 14 days)</h2>
				<LineChart data={timelineData} height={140} label="Activity" color="hsl(210 60% 50%)" />
			</section>
		{/if}

		<div class="two-col">
			<MarathonUsageSection data={data.marathon} />
			<ConversationUsageSection data={data.conversations} />
		</div>

		<section class="agents-section">
			<AgentUsageSection data={data.agentUsage} />
		</section>
	{:else}
		<p class="empty-panel">Sign in or use the app to see usage stats.</p>
	{/if}
</div>

<style>
	.usage-panel {
		margin-top: 1rem;
		padding-bottom: 1rem;
	}

	.usage-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1.25rem;
		gap: 1rem;
	}

	.usage-title {
		font-size: 1.5rem;
		font-weight: 700;
		color: hsl(210 30% 25%);
		margin: 0;
	}
	:global(body.dark) .usage-title {
		color: hsl(210 15% 92%);
	}

	.refresh-btn {
		width: 2.5rem;
		height: 2.5rem;
		border: none;
		border-radius: 8px;
		background: hsl(210 25% 92%);
		color: hsl(210 50% 40%);
		font-size: 1.25rem;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background 0.2s;
	}
	.refresh-btn:hover:not(:disabled) {
		background: hsl(210 30% 88%);
	}
	.refresh-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	:global(body.dark) .refresh-btn {
		background: hsl(210 25% 22%);
		color: hsl(210 60% 65%);
	}
	:global(body.dark) .refresh-btn:hover:not(:disabled) {
		background: hsl(210 25% 28%);
	}

	.loading {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.skeleton {
		background: linear-gradient(
			90deg,
			hsl(210 20% 90%) 25%,
			hsl(210 20% 96%) 50%,
			hsl(210 20% 90%) 75%
		);
		border-radius: 12px;
		animation: shimmer 1.2s ease-in-out infinite;
	}
	:global(body.dark) .skeleton {
		background: linear-gradient(
			90deg,
			hsl(210 20% 18%) 25%,
			hsl(210 20% 24%) 50%,
			hsl(210 20% 18%) 75%
		);
	}
	.skeleton-cards {
		height: 100px;
	}
	.skeleton-chart {
		height: 200px;
	}
	.skeleton-sections {
		height: 280px;
	}
	@keyframes shimmer {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.85;
		}
	}

	.error-state {
		padding: 1.5rem;
		background: hsl(0 40% 96%);
		border-radius: 12px;
		border: 1px solid hsl(0 50% 88%);
		color: hsl(0 40% 35%);
	}
	:global(body.dark) .error-state {
		background: hsl(0 30% 18%);
		border-color: hsl(0 40% 28%);
		color: hsl(0 30% 75%);
	}
	.error-state p {
		margin: 0 0 0.75rem;
	}
	.retry-btn {
		padding: 0.5rem 1rem;
		border: none;
		border-radius: 8px;
		background: hsl(210 60% 50%);
		color: white;
		font-weight: 500;
		cursor: pointer;
	}
	.retry-btn:hover {
		background: hsl(210 60% 45%);
	}

	.summary-cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
		gap: 0.75rem;
		margin-bottom: 1.5rem;
	}
	@media (min-width: 640px) {
		.summary-cards {
			grid-template-columns: repeat(4, 1fr);
		}
	}

	.section-heading {
		font-size: 1rem;
		font-weight: 600;
		color: hsl(210 30% 25%);
		margin: 0 0 0.75rem;
	}
	:global(body.dark) .section-heading {
		color: hsl(210 15% 88%);
	}

	.timeline-section {
		margin-bottom: 1.5rem;
	}

	.two-col {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}
	@media (max-width: 768px) {
		.two-col {
			grid-template-columns: 1fr;
		}
	}

	.agents-section {
		margin-bottom: 0;
	}

	.empty-panel {
		margin: 0;
		padding: 2rem;
		text-align: center;
		color: hsl(210 15% 50%);
		font-size: 1rem;
	}
	:global(body.dark) .empty-panel {
		color: hsl(210 15% 58%);
	}
</style>
