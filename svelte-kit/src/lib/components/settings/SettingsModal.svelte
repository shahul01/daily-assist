<script lang="ts">
	import { onMount } from 'svelte';
	import { accessibilityStore } from '$lib/stores/accessibilityStore';
	import type { FontSizePreference, ReduceMotionPreference } from '$lib/stores/accessibilityStore';

	interface Props {
		open: boolean;
		onclose: () => void;
	}
	let { open, onclose }: Props = $props();

	type TabId = 'general' | 'accessibility';
	let activeTab = $state<TabId>('accessibility');

	let a11yState = $state({
		fontSize: 'normal' as FontSizePreference,
		highContrast: false,
		reduceMotion: 'system' as ReduceMotionPreference
	});

	onMount(() => {
		const unsub = accessibilityStore.subscribe((s) => {
			a11yState = { ...s };
		});
		return unsub;
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}

	function setFontSize(v: FontSizePreference) {
		accessibilityStore.setFontSize(v);
	}
	function setHighContrast(v: boolean) {
		accessibilityStore.setHighContrast(v);
	}
	function setReduceMotion(v: ReduceMotionPreference) {
		accessibilityStore.setReduceMotion(v);
	}
</script>

{#if open}
	<div class="modal-backdrop" role="presentation" onclick={onclose} onkeydown={handleKeydown}>
		<div
			class="modal"
			role="dialog"
			aria-modal="true"
			aria-label="Settings"
			aria-labelledby="settings-title"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			onkeydown={handleKeydown}
		>
			<header class="modal-header">
				<h2 id="settings-title">Settings</h2>
				<button type="button" class="close-btn" aria-label="Close settings" onclick={onclose}
					>✕</button
				>
			</header>

			<div class="tabs" role="tablist" aria-label="Settings sections">
				<button
					type="button"
					role="tab"
					aria-selected={activeTab === 'general'}
					aria-controls="panel-general"
					id="tab-general"
					class="tab"
					class:tab-active={activeTab === 'general'}
					onclick={() => (activeTab = 'general')}
				>
					General
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={activeTab === 'accessibility'}
					aria-controls="panel-accessibility"
					id="tab-accessibility"
					class="tab"
					class:tab-active={activeTab === 'accessibility'}
					onclick={() => (activeTab = 'accessibility')}
				>
					Accessibility
				</button>
			</div>

			<div class="panel-wrap">
				{#if activeTab === 'general'}
					<div
						id="panel-general"
						role="tabpanel"
						aria-labelledby="tab-general"
						class="panel"
						hidden={activeTab !== 'general'}
					>
						<p class="muted">More options coming soon.</p>
					</div>
				{:else}
					<div
						id="panel-accessibility"
						role="tabpanel"
						aria-labelledby="tab-accessibility"
						class="panel"
						hidden={activeTab !== 'accessibility'}
					>
						<div class="setting-group" role="group" aria-label="Text size">
							<span class="setting-label">Text size</span>
							<div class="option-row">
								<button
									type="button"
									class="option-btn"
									class:option-active={a11yState.fontSize === 'normal'}
									onclick={() => setFontSize('normal')}
									aria-pressed={a11yState.fontSize === 'normal'}
								>
									Normal
								</button>
								<button
									type="button"
									class="option-btn"
									class:option-active={a11yState.fontSize === 'large'}
									onclick={() => setFontSize('large')}
									aria-pressed={a11yState.fontSize === 'large'}
								>
									Large
								</button>
							</div>
						</div>

						<div class="setting-group" role="group" aria-label="High contrast focus">
							<label class="setting-label">
								<input
									type="checkbox"
									class="checkbox"
									checked={a11yState.highContrast}
									onchange={(e) => setHighContrast((e.currentTarget as HTMLInputElement).checked)}
									aria-describedby="high-contrast-desc"
								/>
								<span>High contrast focus</span>
							</label>
							<p id="high-contrast-desc" class="setting-desc">
								Stronger focus outline for keyboard navigation.
							</p>
						</div>

						<div class="setting-group" role="group" aria-label="Reduce motion">
							<span class="setting-label">Reduce motion</span>
							<div class="option-row">
								<button
									type="button"
									class="option-btn"
									class:option-active={a11yState.reduceMotion === 'system'}
									onclick={() => setReduceMotion('system')}
									aria-pressed={a11yState.reduceMotion === 'system'}
								>
									System
								</button>
								<button
									type="button"
									class="option-btn"
									class:option-active={a11yState.reduceMotion === 'on'}
									onclick={() => setReduceMotion('on')}
									aria-pressed={a11yState.reduceMotion === 'on'}
								>
									On
								</button>
								<button
									type="button"
									class="option-btn"
									class:option-active={a11yState.reduceMotion === 'off'}
									onclick={() => setReduceMotion('off')}
									aria-pressed={a11yState.reduceMotion === 'off'}
								>
									Off
								</button>
							</div>
							<p class="setting-desc">
								System follows your OS preference. On forces reduced motion; Off allows full motion.
							</p>
						</div>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: hsla(210 20% 10% / 0.4);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
		padding: 1rem;
	}
	:global(body.dark) .modal-backdrop {
		background: hsla(0 0% 0% / 0.55);
	}

	.modal {
		background: hsl(210 25% 98%);
		border-radius: 1rem;
		box-shadow: 0 20px 40px hsla(210 20% 20% / 0.2);
		max-width: 420px;
		width: 100%;
		max-height: 90vh;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}
	:global(body.dark) .modal {
		background: hsl(210 20% 14%);
		box-shadow: 0 20px 40px hsla(0 0% 0% / 0.4);
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid hsl(210 15% 88%);
	}
	:global(body.dark) .modal-header {
		border-bottom-color: hsl(210 15% 22%);
	}

	.modal-header h2 {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 600;
		color: hsl(210 30% 20%);
	}
	:global(body.dark) .modal-header h2 {
		color: hsl(210 15% 92%);
	}

	.close-btn {
		width: 2.25rem;
		height: 2.25rem;
		border: none;
		border-radius: 0.5rem;
		background: transparent;
		color: hsl(210 20% 40%);
		font-size: 1.25rem;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.close-btn:hover {
		background: hsl(210 20% 92%);
		color: hsl(210 30% 25%);
	}
	:global(body.dark) .close-btn {
		color: hsl(210 15% 70%);
	}
	:global(body.dark) .close-btn:hover {
		background: hsl(210 20% 22%);
		color: hsl(210 15% 95%);
	}

	.tabs {
		display: flex;
		gap: 0;
		padding: 0 1rem;
		border-bottom: 1px solid hsl(210 15% 88%);
	}
	:global(body.dark) .tabs {
		border-bottom-color: hsl(210 15% 22%);
	}

	.tab {
		padding: 0.75rem 1rem;
		border: none;
		background: none;
		font-size: 0.9375rem;
		color: hsl(210 20% 45%);
		cursor: pointer;
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
	}
	.tab:hover {
		color: hsl(210 50% 40%);
	}
	.tab-active {
		color: hsl(210 60% 40%);
		font-weight: 500;
		border-bottom-color: hsl(210 60% 45%);
	}
	:global(body.dark) .tab {
		color: hsl(210 15% 65%);
	}
	:global(body.dark) .tab:hover {
		color: hsl(210 50% 65%);
	}
	:global(body.dark) .tab-active {
		color: hsl(210 55% 65%);
		border-bottom-color: hsl(210 55% 50%);
	}

	.panel-wrap {
		overflow: auto;
		flex: 1;
		min-height: 0;
	}

	.panel {
		padding: 1.25rem 1.25rem 1.5rem;
	}

	.setting-group {
		margin-bottom: 1.5rem;
	}
	.setting-group:last-child {
		margin-bottom: 0;
	}

	.setting-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 500;
		color: hsl(210 25% 25%);
		margin-bottom: 0.5rem;
		cursor: pointer;
	}
	:global(body.dark) .setting-label {
		color: hsl(210 15% 90%);
	}

	.setting-desc {
		font-size: 0.8125rem;
		color: hsl(210 15% 45%);
		margin: 0.25rem 0 0;
	}
	:global(body.dark) .setting-desc {
		color: hsl(210 15% 60%);
	}

	.option-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.option-btn {
		padding: 0.5rem 0.875rem;
		border: 1px solid hsl(210 20% 80%);
		border-radius: 0.5rem;
		background: hsl(210 20% 98%);
		font-size: 0.875rem;
		color: hsl(210 25% 30%);
		cursor: pointer;
	}
	.option-btn:hover {
		border-color: hsl(210 40% 60%);
		background: hsl(210 30% 95%);
	}
	.option-btn.option-active {
		background: hsl(210 60% 45%);
		border-color: hsl(210 60% 45%);
		color: white;
	}
	:global(body.dark) .option-btn {
		border-color: hsl(210 15% 35%);
		background: hsl(210 20% 20%);
		color: hsl(210 15% 88%);
	}
	:global(body.dark) .option-btn:hover {
		border-color: hsl(210 30% 40%);
		background: hsl(210 20% 28%);
	}
	:global(body.dark) .option-btn.option-active {
		background: hsl(210 55% 45%);
		border-color: hsl(210 55% 45%);
		color: white;
	}

	.checkbox {
		width: 1.125rem;
		height: 1.125rem;
		accent-color: hsl(210 60% 45%);
		cursor: pointer;
	}

	.muted {
		font-size: 0.9375rem;
		color: hsl(210 15% 50%);
		margin: 0;
	}
	:global(body.dark) .muted {
		color: hsl(210 15% 58%);
	}
</style>
