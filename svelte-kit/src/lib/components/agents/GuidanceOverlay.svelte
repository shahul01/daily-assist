<script lang="ts">
	import type { WorkflowGuidance, UserGuidanceStep } from '$lib/utils/userGuidance';

	interface Props {
		guidance: WorkflowGuidance;
		onDismiss?: () => void;
		onSkipStep?: (step: UserGuidanceStep) => void;
		onNext?: () => void;
	}

	let { guidance, onDismiss, onSkipStep, onNext }: Props = $props();

	const current = $derived(
		guidance.steps[Math.max(0, Math.min(guidance.currentStep, guidance.steps.length - 1))]
	);
	const progress = $derived(`${guidance.currentStep + 1} / ${guidance.steps.length}`);
</script>

<div class="guidance-overlay" role="dialog" aria-label="Step-by-step guidance">
	<div class="guidance-card">
		<header class="guidance-header">
			<h3 class="guidance-title">{guidance.workflowName}</h3>
			<span class="guidance-progress" aria-live="polite">{progress}</span>
			{#if onDismiss}
				<button
					type="button"
					class="guidance-close"
					onclick={onDismiss}
					aria-label="Close guidance"
				>
					Close
				</button>
			{/if}
		</header>
		{#if current}
			<p class="guidance-instruction">{current.instruction}</p>
			<div class="guidance-actions">
				{#if current.skippable && onSkipStep}
					<button
						type="button"
						class="guidance-skip"
						onclick={() => onSkipStep(current)}
						aria-label="Skip this step"
					>
						Skip
					</button>
				{/if}
				{#if onNext && guidance.currentStep < guidance.steps.length - 1}
					<button type="button" class="guidance-next" onclick={onNext}>Next</button>
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
	.guidance-overlay {
		position: fixed;
		inset: 0;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding: 1rem;
		background: hsl(210 20% 20% / 0.5);
		z-index: 100;
	}
	:global(body.dark) .guidance-overlay {
		background: hsl(210 20% 5% / 0.6);
	}
	.guidance-card {
		background: white;
		border-radius: 12px;
		box-shadow: 0 8px 24px hsl(210 30% 20% / 0.2);
		max-width: 28rem;
		width: 100%;
		padding: 1.25rem;
	}
	:global(body.dark) .guidance-card {
		background: hsl(210 20% 16%);
		box-shadow: 0 8px 24px hsl(0 0% 0% / 0.4);
	}
	.guidance-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin-bottom: 1rem;
	}
	.guidance-title {
		margin: 0;
		font-size: 1.1rem;
		font-weight: 600;
		color: hsl(210 60% 25%);
	}
	:global(body.dark) .guidance-title {
		color: hsl(210 50% 75%);
	}
	.guidance-progress {
		font-size: 0.85rem;
		opacity: 0.85;
	}
	.guidance-close {
		margin-left: auto;
		background: transparent;
		border: 1px solid currentColor;
		padding: 0.35rem 0.6rem;
		border-radius: 6px;
		font-size: 0.9rem;
		cursor: pointer;
	}
	.guidance-instruction {
		margin: 0 0 1rem;
		line-height: 1.5;
		color: hsl(210 30% 20%);
	}
	:global(body.dark) .guidance-instruction {
		color: hsl(210 20% 88%);
	}
	.guidance-actions {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.guidance-skip {
		background: transparent;
		color: inherit;
		border: 1px solid currentColor;
		padding: 0.5rem 0.75rem;
		border-radius: 8px;
		font-size: 0.9rem;
		cursor: pointer;
	}
	.guidance-next {
		background: hsl(210 60% 45%);
		color: white;
		border: none;
		padding: 0.5rem 0.75rem;
		border-radius: 8px;
		font-size: 0.9rem;
		cursor: pointer;
	}
	:global(body.dark) .guidance-next {
		background: hsl(210 55% 50%);
	}
</style>
