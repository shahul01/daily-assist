<script lang="ts">
	import {
		listConversations,
		getConversation,
		deleteConversation
	} from '$lib/utils/conversationStorage';
	import type { StoredConversation } from '$lib/types/conversation';

	interface Props {
		open: boolean;
		onClose: () => void;
		onRestore: (conversation: StoredConversation) => void;
	}

	let { open, onClose, onRestore }: Props = $props();

	let sessions = $state<StoredConversation[]>([]);
	let loading = $state(false);
	let deletingId = $state<string | null>(null);

	function load() {
		if (!open) return;
		loading = true;
		try {
			sessions = listConversations();
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (open) load();
	});

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function handleRestore(s: StoredConversation) {
		const data = getConversation(s.id);
		if (data) {
			onRestore(data);
			onClose();
		}
	}

	function handleDelete(e: MouseEvent, s: StoredConversation) {
		e.stopPropagation();
		if (!confirm('Delete this conversation?')) return;
		deletingId = s.id;
		try {
			deleteConversation(s.id);
			sessions = listConversations();
		} finally {
			deletingId = null;
		}
	}
</script>

{#if open}
	<button
		type="button"
		class="backdrop"
		aria-label="Close history"
		onclick={onClose}
		onkeydown={(e) => e.key === 'Escape' && onClose()}
	></button>
	<div class="modal" role="dialog" aria-modal="true" aria-label="Conversation history">
		<div class="modal-inner">
			<header class="modal-header">
				<h2>Conversation history</h2>
				<button type="button" class="close-btn" onclick={onClose} aria-label="Close">×</button>
			</header>
			<div class="modal-body">
				{#if loading}
					<p class="muted">Loading…</p>
				{:else if sessions.length === 0}
					<p class="muted">No conversations yet. Your chats will appear here.</p>
				{:else}
					<ul class="session-list">
						{#each sessions as s (s.id)}
							<li class="session-item">
								<button type="button" class="session-item-restore" onclick={() => handleRestore(s)}>
									<div class="session-meta">
										<strong>{formatDate(s.createdAt)}</strong>
										<span class="badge">{s.iterationsCount} iteration(s)</span>
									</div>
									<div class="session-input-preview">
										{s.userInput.slice(0, 60)}{s.userInput.length > 60 ? '…' : ''}
									</div>
									{#if s.finalResponse}
										<div class="session-response-preview">
											{s.finalResponse.slice(0, 80)}{s.finalResponse.length > 80 ? '…' : ''}
										</div>
									{/if}
								</button>
								<button
									type="button"
									class="delete-btn"
									aria-label="Delete conversation"
									disabled={deletingId === s.id}
									onclick={(e) => handleDelete(e, s)}
								>
									{deletingId === s.id ? '…' : 'Delete'}
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: hsla(210 20% 10% / 0.35);
		border: none;
		cursor: pointer;
		z-index: 100;
	}
	:global(body.dark) .backdrop {
		background: hsla(0 0% 0% / 0.5);
	}

	.modal {
		position: fixed;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		z-index: 101;
		pointer-events: none;
	}
	.modal-inner {
		pointer-events: auto;
		width: 100%;
		max-width: 420px;
		max-height: 85vh;
		display: flex;
		flex-direction: column;
		background: hsl(210 20% 98%);
		border-radius: 12px;
		box-shadow: 0 8px 32px hsla(210 20% 20% / 0.15);
	}
	:global(body.dark) .modal-inner {
		background: hsl(210 20% 14%);
		box-shadow: 0 8px 32px hsla(0 0% 0% / 0.4);
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid hsl(210 10% 90%);
		flex-shrink: 0;
	}
	:global(body.dark) .modal-header {
		border-bottom-color: hsl(210 20% 25%);
	}
	.modal-header h2 {
		margin: 0;
		font-size: 1.125rem;
		color: hsl(210 60% 40%);
	}
	:global(body.dark) .modal-header h2 {
		color: hsl(210 60% 60%);
	}
	.close-btn {
		background: none;
		border: none;
		font-size: 1.5rem;
		line-height: 1;
		color: hsl(210 20% 45%);
		cursor: pointer;
		padding: 0.25rem;
	}
	.close-btn:hover {
		color: hsl(210 20% 25%);
	}
	:global(body.dark) .close-btn {
		color: hsl(210 15% 65%);
	}
	:global(body.dark) .close-btn:hover {
		color: hsl(210 15% 85%);
	}

	.modal-body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 1rem 1.25rem;
	}

	.muted {
		font-size: 0.9rem;
		color: hsl(210 20% 50%);
		margin: 0;
	}
	:global(body.dark) .muted {
		color: hsl(210 15% 60%);
	}

	.session-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.session-item {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		padding: 0.5rem;
		background: hsl(210 15% 96%);
		border-radius: 10px;
		border: 1px solid hsl(210 20% 88%);
		transition:
			background 0.15s,
			border-color 0.15s;
	}
	:global(body.dark) .session-item {
		background: hsl(210 20% 18%);
		border-color: hsl(210 20% 28%);
	}
	.session-item-restore {
		flex: 1;
		min-width: 0;
		padding: 0.5rem;
		margin: 0;
		background: none;
		border: none;
		border-radius: 8px;
		cursor: pointer;
		text-align: left;
		font: inherit;
		color: inherit;
	}
	.session-item-restore:hover {
		background: hsl(210 20% 92%);
	}
	:global(body.dark) .session-item-restore:hover {
		background: hsl(210 22% 24%);
	}
	.session-meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.35rem;
		font-size: 0.85rem;
	}
	.session-meta strong {
		color: hsl(210 50% 35%);
	}
	:global(body.dark) .session-meta strong {
		color: hsl(210 50% 65%);
	}
	.badge {
		font-size: 0.75rem;
		padding: 0.2rem 0.5rem;
		background: hsl(210 60% 92%);
		color: hsl(210 60% 40%);
		border-radius: 6px;
	}
	:global(body.dark) .badge {
		background: hsl(210 50% 22%);
		color: hsl(210 60% 70%);
	}
	.session-input-preview,
	.session-response-preview {
		font-size: 0.9rem;
		color: hsl(210 15% 40%);
		margin-top: 0.25rem;
	}
	:global(body.dark) .session-input-preview,
	:global(body.dark) .session-response-preview {
		color: hsl(210 15% 75%);
	}
	.session-response-preview {
		opacity: 0.9;
	}
	.delete-btn {
		flex-shrink: 0;
		padding: 0.35rem 0.75rem;
		font-size: 0.8rem;
		background: transparent;
		color: hsl(0 60% 50%);
		border: 1px solid hsl(0 50% 75%);
		border-radius: 6px;
		cursor: pointer;
	}
	.delete-btn:hover:not(:disabled) {
		background: hsl(0 60% 96%);
	}
	.delete-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	:global(body.dark) .delete-btn {
		color: hsl(0 55% 60%);
		border-color: hsl(0 40% 40%);
	}
	:global(body.dark) .delete-btn:hover:not(:disabled) {
		background: hsl(0 30% 20%);
	}
</style>
