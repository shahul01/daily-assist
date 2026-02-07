<script lang="ts">
	/* eslint-disable svelte/prefer-svelte-reactivity -- Date/Map used only to compute primitives for display */
	interface Reminder {
		id: string;
		task: string;
		time: string;
	}
	interface Appointment {
		id: string;
		title: string;
		appointmentTime: string;
		appointmentType: string | null;
	}

	interface Props {
		userId: string | null;
	}

	let { userId }: Props = $props();

	let reminders = $state<Reminder[]>([]);
	let appointments = $state<Appointment[]>([]);
	let loading = $state(true);

	$effect(() => {
		if (userId) load();
		else {
			reminders = [];
			appointments = [];
			loading = false;
		}
	});

	async function load() {
		if (!userId) return;
		loading = true;
		try {
			const [remRes, appRes] = await Promise.all([
				fetch('/api/agents/remember', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ action: 'list_reminders', userId })
				}),
				fetch('/api/agents/remember', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ action: 'list_appointments', userId, days: 14 })
				})
			]);
			const remData = await remRes.json();
			const appData = await appRes.json();
			reminders = remRes.ok && remData.reminders ? remData.reminders : [];
			appointments = appRes.ok && appData.appointments ? appData.appointments : [];
		} catch {
			reminders = [];
			appointments = [];
		} finally {
			loading = false;
		}
	}

	const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

	function getWeekStart(d: Date): Date {
		const x = new Date(d);
		const day = x.getDay();
		x.setDate(x.getDate() - day);
		x.setHours(0, 0, 0, 0);
		return x;
	}

	function toDateKey(iso: string): string {
		const d = new Date(iso);
		return d.toISOString().slice(0, 10);
	}

	function formatTime(iso: string): string {
		const d = new Date(iso);
		return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
	}

	const weekStartTs = $derived(getWeekStart(new Date()).getTime());
	const days = $derived(
		Array.from({ length: 7 }, (_, i) => {
			const d = new Date(weekStartTs);
			d.setDate(d.getDate() + i);
			return d.getTime();
		})
	);

	type DayItem = { type: 'reminder' | 'appointment'; label: string; time: string; id: string };
	const byDate = $derived.by((): Record<string, DayItem[]> => {
		const obj: Record<string, DayItem[]> = {};
		for (const r of reminders) {
			const key = toDateKey(r.time);
			if (!obj[key]) obj[key] = [];
			obj[key].push({ type: 'reminder', label: r.task, time: formatTime(r.time), id: r.id });
		}
		for (const a of appointments) {
			const key = toDateKey(a.appointmentTime);
			if (!obj[key]) obj[key] = [];
			obj[key].push({
				type: 'appointment',
				label: a.title,
				time: formatTime(a.appointmentTime),
				id: a.id
			});
		}
		return obj;
	});
</script>

<div
	class="calendar-view rounded-xl border border-neutral-200 bg-white/80 p-4 dark:border-neutral-700 dark:bg-neutral-800/80"
>
	<h3 class="mb-3 text-sm font-medium text-neutral-800 dark:text-neutral-200">This week</h3>
	{#if !userId}
		<p class="text-sm text-neutral-500 dark:text-neutral-400">Sign in to see calendar.</p>
	{:else if loading}
		<p class="text-sm text-neutral-500 dark:text-neutral-400">Loading…</p>
	{:else}
		<div
			class="grid grid-cols-7 gap-1 text-center text-xs font-medium text-neutral-500 dark:text-neutral-400"
		>
			{#each DAYS as day (day)}
				<div>{day}</div>
			{/each}
		</div>
		<div class="mt-1 grid grid-cols-7 gap-1">
			{#each days as dayTs (dayTs)}
				{@const d = new Date(dayTs)}
				{@const key = d.toISOString().slice(0, 10)}
				{@const items = byDate[key] ?? []}
				<div
					class="min-h-20 rounded-lg border border-neutral-200 p-1.5 dark:border-neutral-600 {d.toDateString() ===
					new Date().toDateString()
						? 'border-teal-400 bg-teal-50/50 dark:bg-teal-900/20'
						: ''}"
				>
					<p class="text-xs font-medium text-neutral-600 dark:text-neutral-300">{d.getDate()}</p>
					<div class="mt-1 flex flex-col gap-0.5">
						{#each items.slice(0, 3) as item (item.id)}
							<div
								class="truncate rounded px-1 py-0.5 text-xs {item.type === 'reminder'
									? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200'
									: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200'}"
								title="{item.label} ({item.time})"
							>
								{item.label}
							</div>
						{/each}
						{#if items.length > 3}
							<p class="text-xs text-neutral-400">+{items.length - 3}</p>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
