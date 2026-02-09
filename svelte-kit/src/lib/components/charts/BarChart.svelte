<script lang="ts">
	interface DataItem {
		label: string;
		value: number;
	}

	interface Props {
		data: DataItem[];
		color?: string;
		maxBars?: number;
	}
	let { data = [], color = 'hsl(210 60% 50%)', maxBars = 8 }: Props = $props();

	const displayData = $derived(data.slice(0, maxBars));
	const maxVal = $derived(Math.max(1, ...displayData.map((d) => d.value)));
</script>

<figure class="bar-chart" role="img" aria-label="Bar chart comparing values">
	<div class="bars">
		{#each displayData as item (item.label + item.value)}
			<div class="bar-row">
				<span class="bar-label" title={item.label}
					>{item.label.length > 12 ? item.label.slice(0, 11) + '…' : item.label}</span
				>
				<div class="bar-track">
					<div
						class="bar-fill"
						style="width: {(item.value / maxVal) * 100}%; background-color: {color};"
						role="presentation"
					></div>
					<span class="bar-value">{item.value}</span>
				</div>
			</div>
		{/each}
	</div>
	{#if data.length === 0}
		<p class="empty">No data to show</p>
	{/if}
</figure>

<style>
	.bar-chart {
		margin: 0;
		padding: 1rem 1.25rem;
		background: hsl(210 30% 96%);
		border-radius: 12px;
		box-shadow: 0 1px 3px hsl(210 20% 85%);
		min-height: 120px;
	}
	:global(body.dark) .bar-chart {
		background: hsl(210 30% 15%);
		box-shadow: 0 1px 3px hsl(210 20% 10%);
	}

	.bars {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.bar-row {
		display: grid;
		grid-template-columns: 8rem 1fr;
		align-items: center;
		gap: 0.75rem;
		min-height: 2rem;
	}

	.bar-label {
		font-size: 0.8rem;
		color: hsl(210 20% 30%);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	:global(body.dark) .bar-label {
		color: hsl(210 15% 78%);
	}

	.bar-track {
		position: relative;
		height: 1.5rem;
		background: hsl(210 20% 90%);
		border-radius: 6px;
		overflow: hidden;
		display: flex;
		align-items: center;
	}
	:global(body.dark) .bar-track {
		background: hsl(210 20% 22%);
	}

	.bar-fill {
		height: 100%;
		border-radius: 6px;
		transition: width 0.3s ease;
		min-width: 2px;
	}

	.bar-value {
		position: absolute;
		right: 0.5rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: hsl(210 25% 25%);
		text-shadow: 0 0 2px white;
		z-index: 1;
	}
	:global(body.dark) .bar-value {
		color: hsl(210 15% 90%);
		text-shadow: 0 0 2px hsl(210 20% 10%);
	}

	.empty {
		margin: 0;
		padding: 1rem;
		text-align: center;
		color: hsl(210 15% 50%);
		font-size: 0.9rem;
	}
	:global(body.dark) .empty {
		color: hsl(210 15% 55%);
	}

	@media (max-width: 480px) {
		.bar-row {
			grid-template-columns: 6rem 1fr;
		}
	}
</style>
