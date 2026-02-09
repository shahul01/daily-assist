<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { accessibilityStore } from '$lib/stores/accessibilityStore';

	let { children } = $props();

	onMount(() => {
		if (!browser) return;
		const apply = (s: { fontSize: string; highContrast: boolean; reduceMotion: string }) => {
			const root = document.documentElement;
			root.classList.toggle('a11y-font-large', s.fontSize === 'large');
			root.classList.toggle('a11y-high-contrast', s.highContrast);
			root.classList.toggle('a11y-reduce-motion', s.reduceMotion === 'on');
			root.classList.toggle('a11y-allow-motion', s.reduceMotion === 'off');
		};
		apply(accessibilityStore.init());
		const unsub = accessibilityStore.subscribe(apply);
		return unsub;
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{@render children()}
