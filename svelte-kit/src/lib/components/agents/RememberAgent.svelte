<script lang="ts">
	import { onMount } from 'svelte';
	import { getOrCreateUserId } from '$lib/supabase';
	import ReminderList from './ReminderList.svelte';

	type Tab = 'reminders' | 'medications' | 'appointments';

	let userId = $state<string | null>(null);
	let activeTab = $state<Tab>('reminders');
	let error = $state('');
	let loading = $state(false);
	let success = $state('');

	// Reminder form
	let reminderText = $state('');
	let reminderTime = $state('');

	// Medication form
	let medName = $state('');
	let medSchedule = $state('');
	let medCritical = $state(false);

	// Appointment form
	let appTitle = $state('');
	let appTime = $state('');
	let appLocation = $state('');

	let refreshTrigger = $state(0);

	onMount(() => {
		getOrCreateUserId().then((id) => {
			userId = id;
			if (id) refreshTrigger++;
		});
	});

	function refreshList() {
		refreshTrigger++;
	}

	function clearFeedback() {
		error = '';
		success = '';
	}

	async function addReminder() {
		if (!userId || !reminderText.trim()) {
			error = 'Enter what to remember.';
			return;
		}
		loading = true;
		clearFeedback();
		try {
			const res = await fetch('/api/agents/remember', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'create_reminder',
					userId,
					task: reminderText.trim(),
					time: reminderTime.trim() || undefined
				})
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.message || data.error || 'Failed');
			success = 'Reminder added.';
			reminderText = '';
			reminderTime = '';
			refreshList();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to add reminder.';
		} finally {
			loading = false;
		}
	}

	async function addMedication() {
		if (!userId || !medName.trim()) {
			error = 'Enter medication name.';
			return;
		}
		loading = true;
		clearFeedback();
		try {
			const res = await fetch('/api/agents/remember', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'create_medication',
					userId,
					name: medName.trim(),
					scheduleText: medSchedule.trim() || undefined,
					isCritical: medCritical
				})
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.message || data.error || 'Failed');
			success = 'Medication added.';
			medName = '';
			medSchedule = '';
			medCritical = false;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to add medication.';
		} finally {
			loading = false;
		}
	}

	async function addAppointment() {
		if (!userId || !appTitle.trim() || !appTime.trim()) {
			error = 'Enter title and date/time.';
			return;
		}
		loading = true;
		clearFeedback();
		try {
			const res = await fetch('/api/agents/remember', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'create_appointment',
					userId,
					title: appTitle.trim(),
					appointmentTime: appTime.trim(),
					location: appLocation.trim() || undefined
				})
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.message || data.error || 'Failed');
			success = 'Appointment added.';
			appTitle = '';
			appTime = '';
			appLocation = '';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to add appointment.';
		} finally {
			loading = false;
		}
	}
</script>

<div
	class="remember-agent rounded-xl border border-neutral-200 bg-white/80 p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-800/80"
