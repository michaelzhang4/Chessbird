<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import InstallBanner from '$lib/components/InstallBanner.svelte';

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div class="mx-auto flex min-h-dvh-safe w-full max-w-md flex-col bg-neutral-50">
	<main class="flex-1 px-4 pb-28 pt-safe">
		{@render children()}
	</main>
	<BottomNav />
	<Toast />
	<InstallBanner />
</div>
