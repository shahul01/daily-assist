<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { accessibilityStore } from '$lib/stores/accessibilityStore';
	import { themeStore } from '$lib/stores/themeStore';
	import type { ThemeState } from '$lib/stores/themeStore';

	let { children } = $props();

	onMount(() => {
		if (!browser) return;
		const root = document.documentElement;
		const body = document.body;

		const apply = (s: { fontSize: string; highContrast: boolean; reduceMotion: string }) => {
			root.classList.toggle('a11y-font-large', s.fontSize === 'large');
			root.classList.toggle('a11y-high-contrast', s.highContrast);
			root.classList.toggle('a11y-reduce-motion', s.reduceMotion === 'on');
			root.classList.toggle('a11y-allow-motion', s.reduceMotion === 'off');
		};

		const applyTheme = (state: ThemeState) => {
			const prefersDark =
				window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
			const isDark = state.mode === 'dark' || (state.mode === 'system' && prefersDark);
			root.classList.toggle('dark', isDark);
			body.classList.toggle('dark', isDark);
		};

		apply(accessibilityStore.init());
		applyTheme(themeStore.init());

		const unsub = accessibilityStore.subscribe(apply);
		const unsubTheme = themeStore.subscribe(applyTheme);

		return () => {
			unsub();
			unsubTheme();
		};
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{@render children()}
