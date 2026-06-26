<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { base } from '$app/paths';
	import ProgressRing from '$lib/components/ProgressRing.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { formatDuration } from '$lib/time';
	import { computeProgramView } from '$lib/schedule/program';
	import {
		loadActive,
		advanceToNextCycle,
		resetDeadline,
		type ActiveState
	} from '$lib/services/training';

	let loading = $state(true);
	let act = $state<ActiveState | null>(null);
	let now = $state(Date.now());
	let busy = $state(false);
	let ticker: ReturnType<typeof setInterval> | undefined;

	const view = $derived(act ? computeProgramView(act.program, act.solvedThisCycle, now) : null);

	async function refresh() {
		act = await loadActive(Date.now());
		loading = false;
	}

	onMount(() => {
		refresh();
		ticker = setInterval(() => (now = Date.now()), 1000);
	});
	onDestroy(() => clearInterval(ticker));

	async function startNext() {
		if (!act) return;
		busy = true;
		try {
			await advanceToNextCycle(act.program);
			await refresh();
			toast.success('New cycle started');
		} finally {
			busy = false;
		}
	}

	async function doReset() {
		if (!act) return;
		if (!confirm('Reset this cycle’s deadline to now? This is recorded in your stats.')) return;
		busy = true;
		try {
			await resetDeadline(act.program);
			await refresh();
		} finally {
			busy = false;
		}
	}

	const CYCLE_DAYS = [7, 4, 2, 1];
</script>

