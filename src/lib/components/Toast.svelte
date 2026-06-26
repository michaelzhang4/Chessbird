<script lang="ts">
	import { toast } from '$lib/stores/toast.svelte';
</script>

<div class="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-4">
	{#each toast.items as t (t.id)}
		<div
			class="pointer-events-auto w-full max-w-sm rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg"
			class:bg-brand-600={t.kind === 'success'}
			class:text-white={t.kind !== 'info'}
			class:bg-red-600={t.kind === 'error'}
			class:bg-neutral-800={t.kind === 'info'}
			role="status"
		>
			{t.msg}
		</div>
	{/each}
</div>
