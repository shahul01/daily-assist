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
	import UsagePanel from '$lib/components/page/UsagePanel.svelte';
	import AgentTabContent from '$lib/components/page/AgentTabContent.svelte';
	import TabPlaceholder from '$lib/components/page/TabPlaceholder.svelte';
	import SettingsModal from '$lib/components/settings/SettingsModal.svelte';
	import { getOrCreateUserId } from '$lib/supabase';
	import { getAgentLabel } from '$lib/stores/tabState';

	let userId = $state<string>('');
	let settingsOpen = $state(false);

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

	const pageTitle = $derived.by(() => {
		if (tabState.primary === 'home') return 'DailyAssist - AI Companion for Accessibility';
		if (tabState.primary === 'dashboard') return 'Dashboard - DailyAssist';
		if (tabState.primary === 'usage') return 'Usage - DailyAssist';
		if (tabState.primary === 'chat' && tabState.agent)
			return `${getAgentLabel(tabState.agent)} - DailyAssist`;
		if (tabState.primary === 'tools' && tabState.agent)
			return `${getAgentLabel(tabState.agent)} - DailyAssist`;
		if (tabState.primary === 'chat') return 'Chat - DailyAssist';
		if (tabState.primary === 'tools') return 'Tools - DailyAssist';
		return 'DailyAssist - AI Companion for Accessibility';
	});
</script>

<svelte:head>
	<title>{pageTitle}</title>
</svelte:head>

<a href="#main-content" class="skip-link">Skip to main content</a>
<MarathonStatusBar />

<main aria-label="Primary content">
	<div class="header-row">
		<PageHero />
		<button
			type="button"
			class="settings-btn"
			aria-label="Open settings"
			title="Settings"
			onclick={() => (settingsOpen = true)}
		>
			<span aria-hidden="true">⚙</span>
		</button>
	</div>

	<TabNavigation state={tabState} onPrimary={setPrimary} onGroup={setGroup} onAgent={setAgent} />
	<BreadcrumbNav state={tabState} />

	<div id="main-content" class="content">
		{#if tabState.primary === 'home'}
			<HomeFeatures />
		{:else if tabState.primary === 'dashboard'}
			<DashboardPanel {userId} />
		{:else if tabState.primary === 'usage'}
			<UsagePanel {userId} />
		{:else if showAgentContent && currentAgent}
			<AgentTabContent
				agent={currentAgent}
				{userId}
				resultId={$page.url.searchParams.get('resultId') ?? undefined}
			/>
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

<OrchestratorDrawer
		returnResultId={$page.url.searchParams.get('resultId') ?? undefined}
		onClearReturnResult={() => {
			const params = tabStateToSearchParams(tabState);
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- clear return result from URL
			goto(params.toString() ? `?${params.toString()}` : window.location.pathname, {
				replaceState: true
			});
		}}
	/>
<SettingsModal open={settingsOpen} onclose={() => (settingsOpen = false)} />

<style>
	.skip-link {
		position: fixed;
		top: -100px;
		left: 1rem;
		z-index: 200;
		padding: 0.5rem 1rem;
		background: hsl(210 60% 45%);
		color: white;
		border-radius: 0.5rem;
		font-size: 0.9375rem;
		text-decoration: none;
		font-weight: 500;
	}
	.skip-link:focus {
		top: 1rem;
		outline: 3px solid hsl(210 80% 50%);
		outline-offset: 2px;
	}

	.header-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}
	.header-row :global(.hero) {
		flex: 1;
	}

	.settings-btn {
		flex-shrink: 0;
		width: 2.5rem;
		height: 2.5rem;
		border: none;
		border-radius: 0.5rem;
		background: hsl(210 20% 94%);
		color: hsl(210 30% 35%);
		font-size: 1.25rem;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.settings-btn:hover {
		background: hsl(210 25% 88%);
		color: hsl(210 50% 40%);
	}
	.settings-btn:focus-visible {
		outline: 2px solid hsl(210 60% 45%);
		outline-offset: 2px;
	}
	:global(body.dark) .settings-btn {
		background: hsl(210 20% 22%);
		color: hsl(210 15% 75%);
	}
	:global(body.dark) .settings-btn:hover {
		background: hsl(210 20% 28%);
		color: hsl(210 50% 65%);
	}

	main {
		padding: 0 1rem 2rem;
		max-width: 1200px;
		margin: 0 auto;
		position: relative;
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
