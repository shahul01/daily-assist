<script lang="ts">
	interface Props {
		items?: Array<{ id?: string; context: string; agent_used?: string | null }>;
		maxHeight?: string;
	}
	let { items = [], maxHeight = '12rem' }: Props = $props();
</script>

<div
	class="thought-signature-viewer rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 shadow-sm dark:border-[hsl(var(--border))]"
	style="max-height: {maxHeight}; overflow-y: auto;"
>
	<h3 class="mb-2 text-sm font-medium text-[hsl(var(--foreground))]">Thought flow</h3>
	{#if items.length === 0}
		<p class="text-xs text-[hsl(var(--muted-foreground))]">No thought signatures yet.</p>
	{:else}
		<ul class="space-y-2 text-xs">
			{#each items as item, i (item.id ?? i)}
				<li
					class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 px-2 py-1.5 dark:border-[hsl(var(--border))]"
				>
					{#if item.agent_used}
						<span
							class="font-medium text-[hsl(var(--primary))] dark:text-[hsl(var(--primary))]"
							>{item.agent_used}</span
						>
						<span class="text-[hsl(var(--muted-foreground))]"> · </span>
					{/if}
					<span class="text-[hsl(var(--foreground))]">{item.context || '—'}</span>
				</li>
			{/each}
		</ul>
	{/if}
</div>
