<script lang="ts">
	import type { AgentId } from '$lib/stores/tabState';
	import ReadAgent from '$lib/components/agents/ReadAgent.svelte';
	import CameraReader from '$lib/components/agents/CameraReader.svelte';
	import WriteAgent from '$lib/components/agents/WriteAgent.svelte';
	import SayAgent from '$lib/components/agents/SayAgent.svelte';
	import RememberAgent from '$lib/components/agents/RememberAgent.svelte';
	import SeeAgent from '$lib/components/agents/SeeAgent.svelte';
	import HearAgent from '$lib/components/agents/HearAgent.svelte';
	import CreateAgent from '$lib/components/agents/CreateAgent.svelte';
	import CalendarView from '$lib/components/agents/CalendarView.svelte';
	import PatternDashboard from '$lib/components/agents/PatternDashboard.svelte';

	interface Props {
		agent: AgentId;
		userId: string;
	}
	let { agent, userId }: Props = $props();
</script>

<div
	class="agent-content"
	id="panel-agent-{agent}"
	role="tabpanel"
	aria-labelledby="tab-agent-{agent}"
>
	{#if agent === 'read'}
		<section class="section" aria-labelledby="read-to-me-heading">
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
	{:else if agent === 'write'}
		<section class="section" aria-labelledby="write-for-me-heading">
			<h2 id="write-for-me-heading" class="section-heading">✍️ Write-For-Me</h2>
			<p class="section-desc">
				Compose emails, correct grammar, adjust tone. Use voice dictation or choose from templates.
			</p>
			<WriteAgent {userId} />
		</section>
	{:else if agent === 'create'}
		<section class="section" aria-labelledby="create-for-me-heading">
			<h2 id="create-for-me-heading" class="section-heading">🎨 Create-For-Me</h2>
			<p class="section-desc">
				Generate images (up to 4K) and short videos from prompts. Use character profiles for
				consistency. Media expires after 3 days.
			</p>
			<CreateAgent {userId} />
		</section>
	{:else if agent === 'say'}
		<section class="section" aria-labelledby="say-it-for-me-heading">
			<h2 id="say-it-for-me-heading" class="section-heading">🗣️ Say-It-For-Me</h2>
			<p class="section-desc">
				Speak for you: type or pick quick phrases, set emotion, or use emergency mode for urgent
				repeated speech.
			</p>
			<SayAgent />
		</section>
	{:else if agent === 'see'}
		<section class="section" aria-labelledby="see-for-me-heading">
			<h2 id="see-for-me-heading" class="section-heading">👁️ See-For-Me</h2>
			<p class="section-desc">
				Real-time vision: scene description, object detection, danger alerts, and navigation help.
				Voice modes: auto, smart alerts, or manual.
			</p>
			<SeeAgent {userId} />
		</section>
	{:else if agent === 'hear'}
		<section class="section" aria-labelledby="hear-for-me-heading">
			<h2 id="hear-for-me-heading" class="section-heading">👂 Hear-For-Me</h2>
			<p class="section-desc">
				Real-time audio: live transcription, sound detection (doorbell, alarm, crying), speaker
				identification, and sentiment. Speak alerts on or off.
			</p>
			<HearAgent {userId} />
		</section>
	{:else if agent === 'remember'}
		<section class="section" aria-labelledby="remember-for-me-heading">
			<h2 id="remember-for-me-heading" class="section-heading">🧠 Remember-For-Me</h2>
			<p class="section-desc">
				Medication reminders, tasks, and appointments. Track adherence and view patterns.
			</p>
			<div class="remember-widgets">
				<RememberAgent />
				<CalendarView {userId} />
				<PatternDashboard {userId} />
			</div>
		</section>
	{/if}
</div>

<style>
	.agent-content .section {
		margin-top: 1rem;
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
</style>
