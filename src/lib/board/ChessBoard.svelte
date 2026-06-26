<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { PuzzleBoard, type SolveResult } from './boardController';
	import { solvingPosition, type Promotion } from '$lib/chess';
	import type { Color, Puzzle } from '$lib/types';
	import '@lichess-org/chessground/assets/chessground.base.css';
	import '@lichess-org/chessground/assets/chessground.cburnett.css';
	import './board-theme.css';

	let {
		puzzle = undefined,
		viewOnly = false,
		onsolved = undefined,
		onfirstmove = undefined,
		oncorrect = undefined,
		onwrong = undefined
	}: {
		puzzle?: Puzzle;
		viewOnly?: boolean;
		onsolved?: (r: SolveResult) => void;
		onfirstmove?: () => void;
		oncorrect?: () => void;
		onwrong?: (n: number) => void;
	} = $props();

	let el: HTMLDivElement;
	let board: PuzzleBoard | undefined;
	let loadedId: string | undefined;

	const PROMOS: Promotion[] = ['q', 'r', 'b', 'n'];
	const GLYPH: Record<Color, Record<Promotion, string>> = {
		w: { q: '♕', r: '♖', b: '♗', n: '♘' },
		b: { q: '♛', r: '♜', b: '♝', n: '♞' }
	};

	let promo = $state<null | { color: Color; resolve: (p: Promotion | null) => void }>(null);

	function requestPromotion(color: Color): Promise<Promotion | null> {
		return new Promise((resolve) => {
			promo = { color, resolve };
		});
	}
	function choose(p: Promotion | null) {
		promo?.resolve(p);
		promo = null;
	}

	function render(p: Puzzle) {
		if (!board) return;
		loadedId = p.id;
		if (viewOnly) {
			board.setViewFen(solvingPosition(p.fen, p.moves, p.setupMoveFirst), p.solverColor);
		} else {
			board.loadPuzzle(p, {
				onSolved: onsolved,
				onFirstMove: onfirstmove,
				onCorrect: oncorrect,
				onWrong: onwrong
			});
		}
	}

	onMount(() => {
		board = new PuzzleBoard(el, { requestPromotion, viewOnly });
		if (puzzle) render(puzzle);
	});
	onDestroy(() => board?.destroy());

	// Reload whenever the puzzle identity changes.
	$effect(() => {
		const p = puzzle;
		if (board && p && p.id !== loadedId) render(p);
	});

	export function showSolution() {
		return board?.showSolution();
	}
</script>

<div class="relative w-full">
	<div class="cg-wrap aspect-square w-full overflow-hidden rounded-lg shadow-md" bind:this={el}></div>

	{#if promo}
		<div
			class="absolute inset-0 z-30 flex items-center justify-center bg-black/50"
			role="presentation"
			onclick={() => choose(null)}
		>
			<div
				class="flex gap-2 rounded-2xl bg-white p-3 shadow-xl"
				role="presentation"
				onclick={(e) => e.stopPropagation()}
			>
				{#each PROMOS as p (p)}
					<button
						class="flex h-16 w-16 items-center justify-center rounded-xl text-5xl leading-none text-ink hover:bg-neutral-100 active:bg-neutral-200"
						onclick={() => choose(p)}
						aria-label={`Promote to ${p}`}>{GLYPH[promo.color][p]}</button
					>
				{/each}
			</div>
		</div>
	{/if}
</div>
