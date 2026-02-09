<script lang="ts">
	import type { UsageStatsResponse } from '$lib/types/usage';
	import { getAgentLabel, AGENTS_BY_GROUP } from '$lib/stores/tabState';

	interface Props {
		data: UsageStatsResponse['agentUsage'];
	}
	let { data }: Props = $props();

	const agentMeta: Record<string, { icon: string; label: string }> = {};
	for (const g of Object.values(AGENTS_BY_GROUP)) {
		for (const a of g) {
			agentMeta[a.id] = { icon: a.icon, label: getAgentLabel(a.id) };
		}
	}

	function getMeta(name: string): { icon: string; label: string } {
		const id = name.toLowerCase();
		return agentMeta[id] ?? { icon: '🤖', label: name };
	}

	function formatLastUsed(iso: string | null): string {
		if (!iso) return 'Never';
		const d = new Date(iso);
		const now = new Date();
		const diffMs = now.getTime() - d.getTime();
		const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
		if (diffDays === 0) return 'Today';
		if (diffDays === 1) return 'Yesterday';
		if (diffDays < 7) return `${diffDays} days ago`;
		return d.toLocaleDateString();
	}
</script>

<section class="agent-section" aria-labelledby="agent-heading">
	<h2 id="agent-heading" class="section-heading">Agent usage</h2>
	<div class="agent-grid">
		{#each data as agent (agent.agentName)}
			{@const meta = getMeta(agent.agentName)}
			<div class="agent-card">
				<span class="agent-icon" aria-hidden="true">{meta.icon}</span>
				<div class="agent-info">
					<span class="agent-name">{meta.label}</span>
					<span class="agent-stat">Uses: {agent.totalActions}</span>
					<span class="agent-stat">Success: {agent.successRate}%</span>
					{#if agent.specificMetric != null}
						<span class="agent-metric">{agent.specificMetric} items</span>
					{/if}
					<span class="agent-last">Last: {formatLastUsed(agent.lastUsed)}</span>
				</div>
			</div>
		{/each}
	</div>
	{#if data.length === 0}
		<p class="empty-msg">No agent usage yet. Use Chat or Tools to get started.</p>
	{/if}
</section>

<style>
	.agent-section {
		background: hsl(210 30% 96%);
		border-radius: 12px;
		padding: 1.25rem;
		box-shadow: 0 1px 3px hsl(210 20% 85%);
	}
	:global(body.dark) .agent-section {
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

	.agent-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
		gap: 0.75rem;
		align-items: stretch;
	}

	.agent-card {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		height: 100%;
		min-height: 0;
		padding: 0.875rem 1rem;
		background: hsl(210 25% 98%);
		border-radius: 10px;
		border: 1px solid hsl(210 15% 90%);
		transition: transform 0.2s ease, box-shadow 0.2s ease;
	}
	:global(body.dark) .agent-card {
		background: hsl(210 25% 18%);
		border-color: hsl(210 20% 25%);
	}
	.agent-card:hover {
		transform: scale(1.02);
		box-shadow: 0 2px 8px hsl(210 25% 85%);
	}
	:global(body.dark) .agent-card:hover {
		box-shadow: 0 2px 8px hsl(210 20% 12%);
	}

	.agent-icon {
		font-size: 1.5rem;
		line-height: 1;
		flex-shrink: 0;
	}

	.agent-info {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 0;
	}

	.agent-name {
		font-weight: 600;
		font-size: 0.9rem;
		color: hsl(210 30% 25%);
	}
	:global(body.dark) .agent-name {
		color: hsl(210 15% 90%);
	}

	.agent-stat,
	.agent-metric,
	.agent-last {
		font-size: 0.75rem;
		color: hsl(210 15% 48%);
	}
	:global(body.dark) .agent-stat,
	:global(body.dark) .agent-metric,
	:global(body.dark) .agent-last {
		color: hsl(210 15% 62%);
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
