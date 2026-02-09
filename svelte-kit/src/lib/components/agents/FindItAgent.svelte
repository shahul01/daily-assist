<script lang="ts">
</script>

<div class="find-it-panel">
	<p class="find-it-desc">
		Search, navigate, and locate files. Use the chat to ask for file search—you’ll be directed here
		for full access. In the future you can pick a folder to search from this panel.
	</p>
</div>

<style>
	.find-it-panel {
		padding: 1rem;
		background: hsl(210 20% 98%);
		border-radius: 12px;
		border: 1px solid hsl(210 20% 88%);
	}
	:global(body.dark) .find-it-panel {
		background: hsl(210 20% 18%);
		border-color: hsl(210 20% 28%);
	}
	.find-it-desc {
		margin: 0;
		color: hsl(210 20% 35%);
		font-size: 0.9375rem;
		line-height: 1.5;
	}
	:global(body.dark) .find-it-desc {
		color: hsl(210 15% 75%);
	}
</style>
