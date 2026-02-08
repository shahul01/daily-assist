<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import {
		parseTabStateFromUrl,
		tabStateToSearchParams,
		persistTabState,
		loadPersistedTabState,
		AGENTS_BY_GROUP,
		type TabState,
		type PrimaryTab,
		type FunctionGroup,
		type AgentId
	} from '$lib/stores/tabState';
	import MarathonStatusBar from '$lib/components/navigation/MarathonStatusBar.svelte';
	import TabNavigation from '$lib/components/navigation/TabNavigation.svelte';
	import BreadcrumbNav from '$lib/components/navigation/BreadcrumbNav.svelte';
	import OrchestratorDrawer from '$lib/components/navigation/OrchestratorDrawer.svelte';
	import PageHero from '$lib/components/page/PageHero.svelte';
	import HomeFeatures from '$lib/components/page/HomeFeatures.svelte';
	import DashboardPanel from '$lib/components/page/DashboardPanel.svelte';
	import AgentTabContent from '$lib/components/page/AgentTabContent.svelte';
	import TabPlaceholder from '$lib/components/page/TabPlaceholder.svelte';
	import { getOrCreateUserId } from '$lib/supabase';

	let userId = $state<string>('');

	const tabState = $derived.by(() => {
		const params = $page.url.searchParams;
		if (params.toString()) {
			return parseTabStateFromUrl(params);
		}
		return { primary: 'home' as const, group: undefined, agent: undefined };
	});

	$effect(() => {
		if (!browser) return;
		const state = tabState;
		if (state.primary === 'chat' && !state.group) {
			updateUrl({ ...state, group: 'communication', agent: 'read' });
		} else if (state.primary === 'tools' && !state.agent) {
			updateUrl({ ...state, agent: 'read' });
		}
	});

	onMount(() => {
		getOrCreateUserId().then((id) => {
			userId = id ?? '';
		});
		if (!$page.url.searchParams.toString()) {
			const persisted = loadPersistedTabState();
			if (persisted?.primary) {
				const next: TabState = {
					primary: persisted.primary,
					group: persisted.group,
					agent: persisted.agent
				};
				updateUrl(next);
			}
		}
	});

	async function updateUrl(state: TabState) {
		persistTabState(state);
		const params = tabStateToSearchParams(state);
		const q = params.toString();
		await tick();
		// Client-side tab state sync to URL; not during load resolve
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- programmatic nav after user/tick
		goto(q ? `?${q}` : window.location.pathname, { replaceState: true });
	}

	function setPrimary(primary: PrimaryTab) {
		const next: TabState = { primary, group: undefined, agent: undefined };
		if (primary === 'chat') {
			next.group = 'communication';
			next.agent = 'read';
		} else if (primary === 'tools') {
			next.agent = 'read';
		}
		updateUrl(next);
	}

	function setGroup(group: FunctionGroup) {
		const agents = AGENTS_BY_GROUP[group];
		const agent = agents[0]?.id;
		updateUrl({ ...tabState, group, agent });
	}

	function setAgent(agent: AgentId) {
		updateUrl({ ...tabState, agent });
	}

	const showAgentContent = $derived(
		(tabState.primary === 'chat' && tabState.group && tabState.agent) ||
			(tabState.primary === 'tools' && tabState.agent)
	);
	const currentAgent = $derived(tabState.agent);
</script>

<svelte:head>
	<title>DailyAssist - AI Companion for Accessibility</title>
</svelte:head>

<MarathonStatusBar />

<main>
	<PageHero />

	<TabNavigation state={tabState} onPrimary={setPrimary} onGroup={setGroup} onAgent={setAgent} />
	<BreadcrumbNav state={tabState} />

	<div class="content" role="main">
		{#if tabState.primary === 'home'}
			<HomeFeatures />
		{:else if tabState.primary === 'dashboard'}
			<DashboardPanel {userId} />
		{:else if showAgentContent && currentAgent}
			<AgentTabContent agent={currentAgent} {userId} />
		{:else if tabState.primary === 'chat' && !tabState.group}
			<TabPlaceholder
				id="panel-chat"
				message="Choose a group above (Communication, Sense, or Memory), then pick an agent."
			/>
		{:else if tabState.primary === 'tools' && !tabState.agent}
			<TabPlaceholder id="panel-tools" message="Choose an agent above to get started." />
		{/if}
	</div>
</main>

<OrchestratorDrawer />

<style>
	main {
		padding: 0 1rem 2rem;
		max-width: 1200px;
		margin: 0 auto;
	}

	.content {
		padding: 1rem 0;
	}

	@media (max-width: 640px) {
		main {
			/* Leave room for fixed marathon strip + chat FAB so they don't hide content */
			padding-bottom: calc(10rem + env(safe-area-inset-bottom, 0px));
		}
	}
</style>
