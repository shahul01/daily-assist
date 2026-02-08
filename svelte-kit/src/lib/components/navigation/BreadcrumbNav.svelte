<script lang="ts">
	import {
		PRIMARY_TABS,
		FUNCTION_GROUPS,
		getAgentLabel,
		type TabState
	} from '$lib/stores/tabState';

	interface Props {
		state: TabState;
	}
	let { state }: Props = $props();

	const crumbs = $derived.by(() => {
		const out: Array<{ label: string; id?: string }> = [];
		const primaryLabel = PRIMARY_TABS.find((t) => t.id === state.primary)?.label ?? state.primary;
		out.push({ label: primaryLabel, id: `crumb-${state.primary}` });
		if (state.primary === 'chat' && state.group) {
			const grpLabel = FUNCTION_GROUPS.find((g) => g.id === state.group)?.label ?? state.group;
			out.push({ label: grpLabel, id: `crumb-${state.group}` });
		}
		if (state.primary === 'tools' && state.agent) {
			out.push({ label: getAgentLabel(state.agent), id: `crumb-${state.agent}` });
		} else if (state.primary === 'chat' && state.group && state.agent) {
			out.push({ label: getAgentLabel(state.agent), id: `crumb-${state.agent}` });
		}
		return out;
	});
</script>

<nav class="breadcrumb" aria-label="Breadcrumb">
	<ol class="breadcrumb-list">
		{#each crumbs as crumb, i (crumb.id ?? `crumb-${i}`)}
			<li class="breadcrumb-item">
				{#if i > 0}
					<span class="breadcrumb-sep" aria-hidden="true">›</span>
				{/if}
				<span id={crumb.id} class="breadcrumb-text">{crumb.label}</span>
			</li>
		{/each}
	</ol>
</nav>

<style>
	.breadcrumb {
		padding: 0.35rem 1rem;
		background: hsl(210 15% 96%);
		border-bottom: 1px solid hsl(210 10% 92%);
	}
	:global(body.dark) .breadcrumb {
		background: hsl(210 20% 16%);
		border-bottom-color: hsl(210 20% 24%);
	}

	.breadcrumb-list {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.25rem;
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: 0.85rem;
		color: hsl(210 10% 45%);
	}
	:global(body.dark) .breadcrumb-list {
		color: hsl(210 10% 65%);
	}

	.breadcrumb-sep {
		margin: 0 0.25rem;
		user-select: none;
	}

	.breadcrumb-text {
		font-weight: 500;
	}
</style>
