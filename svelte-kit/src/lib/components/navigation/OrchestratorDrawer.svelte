<script lang="ts">
	import AgentPanel from '$lib/components/agents/AgentPanel.svelte';

	let open = $state(false);
</script>

<div class="drawer-wrapper">
	{#if open}
		<button
			type="button"
			class="drawer-backdrop"
			aria-label="Close chat"
			onclick={() => (open = false)}
		></button>
	{/if}

	<div
		id="orchestrator-drawer"
		class="drawer"
		class:drawer-open={open}
		role="dialog"
		aria-label="DailyAssist chat"
		aria-modal="true"
		aria-hidden={!open}
		onclick={(e) => e.stopPropagation()}
	>
		<div class="drawer-content">
			<AgentPanel />
		</div>
	</div>

	<button
		type="button"
		class="drawer-fab"
		onclick={() => (open = !open)}
		aria-expanded={open}
		aria-controls="orchestrator-drawer"
		aria-label={open ? 'Close chat' : 'Open chat'}
		title={open ? 'Close chat' : 'Open chat'}
	>
		{open ? '✕' : '💬'}
	</button>
</div>

<style>
	.drawer-wrapper {
		position: relative;
		z-index: 50;
	}

	.drawer-fab {
		position: fixed;
		bottom: calc(1.5rem + env(safe-area-inset-bottom, 0px));
		right: calc(1.5rem + env(safe-area-inset-right, 0px));
		width: 56px;
		height: 56px;
		min-width: 56px;
		min-height: 56px;
		border-radius: 50%;
		border: none;
		background: hsl(210 60% 50%);
		color: white;
		font-size: 1.5rem;
		cursor: pointer;
		box-shadow: 0 4px 12px hsla(210 60% 30% / 0.35);
		transition:
			transform 0.2s,
			box-shadow 0.2s;
		z-index: 53;
	}
	.drawer-fab:hover {
		transform: scale(1.05);
		box-shadow: 0 6px 16px hsla(210 60% 30% / 0.4);
	}
	:global(body.dark) .drawer-fab {
		background: hsl(210 60% 45%);
		box-shadow: 0 4px 12px hsla(0 0% 0% / 0.4);
	}

	.drawer-backdrop {
		position: fixed;
		inset: 0;
		background: hsla(210 20% 10% / 0.35);
		border: none;
		cursor: pointer;
		z-index: 51;
	}
	:global(body.dark) .drawer-backdrop {
		background: hsla(0 0% 0% / 0.45);
	}

	.drawer {
		position: fixed;
		top: 0;
		right: 0;
		width: 100%;
		max-width: 420px;
		height: 100%;
		background: hsl(210 20% 98%);
		box-shadow: -4px 0 20px hsla(210 20% 20% / 0.15);
		transform: translateX(100%);
		transition: transform 0.25s ease;
		z-index: 52;
		overflow: auto;
		pointer-events: auto;
	}
	:global(body.dark) .drawer {
		background: hsl(210 20% 14%);
		box-shadow: -4px 0 20px hsla(0 0% 0% / 0.4);
	}
	.drawer.drawer-open {
		transform: translateX(0);
	}

	.drawer-content {
		height: 100%;
		overflow: auto;
		padding: 1rem;
	}
	.drawer-content :global(.agent-panel) {
		margin: 0;
		max-width: none;
		height: 100%;
	}

	@media (max-width: 640px) {
		.drawer-fab {
			bottom: calc(1.5rem + env(safe-area-inset-bottom, 0px));
			right: calc(1rem + env(safe-area-inset-right, 0px));
		}
		.drawer {
			max-width: 100%;
		}
	}
</style>
