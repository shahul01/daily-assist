<script lang="ts">
	interface Props {
		id: string;
		message: string;
	}
	let { id, message }: Props = $props();
</script>

<div class="content-placeholder" {id}>
	<p>{message}</p>
</div>

<style>
	.content-placeholder {
		padding: 2rem;
		text-align: center;
		color: hsl(210 10% 45%);
	}
	:global(body.dark) .content-placeholder {
		color: hsl(210 10% 65%);
	}
</style>
