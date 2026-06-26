/** Helpers for building a PuzzleSet from parsed puzzles and summarizing its difficulty. */
import { nanoid } from 'nanoid';
import type { Puzzle, PuzzleSet } from '../types';

export interface SetSummary {
	count: number;
	ratingMin?: number;
	ratingMax?: number;
	ratingMedian?: number;
	themeCounts?: Record<string, number>;
}

export function summarize(puzzles: Puzzle[]): SetSummary {
	const ratings = puzzles
		.map((p) => p.rating)
		.filter((r): r is number => typeof r === 'number' && Number.isFinite(r))
		.sort((a, b) => a - b);
	const themeCounts: Record<string, number> = {};
	for (const p of puzzles) for (const th of p.themes ?? []) themeCounts[th] = (themeCounts[th] ?? 0) + 1;
	return {
		count: puzzles.length,
		ratingMin: ratings[0],
		ratingMax: ratings[ratings.length - 1],
		ratingMedian: ratings.length ? ratings[Math.floor(ratings.length / 2)] : undefined,
		themeCounts: Object.keys(themeCounts).length ? themeCounts : undefined
	};
}

export function slugify(title: string): string {
	const base = title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)/g, '');
	return base || `set-${nanoid(6)}`;
}

export function buildSet(opts: {
	id?: string;
	title: string;
	description?: string;
	source: string;
	puzzles: Puzzle[];
	createdAt?: string;
	origin?: 'library' | 'user';
}): PuzzleSet {
	const s = summarize(opts.puzzles);
	return {
		id: opts.id || slugify(opts.title),
		title: opts.title,
		description: opts.description,
		createdAt: opts.createdAt ?? new Date().toISOString().slice(0, 10),
		source: opts.source,
		count: s.count,
		ratingMin: s.ratingMin,
		ratingMax: s.ratingMax,
		ratingMedian: s.ratingMedian,
		themeCounts: s.themeCounts,
		puzzles: opts.puzzles,
		origin: opts.origin
	};
}

/** Pick the top N puzzles (or all) — used to trim a paste down to ~300. */
export function trimTo(puzzles: Puzzle[], n: number): Puzzle[] {
	return n > 0 && puzzles.length > n ? puzzles.slice(0, n) : puzzles;
}
