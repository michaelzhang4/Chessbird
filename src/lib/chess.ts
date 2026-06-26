/**
 * Shared chess helpers built on chess.js v1.4 — used by both the puzzle parsers
 * and the live board controller, so UCI handling stays identical everywhere.
 */
import { Chess, type Square } from 'chess.js';
import type { Color } from './types';

export type Promotion = 'q' | 'r' | 'b' | 'n';

export interface ParsedUci {
	from: Square;
	to: Square;
	promotion?: Promotion;
}

const UCI_RE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

/** Parse a UCI move string into from/to/promotion, or null if malformed. */
export function parseUci(uci: string): ParsedUci | null {
	if (!UCI_RE.test(uci)) return null;
	return {
		from: uci.slice(0, 2) as Square,
		to: uci.slice(2, 4) as Square,
		promotion: uci.length === 5 ? (uci[4] as Promotion) : undefined
	};
}

/** Build a canonical UCI string from board coordinates. */
export function toUci(from: string, to: string, promotion?: string): string {
	return `${from}${to}${promotion ?? ''}`;
}

/**
 * Replay a full UCI line from a FEN to confirm it is legal end-to-end.
 * Returns the first problem found, so callers can report a precise row error.
 */
export function validateLine(fen: string, moves: string[]): { ok: boolean; error?: string } {
	let chess: Chess;
	try {
		chess = new Chess(fen);
	} catch {
		return { ok: false, error: 'invalid FEN' };
	}
	if (moves.length === 0) return { ok: false, error: 'no moves' };
	for (let i = 0; i < moves.length; i++) {
		const m = parseUci(moves[i]);
		if (!m) return { ok: false, error: `move ${i + 1} "${moves[i]}" is not valid UCI` };
		try {
			chess.move({ from: m.from, to: m.to, promotion: m.promotion });
		} catch {
			return { ok: false, error: `move ${i + 1} "${moves[i]}" is illegal in this position` };
		}
	}
	return { ok: true };
}

/**
 * Which colour the human solves as.
 * Lichess style (`setupMoveFirst`): the side-to-move in the FEN plays the auto setup move,
 * so the human is the other colour. Manual style: the human is to move in the FEN.
 */
export function solverColorFor(fen: string, setupMoveFirst: boolean): Color {
	const toMove = new Chess(fen).turn() as Color;
	if (!setupMoveFirst) return toMove;
	return toMove === 'w' ? 'b' : 'w';
}

/** The FEN the solver actually faces (after the auto-played setup move, if any). */
export function solvingPosition(fen: string, moves: string[], setupMoveFirst: boolean): string {
	const chess = new Chess(fen);
	if (setupMoveFirst && moves.length > 0) {
		const m = parseUci(moves[0]);
		if (m) chess.move({ from: m.from, to: m.to, promotion: m.promotion });
	}
	return chess.fen();
}

/** chess.js Color/Square re-exports for convenience. */
export type { Square };
export const colorWord = (c: Color): 'white' | 'black' => (c === 'w' ? 'white' : 'black');
