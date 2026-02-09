<script lang="ts">
	import StatCard from '$lib/components/charts/StatCard.svelte';
	import BarChart from '$lib/components/charts/BarChart.svelte';
	import type { UsageStatsResponse } from '$lib/types/usage';

	interface Props {
		data: UsageStatsResponse['conversations'];
	}
	let { data }: Props = $props();

	let expanded = $state(false);

	const barData = $derived(
		data.recentSessions.slice(0, 8).map((s) => ({
			label: new Date(s.started_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
			value: s.turn_count
		}))
	);

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function formatDuration(sec: number | null): string {
		if (sec == null) return '—';
		if (sec < 60) return `${sec}s`;
		return `${Math.floor(sec / 60)}m ${sec % 60}s`;
	}
</script>

<section class="conversation-section" aria-labelledby="conversation-heading">
	<h2 id="conversation-heading" class="section-heading">Conversations</h2>
	<div class="stats-row">
		<StatCard
			label="Sessions"
			value={data.sessionCount}
			icon="💬"
			subtitle="Last 30 days"
		/>
		<StatCard
			label="Total turns"
			value={data.totalTurns}
			icon="🔄"
		/>
		<StatCard
			label="Avg turns/session"
			value={data.avgTurnsPerSession}
			icon="📊"
		/>
		<StatCard
			label="Avg duration"
			value={formatDuration(data.avgDurationSeconds)}
			icon="⏱️"
		/>
	</div>
	{#if barData.length > 0}
		<div class="bar-wrap">
			<BarChart data={barData} maxBars={8} color="hsl(210 60% 50%)" />
		</div>
	{/if}
	<button
		type="button"
		class="expand-btn"
		aria-expanded={expanded}
		aria-controls="conversation-session-list"
		onclick={() => (expanded = !expanded)}
	>
		{expanded ? 'Hide' : 'Show'} recent conversations
	</button>
	{#if expanded}
		<div id="conversation-session-list" class="session-list" role="region">
			{#if data.recentSessions.length === 0}
				<p class="empty-msg">No conversations yet. Try the Say or Hear agents.</p>
			{:else}
				<ul>
					{#each data.recentSessions as session (session.id)}
						<li class="session-item">
							<span class="session-date">{formatDate(session.started_at)}</span>
							<span class="session-turns">{session.turn_count} turns</span>
							<span class="session-duration">{formatDuration(session.duration_seconds)}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</section>

<style>
	.conversation-section {
		background: hsl(210 30% 96%);
		border-radius: 12px;
		padding: 1.25rem;
		box-shadow: 0 1px 3px hsl(210 20% 85%);
	}
	:global(body.dark) .conversation-section {
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

	.bar-wrap {
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
		grid-template-columns: 1fr auto auto;
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

	.session-turns,
	.session-duration {
		color: hsl(210 15% 50%);
	}
	:global(body.dark) .session-turns,
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
</style>
