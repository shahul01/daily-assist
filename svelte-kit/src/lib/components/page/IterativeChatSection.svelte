<script lang="ts">
	interface IterativeSession {
		id: string;
		user_input: string;
		iterations_count: number;
		final_response: string | null;
		created_at: string;
	}

	interface Props {
		userId: string;
	}

	let { userId }: Props = $props();
	let sessions = $state<IterativeSession[]>([]);
	let loading = $state(false);
	let expanded = $state(false);

	async function load() {
		if (!userId) return;
		loading = true;
		try {
			const res = await fetch(`/api/usage/iterative-chat?userId=${encodeURIComponent(userId)}`);
			const data = await res.json();
			sessions = Array.isArray(data.sessions) ? data.sessions : [];
		} catch {
			sessions = [];
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (userId) load();
	});

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<section class="iterative-section" aria-labelledby="iterative-chat-heading">
	<h2 id="iterative-chat-heading" class="section-heading">Iterative Chat</h2>
	<p class="section-desc">Plans and results from multi-step orchestration (Gemini 3’s Plan).</p>
	{#if loading}
		<p class="muted">Loading…</p>
	{:else if sessions.length === 0}
		<p class="muted">No iterative chat sessions yet. Use the Chat tab to run multi-step tasks.</p>
	{:else}
		<button
			type="button"
			class="expand-btn"
			aria-expanded={expanded}
			aria-controls="iterative-session-list"
			onclick={() => (expanded = !expanded)}
		>
			{expanded ? 'Hide' : 'Show'} sessions ({sessions.length})
		</button>
		{#if expanded}
			<ul id="iterative-session-list" class="session-list">
				{#each sessions as s (s.id)}
					<li class="session-item">
						<strong>{formatDate(s.created_at)}</strong> — {s.iterations_count} iteration(s)
						<div class="session-input">
							{s.user_input.slice(0, 80)}{s.user_input.length > 80 ? '…' : ''}
						</div>
						{#if s.final_response}
							<div class="session-response">
								{s.final_response.slice(0, 120)}{s.final_response.length > 120 ? '…' : ''}
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</section>

<style>
	.iterative-section {
		margin-top: 1rem;
		padding: 1rem;
		background: hsl(210 20% 98%);
		border-radius: 12px;
		border: 1px solid hsl(210 20% 88%);
	}
	:global(body.dark) .iterative-section {
		background: hsl(210 20% 16%);
		border-color: hsl(210 20% 28%);
	}
	.section-heading {
		font-size: 1.125rem;
		color: hsl(210 60% 40%);
		margin: 0 0 0.25rem;
	}
	:global(body.dark) .section-heading {
		color: hsl(210 60% 60%);
	}
	.section-desc {
		font-size: 0.875rem;
		color: hsl(210 20% 45%);
		margin: 0 0 0.75rem;
	}
	:global(body.dark) .section-desc {
		color: hsl(210 20% 65%);
	}
	.muted {
		font-size: 0.875rem;
		color: hsl(210 20% 55%);
		margin: 0;
	}
	.expand-btn {
		font-size: 0.875rem;
		padding: 0.35rem 0.75rem;
		border-radius: 8px;
		border: 1px solid hsl(210 40% 80%);
		background: transparent;
		color: hsl(210 60% 40%);
		cursor: pointer;
	}
	.session-list {
		margin: 0.5rem 0 0;
		padding: 0;
		list-style: none;
	}
	.session-item {
		padding: 0.5rem 0;
		border-bottom: 1px solid hsl(210 20% 90%);
		font-size: 0.875rem;
	}
	:global(body.dark) .session-item {
		border-bottom-color: hsl(210 20% 25%);
	}
	.session-input,
	.session-response {
		margin-top: 0.25rem;
		color: hsl(210 20% 40%);
	}
	:global(body.dark) .session-input,
	:global(body.dark) .session-response {
		color: hsl(210 15% 75%);
	}
</style>
