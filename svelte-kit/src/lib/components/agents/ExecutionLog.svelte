<script lang="ts">
	export interface LogEntry {
		type:
			| 'action'
			| 'iteration_start'
			| 'iteration_complete'
			| 'verification'
			| 'final'
			| 'parallel_start'
			| 'parallel_complete';
		iteration?: number;
		agent?: string;
		action?: string;
		resultSummary?: string;
		message?: string;
		/** For parallel_start: comma-separated agent/action labels */
		parallelActions?: string;
		status?: 'running' | 'success' | 'error';
		timestamp?: string;
	}

	interface Props {
		logEntries: LogEntry[];
		isRunning?: boolean;
		currentIteration?: number;
		maxIterations?: number;
		onClose?: () => void;
	}

	let {
		logEntries = [],
		isRunning = false,
		currentIteration = 0,
		maxIterations = 10,
		onClose
	}: Props = $props();

	let logContainer: HTMLDivElement;

	function formatEntry(entry: LogEntry): string {
		if (entry.type === 'action' && entry.agent != null && entry.action != null) {
			const result = entry.resultSummary ?? (entry.status === 'error' ? 'error' : 'ok');
			return `[${entry.agent}] ${entry.action} → ${result}`;
		}
		if (entry.type === 'iteration_start' && entry.iteration != null) {
			return `Iteration ${entry.iteration}/${maxIterations}`;
		}
		if (entry.type === 'iteration_complete') {
			return entry.message ?? 'Iteration complete';
		}
		if (entry.type === 'verification') {
			return entry.message ?? 'Verification';
		}
		if (entry.type === 'parallel_start') {
			return entry.parallelActions
				? `Parallel: ${entry.parallelActions}`
				: 'Parallel batch started';
		}
		if (entry.type === 'parallel_complete') {
			return entry.message ?? 'Parallel batch complete';
		}
		if (entry.type === 'final') {
			return entry.message ?? 'Done';
		}
		return entry.message ?? '';
	}

	function entryClass(entry: LogEntry): string {
		const base = 'log-entry';
		const status =
			entry.status === 'error'
				? ' log-entry-error'
				: entry.status === 'success'
					? ' log-entry-success'
					: '';
		const type = entry.type === 'final' ? ' log-entry-final' : '';
		const parallel =
			entry.type === 'parallel_start' || entry.type === 'parallel_complete'
				? ' log-entry-parallel'
				: '';
		return base + status + type + parallel;
	}

	$effect(() => {
		if (logContainer && logEntries.length > 0) {
			logContainer.scrollTop = logContainer.scrollHeight;
		}
	});
</script>

