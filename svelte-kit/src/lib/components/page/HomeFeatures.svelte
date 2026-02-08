<script lang="ts">
	const FEATURES: Array<{ icon: string; title: string; desc: string }> = [
		{
			icon: '📖',
			title: 'Read-To-Me',
			desc: 'Converts text to speech-friendly format for vision disabilities'
		},
		{
			icon: '✍️',
			title: 'Write-For-Me',
			desc: 'Drafts emails, corrects grammar, and adjusts tone for motor or cognitive support'
		},
		{
			icon: '🎨',
			title: 'Create-For-Me',
			desc: 'Generate images and videos from text; character profiles for consistent visuals'
		},
		{
			icon: '🧠',
			title: 'Remember-For-Me',
			desc: 'Creates reminders and tracks tasks for memory disabilities'
		},
		{
			icon: '🗣️',
			title: 'Say-It-For-Me',
			desc: 'Text-to-speech, quick phrases, and emergency mode for speech disabilities'
		},
		{
			icon: '👁️',
			title: 'See-For-Me',
			desc: 'Real-time camera vision: scene description, dangers, and navigation for blind and low-vision users'
		},
		{
			icon: '👂',
			title: 'Hear-For-Me',
			desc: 'Real-time audio: transcription, sound detection, speaker ID, and sentiment for deaf and hard-of-hearing users'
		},
		{
			icon: '🎯',
			title: 'Smart Orchestration',
			desc: 'Multiple agents work together to help you accomplish complex tasks'
		}
	];
</script>

<div class="features" id="panel-home">
	{#each FEATURES as f (f.title)}
		<div class="feature">
			<h3>{f.icon} {f.title}</h3>
			<p>{f.desc}</p>
		</div>
	{/each}
</div>

<style>
	.features {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
		gap: 2rem;
		margin-top: 1rem;
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
		font-size: 1.25rem;
		margin-bottom: 0.5rem;
		color: hsl(210 60% 40%);
	}

	:global(body.dark) .feature h3 {
		color: hsl(210 60% 60%);
	}

	.feature p {
		color: hsl(210 10% 40%);
		line-height: 1.6;
		font-size: 0.95rem;
	}

	:global(body.dark) .feature p {
		color: hsl(210 10% 70%);
	}
</style>
