/** Detect the pasted format, dispatch to the right parser, and de-duplicate. */
import type { Puzzle } from '../types';
import type { ParseFormat, ParseResult } from './parse-types';
import { parseLichessCsv } from './parseLichessCsv';
import { parseFenSolution } from './parseFenSolution';

export function detectFormat(text: string): ParseFormat {
	const t = text.trim();
	if (!t) return 'unknown';
	const first = t.split(/\r?\n/, 1)[0] ?? '';
	if (/puzzleid/i.test(first) && /fen/i.test(first)) return 'lichess-csv';
	// Lichess data rows have 10 comma-separated fields; a hand FEN+solution line has one delimiter.
	const commas = (first.match(/,/g) || []).length;
	if (commas >= 7) return 'lichess-csv';
	if (/[,;|\t]/.test(first)) return 'fen-solution';
	return 'unknown';
}

export interface RouteOptions {
	format?: ParseFormat;
	/** for fen-solution: is moves[0] the opponent's setup move? (default false) */
	setupMoveFirst?: boolean;
}

export function parsePuzzles(text: string, opts: RouteOptions = {}): ParseResult {
	const format =
		opts.format && opts.format !== 'unknown' ? opts.format : detectFormat(text);

	if (format === 'lichess-csv') {
		const { puzzles, errors } = parseLichessCsv(text);
		const { unique, dropped } = dedupe(puzzles);
		return { format, puzzles: unique, errors, dropped };
	}
	if (format === 'fen-solution') {
		const { puzzles, errors } = parseFenSolution(text, { setupMoveFirst: opts.setupMoveFirst });
		const { unique, dropped } = dedupe(puzzles);
		return { format, puzzles: unique, errors, dropped };
	}
	return {
		format: 'unknown',
		puzzles: [],
		errors: [
			{ line: 0, reason: 'Could not detect the format. Pick "Lichess CSV" or "FEN + solution".' }
		],
		dropped: 0
	};
}

function dedupe(puzzles: Puzzle[]): { unique: Puzzle[]; dropped: number } {
	const seen = new Set<string>();
	const unique: Puzzle[] = [];
	let dropped = 0;
	for (const p of puzzles) {
		const key = `${p.fen}|${p.moves.join(' ')}`;
		if (seen.has(key)) {
			dropped++;
			continue;
		}
		seen.add(key);
		unique.push(p);
	}
	return { unique, dropped };
}