<header class="py-3">
	<h1 class="text-2xl font-extrabold tracking-tight text-ink">Training</h1>
	{#if act}<p class="truncate text-sm text-neutral-500">{act.set.title}</p>{/if}
</header>

{#if loading}
	<div class="h-56 animate-pulse rounded-3xl bg-neutral-200"></div>
{:else if !act || !view}
	<div class="rounded-3xl border border-dashed border-neutral-300 bg-white p-8 text-center">
		<p class="text-4xl">🪵</p>
		<p class="mt-2 font-semibold text-ink">No active program</p>
		<p class="mt-1 text-sm text-neutral-500">Pick a set and press Begin to start your 2.5-week cycle.</p>
		<a href="{base}/" class="mt-4 inline-block rounded-2xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white">Browse sets</a>
	</div>
{:else}
	{@const v = view}
	<!-- Cycle stepper -->
	<div class="mb-4 flex items-center gap-1.5">
		{#each CYCLE_DAYS as d, i (i)}
			<div
				class="flex-1 rounded-lg py-1.5 text-center text-[11px] font-bold"
				class:bg-brand-600={act.program.cycles[i].status === 'completed' || (act.program.currentCycleIndex === i && v.phase !== 'program-complete')}
				class:text-white={act.program.cycles[i].status === 'completed' || (act.program.currentCycleIndex === i && v.phase !== 'program-complete')}
				class:bg-neutral-200={act.program.currentCycleIndex < i}
				class:text-neutral-500={act.program.currentCycleIndex < i}
			>
				C{i + 1} · {d}d
			</div>
		{/each}
	</div>

	<div class="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
		<div class="flex items-center justify-between gap-4">
			<div class="min-w-0">
				<p class="text-xs font-semibold uppercase tracking-wide text-neutral-400">Cycle {v.cycleIndex + 1} of 4</p>
				{#if v.phase === 'cycle-active'}
					<p class="mt-1 text-2xl font-extrabold text-ink">Day {v.dayNumber} of {v.totalDays}</p>
					<p class="mt-1 text-sm font-medium text-neutral-600">⏳ {formatDuration(v.msToDeadline ?? 0)} left · today's goal {v.target}</p>
				{:else if v.phase === 'cycle-overdue'}
					<p class="mt-1 text-2xl font-extrabold text-rose-600">Overdue</p>
					<p class="mt-1 text-sm font-medium text-neutral-600">{v.remainingPuzzles} puzzles left to finish</p>
				{:else if v.phase === 'break'}
					<p class="mt-1 text-2xl font-extrabold text-amber-600">Rest break</p>
					<p class="mt-1 text-sm font-medium text-neutral-600">Cycle {(v.nextCycleIndex ?? 0) + 1} unlocks in {formatDuration(v.msToBreakEnd ?? 0)}</p>
				{:else if v.phase === 'next-ready'}
					<p class="mt-1 text-2xl font-extrabold text-brand-700">Ready!</p>
					<p class="mt-1 text-sm font-medium text-neutral-600">Break over — start Cycle {(v.nextCycleIndex ?? 0) + 1}</p>
				{:else}
					<p class="mt-1 text-2xl font-extrabold text-brand-700">Complete 🎉</p>
					<p class="mt-1 text-sm font-medium text-neutral-600">All four cycles done</p>
				{/if}
			</div>
			<ProgressRing value={act.solvedThisCycle} max={v.totalPuzzles} size={88}>
				<span class="text-base font-extrabold text-ink">{act.solvedThisCycle}</span>
				<span class="text-[10px] text-neutral-400">/{v.totalPuzzles}</span>
			</ProgressRing>
		</div>

		{#if v.phase === 'cycle-active' || v.phase === 'cycle-overdue'}
			<div class="mt-4">
				<div class="flex justify-between text-xs font-medium text-neutral-500">
					<span>Done today {act.solvedToday}{#if v.target} / {v.target}{/if}</span>
					<span>{act.solvedThisCycle}/{v.totalPuzzles} this cycle</span>
				</div>
				<div class="mt-1 h-2 w-full overflow-hidden rounded-full bg-neutral-200">
					<div class="h-full rounded-full bg-brand-500 transition-all" style="width:{Math.min(100, (act.solvedThisCycle / v.totalPuzzles) * 100)}%"></div>
				</div>
			</div>
		{/if}
	</div>

	<div class="mt-5 space-y-2">
		{#if v.phase === 'cycle-active'}
			<a href="{base}/solve" class="block w-full rounded-2xl bg-brand-600 py-4 text-center text-base font-bold text-white shadow-sm active:bg-brand-700">
				{act.solvedToday > 0 ? 'Continue today' : "Start today's puzzles"}
			</a>
		{:else if v.phase === 'cycle-overdue'}
			<a href="{base}/solve" class="block w-full rounded-2xl bg-rose-600 py-4 text-center text-base font-bold text-white active:bg-rose-700">Catch up now</a>
			<button onclick={doReset} disabled={busy} class="w-full rounded-2xl border border-neutral-300 bg-white py-3 text-sm font-semibold text-neutral-700 disabled:opacity-50">Reset cycle deadline</button>
		{:else if v.phase === 'break'}
			<button disabled class="w-full cursor-not-allowed rounded-2xl bg-neutral-200 py-4 text-center text-base font-bold text-neutral-400">🔒 Resting…</button>
		{:else if v.phase === 'next-ready'}
			<button onclick={startNext} disabled={busy} class="w-full rounded-2xl bg-brand-600 py-4 text-base font-bold text-white active:bg-brand-700 disabled:opacity-50">Start Cycle {(v.nextCycleIndex ?? 0) + 1}</button>
		{:else}
			<a href="{base}/stats" class="block w-full rounded-2xl bg-brand-600 py-4 text-center text-base font-bold text-white active:bg-brand-700">View your results</a>
			<a href="{base}/" class="block w-full rounded-2xl border border-neutral-300 bg-white py-3 text-center text-sm font-semibold text-neutral-700">Start a new program</a>
		{/if}
	</div>

	{#if act.program.cycles[v.cycleIndex].deadlineResetCount > 0}
		<p class="mt-3 text-center text-xs text-neutral-400">Deadline reset {act.program.cycles[v.cycleIndex].deadlineResetCount}× this cycle</p>
	{/if}
{/if}
