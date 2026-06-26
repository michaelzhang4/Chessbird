<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { loadActive, type ActiveState } from '$lib/services/training';
	import { loadManifest } from '$lib/services/library';
	import { setsRepo } from '$lib/db';
	import type { ManifestEntry } from '$lib/puzzles/schema';
	import type { PuzzleSet } from '$lib/types';
	import type { ProgramView } from '$lib/schedule/program';
	import { formatDuration } from '$lib/time';
	import ProgressRing from '$lib/components/ProgressRing.svelte';

	let loading = $state(true);
	let active = $state<ActiveState | null>(null);
	let library = $state<ManifestEntry[]>([]);
	let mySets = $state<PuzzleSet[]>([]);

	onMount(async () => {
		try {
			const [a, manifest, sets] = await Promise.all([
				loadActive(),
				loadManifest().catch(() => ({ version: 1, sets: [] as ManifestEntry[] })),
				setsRepo.list()
			]);
			active = a;
			library = manifest.sets;
			mySets = sets;
		} finally {
			loading = false;
		}
	});

	function hero(v: ProgramView): { line: string; cta: string; href: string; tone: string } {
		switch (v.phase) {
			case 'cycle-active':
				return {
					line: `Cycle ${v.cycleIndex + 1} · Day ${v.dayNumber}/${v.totalDays} · today's goal ${v.target}`,
					cta: 'Continue today',
					href: `${base}/solve`,
					tone: 'from-brand-600 to-brand-700'
				};
			case 'cycle-overdue':
				return {
					line: `Cycle ${v.cycleIndex + 1} overdue · ${v.remainingPuzzles} left`,
					cta: 'Catch up',
					href: `${base}/solve`,
					tone: 'from-rose-600 to-rose-700'
				};
			case 'break':
				return {
					line: `Resting · Cycle ${(v.nextCycleIndex ?? 0) + 1} unlocks in ${formatDuration(v.msToBreakEnd ?? 0)}`,
					cta: 'View program',
					href: `${base}/program`,
					tone: 'from-amber-500 to-amber-600'
				};
			case 'next-ready':
				return {
					line: `Break over · Cycle ${(v.nextCycleIndex ?? 0) + 1} ready to start`,
					cta: 'Start cycle',
					href: `${base}/program`,
					tone: 'from-brand-600 to-brand-700'
				};
			case 'program-complete':
				return {
					line: 'Program complete 🎉',
					cta: 'View results',
					href: `${base}/stats`,
					tone: 'from-brand-600 to-brand-700'
				};
		}
	}
</script>

{#snippet setCard(id: string, title: string, count: number, rmin: number | undefined, rmax: number | undefined, themes: string[], badge: string)}
	<a
		href="{base}/set/{id}"
		class="block rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition active:scale-[.99]"
	>
		<div class="flex items-start justify-between gap-2">
			<h3 class="font-semibold leading-tight text-ink">{title}</h3>
			<span class="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">{badge}</span>
		</div>
		<p class="mt-1 text-sm text-neutral-500">
			{count} puzzles{#if rmin && rmax} · {rmin}–{rmax}{/if}
		</p>
		{#if themes.length}
			<div class="mt-2 flex flex-wrap gap-1">
				{#each themes.slice(0, 3) as th (th)}
					<span class="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-600">{th}</span>
				{/each}
			</div>
		{/if}
	</a>
{/snippet}

<header class="flex items-center justify-between py-3">
	<div>
		<h1 class="text-2xl font-extrabold tracking-tight text-ink">Woodpecker</h1>
		<p class="text-sm text-neutral-500">Chess pattern training</p>
	</div>
	<a href="{base}/new" class="rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm active:bg-brand-700">+ New set</a>
</header>

{#if loading}
	<div class="mt-6 space-y-3">
		{#each [1, 2, 3] as i (i)}
			<div class="h-24 animate-pulse rounded-2xl bg-neutral-200"></div>
		{/each}
	</div>
{:else}
	{#if active}
		{@const h = hero(active.view)}
		<a href={h.href} class="mt-2 block rounded-3xl bg-gradient-to-br {h.tone} p-5 text-white shadow-lg active:scale-[.99]">
			<div class="flex items-center justify-between gap-4">
				<div class="min-w-0">
					<p class="text-xs font-medium uppercase tracking-wide text-white/70">Active program</p>
					<p class="mt-1 truncate text-lg font-bold">{active.set.title}</p>
					<p class="mt-1 text-sm text-white/85">{h.line}</p>
					<span class="mt-3 inline-block rounded-xl bg-white/20 px-3 py-1.5 text-sm font-semibold">{h.cta} →</span>
				</div>
				<ProgressRing
					value={active.solvedThisCycle}
					max={active.view.totalPuzzles}
					color="#ffffff"
					track="rgba(255,255,255,.25)"
				>
					<span class="text-sm font-bold text-white">{active.solvedThisCycle}</span>
					<span class="text-[10px] text-white/70">/{active.view.totalPuzzles}</span>
				</ProgressRing>
			</div>
		</a>
	{/if}

	<div class="mt-5 grid grid-cols-2 gap-3">
		<a
			href="{base}/pool"
			class="flex flex-col justify-between rounded-2xl border border-brand-200 bg-brand-50 p-4 shadow-sm active:scale-[.99]"
		>
			<p class="font-semibold text-brand-800">🎯 Training pool</p>
			<p class="mt-0.5 text-xs text-brand-700/80">Mix sets, pick how many, run a program</p>
		</a>
		<a
			href="{base}/practice"
			class="flex flex-col justify-between rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm active:scale-[.99]"
		>
			<p class="font-semibold text-ink">🎲 Practice</p>
			<p class="mt-0.5 text-xs text-neutral-500">Casual solving — no schedule</p>
		</a>
	</div>

	<section class="mt-6">
		<h2 class="mb-2 px-1 text-sm font-bold uppercase tracking-wide text-neutral-500">Library</h2>
		{#if library.length}
			<div class="space-y-3">
				{#each library as s (s.id)}
					{@render setCard(s.id, s.title, s.count, s.ratingRange?.[0], s.ratingRange?.[1], s.themes ?? [], 'Library')}
				{/each}
			</div>
		{:else}
			<p class="px-1 text-sm text-neutral-500">No library sets found.</p>
		{/if}
	</section>

	{#if mySets.length}
		<section class="mt-6">
			<h2 class="mb-2 px-1 text-sm font-bold uppercase tracking-wide text-neutral-500">My sets</h2>
			<div class="space-y-3">
				{#each mySets as s (s.id)}
					{@render setCard(s.id, s.title, s.count, s.ratingMin, s.ratingMax, Object.keys(s.themeCounts ?? {}), 'Mine')}
				{/each}
			</div>
		</section>
	{/if}
{/if}
