/**
 * Parse the free Lichess puzzle CSV.
 * Columns (with or without a header row):
 *   PuzzleId, FEN, Moves, Rating, RatingDeviation, Popularity, NbPlays, Themes, GameUrl, OpeningTags
 *
 * Lichess convention: `FEN` is the position BEFORE the opponent's setup move, and the
 * first UCI in `Moves` is that auto-played setup move — so every row is `setupMoveFirst`.
 */
import Papa from 'papaparse';
import { nanoid } from 'nanoid';
import type { Puzzle } from '../types';
import { validateLine, solverColorFor } from '../chess';
import type { ParseError } from './parse-types';

function splitTokens(v: unknown): string[] | undefined {
	if (!v) return undefined;
	const t = String(v)
		.trim()
		.split(/[\s,]+/)
		.filter(Boolean);
	return t.length ? t : undefined;
}

export function parseLichessCsv(text: string): { puzzles: Puzzle[]; errors: ParseError[] } {
	const errors: ParseError[] = [];
	const puzzles: Puzzle[] = [];
	const trimmed = text.trim();
	if (!trimmed) return { puzzles, errors };

	const firstLine = trimmed.split(/\r?\n/, 1)[0] ?? '';
	const hasHeader = /puzzleid/i.test(firstLine) && /fen/i.test(firstLine);

	const parsed = Papa.parse<string[] | Record<string, string>>(trimmed, {
		header: hasHeader,
		skipEmptyLines: 'greedy'
	});

	(parsed.data as unknown[]).forEach((raw, idx) => {
		const lineNo = idx + (hasHeader ? 2 : 1);
		let id: string, fen: string, movesStr: string;
		let ratingStr: string | undefined, themesStr: unknown, openingStr: unknown, gameUrl: string | undefined;

		if (hasHeader) {
			const r = raw as Record<string, string>;
			id = r.PuzzleId;
			fen = r.FEN;
			movesStr = r.Moves;
			ratingStr = r.Rating;
			themesStr = r.Themes;
			openingStr = r.OpeningTags;
			gameUrl = r.GameUrl;
		} else {
			const r = raw as string[];
			id = r[0];
			fen = r[1];
			movesStr = r[2];
			ratingStr = r[3];
			themesStr = r[7];
			gameUrl = r[8];
			openingStr = r[9];
		}

		if (!fen || !movesStr) {
			errors.push({ line: lineNo, reason: 'missing FEN or Moves' });
			return;
		}
		const moves = String(movesStr).trim().split(/\s+/).filter(Boolean);
		const check = validateLine(fen, moves);
		if (!check.ok) {
			errors.push({ line: lineNo, reason: check.error ?? 'invalid move line' });
			return;
		}

		const rating = ratingStr ? Number(ratingStr) : undefined;
		puzzles.push({
			id: id ? `lichess_${id}` : `lichess_${nanoid(8)}`,
			fen,
			moves,
			setupMoveFirst: true,
			solverColor: solverColorFor(fen, true),
			rating: Number.isFinite(rating) ? rating : undefined,
			themes: splitTokens(themesStr),
			openingTags: splitTokens(openingStr),
			sourceUrl: gameUrl || (id ? `https://lichess.org/training/${id}` : undefined),
			source: 'lichess'
		});
	});

	return { puzzles, errors };
}
