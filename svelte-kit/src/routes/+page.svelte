<script lang="ts">
	import AgentPanel from '$lib/components/agents/AgentPanel.svelte';
</script>

<svelte:head>
	<title>DailyAssist - AI Companion for Accessibility</title>
</svelte:head>

<main>
	<div class="hero">
		<h1>DailyAssist</h1>
		<p>Your AI companion helping with reading, writing, finding, remembering, and communicating</p>
	</div>

	<AgentPanel />

	<div class="features">
		<div class="feature">
			<h3>📖 Read-To-Me</h3>
			<p>Converts text to speech-friendly format for vision disabilities</p>
		</div>

		<div class="feature">
			<h3>🧠 Remember-For-Me</h3>
			<p>Creates reminders and tracks tasks for memory disabilities</p>
		</div>

		<div class="feature">
			<h3>🎯 Smart Orchestration</h3>
			<p>Multiple agents work together to help you accomplish complex tasks</p>
		</div>
	</div>
</main>

<style>
	main {
		padding: 2rem 1rem;
		max-width: 1200px;
		margin: 0 auto;
	}

	.hero {
		text-align: center;
		margin-bottom: 3rem;
	}

	h1 {
		font-size: 3rem;
		color: hsl(210 60% 40%);
		margin-bottom: 0.5rem;
	}

	:global(body.dark) h1 {
		color: hsl(210 60% 60%);
	}

	.hero p {
		font-size: 1.25rem;
		color: hsl(210 10% 40%);
	}

	:global(body.dark) .hero p {
		color: hsl(210 10% 70%);
	}

	.features {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
		gap: 2rem;
		margin-top: 3rem;
	}

	.feature {
		padding: 1.5rem;
		background: hsl(210 20% 98%);
		border-radius: 12px;
		text-align: center;
	}

	:global(body.dark) .feature {
		background: hsl(210 20% 15%);
	}

	.feature h3 {
		font-size: 1.5rem;
		margin-bottom: 0.5rem;
		color: hsl(210 60% 40%);
	}

	:global(body.dark) .feature h3 {
		color: hsl(210 60% 60%);
	}

	.feature p {
		color: hsl(210 10% 40%);
		line-height: 1.6;
	}

	:global(body.dark) .feature p {
		color: hsl(210 10% 70%);
	}
</style>