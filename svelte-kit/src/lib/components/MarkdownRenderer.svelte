<script lang="ts">
	import { marked } from 'marked';
	import DOMPurify from 'dompurify';

	interface Props {
		content: string;
		isStreaming?: boolean;
	}

	let { content = '', isStreaming = false }: Props = $props();

	let isCopied = $state(false);

	// Configure marked for better output
	marked.setOptions({
		breaks: true,
		gfm: true
	});

	// Parse markdown to HTML
	function renderMarkdown(text: string): string {
		if (!text) return '';
		try {
			const html = marked.parse(text) as string;
			return DOMPurify.sanitize(html, {
				ALLOWED_TAGS: [
					'p',
					'br',
					'strong',
					'em',
					'h1',
					'h2',
					'h3',
					'h4',
					'h5',
					'h6',
					'ul',
					'ol',
					'li',
					'code',
					'pre',
					'blockquote',
					'a',
					'img',
					'table',
					'thead',
					'tbody',
					'tr',
					'th',
					'td'
				],
				ALLOWED_ATTR: ['href', 'title', 'src', 'alt', 'target', 'rel']
			});
		} catch {
			return DOMPurify.sanitize(text);
		}
	}

	function copyToClipboard() {
		navigator.clipboard.writeText(content).then(() => {
			isCopied = true;
			setTimeout(() => {
				isCopied = false;
			}, 2000);
		});
	}

	function exportAsMarkdown() {
		const element = document.createElement('a');
		const file = new Blob([content], { type: 'text/markdown' });
		element.href = URL.createObjectURL(file);
		element.download = `response-${new Date().toISOString().slice(0, 10)}.md`;
		document.body.appendChild(element);
		element.click();
		document.body.removeChild(element);
		URL.revokeObjectURL(element.href);
	}
</script>