>
	<h2 class="mb-3 text-lg font-medium text-neutral-800 dark:text-neutral-200">Remember-For-Me</h2>

	{#if !userId}
		<p class="text-sm text-neutral-500 dark:text-neutral-400">
			Sign in to use reminders and medications.
		</p>
	{:else}
		<div class="mb-3 flex gap-1 rounded-lg bg-neutral-100 p-1 dark:bg-neutral-700">
			<button
				type="button"
				class="flex-1 rounded-md px-3 py-2 text-sm font-medium transition {activeTab === 'reminders'
					? 'bg-white text-neutral-900 shadow dark:bg-neutral-600 dark:text-white'
					: 'text-neutral-600 dark:text-neutral-300'}"
				onclick={() => (activeTab = 'reminders')}
			>
				Reminders
			</button>
			<button
				type="button"
				class="flex-1 rounded-md px-3 py-2 text-sm font-medium transition {activeTab ===
				'medications'
					? 'bg-white text-neutral-900 shadow dark:bg-neutral-600 dark:text-white'
					: 'text-neutral-600 dark:text-neutral-300'}"
				onclick={() => (activeTab = 'medications')}
			>
				Medications
			</button>
			<button
				type="button"
				class="flex-1 rounded-md px-3 py-2 text-sm font-medium transition {activeTab ===
				'appointments'
					? 'bg-white text-neutral-900 shadow dark:bg-neutral-600 dark:text-white'
					: 'text-neutral-600 dark:text-neutral-300'}"
				onclick={() => (activeTab = 'appointments')}
			>
				Appointments
			</button>
		</div>

		{#if error}
			<p class="mb-2 text-sm text-red-600 dark:text-red-400" role="alert">
				<span class="font-medium">Error:</span>
				{error}
			</p>
		{/if}
		{#if success}
			<p class="mb-2 text-sm text-green-600 dark:text-green-400" role="status">
				<span class="font-medium">Success:</span>
				{success}
			</p>
		{/if}

		{#if activeTab === 'reminders'}
			<form
				class="mb-4 flex flex-col gap-2"
				onsubmit={(e: SubmitEvent) => {
					e.preventDefault();
					addReminder();
				}}
			>
				<label for="reminder-task" class="sr-only">What to remember</label>
				<input
					id="reminder-task"
					type="text"
					class="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900 placeholder-neutral-500 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100"
					placeholder="e.g. Take Metformin at 8 PM"
					bind:value={reminderText}
					disabled={loading}
				/>
				<input
					type="text"
					class="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900 placeholder-neutral-500 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100"
					placeholder="Time (optional, e.g. 8pm or tomorrow 9am)"
					bind:value={reminderTime}
					disabled={loading}
				/>
				<button
					type="submit"
					class="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-700 disabled:opacity-50 dark:bg-teal-500 dark:hover:bg-teal-600"
					disabled={loading}
				>
					{loading ? 'Adding…' : 'Add reminder'}
				</button>
			</form>
			<ReminderList {userId} {refreshTrigger} onComplete={refreshList} />
		{:else if activeTab === 'medications'}
			<form
				class="mb-4 flex flex-col gap-2"
				onsubmit={(e: SubmitEvent) => {
					e.preventDefault();
					addMedication();
				}}
			>
				<label for="med-name" class="sr-only">Medication name</label>
				<input
					id="med-name"
					type="text"
					class="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900 placeholder-neutral-500 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100"
					placeholder="Medication name (e.g. Metformin)"
					bind:value={medName}
					disabled={loading}
				/>
				<input
					type="text"
					class="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900 placeholder-neutral-500 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100"
					placeholder="Schedule (e.g. 8am and 8pm daily)"
					bind:value={medSchedule}
					disabled={loading}
				/>
				<label class="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
					<input type="checkbox" bind:checked={medCritical} disabled={loading} />
					Critical (escalate if missed)
				</label>
				<button
					type="submit"
					class="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-700 disabled:opacity-50 dark:bg-teal-500 dark:hover:bg-teal-600"
					disabled={loading}
				>
					{loading ? 'Adding…' : 'Add medication'}
				</button>
			</form>
		{:else}
			<form
				class="mb-4 flex flex-col gap-2"
				onsubmit={(e: SubmitEvent) => {
					e.preventDefault();
					addAppointment();
				}}
			>
				<label for="app-title" class="sr-only">Appointment title</label>
				<input
					id="app-title"
					type="text"
					class="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900 placeholder-neutral-500 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100"
					placeholder="Title (e.g. Doctor visit)"
					bind:value={appTitle}
					disabled={loading}
				/>
				<input
					type="datetime-local"
					class="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100"
					bind:value={appTime}
					disabled={loading}
				/>
				<input
					type="text"
					class="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900 placeholder-neutral-500 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100"
					placeholder="Location (optional)"
					bind:value={appLocation}
					disabled={loading}
				/>
				<button
					type="submit"
					class="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-700 disabled:opacity-50 dark:bg-teal-500 dark:hover:bg-teal-600"
					disabled={loading}
				>
					{loading ? 'Adding…' : 'Add appointment'}
				</button>
			</form>
		{/if}
	{/if}
</div>
