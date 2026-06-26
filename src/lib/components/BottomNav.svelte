<script lang="ts">
	import { page } from '$app/state';
	import { base } from '$app/paths';

	const tabs = [
		{ href: '', label: 'Home', icon: 'home' },
		{ href: '/program', label: 'Train', icon: 'board' },
		{ href: '/stats', label: 'Stats', icon: 'chart' },
		{ href: '/settings', label: 'Settings', icon: 'gear' }
	];

	function active(href: string): boolean {
		const path = page.url.pathname.replace(base, '') || '/';
		if (href === '') return path === '/';
		return path === href || path.startsWith(href + '/');
	}
</script>

<nav
	class="pb-safe fixed inset-x-0 bottom-0 z-40 mx-auto flex w-full max-w-md justify-around border-t border-neutral-200 bg-white/95 backdrop-blur"
>
	{#each tabs as t (t.label)}
		<a
			href="{base}{t.href}"
			class="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors"
			class:text-brand-700={active(t.href)}
			class:text-neutral-400={!active(t.href)}
			aria-current={active(t.href) ? 'page' : undefined}
		>
			<svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				{#if t.icon === 'home'}
					<path
						d="M3 11.5 12 4l9 7.5M5 10v9a1 1 0 0 0 1 1h3v-6h6v6h3a1 1 0 0 0 1-1v-9"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				{:else if t.icon === 'board'}
					<rect x="3" y="3" width="18" height="18" rx="2" />
					<path d="M3 9h18M3 15h18M9 3v18M15 3v18" stroke-linecap="round" />
				{:else if t.icon === 'chart'}
					<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" stroke-linecap="round" stroke-linejoin="round" />
				{:else}
					<circle cx="12" cy="12" r="3" />
					<path
						d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 6 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H2a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4 6l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V2a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 18 4l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				{/if}
			</svg>
			<span>{t.label}</span>
		</a>
	{/each}
</nav>
