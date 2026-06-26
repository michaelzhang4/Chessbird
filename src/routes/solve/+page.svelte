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
	import type { SolveResult, ReviewState } from '$lib/board/boardController';
	import { Engine, whiteWinProb, formatEval } from '$lib/engine/engine';
	import { Chess } from 'chess.js';
	import type { Promotion } from '$lib/chess';

	const EVAL_DEPTH = 16;

	let loading = $state(true);
	let active = $state<ActiveState | null>(null);
	let pmap = new Map<string, Puzzle>();
	let queue = $state<string[]>([]);
	let idx = $state(0);

	let solvedThisCycle = $state(0);
	let solvedToday = $state(0);
	let target = $state(0);
	let goalPrompt = $state(false);

	// post-puzzle review/exploration
	let reviewing = $state(false);
	let review = $state<ReviewState | null>(null);
	let cycleJustCompleted = $state(false);

	// in-browser Stockfish eval (single-threaded WASM, lazy)
	let engine: Engine | undefined;
	let evalInfo = $state<{ depth: number; cp?: number; mate?: number; pv: string[] } | null>(null);
	let engineFailed = $state(false);

	// Terminal positions (checkmate/draw) have no engine eval — describe them directly.
	const terminal = $derived.by(() => {
		if (!review) return null;
		try {
			const ch = new Chess(review.fen);
			if (ch.isCheckmate()) return { winner: review.sideToMove === 'w' ? 'b' : 'w' };
			if (ch.isStalemate() || ch.isInsufficientMaterial() || ch.isDraw()) return { winner: null };
		} catch {
			/* malformed fen — treat as normal */
		}
		return null;
	});

	// White-POV eval bar + best line for the position currently under review
	const evalView = $derived.by(() => {
		if (terminal) {
			if (!terminal.winner) return { prob: 0.5, label: '½', depth: 0, pvSan: [], note: 'Draw' };
			const whiteWins = terminal.winner === 'w';
			return { prob: whiteWins ? 1 : 0, label: '#', depth: 0, pvSan: [], note: 'Checkmate' };
		}
		if (!evalInfo || !review) return null;
		const stmWhite = review.sideToMove === 'w';
		const whiteCp = evalInfo.cp === undefined ? undefined : stmWhite ? evalInfo.cp : -evalInfo.cp;
		const whiteMate =
			evalInfo.mate === undefined ? undefined : stmWhite ? evalInfo.mate : -evalInfo.mate;
		const pvSan: string[] = [];
		try {
			const ch = new Chess(review.fen);
			for (const u of evalInfo.pv.slice(0, 6)) {
				const m = ch.move({
					from: u.slice(0, 2),
					to: u.slice(2, 4),
					promotion: u.length === 5 ? (u[4] as Promotion) : undefined
				});
				pvSan.push(m.san);
			}
		} catch {
			/* partial/illegal pv — show what we have */
		}
		return { prob: whiteWinProb(whiteCp, whiteMate), label: formatEval(whiteCp, whiteMate), depth: evalInfo.depth, pvSan, note: '' };
	});

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
		// warm up the eval engine in the background (degrades silently if WASM won't load)
		engine = new Engine();
		engine.init().then(() => {
			if (engine?.failed) engineFailed = true;
		});
	});

	onDestroy(() => {
		clearInterval(ticker);
		engine?.quit();
	});

	// Analyse whatever position the user is viewing in review.
	$effect(() => {
		const r = review;
		if (!reviewing || !r || !engine || engineFailed) return;
		evalInfo = null;
		if (terminal) return; // checkmate/draw — nothing to analyse
		const fen = r.fen;
		engine.analyze(fen, EVAL_DEPTH, (info) => {
			if (review?.fen !== fen) return; // ignore updates for a position we've navigated away from
			evalInfo = { depth: info.depth, cp: info.cp, mate: info.mate, pv: info.pv };
		});
	});

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
		if (res.cycleCompleted) toast.success(`Cycle ${active.program.currentCycleIndex + 1} complete! 🎉`);

		// Stay on the board for review/exploration; the user advances when ready.
		cycleJustCompleted = res.cycleCompleted;
		reviewing = true;
	}

	function onReview(s: ReviewState) {
		review = s;
	}

	/** Leave review and move on (called by the "Next" button). */
	function continueNext() {
		reviewing = false;
		review = null;
		engine?.stop();
		evalInfo = null;
		if (cycleJustCompleted) {
			goto(`${base}/program`);
			return;
		}
		const more = idx + 1 < queue.length;
		if (solvedToday >= target && more) goalPrompt = true; // pause and ask
		else if (more) next();
		else goto(`${base}/program`);
	}

	function next() {
		goalPrompt = false;
		reviewing = false;
		review = null;
		engine?.stop();
		evalInfo = null;
		if (idx + 1 < queue.length) idx += 1;
		else goto(`${base}/program`);
	}

	function onWrong() {
		toast.error('Not the move — try again');
	}

	function onKey(e: KeyboardEvent) {
		if (!reviewing) return;
		// Enter / Space = advance (fast flow); arrows = scrub the line.
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			continueNext();
		} else if (e.key === 'ArrowLeft') boardComp?.reviewBack();
		else if (e.key === 'ArrowRight') boardComp?.reviewForward();
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
		onreview={onReview}
	/>

	{#if reviewing}
		<!-- Post-puzzle: keep moving by default, or explore the line + engine eval. -->
		<div class="mt-3 space-y-3">
			{#if !engineFailed}
				<div>
					<div class="flex items-center gap-2">
						<div class="relative h-2.5 flex-1 overflow-hidden rounded-full bg-neutral-800 ring-1 ring-neutral-300">
							<div class="absolute inset-y-0 left-0 bg-neutral-50 transition-[width] duration-200" style="width:{(evalView?.prob ?? 0.5) * 100}%"></div>
						</div>
						<span class="w-12 text-right font-mono text-xs font-semibold tabular-nums text-neutral-700">{evalView?.label ?? '…'}</span>
					</div>
					{#if evalView?.note}
						<p class="mt-1 px-1 text-center text-[11px] text-neutral-400">{evalView.note}</p>
					{:else if evalView?.pvSan?.length}
						<p class="mt-1 truncate px-1 text-center text-[11px] text-neutral-400">depth {evalView.depth} · {evalView.pvSan.join(' ')}</p>
					{/if}
				</div>
			{/if}

			<button
				onclick={continueNext}
				class="w-full rounded-2xl bg-brand-600 py-3.5 text-center text-base font-bold text-white shadow-sm active:bg-brand-700"
			>
				{cycleJustCompleted ? 'Finish cycle →' : idx + 1 < queue.length ? 'Next puzzle →' : 'Done →'}
			</button>

			<div class="flex items-center justify-between gap-2">
				<div class="flex items-center gap-1">
					<button onclick={() => boardComp?.reviewStart()} disabled={(review?.ply ?? 0) === 0} aria-label="First position" class="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-700 active:bg-neutral-100 disabled:opacity-40">⏮</button>
					<button onclick={() => boardComp?.reviewBack()} disabled={(review?.ply ?? 0) === 0} aria-label="Previous move" class="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-700 active:bg-neutral-100 disabled:opacity-40">◀</button>
					<button onclick={() => boardComp?.reviewForward()} disabled={(review?.ply ?? 0) >= (review?.total ?? 0)} aria-label="Next move" class="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-700 active:bg-neutral-100 disabled:opacity-40">▶</button>
					<button onclick={() => boardComp?.reviewEnd()} disabled={(review?.ply ?? 0) >= (review?.total ?? 0)} aria-label="Last move" class="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-700 active:bg-neutral-100 disabled:opacity-40">⏭</button>
				</div>
				{#if review?.branched}
					<button onclick={() => boardComp?.reviewReset()} class="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-600 active:bg-neutral-100">↺ Solution</button>
				{/if}
			</div>

			{#if review && review.san.length}
				<div class="flex flex-wrap gap-1 rounded-xl bg-neutral-50 p-2 text-sm">
					{#each review.san as san, i (i)}
						<button
							onclick={() => boardComp?.reviewGoto(i + 1)}
							class="rounded px-1.5 py-0.5 font-mono tabular-nums {review.ply === i + 1 ? 'bg-brand-600 text-white' : 'text-neutral-700 hover:bg-neutral-200'} {i >= review.solutionLen ? 'italic opacity-80' : ''}"
						>{san}</button>
					{/each}
				</div>
			{/if}

			<p class="px-1 text-center text-xs text-neutral-400">Tap Next (or press Enter) to continue · drag pieces to explore · ← → to step.</p>
		</div>
	{:else}
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
{/if}

<svelte:window onkeydown={onKey} />

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
