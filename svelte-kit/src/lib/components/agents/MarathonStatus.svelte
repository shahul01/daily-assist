<script lang="ts">
	interface SessionRow {
		id: string;
		status: string;
		mode: string;
		started_at: string;
		last_activity_at: string;
		duration_hours: number | null;
	}

	let running = $state(false);
	let activeSessionId = $state<string | null>(null);
	let sessions = $state<SessionRow[]>([]);
	let loading = $state(false);
	let error = $state('');

	interface Props {
		userId: string | null;
		refreshTrigger?: number;
	}
	let { userId = null, refreshTrigger = 0 }: Props = $props();

	async function fetchStatus() {
		if (!userId) return;
		loading = true;
		error = '';
		try {
			const res = await fetch(`/api/marathon/status?userId=${encodeURIComponent(userId)}`);
			const data = await res.json();
			if (!res.ok) {
				error = data.message ?? data.error ?? 'Failed to load status';
				return;
			}
			running = data.running ?? false;
			activeSessionId = data.activeSessionId ?? null;
			sessions = data.sessions ?? [];
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unknown error';
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (userId) {
			fetchStatus();
		}
	});
	$effect(() => {
		void refreshTrigger;
		if (userId) fetchStatus();
	});

	function formatDate(iso: string) {
		try {
			return new Date(iso).toLocaleString();
		} catch {
			return iso;
		}
	}
</script>

<div
	class="marathon-status rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-sm dark:border-[hsl(var(--border))]"
>
	<h3 class="mb-2 text-sm font-medium text-[hsl(var(--foreground))]">Marathon session</h3>
	{#if loading}
		<p class="text-sm text-[hsl(var(--muted-foreground))]">Loading…</p>
	{:else if error}
		<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
	{:else}
		<div class="space-y-2 text-sm">
			<p>
				<span class="text-[hsl(var(--muted-foreground))]">Status:</span>
				{#if running}
					<span class="font-medium text-green-600 dark:text-green-400">Running</span>
					{#if activeSessionId}
						<span class="ml-1 text-xs text-[hsl(var(--muted-foreground))]"
							>({activeSessionId.slice(0, 8)}…)</span
						>
					{/if}
				{:else}
					<span class="text-[hsl(var(--muted-foreground))]">Stopped</span>
				{/if}
			</p>
			{#if sessions.length > 0}
				<details class="mt-2">
					<summary class="cursor-pointer text-[hsl(var(--muted-foreground))] hover:underline">
						Recent sessions ({sessions.length})
					</summary>
					<ul
						class="mt-1 list-inside list-disc space-y-1 text-xs text-[hsl(var(--muted-foreground))]"
					>
						{#each sessions as s (s.id)}
							<li>
								{s.status} · {s.mode} · started {formatDate(s.started_at)}
								{#if s.duration_hours != null}
									· {s.duration_hours}h
								{/if}
							</li>
						{/each}
					</ul>
				</details>
			{/if}
		</div>
	{/if}
	<button
		type="button"
		class="mt-3 rounded-lg bg-[hsl(var(--primary))] px-3 py-1.5 text-xs text-[hsl(var(--primary-foreground))] hover:opacity-90"
		onclick={() => fetchStatus()}
		disabled={loading || !userId}
		aria-label="Refresh marathon status"
	>
		Refresh
	</button>
</div>
