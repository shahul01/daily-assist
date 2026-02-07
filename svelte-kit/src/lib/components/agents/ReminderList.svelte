<script lang="ts">
	interface Reminder {
		id: string;
		task: string;
		time: string;
		created: string;
	}

	interface Props {
		userId: string | null;
		refreshTrigger?: number;
		onComplete?: () => void;
	}

	let { userId, refreshTrigger = 0, onComplete }: Props = $props();

	let reminders = $state<Reminder[]>([]);
	let loading = $state(true);
	let completingId = $state<string | null>(null);

	$effect(() => {
		void refreshTrigger;
		if (userId) load();
		else {
			reminders = [];
			loading = false;
		}
	});

	async function load() {
		if (!userId) return;
		loading = true;
		try {
			const res = await fetch('/api/agents/remember', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'list_reminders', userId })
			});
			const data = await res.json();
			if (res.ok && data.reminders) reminders = data.reminders;
			else reminders = [];
		} catch {
			reminders = [];
		} finally {
			loading = false;
		}
	}

	async function markComplete(id: string) {
		if (!userId) return;
		completingId = id;
		try {
			const res = await fetch('/api/agents/remember', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'complete_reminder', userId, reminderId: id })
			});
			if (res.ok) {
				reminders = reminders.filter((r) => r.id !== id);
				onComplete?.();
			}
		} finally {
			completingId = null;
		}
	}

	function formatTime(iso: string): string {
		try {
			const d = new Date(iso);
			return isNaN(d.getTime())
				? iso
				: d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
		} catch {
			return iso;
		}
	}
</script>

<div class="reminder-list">
	{#if loading}
		<p class="text-sm text-neutral-500 dark:text-neutral-400">Loading reminders…</p>
	{:else if reminders.length === 0}
		<p class="text-sm text-neutral-500 dark:text-neutral-400">No upcoming reminders.</p>
	{:else}
		<ul class="flex flex-col gap-2" role="list">
			{#each reminders as r (r.id)}
				<li
					class="flex items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 dark:border-neutral-600 dark:bg-neutral-700/50"
				>
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
							{r.task}
						</p>
						<p class="text-xs text-neutral-500 dark:text-neutral-400">{formatTime(r.time)}</p>
					</div>
					<button
						type="button"
						class="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-teal-600 transition hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-900/30"
						disabled={completingId === r.id}
						onclick={() => markComplete(r.id)}
						aria-label="Mark complete"
					>
						{completingId === r.id ? '…' : 'Done'}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
