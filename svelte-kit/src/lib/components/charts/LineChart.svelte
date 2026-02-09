<script lang="ts">
	interface DataPoint {
		x: string;
		y: number;
	}

	interface Props {
		data: DataPoint[];
		color?: string;
		height?: number;
		label?: string;
	}
	let { data = [], color = 'hsl(210 60% 50%)', height = 200, label = 'Activity' }: Props = $props();

	const padding = { top: 16, right: 16, bottom: 24, left: 40 };
	const width = 100;
	const innerDims = $derived.by(() => ({
		innerWidth: Math.max(0, width - padding.left - padding.right),
		innerHeight: Math.max(0, height - padding.top - padding.bottom)
	}));

	const maxY = $derived(Math.max(1, ...data.map((d) => d.y)));
	const minY = 0;
	const scaleY = (v: number) =>
		innerDims.innerHeight - ((v - minY) / (maxY - minY)) * innerDims.innerHeight + padding.top;
	const scaleX = (i: number) =>
		padding.left +
		(data.length > 1 ? (i / (data.length - 1)) * innerDims.innerWidth : innerDims.innerWidth / 2);

	const pathD = $derived.by(() => {
		if (data.length === 0) return '';
		const points = data.map((d, i) => `${scaleX(i)},${scaleY(d.y)}`);
		return `M ${points.join(' L ')}`;
	});

	const yTicks = $derived(
		maxY >= 2 ? [maxY, Math.round(maxY / 2), 0] : [maxY, 0]
	);
	function formatXLabel(x: string): string {
		const d = new Date(x + 'T00:00:00');
		return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	let hoverIndex = $state<number | null>(null);
</script>

<figure class="line-chart" role="img" aria-label="{label}">
	<svg
		viewBox="0 0 {width} {height}"
		preserveAspectRatio="xMidYMid meet"
		class="chart-svg"
		aria-hidden="true"
	>
		<defs>
			<linearGradient id="line-chart-gradient" x1="0" x2="0" y1="0" y2="1">
				<stop offset="0%" stop-color={color} stop-opacity="0.35" />
				<stop offset="100%" stop-color={color} stop-opacity="0" />
			</linearGradient>
		</defs>
		<!-- Y axis labels -->
		{#each yTicks as val (String(val))}
			<text
				x={padding.left - 6}
				y={scaleY(val)}
				text-anchor="end"
				dominant-baseline="middle"
				class="axis-label"
			>
				{val}
			</text>
		{/each}
		<!-- Area fill -->
		{#if pathD}
			<path
				d="{pathD} L {scaleX(data.length - 1)},{padding.top + innerDims.innerHeight} L {padding.left},{padding.top + innerDims.innerHeight} Z"
				fill="url(#line-chart-gradient)"
			/>
		{/if}
		<!-- Line -->
		<path d={pathD} fill="none" stroke={color} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
		<!-- Points -->
		{#each data as d, i (d.x + d.y)}
			<circle
				cx={scaleX(i)}
				cy={scaleY(d.y)}
				r={hoverIndex === i ? 5 : 3}
				fill={color}
				class="point"
				role="img"
				aria-label="{d.x}: {d.y}"
				onmouseenter={() => (hoverIndex = i)}
				onmouseleave={() => (hoverIndex = null)}
			/>
		{/each}
	</svg>
	{#if hoverIndex !== null && data[hoverIndex]}
		<div class="tooltip" role="status">
			{data[hoverIndex].x}: {data[hoverIndex].y}
		</div>
	{/if}
	<div class="x-axis-wrap">
		<span class="x-axis-caption">Date</span>
		<div class="x-labels">
			{#each data as d, i (d.x + d.y)}
				<span
					class="x-label"
					class:highlight={hoverIndex === i}
					role="button"
					tabindex="0"
					onmouseenter={() => (hoverIndex = i)}
					onmouseleave={() => (hoverIndex = null)}
					onkeydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							hoverIndex = hoverIndex === i ? null : i;
						}
					}}
				>
					{formatXLabel(d.x)}
				</span>
			{/each}
		</div>
	</div>
</figure>

<style>
	.line-chart {
		margin: 0;
		padding: 1rem;
		background: hsl(210 30% 96%);
		border-radius: 12px;
		box-shadow: 0 1px 3px hsl(210 20% 85%);
		position: relative;
	}
	:global(body.dark) .line-chart {
		background: hsl(210 30% 15%);
		box-shadow: 0 1px 3px hsl(210 20% 10%);
	}

	.chart-svg {
		width: 100%;
		height: auto;
		max-height: 12rem;
		display: block;
	}

	.axis-label {
		font-size: 8px;
		fill: hsl(210 12% 50%);
		font-weight: 500;
	}
	:global(body.dark) .axis-label {
		fill: hsl(210 12% 58%);
	}

	.point {
		transition: r 0.15s ease;
		cursor: pointer;
	}

	.tooltip {
		position: absolute;
		bottom: 2rem;
		left: 50%;
		transform: translateX(-50%);
		background: hsl(210 25% 20%);
		color: white;
		padding: 0.35rem 0.6rem;
		border-radius: 6px;
		font-size: 0.8rem;
		white-space: nowrap;
		pointer-events: none;
	}
	:global(body.dark) .tooltip {
		background: hsl(210 30% 25%);
	}

	.x-axis-wrap {
		margin-top: 0.5rem;
		padding: 0 0.5rem 0 0;
	}

	.x-axis-caption {
		display: block;
		font-size: 0.65rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: hsl(210 12% 48%);
		margin-bottom: 0.25rem;
	}
	:global(body.dark) .x-axis-caption {
		color: hsl(210 12% 55%);
	}

	.x-labels {
		display: flex;
		justify-content: space-between;
		gap: 0.25rem;
		font-size: 0.75rem;
		color: hsl(210 15% 42%);
		overflow-x: auto;
		min-height: 1.25rem;
	}
	:global(body.dark) .x-labels {
		color: hsl(210 15% 62%);
	}

	.x-label {
		flex-shrink: 0;
		transition: color 0.15s;
	}
	.x-label.highlight {
		color: hsl(210 60% 45%);
		font-weight: 600;
	}
</style>
