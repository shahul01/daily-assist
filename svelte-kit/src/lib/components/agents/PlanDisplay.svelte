<script lang="ts">
	import type { PlannerPlan } from '$lib/agents/orchestrator';

	interface Props {
		plan: PlannerPlan;
		onClose: () => void;
	}

	let { plan, onClose }: Props = $props();

	function flowDescription(action: PlannerPlan['actions'][number]): string {
		const agent = action.agent.replace(/\s+Agent$/i, '').trim();
		const actionLabel = action.action.replace(/_/g, ' ');
		const params = action.params as Record<string, unknown> | undefined;
		const paramHint =
			params && Object.keys(params).length > 0
				? ': ' +
					Object.entries(params)
						.slice(0, 2)
						.map(([k, v]) => (v != null && String(v).length < 30 ? `${k}=${v}` : k))
						.join(', ')
				: '';
		return `${agent}: ${actionLabel}${paramHint}`;
	}
</script>

<div class="plan-display" role="region" aria-label="Gemini 3's Plan">
	<div class="plan-header">
		<h3 class="plan-title">Gemini 3's Plan</h3>
		<button type="button" class="plan-close" onclick={onClose} aria-label="Close plan">
			Close
		</button>
	</div>

	{#if plan.reasoning}
		<p class="plan-reasoning">{plan.reasoning}</p>
	{/if}

	<div class="plan-flow" aria-label="Agent flow">
		{#each plan.actions as action, i (action.agent + action.action + i)}
			<span class="flow-item">
				{flowDescription(action)}
			</span>
			{#if i < plan.actions.length - 1}
				<span class="flow-arrow" aria-hidden="true">→</span>
			{/if}
		{/each}
	</div>

	<details class="plan-details">
		<summary class="plan-details-summary">Agents &amp; actions</summary>
		<ul class="plan-actions-list">
			{#each plan.actions as action, i (action.agent + action.action + i)}
				<li class="plan-action-item">
					<span class="action-agent">{action.agent}</span>
					<span class="action-name">{action.action}</span>
					{#if action.params && Object.keys(action.params).length > 0}
						<pre class="action-params">{JSON.stringify(action.params, null, 2)}</pre>
					{/if}
				</li>
			{/each}
		</ul>
	</details>
</div>

<style>
	.plan-display {
		background: hsl(210 60% 95%);
		border: 1px solid hsl(210 60% 30%);
		border-radius: 12px;
		box-shadow: 0 2px 8px hsla(210 60% 30% / 0.12);
		padding: 1rem 1.25rem;
		margin-bottom: 1rem;
		max-width: 600px;
	}
	:global(body.dark) .plan-display {
		background: hsl(210 30% 20%);
		border-color: hsl(210 60% 40%);
		box-shadow: 0 2px 8px hsla(0 0% 0% / 0.3);
	}

	.plan-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.75rem;
		gap: 0.5rem;
	}
	.plan-title {
		font-size: 1rem;
		font-weight: 600;
		color: hsl(210 60% 35%);
		margin: 0;
	}
	:global(body.dark) .plan-title {
		color: hsl(210 60% 65%);
	}
	.plan-close {
		font-size: 0.875rem;
		padding: 0.25rem 0.5rem;
		border-radius: 6px;
		border: 1px solid hsl(210 60% 80%);
		background: transparent;
		color: hsl(210 60% 30%);
		cursor: pointer;
	}
	.plan-close:hover {
		background: hsl(210 60% 90%);
	}
	:global(body.dark) .plan-close {
		border-color: hsl(210 60% 40%);
		color: hsl(210 60% 75%);
	}
	:global(body.dark) .plan-close:hover {
		background: hsl(210 30% 28%);
	}

	.plan-reasoning {
		font-size: 0.875rem;
		color: hsl(210 30% 25%);
		margin: 0 0 0.75rem;
		line-height: 1.4;
	}
	:global(body.dark) .plan-reasoning {
		color: hsl(210 20% 85%);
	}

	.plan-flow {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.35rem 0.5rem;
		font-size: 0.8125rem;
		margin-bottom: 0.75rem;
		padding: 0.5rem 0.75rem;
		background: hsl(210 40% 92%);
		border-radius: 8px;
		border: 1px solid hsl(210 50% 85%);
	}
	:global(body.dark) .plan-flow {
		background: hsl(210 25% 25%);
		border-color: hsl(210 40% 35%);
	}
	.flow-item {
		color: hsl(210 50% 28%);
	}
	:global(body.dark) .flow-item {
		color: hsl(210 40% 88%);
	}
	.flow-arrow {
		color: hsl(210 60% 50%);
		font-weight: 600;
	}
	:global(body.dark) .flow-arrow {
		color: hsl(210 60% 60%);
	}

	.plan-details {
		font-size: 0.8125rem;
	}
	.plan-details-summary {
		cursor: pointer;
		color: hsl(210 60% 40%);
		font-weight: 500;
	}
	:global(body.dark) .plan-details-summary {
		color: hsl(210 60% 65%);
	}
	.plan-actions-list {
		margin: 0.5rem 0 0 1rem;
		padding: 0;
		list-style: none;
	}
	.plan-action-item {
		padding: 0.35rem 0;
		border-bottom: 1px solid hsl(210 40% 88%);
	}
	:global(body.dark) .plan-action-item {
		border-bottom-color: hsl(210 30% 35%);
	}
	.plan-action-item:last-child {
		border-bottom: none;
	}
	.action-agent {
		font-weight: 600;
		color: hsl(210 60% 35%);
		margin-right: 0.5rem;
	}
	:global(body.dark) .action-agent {
		color: hsl(210 60% 65%);
	}
	.action-name {
		color: hsl(210 30% 35%);
	}
	:global(body.dark) .action-name {
		color: hsl(210 20% 80%);
	}
	.action-params {
		display: block;
		margin: 0.25rem 0 0 0;
		padding: 0.35rem 0.5rem;
		font-size: 0.75rem;
		background: hsl(210 30% 92%);
		border-radius: 4px;
		overflow-x: auto;
		white-space: pre-wrap;
		word-break: break-word;
	}
	:global(body.dark) .action-params {
		background: hsl(210 20% 18%);
	}
</style>
