<script lang="ts">
	import PatternDashboard from '$lib/components/agents/PatternDashboard.svelte';

	interface Props {
		userId: string;
	}
	let { userId }: Props = $props();
</script>

<div class="dashboard-content" id="panel-dashboard">
	<PatternDashboard {userId} />
</div>

<style>
	.dashboard-content {
		margin-top: 1rem;
	}
</style>
