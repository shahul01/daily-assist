<script lang="ts">
	import AgentPanel from '$lib/components/agents/AgentPanel.svelte';
	import ReadAgent from '$lib/components/agents/ReadAgent.svelte';
	import CameraReader from '$lib/components/agents/CameraReader.svelte';
	import WriteAgent from '$lib/components/agents/WriteAgent.svelte';
	import SayAgent from '$lib/components/agents/SayAgent.svelte';
	import RememberAgent from '$lib/components/agents/RememberAgent.svelte';
	import CalendarView from '$lib/components/agents/CalendarView.svelte';
	import PatternDashboard from '$lib/components/agents/PatternDashboard.svelte';
	import { getOrCreateUserId } from '$lib/supabase';
	import { onMount } from 'svelte';

	let writeAgentUserId = $state<string>('');
	onMount(() => {
		getOrCreateUserId().then((id) => {
			writeAgentUserId = id ?? '';
		});
	});
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

	<section class="read-section" aria-labelledby="read-to-me-heading">
		<h2 id="read-to-me-heading" class="section-heading">📖 Read-To-Me</h2>
		<p class="section-desc">
			Convert text, images, and PDFs to speech-friendly format. Use the camera for real-time text
			detection.
		</p>
		<div class="read-widgets">
			<ReadAgent />
			<CameraReader />
		</div>
	</section>

	<section class="write-section" aria-labelledby="write-for-me-heading">
		<h2 id="write-for-me-heading" class="section-heading">✍️ Write-For-Me</h2>
		<p class="section-desc">
			Compose emails, correct grammar, adjust tone. Use voice dictation or choose from templates.
		</p>
		<WriteAgent userId={writeAgentUserId} />
	</section>

	<section class="say-section" aria-labelledby="say-it-for-me-heading">
		<h2 id="say-it-for-me-heading" class="section-heading">🗣️ Say-It-For-Me</h2>
		<p class="section-desc">
			Speak for you: type or pick quick phrases, set emotion, or use emergency mode for urgent
			repeated speech.
		</p>
		<SayAgent />
	</section>

	<section class="remember-section" aria-labelledby="remember-for-me-heading">
		<h2 id="remember-for-me-heading" class="section-heading">🧠 Remember-For-Me</h2>
		<p class="section-desc">
			Medication reminders, tasks, and appointments. Track adherence and view patterns.
		</p>
		<div class="remember-widgets">
			<RememberAgent />
			<CalendarView userId={writeAgentUserId} />
			<PatternDashboard userId={writeAgentUserId} />
		</div>
	</section>

	<div class="features">
		<div class="feature">
			<h3>📖 Read-To-Me</h3>
			<p>Converts text to speech-friendly format for vision disabilities</p>
		</div>

		<div class="feature">
			<h3>✍️ Write-For-Me</h3>
			<p>Drafts emails, corrects grammar, and adjusts tone for motor or cognitive support</p>
		</div>

		<div class="feature">
			<h3>🧠 Remember-For-Me</h3>
			<p>Creates reminders and tracks tasks for memory disabilities</p>
		</div>

		<div class="feature">
			<h3>🗣️ Say-It-For-Me</h3>
			<p>Text-to-speech, quick phrases, and emergency mode for speech disabilities</p>
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

	.read-section,
	.write-section,
	.say-section,
	.remember-section {
		margin-top: 2.5rem;
	}

	.remember-widgets {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
		gap: 1.5rem;
	}

	.section-heading {
		font-size: 1.5rem;
		color: hsl(210 60% 40%);
		margin-bottom: 0.25rem;
	}

	:global(body.dark) .section-heading {
		color: hsl(210 60% 60%);
	}

	.section-desc {
		color: hsl(210 10% 40%);
		margin-bottom: 1rem;
	}

	:global(body.dark) .section-desc {
		color: hsl(210 10% 70%);
	}

	.read-widgets {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
		gap: 1.5rem;
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
