<script lang="ts">
	import { onMount } from 'svelte';
	import { getOrCreateUserId } from '$lib/supabase';
	import MarathonStatus from '$lib/components/agents/MarathonStatus.svelte';

	let userId = $state<string | null>(null);
	let expanded = $state(false);
	let marathonStarting = $state(false);
	let marathonStopping = $state(false);
	let refreshKey = $state(0);
	let running = $state(false);
	let loading = $state(false);

	onMount(() => {
		getOrCreateUserId().then((id) => {
			userId = id;
		});
	});

	async function fetchStatus() {
		if (!userId) return;
		loading = true;
		try {
			const res = await fetch(`/api/marathon/status?userId=${encodeURIComponent(userId)}`);
			const data = await res.json();
			if (res.ok) running = data.running ?? false;
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (userId) fetchStatus();
	});
	$effect(() => {
		void refreshKey;
		if (userId) fetchStatus();
	});

	async function startMarathon() {
		const uid = userId ?? (await getOrCreateUserId());
		if (!uid) return;
		marathonStarting = true;
		try {
			const res = await fetch('/api/marathon/start', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ userId: uid, durationHours: 24, mode: 'hybrid' })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.message ?? data.error ?? 'Start failed');
			refreshKey++;
		} finally {
			marathonStarting = false;
		}
	}

	async function stopMarathon() {
		const uid = userId ?? (await getOrCreateUserId());
		if (!uid) return;
		marathonStopping = true;
		try {
			const res = await fetch('/api/marathon/stop', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ userId: uid })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.message ?? data.error ?? 'Stop failed');
			refreshKey++;
		} finally {
			marathonStopping = false;
		}
	}
</script>

<div class="marathon-wrap" aria-label="Marathon session status">
	<div class="marathon-bar">
		<button
			type="button"
			class="bar-toggle"
			onclick={() => (expanded = !expanded)}
			aria-expanded={expanded}
			aria-controls="marathon-details"
		>
			<span class="bar-label">Marathon</span>
			{#if loading}
				<span class="bar-status bar-status-muted">…</span>
			{:else}
				<span class="bar-status" class:bar-status-running={running}>
					{running ? 'Running' : 'Stopped'}
				</span>
			{/if}
		</button>
		{#if userId}
			<div class="bar-actions">
				<button
					type="button"
					class="bar-btn"
					onclick={startMarathon}
					disabled={marathonStarting || marathonStopping}
					aria-label="Start marathon session"
				>
					{marathonStarting ? '…' : 'Start'}
				</button>
				<button
					type="button"
					class="bar-btn bar-btn-stop"
					onclick={stopMarathon}
					disabled={marathonStopping || marathonStarting}
					aria-label="Stop marathon session"
				>
					{marathonStopping ? '…' : 'Stop'}
				</button>
			</div>
		{/if}
	</div>
	{#if expanded && userId}
		<div id="marathon-details" class="bar-details" role="region" aria-label="Marathon details">
			<MarathonStatus {userId} refreshTrigger={refreshKey} />
		</div>
	{/if}
</div>

<style>
	.marathon-wrap {
		position: fixed;
		bottom: calc(5.5rem + env(safe-area-inset-bottom, 0px));
		right: calc(1.5rem + env(safe-area-inset-right, 0px));
		z-index: 50;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.5rem;
	}

	.marathon-bar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0.6rem;
		min-height: 44px;
		background: hsl(210 20% 98%);
		border: 1px solid hsl(210 10% 90%);
		border-radius: 999px;
		box-shadow: 0 2px 8px hsla(210 20% 20% / 0.12);
	}
	:global(body.dark) .marathon-bar {
		background: hsl(210 20% 14%);
		border-color: hsl(210 20% 24%);
		box-shadow: 0 2px 8px hsla(0 0% 0% / 0.3);
	}

	.bar-toggle {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		background: transparent;
		border: none;
		cursor: pointer;
		padding: 0.2rem 0.25rem;
		min-height: 36px;
		min-width: 36px;
		color: hsl(210 10% 30%);
		font-size: 0.85rem;
	}
	:global(body.dark) .bar-toggle {
		color: hsl(210 10% 85%);
	}
	.bar-toggle:hover {
		text-decoration: underline;
	}

	.bar-label {
		font-weight: 500;
	}

	.bar-status {
		font-weight: 500;
		color: hsl(210 10% 45%);
	}
	:global(body.dark) .bar-status {
		color: hsl(210 10% 70%);
	}
	.bar-status-running {
		color: hsl(150 60% 35%);
	}
	:global(body.dark) .bar-status-running {
		color: hsl(150 55% 50%);
	}
	.bar-status-muted {
		opacity: 0.7;
	}

	.bar-actions {
		display: flex;
		gap: 0.5rem;
	}

	.bar-btn {
		padding: 0.35rem 0.6rem;
		min-height: 36px;
		min-width: 36px;
		border-radius: 999px;
		border: 1px solid hsl(210 10% 85%);
		background: hsl(210 60% 50%);
		color: white;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.2s;
	}
	.bar-btn:hover:not(:disabled) {
		background: hsl(210 60% 45%);
	}
	.bar-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	.bar-btn-stop {
		background: hsl(210 20% 92%);
		color: hsl(210 30% 25%);
	}
	:global(body.dark) .bar-btn-stop {
		background: hsl(210 15% 28%);
		color: hsl(210 10% 85%);
	}

	.bar-details {
		min-width: 280px;
		max-width: 90vw;
		padding: 0.75rem;
		background: hsl(210 20% 98%);
		border: 1px solid hsl(210 10% 90%);
		border-radius: 12px;
		box-shadow: 0 4px 16px hsla(210 20% 20% / 0.15);
	}
	:global(body.dark) .bar-details {
		background: hsl(210 20% 14%);
		border-color: hsl(210 20% 24%);
		box-shadow: 0 4px 16px hsla(0 0% 0% / 0.35);
	}

	@media (max-width: 640px) {
		.marathon-wrap {
			bottom: calc(5rem + env(safe-area-inset-bottom, 0px));
			right: 1rem;
			left: 1rem;
			align-items: stretch;
		}
		.marathon-bar {
			border-radius: 12px;
		}
	}
</style>
