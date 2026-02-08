<script lang="ts">
	import {
		PRIMARY_TABS,
		FUNCTION_GROUPS,
		AGENTS_BY_GROUP,
		ALL_AGENTS_IDS,
		getAgentLabel,
		type TabState,
		type PrimaryTab,
		type FunctionGroup,
		type AgentId
	} from '$lib/stores/tabState';

	interface Props {
		state: TabState;
		onPrimary: (tab: PrimaryTab) => void;
		onGroup: (group: FunctionGroup) => void;
		onAgent: (agent: AgentId) => void;
	}
	let { state, onPrimary, onGroup, onAgent }: Props = $props();

	const agentsForTools = $derived(ALL_AGENTS_IDS.map((id) => ({ id, label: getAgentLabel(id) })));

	function handlePrimaryKeydown(e: KeyboardEvent, index: number) {
		if (e.key === 'ArrowLeft' && index > 0) {
			e.preventDefault();
			onPrimary(PRIMARY_TABS[index - 1].id);
		}
		if (e.key === 'ArrowRight' && index < PRIMARY_TABS.length - 1) {
			e.preventDefault();
			onPrimary(PRIMARY_TABS[index + 1].id);
		}
	}

	function handleGroupKeydown(e: KeyboardEvent, index: number) {
		if (e.key === 'ArrowLeft' && index > 0) {
			e.preventDefault();
			onGroup(FUNCTION_GROUPS[index - 1].id);
		}
		if (e.key === 'ArrowRight' && index < FUNCTION_GROUPS.length - 1) {
			e.preventDefault();
			onGroup(FUNCTION_GROUPS[index + 1].id);
		}
	}

	function handleAgentKeydown(e: KeyboardEvent, agents: { id: AgentId }[], index: number) {
		if (e.key === 'ArrowLeft' && index > 0) {
			e.preventDefault();
			onAgent(agents[index - 1].id);
		}
		if (e.key === 'ArrowRight' && index < agents.length - 1) {
			e.preventDefault();
			onAgent(agents[index + 1].id);
		}
	}
</script>

<nav class="tab-nav" aria-label="Main navigation">
	<div class="tab-row tab-row-primary" role="tablist" aria-label="Primary sections">
		{#each PRIMARY_TABS as tab, i (tab.id)}
			<button
				type="button"
				role="tab"
				aria-selected={state.primary === tab.id}
				aria-controls="panel-{tab.id}"
				id="tab-{tab.id}"
				class="tab tab-primary"
				class:tab-active={state.primary === tab.id}
				onclick={() => onPrimary(tab.id)}
				onkeydown={(e) => handlePrimaryKeydown(e, i)}
			>
				<span class="tab-icon" aria-hidden="true">{tab.icon}</span>
				<span class="tab-label">{tab.label}</span>
			</button>
		{/each}
	</div>

	{#if state.primary === 'chat'}
		<div class="tab-row tab-row-groups" role="tablist" aria-label="Function groups">
			{#each FUNCTION_GROUPS as grp, i (grp.id)}
				<button
					type="button"
					role="tab"
					aria-selected={state.group === grp.id}
					aria-controls="panel-group-{grp.id}"
					id="tab-group-{grp.id}"
					class="tab tab-group"
					class:tab-active={state.group === grp.id}
					onclick={() => onGroup(grp.id)}
					onkeydown={(e) => handleGroupKeydown(e, i)}
				>
					<span class="tab-icon" aria-hidden="true">{grp.icon}</span>
					<span class="tab-label">{grp.label}</span>
				</button>
			{/each}
		</div>

		{#if state.group}
			{@const agents = AGENTS_BY_GROUP[state.group]}
			<div class="tab-row tab-row-agents" role="tablist" aria-label="Agents">
				{#each agents as a, i (a.id)}
					<button
						type="button"
						role="tab"
						aria-selected={state.agent === a.id}
						aria-controls="panel-agent-{a.id}"
						id="tab-agent-{a.id}"
						class="tab tab-agent"
						class:tab-active={state.agent === a.id}
						onclick={() => onAgent(a.id)}
						onkeydown={(e) => handleAgentKeydown(e, agents, i)}
					>
						<span class="tab-icon" aria-hidden="true">{a.icon}</span>
						<span class="tab-label">{a.label}</span>
					</button>
				{/each}
			</div>
		{/if}
	{/if}

	{#if state.primary === 'tools'}
		<div class="tab-row tab-row-agents" role="tablist" aria-label="All agents">
			{#each agentsForTools as a, i (a.id)}
				<button
					type="button"
					role="tab"
					aria-selected={state.agent === a.id}
					aria-controls="panel-agent-{a.id}"
					id="tab-agent-{a.id}"
					class="tab tab-agent"
					class:tab-active={state.agent === a.id}
					onclick={() => onAgent(a.id)}
					onkeydown={(e) => handleAgentKeydown(e, agentsForTools, i)}
				>
					<span class="tab-label">{a.label}</span>
				</button>
			{/each}
		</div>
	{/if}
</nav>

<style>
	.tab-nav {
		background: hsl(210 20% 98%);
		border-bottom: 1px solid hsl(210 10% 90%);
	}
	:global(body.dark) .tab-nav {
		background: hsl(210 20% 14%);
		border-bottom-color: hsl(210 20% 22%);
	}

	.tab-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		padding: 0.5rem 1rem;
		align-items: center;
	}

	.tab-row-groups {
		padding-top: 0;
	}
	.tab-row-agents {
		padding-top: 0;
	}

	.tab {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.5rem 0.75rem;
		min-height: 44px;
		border: none;
		border-radius: 8px;
		background: transparent;
		color: hsl(210 10% 35%);
		font-size: 0.9rem;
		font-weight: 500;
		cursor: pointer;
		transition:
			background 0.15s,
			color 0.15s;
	}
	:global(body.dark) .tab {
		color: hsl(210 10% 75%);
	}
	.tab:hover {
		background: hsl(210 20% 92%);
		color: hsl(210 60% 40%);
	}
	:global(body.dark) .tab:hover {
		background: hsl(210 20% 22%);
		color: hsl(210 60% 60%);
	}
	.tab:focus-visible {
		outline: 2px solid hsl(210 60% 50%);
		outline-offset: 2px;
	}
	.tab.tab-active {
		background: hsl(210 60% 50%);
		color: white;
	}
	:global(body.dark) .tab.tab-active {
		background: hsl(210 60% 45%);
		color: white;
	}

	.tab-primary {
		font-size: 1rem;
	}
	.tab-group {
		font-size: 0.875rem;
	}
	.tab-agent {
		font-size: 0.85rem;
		padding: 0.4rem 0.6rem;
	}

	.tab-icon {
		font-size: 1.1em;
	}

	@media (max-width: 640px) {
		.tab-row {
			overflow-x: auto;
			flex-wrap: nowrap;
			scroll-snap-type: x mandatory;
			-webkit-overflow-scrolling: touch;
			padding-bottom: 0.5rem;
		}
		.tab {
			scroll-snap-align: start;
			flex-shrink: 0;
		}
	}
</style>
