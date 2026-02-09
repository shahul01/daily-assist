<script lang="ts">
	import StatCard from '$lib/components/charts/StatCard.svelte';
	import DonutChart from '$lib/components/charts/DonutChart.svelte';
	import type { UsageStatsResponse } from '$lib/types/usage';
	import { getAgentLabel } from '$lib/stores/tabState';
	import type { AgentId } from '$lib/stores/tabState';

	interface Props {
		data: UsageStatsResponse['marathon'];
	}
	let { data }: Props = $props();

	let expanded = $state(false);

	const donutData = $derived(
		data.topAgents.slice(0, 6).map((a, i) => ({
			label: getAgentLabel(a.name as AgentId) || a.name,
			value: a.executionCount,
			color: ['hsl(210 60% 50%)', 'hsl(142 55% 42%)', 'hsl(38 90% 50%)', 'hsl(280 60% 55%)', 'hsl(0 65% 52%)', 'hsl(180 55% 45%)'][i] ?? 'hsl(210 40% 60%)'
		}))
	);

	function formatDate(iso: string): string {
		const d = new Date(iso);
		return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
	}

	function formatDuration(hours: number | null): string {
		if (hours == null) return '—';
		if (hours < 1) return `${Math.round(hours * 60)}m`;
		return `${hours.toFixed(1)}h`;
	}
</script>

<section class="marathon-section" aria-labelledby="marathon-heading">
	<h2 id="marathon-heading" class="section-heading">Marathon &amp; orchestration</h2>
	<div class="stats-row">
		<StatCard
			label="Sessions"
			value={data.sessionCount}
			icon="🏃"
			subtitle="Last 30 days"
		/>
		<StatCard
			label="Avg duration"
			value={formatDuration(data.avgDurationHours)}
			icon="⏱️"
		/>
		<StatCard
			label="Success rate"
			value="{data.successRate}%"
			icon="✓"
		/>
	</div>
	{#if donutData.length > 0}
		<div class="donut-wrap">
			<DonutChart data={donutData} size={140} strokeWidth={12} />
		</div>
	{/if}
	<button
		type="button"
		class="expand-btn"
		aria-expanded={expanded}
		aria-controls="marathon-session-list"
		onclick={() => (expanded = !expanded)}
	>
		{expanded ? 'Hide' : 'Show'} recent sessions
	</button>
	{#if expanded}
		<div id="marathon-session-list" class="session-list" role="region">
			{#if data.recentSessions.length === 0}
				<p class="empty-msg">No marathon sessions yet. Start one from the orchestrator.</p>
			{:else}
				<ul>
					{#each data.recentSessions as session (session.id)}
						<li class="session-item">
							<span class="session-status" data-status={session.status}>{session.status}</span>
							<span class="session-mode">{session.mode}</span>
							<span class="session-date">{formatDate(session.started_at)}</span>
							<span class="session-duration">{formatDuration(session.duration_hours)}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</section>

<style>
	.marathon-section {
		background: hsl(210 30% 96%);
		border-radius: 12px;
		padding: 1.25rem;
		box-shadow: 0 1px 3px hsl(210 20% 85%);
	}
	:global(body.dark) .marathon-section {
		background: hsl(210 30% 15%);
		box-shadow: 0 1px 3px hsl(210 20% 10%);
	}

	.section-heading {
		font-size: 1.1rem;
		font-weight: 600;
		color: hsl(210 30% 25%);
		margin: 0 0 1rem;
	}
	:global(body.dark) .section-heading {
		color: hsl(210 15% 88%);
	}

	.stats-row {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.donut-wrap {
		margin-bottom: 1rem;
	}

	.expand-btn {
		width: 100%;
		padding: 0.5rem 1rem;
		border: 1px solid hsl(210 20% 85%);
		border-radius: 8px;
		background: transparent;
		color: hsl(210 50% 40%);
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.2s, border-color 0.2s;
	}
	:global(body.dark) .expand-btn {
		border-color: hsl(210 20% 28%);
		color: hsl(210 60% 65%);
	}
	.expand-btn:hover {
		background: hsl(210 25% 92%);
		border-color: hsl(210 30% 80%);
	}
	:global(body.dark) .expand-btn:hover {
		background: hsl(210 25% 20%);
		border-color: hsl(210 30% 35%);
	}

	.session-list {
		margin-top: 0.75rem;
		padding-top: 0.75rem;
		border-top: 1px solid hsl(210 15% 88%);
	}
	:global(body.dark) .session-list {
		border-top-color: hsl(210 20% 22%);
	}

	.session-list ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.session-item {
		display: grid;
		grid-template-columns: 5rem 1fr auto auto;
		gap: 0.75rem;
		align-items: center;
		padding: 0.5rem 0.75rem;
		background: hsl(210 25% 98%);
		border-radius: 8px;
		font-size: 0.85rem;
	}
	:global(body.dark) .session-item {
		background: hsl(210 25% 18%);
	}

	.session-status {
		text-transform: capitalize;
		font-weight: 600;
	}
	.session-status[data-status="running"] {
		color: hsl(142 55% 38%);
	}
	.session-status[data-status="completed"] {
		color: hsl(210 60% 45%);
	}

	.session-date,
	.session-duration {
		color: hsl(210 15% 50%);
	}
	:global(body.dark) .session-date,
	:global(body.dark) .session-duration {
		color: hsl(210 15% 60%);
	}

	.empty-msg {
		margin: 0;
		padding: 0.75rem;
		color: hsl(210 15% 50%);
		font-size: 0.9rem;
	}
	:global(body.dark) .empty-msg {
		color: hsl(210 15% 58%);
	}

	@media (max-width: 480px) {
		.session-item {
			grid-template-columns: 1fr 1fr;
			grid-template-rows: auto auto;
		}
		.session-mode {
			grid-column: 1 / -1;
		}
	}
</style>
