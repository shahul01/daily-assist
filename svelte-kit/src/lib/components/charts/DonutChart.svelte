<script lang="ts">
	interface Slice {
		label: string;
		value: number;
		color: string;
	}

	interface Props {
		data: Slice[];
		size?: number;
		strokeWidth?: number;
	}
	let { data = [], size = 160, strokeWidth = 14 }: Props = $props();

	const total = $derived(
		Math.max(
			1,
			data.reduce((s, d) => s + d.value, 0)
		)
	);
	const geometry = $derived.by(() => {
		const r = (size - strokeWidth) / 2;
		return {
			radius: r,
			circumference: 2 * Math.PI * r,
			cx: size / 2,
			cy: size / 2
		};
	});

	const segments = $derived.by(() => {
		let cumulative = 0;
		return data.map((d) => {
			const fraction = d.value / total;
			const dashLength = fraction * geometry.circumference;
			const gapLength = geometry.circumference - dashLength;
			const offset = (cumulative / total) * geometry.circumference;
			cumulative += d.value;
			return {
				label: d.label,
				value: d.value,
				color: d.color,
				strokeDasharray: `${dashLength} ${gapLength}`,
				strokeDashoffset: -offset
			};
		});
	});
</script>

<figure class="donut-chart" role="img" aria-label="Distribution chart">
	<svg width={size} height={size} viewBox="0 0 {size} {size}" class="donut-svg" aria-hidden="true">
		<circle
			cx={geometry.cx}
			cy={geometry.cy}
			r={geometry.radius}
			fill="none"
			stroke="hsl(210 20% 90%)"
			stroke-width={strokeWidth}
			class="donut-bg"
		/>
		{#each segments as seg (seg.label + seg.value)}
			<circle
				cx={geometry.cx}
				cy={geometry.cy}
				r={geometry.radius}
				fill="none"
				stroke={seg.color}
				stroke-width={strokeWidth}
				stroke-dasharray={seg.strokeDasharray}
				stroke-dashoffset={seg.strokeDashoffset}
				stroke-linecap="round"
				transform="rotate(-90 {geometry.cx} {geometry.cy})"
				class="donut-segment"
			/>
		{/each}
	</svg>
	<div class="donut-center">
		<span class="donut-total">{total}</span>
		<span class="donut-legend">total</span>
	</div>
	<ul class="donut-legend-list" aria-hidden="true">
		{#each data as d (d.label + d.value)}
			<li>
				<span class="legend-dot" style="background-color: {d.color}"></span>
				<span class="legend-label">{d.label}</span>
				<span class="legend-value">{d.value}</span>
			</li>
		{/each}
	</ul>
	{#if data.length === 0}
		<p class="empty">No data</p>
	{/if}
</figure>

<style>
	.donut-chart {
		margin: 0;
		padding: 1rem;
		background: hsl(210 30% 96%);
		border-radius: 12px;
		box-shadow: 0 1px 3px hsl(210 20% 85%);
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		position: relative;
		min-height: 180px;
	}
	:global(body.dark) .donut-chart {
		background: hsl(210 30% 15%);
		box-shadow: 0 1px 3px hsl(210 20% 10%);
	}

	.donut-svg {
		flex-shrink: 0;
	}

	.donut-bg {
		stroke: hsl(210 20% 90%);
	}
	:global(body.dark) .donut-bg {
		stroke: hsl(210 20% 22%);
	}

	.donut-segment {
		transition: stroke-dasharray 0.3s ease;
	}

	.donut-center {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		pointer-events: none;
	}

	.donut-total {
		font-size: 1.5rem;
		font-weight: 700;
		color: hsl(210 30% 25%);
		line-height: 1.2;
	}
	:global(body.dark) .donut-total {
		color: hsl(210 15% 92%);
	}

	.donut-legend {
		font-size: 0.7rem;
		color: hsl(210 15% 50%);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	:global(body.dark) .donut-legend {
		color: hsl(210 15% 60%);
	}

	.donut-legend-list {
		list-style: none;
		margin: 0;
		padding: 0;
		font-size: 0.8rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		margin-left: auto;
	}
	.donut-legend-list li {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		color: hsl(210 20% 30%);
	}
	:global(body.dark) .donut-legend-list li {
		color: hsl(210 15% 78%);
	}

	.legend-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.legend-label {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 6rem;
	}

	.legend-value {
		font-weight: 600;
		color: hsl(210 25% 25%);
	}
	:global(body.dark) .legend-value {
		color: hsl(210 15% 88%);
	}

	.empty {
		position: absolute;
		margin: 0;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		color: hsl(210 15% 50%);
		font-size: 0.9rem;
	}
</style>
