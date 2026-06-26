/**
 * Build a custom training pool from several library/user sets.
 *
 * The Woodpecker studies overlap heavily (they're community transcriptions of the
 * same book), so we dedup by POSITION across the chosen sets — keeping the most
 * complete solution line when the same position appears with different recordings —
 * then randomly sample N puzzles into a fresh set the normal program flow can run.
 */
import { nanoid } from 'nanoid';
import type { Puzzle, PuzzleSet } from '$lib/types';
import { buildSet } from '$lib/puzzles/set';
import { loadSetById } from '$lib/services/library';

/** Position identity ignoring move clocks: placement + side + castling + en-passant. */
export const posKey = (fen: string): string => fen.split(/\s+/).slice(0, 4).join(' ');

/** Merge puzzles from many sets, dedup by position (prefer the longest solution line). */
export function dedupeByPosition(puzzles: Puzzle[]): Puzzle[] {
	const byPos = new Map<string, Puzzle>();
	for (const p of puzzles) {
		const k = posKey(p.fen);
		const cur = byPos.get(k);
		if (!cur || p.moves.length > cur.moves.length) byPos.set(k, p);
	}
	return [...byPos.values()];
}

/** Load the chosen sets and return their deduped puzzle pool (stable order). */
export async function loadPool(setIds: string[]): Promise<{ puzzles: Puzzle[]; raw: number }> {
	const sets = await Promise.all(setIds.map((id) => loadSetById(id)));
	const all = sets.flatMap((s) => s?.puzzles ?? []);
	return { puzzles: dedupeByPosition(all), raw: all.length };
}

function shuffle<T>(arr: T[]): T[] {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

/** Randomly sample up to `n` puzzles from a deduped pool into a fresh, saveable set. */
export function makePoolSet(pool: Puzzle[], n: number, title?: string): PuzzleSet {
	const chosen = n > 0 && n < pool.length ? shuffle(pool).slice(0, n) : shuffle(pool);
	return buildSet({
		id: `pool-${nanoid(6)}`,
		title: title?.trim() || `Custom pool (${chosen.length})`,
		description: `Random pool of ${chosen.length} puzzles drawn from ${pool.length} unique positions.`,
		source: 'pool',
		puzzles: chosen,
		origin: 'user'
	});
}