<div class="execution-log" role="log" aria-live="polite" aria-label="Execution log">
	<div class="log-header">
		<h3 class="log-title">Execution</h3>
		{#if isRunning}
			<span class="log-badge log-badge-running">Iteration {currentIteration}/{maxIterations}</span>
		{:else if logEntries.length > 0}
			<span class="log-badge log-badge-done">Done</span>
		{/if}
		{#if onClose}
			<button type="button" class="log-close" onclick={onClose} aria-label="Close log">Close</button
			>
		{/if}
	</div>

	<div class="log-scroll" bind:this={logContainer}>
		{#if logEntries.length === 0 && !isRunning}
			<p class="log-empty">No execution entries yet.</p>
		{:else}
			<ul class="log-list">
				{#each logEntries as entry, i (i)}
					<li class={entryClass(entry)}>
						{#if entry.type === 'iteration_start'}
							<span class="log-iteration-marker">--- {formatEntry(entry)} ---</span>
						{:else if entry.type === 'final' && entry.message}
							<div class="log-final-message">{entry.message}</div>
						{:else}
							<span class="log-text">{formatEntry(entry)}</span>
							{#if entry.status === 'running'}
								<span class="log-status" aria-label="Running">...</span>
							{/if}
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>

<style>
	.execution-log {
		background: hsl(210 15% 96%);
		border: 1px solid hsl(210 30% 88%);
		border-radius: 12px;
		box-shadow: 0 2px 6px hsla(210 20% 20% / 0.08);
		margin-bottom: 1rem;
		max-width: 600px;
		overflow: hidden;
	}
	:global(body.dark) .execution-log {
		background: hsl(210 20% 16%);
		border-color: hsl(210 30% 30%);
		box-shadow: 0 2px 6px hsla(0 0% 0% / 0.25);
	}

	.log-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		padding: 0.5rem 1rem;
		border-bottom: 1px solid hsl(210 30% 88%);
		background: hsl(210 25% 94%);
	}
	:global(body.dark) .log-header {
		border-bottom-color: hsl(210 30% 28%);
		background: hsl(210 25% 22%);
	}
	.log-title {
		font-size: 0.9375rem;
		font-weight: 600;
		color: hsl(210 40% 30%);
		margin: 0;
	}
	:global(body.dark) .log-title {
		color: hsl(210 40% 80%);
	}
	.log-badge {
		font-size: 0.75rem;
		padding: 0.2rem 0.5rem;
		border-radius: 6px;
		font-weight: 500;
	}
	.log-badge-running {
		background: hsl(210 60% 90%);
		color: hsl(210 60% 35%);
	}
	:global(body.dark) .log-badge-running {
		background: hsl(210 50% 25%);
		color: hsl(210 60% 70%);
	}
	.log-badge-done {
		background: hsl(142 45% 90%);
		color: hsl(142 45% 28%);
	}
	:global(body.dark) .log-badge-done {
		background: hsl(142 35% 22%);
		color: hsl(142 50% 65%);
	}
	.log-close {
		margin-left: auto;
		font-size: 0.8125rem;
		padding: 0.2rem 0.5rem;
		border-radius: 6px;
		border: 1px solid hsl(210 40% 80%);
		background: transparent;
		color: hsl(210 50% 35%);
		cursor: pointer;
	}
	.log-close:hover {
		background: hsl(210 40% 90%);
	}
	:global(body.dark) .log-close {
		border-color: hsl(210 40% 35%);
		color: hsl(210 50% 75%);
	}
	.log-close:hover {
		background: hsl(210 30% 28%);
	}

	.log-scroll {
		max-height: 400px;
		overflow-y: auto;
		padding: 0.5rem 1rem;
	}
	.log-empty {
		font-size: 0.875rem;
		color: hsl(210 20% 55%);
		margin: 0;
	}
	:global(body.dark) .log-empty {
		color: hsl(210 20% 65%);
	}
	.log-list {
		margin: 0;
		padding: 0;
		list-style: none;
		font-family: ui-monospace, monospace;
		font-size: 0.8125rem;
		line-height: 1.5;
	}
	.log-entry {
		padding: 0.25rem 0;
		border-bottom: 1px solid transparent;
		color: hsl(210 30% 28%);
	}
	:global(body.dark) .log-entry {
		color: hsl(210 25% 82%);
	}
	.log-entry-success {
		color: hsl(142 45% 30%);
	}
	:global(body.dark) .log-entry-success {
		color: hsl(142 50% 65%);
	}
	.log-entry-error {
		color: hsl(0 55% 42%);
	}
	:global(body.dark) .log-entry-error {
		color: hsl(0 60% 70%);
	}
	.log-entry-final {
		margin-top: 0.5rem;
		padding-top: 0.5rem;
		border-top: 1px solid hsl(210 30% 88%);
	}
	:global(body.dark) .log-entry-final {
		border-top-color: hsl(210 30% 28%);
	}
	.log-entry-parallel {
		border-left: 3px solid hsl(210 50% 55%);
		padding-left: 0.5rem;
	}
	:global(body.dark) .log-entry-parallel {
		border-left-color: hsl(210 55% 50%);
	}
	.log-iteration-marker {
		font-weight: 600;
		color: hsl(210 60% 45%);
	}
	:global(body.dark) .log-iteration-marker {
		color: hsl(210 60% 60%);
	}
	.log-final-message {
		white-space: pre-wrap;
		word-break: break-word;
	}
	.log-status {
		margin-left: 0.25rem;
		color: hsl(210 60% 50%);
	}
</style>
