<script lang="ts">
	interface Props {
		label: string;
		value: string | number;
		icon: string;
		trend?: 'up' | 'down' | null;
		subtitle?: string | null;
	}
	let { label, value, icon, trend = null, subtitle = null }: Props = $props();
</script>

<div class="stat-card" role="group" aria-label="{label}: {value}">
	<span class="stat-icon" aria-hidden="true">{icon}</span>
	<div class="stat-content">
		<span class="stat-value">
			{value}
			{#if trend === 'up'}
				<span class="trend trend-up" aria-label="trending up">↑</span>
			{:else if trend === 'down'}
				<span class="trend trend-down" aria-label="trending down">↓</span>
			{/if}
		</span>
		<span class="stat-label">{label}</span>
		{#if subtitle}
			<span class="stat-subtitle">{subtitle}</span>
		{/if}
	</div>
</div>

<style>
	.stat-card {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 1rem 1.25rem;
		background: hsl(210 30% 96%);
		border-radius: 12px;
		box-shadow: 0 1px 3px hsl(210 20% 85%);
		transition: transform 0.2s ease, box-shadow 0.2s ease;
	}
	:global(body.dark) .stat-card {
		background: hsl(210 30% 15%);
		box-shadow: 0 1px 3px hsl(210 20% 10%);
	}
	.stat-card:hover {
		transform: scale(1.02);
		box-shadow: 0 4px 12px hsl(210 30% 80%);
	}
	:global(body.dark) .stat-card:hover {
		box-shadow: 0 4px 12px hsl(210 20% 15%);
	}

	.stat-icon {
		font-size: 1.75rem;
		line-height: 1;
		flex-shrink: 0;
	}

	.stat-content {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
		flex: 1;
	}

	.stat-value {
		font-size: 1.5rem;
		font-weight: 700;
		color: hsl(210 30% 25%);
		line-height: 1.2;
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}
	:global(body.dark) .stat-value {
		color: hsl(210 15% 92%);
	}

	.stat-label {
		font-size: 0.875rem;
		color: hsl(210 15% 45%);
		font-weight: 500;
	}
	:global(body.dark) .stat-label {
		color: hsl(210 15% 65%);
	}

	.stat-subtitle {
		font-size: 0.75rem;
		color: hsl(210 10% 55%);
		word-break: break-word;
		line-height: 1.3;
	}
	:global(body.dark) .stat-subtitle {
		color: hsl(210 15% 55%);
	}

	.trend {
		font-size: 0.9em;
		font-weight: 600;
	}
	.trend-up {
		color: hsl(142 55% 40%);
	}
	.trend-down {
		color: hsl(0 60% 45%);
	}
</style>
