<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { loadSetById } from '$lib/services/library';
	import { startProgram } from '$lib/services/training';
	import { programsRepo } from '$lib/db';
	import { toast } from '$lib/stores/toast.svelte';
	import type { PuzzleSet } from '$lib/types';
	import ChessBoard from '$lib/board/ChessBoard.svelte';

	const id = page.params.id ?? '';
	let set = $state<PuzzleSet | null>(null);
	let loading = $state(true);
	let starting = $state(false);
	let previewIndex = $state(0);

	onMount(async () => {
		try {
			set = await loadSetById(id);
		} finally {
			loading = false;
		}
	});

	const topThemes = $derived(
		set?.themeCounts
			? Object.entries(set.themeCounts)
					.sort((a, b) => b[1] - a[1])
					.slice(0, 6)
			: []
	);

	async function begin(assess: boolean) {
		if (!set) return;
		if (assess) {
			goto(`${base}/assess/${id}`);
			return;
		}
		const existing = await programsRepo.getActiveId();
		if (existing && existing !== id) {
			if (!confirm('Starting a new program will set aside your current one. Continue?')) return;
		}
		starting = true;
		try {
			await startProgram(set);
			toast.success('Program started — Cycle 1 begins now');
			goto(`${base}/program`);
		} finally {
			starting = false;
		}
	}

	function shufflePreview() {
		if (set && set.puzzles.length > 1) previewIndex = Math.floor(Math.random() * set.puzzles.length);
	}
</script>

<header class="flex items-center gap-2 py-3">
	<a href="{base}/" class="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100" aria-label="Back">←</a>
	<h1 class="truncate text-lg font-bold text-ink">{set?.title ?? 'Set'}</h1>
</header>

{#if loading}
	<div class="mt-4 h-72 animate-pulse rounded-2xl bg-neutral-200"></div>
{:else if !set}
	<p class="mt-8 text-center text-neutral-500">Set not found.</p>
{:else}
	<div class="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
		{#if set.description}<p class="text-sm text-neutral-600">{set.description}</p>{/if}
		<div class="mt-3 grid grid-cols-3 gap-2 text-center">
			<div class="rounded-xl bg-neutral-50 py-2">
				<p class="text-lg font-bold text-ink">{set.count}</p>
				<p class="text-[11px] text-neutral-500">puzzles</p>
			</div>
			<div class="rounded-xl bg-neutral-50 py-2">
				<p class="text-lg font-bold text-ink">{set.ratingMedian ?? '—'}</p>
				<p class="text-[11px] text-neutral-500">median rating</p>
			</div>
			<div class="rounded-xl bg-neutral-50 py-2">
				<p class="text-lg font-bold text-ink">{set.ratingMin ?? '—'}–{set.ratingMax ?? '—'}</p>
				<p class="text-[11px] text-neutral-500">range</p>
			</div>
		</div>
		{#if topThemes.length}
			<div class="mt-3 flex flex-wrap gap-1">
				{#each topThemes as [th, n] (th)}
					<span class="rounded-md bg-brand-50 px-1.5 py-0.5 text-[11px] font-medium text-brand-700">{th} {n}</span>
				{/each}
			</div>
		{/if}
	</div>

	<div class="mt-4">
		<div class="mb-2 flex items-center justify-between px-1">
			<h2 class="text-sm font-bold uppercase tracking-wide text-neutral-500">Preview</h2>
			<button onclick={shufflePreview} class="text-sm font-medium text-brand-700">Shuffle</button>
		</div>
		<ChessBoard puzzle={set.puzzles[previewIndex]} viewOnly />
	</div>

	<div class="mt-5 space-y-2">
		<button
			onclick={() => begin(true)}
			class="w-full rounded-2xl bg-brand-600 py-3.5 text-base font-bold text-white shadow-sm active:bg-brand-700"
		>
			Assess eligibility, then begin
		</button>
		<button
			onclick={() => begin(false)}
			disabled={starting}
			class="w-full rounded-2xl border border-neutral-300 bg-white py-3 text-sm font-semibold text-neutral-700 active:bg-neutral-100 disabled:opacity-50"
		>
			Skip assessment & start now
		</button>
		<p class="px-2 pt-1 text-center text-xs text-neutral-400">
			Assessment samples 30 puzzles — aim for ≥75% first-try.
		</p>
	</div>
{/if}
