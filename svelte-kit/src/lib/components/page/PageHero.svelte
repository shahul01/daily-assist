<script lang="ts">
	// No props: static hero for the app
</script>

<div class="hero">
	<h1>DailyAssist</h1>
	<p>Your AI companion helping with reading, writing, finding, remembering, and communicating</p>
</div>

<style>
	.hero {
		text-align: center;
		padding: 1.5rem 0;
	}

	h1 {
		font-size: 2rem;
		color: hsl(210 60% 40%);
		margin-bottom: 0.5rem;
	}

	:global(body.dark) h1 {
		color: hsl(210 60% 60%);
	}

	.hero p {
		font-size: 1.1rem;
		color: hsl(210 10% 40%);
	}

	:global(body.dark) .hero p {
		color: hsl(210 10% 70%);
	}

	@media (max-width: 640px) {
		h1 {
			font-size: 1.75rem;
		}
	}
</style>
