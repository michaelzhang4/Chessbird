<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import ChessBoard from '$lib/board/ChessBoard.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { formatClock } from '$lib/time';
	import {
		loadActive,
		buildQueue,
		recordSolve,
		puzzleMap,
		type ActiveState
	} from '$lib/services/training';
	import type { Puzzle } from '$lib/types';
	import type { SolveResult } from '$lib/board/boardController';

	let loading = $state(true);
	let active = $state<ActiveState | null>(null);
	let pmap = new Map<string, Puzzle>();
	let queue = $state<string[]>([]);
	let idx = $state(0);

	let solvedThisCycle = $state(0);
	let solvedToday = $state(0);
	let target = $state(0);
	let goalPrompt = $state(false);

	let boardComp = $state<ChessBoard>();

	let elapsed = $state(0);
	let puzzleStart = 0;
	let ticker: ReturnType<typeof setInterval> | undefined;

	const current = $derived(queue[idx] ? pmap.get(queue[idx]) : undefined);

	onMount(async () => {
		const a = await loadActive();
		if (!a || a.view.phase === 'break' || a.view.phase === 'next-ready' || a.view.phase === 'program-complete') {
			goto(`${base}/program`);
			return;
		}
		active = a;
		pmap = puzzleMap(a.set);
		queue = await buildQueue(a.program);
		solvedThisCycle = a.solvedThisCycle;
		solvedToday = a.solvedToday;
		target = a.view.target ?? a.view.remainingPuzzles;
		loading = false;
		if (queue.length === 0) goto(`${base}/program`);
	});

	onDestroy(() => clearInterval(ticker));

	// Reset the per-puzzle display timer whenever the puzzle changes.
	$effect(() => {
		if (current) {
			clearInterval(ticker);
			puzzleStart = Date.now();
			elapsed = 0;
			ticker = setInterval(() => (elapsed = Date.now() - puzzleStart), 250);
		}
	});

	async function onSolved(r: SolveResult) {
		clearInterval(ticker);
		if (!active || !current) return;
		const res = await recordSolve(active.program, current, r);
		active.program = res.program;
		solvedThisCycle = res.solvedThisCycle;
		solvedToday += 1;

		if (r.firstTryCorrect) toast.success('Correct — first try!');
		else if (r.usedSolution) toast.show('Solution shown');
		else toast.show('Solved');

		if (res.cycleCompleted) {
			toast.success(`Cycle ${active.program.currentCycleIndex + 1} complete! 🎉`);
			setTimeout(() => goto(`${base}/program`), 900);
			return;
		}
		const more = idx + 1 < queue.length;
		if (solvedToday >= target && more) {
			goalPrompt = true; // pause and ask
		} else if (more) {
			setTimeout(next, 650);
		} else {
			setTimeout(() => goto(`${base}/program`), 700);
		}
	}

	function next() {
		goalPrompt = false;
		if (idx + 1 < queue.length) idx += 1;
		else goto(`${base}/program`);
	}

	function onWrong() {
		toast.error('Not the move — try again');
	}
</script>

<header class="flex items-center justify-between py-2">
	<button onclick={() => goto(`${base}/program`)} class="rounded-lg px-2 py-1 text-sm font-medium text-neutral-500 hover:bg-neutral-100">✕ Exit</button>
	<div class="text-center">
		<p class="text-xs font-semibold text-neutral-500">
			{#if active}Cycle {active.program.currentCycleIndex + 1} · {solvedThisCycle}/{active.view.totalPuzzles}{/if}
		</p>
		<p class="text-[11px] text-neutral-400">Today {solvedToday}/{target}</p>
	</div>
	<div class="min-w-16 text-right font-mono text-sm tabular-nums text-neutral-700">{formatClock(elapsed)}</div>
</header>

{#if loading}
	<div class="mt-4 aspect-square animate-pulse rounded-2xl bg-neutral-200"></div>
{:else if current}
	<ChessBoard
		bind:this={boardComp}
		puzzle={current}
		onsolved={onSolved}
		onwrong={onWrong}
	/>

	<div class="mt-3 flex items-center justify-between gap-2">
		<span class="rounded-full bg-neutral-100 px-3 py-1.5 text-sm font-medium text-neutral-600">
			{current.solverColor === 'w' ? 'White' : 'Black'} to move
		</span>
		<button
			onclick={() => boardComp?.showSolution()}
			class="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 active:bg-neutral-100"
		>
			Show solution
		</button>
	</div>

	<p class="mt-2 px-1 text-center text-xs text-neutral-400">Find the best move{current.moves.length > (current.setupMoveFirst ? 3 : 2) ? 's' : ''}.</p>
{/if}

{#if goalPrompt}
	<div class="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4">
		<div class="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">
			<h3 class="text-lg font-bold text-ink">Today's goal reached 🎯</h3>
			<p class="mt-1 text-sm text-neutral-600">You've solved {solvedToday} today (goal {target}). Keep the momentum or rest?</p>
			<div class="mt-4 flex gap-2">
				<button onclick={() => goto(`${base}/program`)} class="flex-1 rounded-2xl border border-neutral-300 py-3 text-sm font-semibold text-neutral-700">I'm done</button>
				<button onclick={next} class="flex-1 rounded-2xl bg-brand-600 py-3 text-sm font-bold text-white">Keep going</button>
			</div>
		</div>
	</div>
{/if}
