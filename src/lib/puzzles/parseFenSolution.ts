/**
 * Parse a simple "one puzzle per line" format for any source (incl. opening/positional
 * "best move" puzzles you curate yourself):
 *
 *   <FEN><delimiter><uci uci uci ...>
 *
 * The delimiter is the first comma, semicolon, pipe or tab (a FEN never contains those,
 * but does contain spaces — hence we can't split on whitespace). Example:
 *   r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4, f3f7
 *
 * By default the human is to move in the FEN (`setupMoveFirst=false`). Pass
 * `setupMoveFirst=true` for Lichess-style lines where the first move is the opponent's.
 */
import { nanoid } from 'nanoid';
import type { Puzzle } from '../types';
import { validateLine, solverColorFor } from '../chess';
import type { ParseError } from './parse-types';

const DELIM = /[,;|\t]/;

export function parseFenSolution(
	text: string,
	opts: { setupMoveFirst?: boolean } = {}
): { puzzles: Puzzle[]; errors: ParseError[] } {
	const setupMoveFirst = opts.setupMoveFirst ?? false;
	const errors: ParseError[] = [];
	const puzzles: Puzzle[] = [];

	const lines = text.split(/\r?\n/);
	lines.forEach((line, idx) => {
		const lineNo = idx + 1;
		const raw = line.trim();
		if (!raw || raw.startsWith('#')) return; // blank or comment

		const m = DELIM.exec(raw);
		if (!m) {
			errors.push({ line: lineNo, reason: 'no delimiter between FEN and moves (use , ; | or tab)' });
			return;
		}
		const fen = raw.slice(0, m.index).trim();
		const moves = raw
			.slice(m.index + 1)
			.trim()
			.split(/\s+/)
			.filter(Boolean);
		if (!fen || moves.length === 0) {
			errors.push({ line: lineNo, reason: 'missing FEN or moves' });
			return;
		}
		const check = validateLine(fen, moves);
		if (!check.ok) {
			errors.push({ line: lineNo, reason: check.error ?? 'invalid move line' });
			return;
		}
		puzzles.push({
			id: `manual_${nanoid(8)}`,
			fen,
			moves,
			setupMoveFirst,
			solverColor: solverColorFor(fen, setupMoveFirst),
			source: 'manual'
		});
	});

	return { puzzles, errors };
}
