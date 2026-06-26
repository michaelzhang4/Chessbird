<script lang="ts">
	import { onMount } from 'svelte';

	let show = $state(false);
	const KEY = 'wp-install-dismissed';

	onMount(() => {
		const ua = navigator.userAgent;
		const isIOS = /iphone|ipad|ipod/i.test(ua);
		const standalone =
			window.matchMedia('(display-mode: standalone)').matches ||
			// iOS Safari exposes navigator.standalone when launched from the home screen
			(navigator as unknown as { standalone?: boolean }).standalone === true;
		const dismissed = localStorage.getItem(KEY) === '1';
		show = isIOS && !standalone && !dismissed;
	});

	function dismiss() {
		show = false;
		localStorage.setItem(KEY, '1');
	}
</script>

{#if show}
	<div class="pb-safe fixed inset-x-0 bottom-16 z-40 mx-auto w-full max-w-md px-3">
		<div class="rounded-2xl border border-brand-200 bg-white p-3 shadow-lg">
			<div class="flex items-start gap-3">
				<div class="text-2xl">📲</div>
				<div class="flex-1 text-sm">
					<p class="font-semibold text-ink">Add to Home Screen</p>
					<p class="mt-0.5 text-neutral-600">
						Install for offline use and reliable saving across the 2.5-week program. Tap
						<span class="font-semibold">Share</span> → <span class="font-semibold">Add to Home Screen</span>.
					</p>
				</div>
				<button onclick={dismiss} class="rounded-lg px-2 py-1 text-neutral-400 hover:bg-neutral-100" aria-label="Dismiss">✕</button>
			</div>
		</div>
	</div>
{/if}
