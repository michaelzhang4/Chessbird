<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { programsRepo, attemptsRepo } from '$lib/db';
	import { programStats, type ProgramStats } from '$lib/stats/aggregate';
	import { formatClock } from '$lib/time';
	import type { TrainingProgram } from '$lib/types';

	let loading = $state(true);
	let programs = $state<TrainingProgram[]>([]);
	let selected = $state<TrainingProgram | null>(null);
	let stats = $state<ProgramStats | null>(null);

	async function select(p: TrainingProgram) {
		selected = p;
		const attempts = await attemptsRepo.forProgram(p.id);
		stats = programStats(p, attempts);
	}

	onMount(async () => {
		programs = await programsRepo.list();
		if (programs.length) await select(programs[0]);
		loading = false;
	});

	const maxAvg = $derived(stats ? Math.max(1, ...stats.perCycle.map((c) => c.avgMs)) : 1);
	const startedCycles = $derived(stats ? stats.perCycle.filter((c) => c.solved > 0) : []);
</script>

<header class="py-3">
	<h1 class="text-2xl font-extrabold tracking-tight text-ink">Stats</h1>
	<p class="text-sm text-neutral-500">Faster &amp; sharper each cycle — that's the goal.</p>
</header>

{#if loading}
	<div class="h-48 animate-pulse rounded-2xl bg-neutral-200"></div>
{:else if !selected || !stats}
	<div class="rounded-3xl border border-dashed border-neutral-300 bg-white p-8 text-center">
		<p class="text-4xl">📊</p>
		<p class="mt-2 font-semibold text-ink">No data yet</p>
		<p class="mt-1 text-sm text-neutral-500">Solve some puzzles to see your speed and accuracy trends.</p>
	</div>
{:else}
	{#if programs.length > 1}
		<select
			class="mb-3 w-full rounded-xl border-neutral-300 text-sm"
			onchange={(e) => {
				const p = programs.find((x) => x.id === (e.currentTarget as HTMLSelectElement).value);
				if (p) select(p);
			}}
		>
			{#each programs as p (p.id)}
				<option value={p.id} selected={p.id === selected.id}>{p.setTitle}</option>
			{/each}
		</select>
	{/if}

	<!-- Speed curve (avg time/puzzle per cycle) -->
	<div class="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
		<p class="mb-3 text-sm font-bold uppercase tracking-wide text-neutral-500">Speed per cycle</p>
		<div class="flex items-end justify-around gap-3" style="height:120px">
			{#each stats.perCycle as c, i (i)}
				<div class="flex flex-1 flex-col items-center justify-end">
					<span class="mb-1 text-[10px] font-medium text-neutral-500">{c.solved ? formatClock(c.avgMs) : '—'}</span>
					<div
						class="w-full rounded-t-lg transition-all"
						class:bg-brand-500={c.solved > 0}
						class:bg-neutral-200={c.solved === 0}
						style="height:{c.solved ? Math.max(6, (c.avgMs / maxAvg) * 96) : 4}px"
					></div>
					<span class="mt-1 text-[11px] font-bold text-neutral-600">C{i + 1}</span>
				</div>
			{/each}
		</div>
	</div>

	<!-- Accuracy per cycle -->
	<div class="mt-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
		<p class="mb-3 text-sm font-bold uppercase tracking-wide text-neutral-500">First-try accuracy</p>
		<div class="space-y-2">
			{#each stats.perCycle as c, i (i)}
				<div class="flex items-center gap-2">
					<span class="w-7 text-xs font-bold text-neutral-600">C{i + 1}</span>
					<div class="h-3 flex-1 overflow-hidden rounded-full bg-neutral-200">
						<div class="h-full rounded-full bg-brand-500" style="width:{Math.round(c.firstTryAccuracy * 100)}%"></div>
					</div>
					<span class="w-10 text-right text-xs font-medium text-neutral-600">{c.solved ? Math.round(c.firstTryAccuracy * 100) + '%' : '—'}</span>
				</div>
			{/each}
		</div>
	</div>

	<!-- Per-cycle table -->
	<div class="mt-3 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
		<table class="w-full text-sm">
			<thead class="bg-neutral-50 text-[11px] uppercase text-neutral-400">
				<tr><th class="px-3 py-2 text-left">Cycle</th><th class="px-2 py-2 text-right">Solved</th><th class="px-2 py-2 text-right">1st-try</th><th class="px-3 py-2 text-right">Avg</th></tr>
			</thead>
			<tbody>
				{#each startedCycles as c (c.cycleIndex)}
					<tr class="border-t border-neutral-100">
						<td class="px-3 py-2 font-medium">Cycle {c.cycleIndex + 1}</td>
						<td class="px-2 py-2 text-right tabular-nums">{c.solved}</td>
						<td class="px-2 py-2 text-right tabular-nums">{Math.round(c.firstTryAccuracy * 100)}%</td>
						<td class="px-3 py-2 text-right tabular-nums">{formatClock(c.avgMs)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	{#if stats.leeches.length}
		<div class="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
			<p class="text-sm font-bold text-amber-800">🐛 {stats.leeches.length} leech puzzles</p>
			<p class="mt-1 text-xs text-amber-700">Missed first-try in 2+ cycles — these are the patterns to drill hardest.</p>
		</div>
	{/if}
{/if}