<div class="markdown-renderer">
	<div class="markdown-content">
		{@html renderMarkdown(content)}
		{#if isStreaming}
			<span class="streaming-indicator">▌</span>
		{/if}
	</div>

	{#if content}
		<div class="action-buttons">
			<button
				type="button"
				onclick={copyToClipboard}
				class="action-btn copy-btn"
				title="Copy response to clipboard"
			>
				{isCopied ? '✓ Copied!' : '📋 Copy'}
			</button>
			<button
				type="button"
				onclick={exportAsMarkdown}
				class="action-btn export-btn"
				title="Download response as Markdown file"
			>
				⬇ Export as MD
			</button>
		</div>
	{/if}
</div>

<style>
	.markdown-renderer {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.markdown-content {
		line-height: 1.6;
		word-wrap: break-word;
		overflow-wrap: break-word;
	}

	/* Markdown Elements Styling */
	:global(.markdown-content h1) {
		font-size: 1.8rem;
		font-weight: 700;
		margin: 1.5rem 0 0.5rem;
		color: hsl(210 60% 35%);
	}

	:global(body.dark .markdown-content h1) {
		color: hsl(210 60% 65%);
	}

	:global(.markdown-content h2) {
		font-size: 1.5rem;
		font-weight: 700;
		margin: 1.25rem 0 0.4rem;
		color: hsl(210 60% 40%);
	}

	:global(body.dark .markdown-content h2) {
		color: hsl(210 60% 60%);
	}

	:global(.markdown-content h3) {
		font-size: 1.25rem;
		font-weight: 600;
		margin: 1rem 0 0.3rem;
		color: hsl(210 60% 45%);
	}

	:global(body.dark .markdown-content h3) {
		color: hsl(210 60% 55%);
	}

	:global(.markdown-content h4, .markdown-content h5, .markdown-content h6) {
		font-weight: 600;
		margin: 0.75rem 0 0.25rem;
		color: hsl(210 50% 50%);
	}

	:global(
		body.dark .markdown-content h4,
		body.dark .markdown-content h5,
		body.dark .markdown-content h6
	) {
		color: hsl(210 50% 50%);
	}

	:global(.markdown-content p) {
		margin: 0.5rem 0;
	}

	:global(.markdown-content ul, .markdown-content ol) {
		margin: 0.75rem 0;
		padding-left: 1.5rem;
	}

	:global(.markdown-content li) {
		margin: 0.25rem 0;
	}

	:global(.markdown-content code) {
		background: hsl(210 15% 92%);
		color: hsl(210 60% 30%);
		padding: 0.2rem 0.4rem;
		border-radius: 4px;
		font-family: 'Monaco', 'Courier New', monospace;
		font-size: 0.9rem;
	}

	:global(body.dark .markdown-content code) {
		background: hsl(210 20% 25%);
		color: hsl(210 80% 80%);
	}

	:global(.markdown-content pre) {
		background: hsl(210 20% 12%);
		color: hsl(210 80% 85%);
		padding: 1rem;
		border-radius: 8px;
		overflow-x: auto;
		margin: 1rem 0;
		line-height: 1.4;
		border-left: 4px solid hsl(210 60% 50%);
	}

	:global(body.dark .markdown-content pre) {
		background: hsl(210 20% 10%);
		color: hsl(210 80% 90%);
	}

	:global(.markdown-content pre code) {
		background: none;
		color: inherit;
		padding: 0;
		font-size: 0.9rem;
	}

	:global(.markdown-content blockquote) {
		border-left: 4px solid hsl(210 60% 50%);
		padding-left: 1rem;
		margin: 1rem 0;
		color: hsl(210 20% 45%);
		font-style: italic;
	}

	:global(body.dark .markdown-content blockquote) {
		color: hsl(210 20% 65%);
	}

	:global(.markdown-content a) {
		color: hsl(210 80% 50%);
		text-decoration: underline;
		word-break: break-word;
	}

	:global(body.dark .markdown-content a) {
		color: hsl(210 80% 60%);
	}

	:global(.markdown-content a:hover) {
		color: hsl(210 80% 40%);
	}

	:global(body.dark .markdown-content a:hover) {
		color: hsl(210 80% 70%);
	}

	:global(.markdown-content table) {
		border-collapse: collapse;
		width: 100%;
		margin: 1rem 0;
	}

	:global(.markdown-content th, .markdown-content td) {
		border: 1px solid hsl(210 20% 85%);
		padding: 0.75rem;
		text-align: left;
	}

	:global(body.dark .markdown-content th, body.dark .markdown-content td) {
		border-color: hsl(210 20% 30%);
	}

	:global(.markdown-content th) {
		background: hsl(210 20% 92%);
		font-weight: 600;
		color: hsl(210 60% 35%);
	}

	:global(body.dark .markdown-content th) {
		background: hsl(210 20% 25%);
		color: hsl(210 60% 65%);
	}

	:global(.markdown-content strong) {
		font-weight: 700;
		color: hsl(210 60% 30%);
	}

	:global(body.dark .markdown-content strong) {
		color: hsl(210 60% 70%);
	}

	:global(.markdown-content em) {
		font-style: italic;
	}

	.action-buttons {
		display: flex;
		gap: 0.75rem;
		margin-top: 0.5rem;
		padding-top: 0.75rem;
		border-top: 1px solid hsl(210 20% 85%);
		flex-wrap: wrap;
	}

	:global(body.dark) .action-buttons {
		border-top-color: hsl(210 20% 30%);
	}

	.action-btn {
		padding: 0.5rem 1rem;
		border: 1px solid hsl(210 60% 50%);
		background: white;
		color: hsl(210 60% 50%);
		border-radius: 6px;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	:global(body.dark) .action-btn {
		background: hsl(210 20% 18%);
		border-color: hsl(210 60% 60%);
		color: hsl(210 60% 60%);
	}

	.action-btn:hover {
		background: hsl(210 60% 50%);
		color: white;
	}

	:global(body.dark) .action-btn:hover {
		background: hsl(210 60% 50%);
		color: white;
	}

	.action-btn:active {
		transform: scale(0.98);
	}

	.copy-btn {
		border-color: hsl(210 60% 50%);
		color: hsl(210 60% 50%);
	}

	:global(body.dark) .copy-btn {
		border-color: hsl(210 60% 60%);
		color: hsl(210 60% 60%);
	}

	.export-btn {
		border-color: hsl(150 60% 45%);
		color: hsl(150 60% 45%);
	}

	:global(body.dark) .export-btn {
		border-color: hsl(150 60% 55%);
		color: hsl(150 60% 55%);
	}

	.export-btn:hover {
		background: hsl(150 60% 45%);
		color: white;
	}

	:global(body.dark) .export-btn:hover {
		background: hsl(150 60% 55%);
		color: white;
	}

	.streaming-indicator {
		display: inline-block;
		color: hsl(210 60% 50%);
		animation: pulse 0.8s ease-in-out infinite;
		margin-left: 0.25rem;
	}

	:global(body.dark) .streaming-indicator {
		color: hsl(210 60% 60%);
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.4;
		}
	}
</style>
