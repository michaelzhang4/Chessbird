import { describe, it, expect } from 'vitest';
import { parseUci, validateLine, solverColorFor, solvingPosition } from './chess';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('parseUci', () => {
	it('parses plain and promotion moves', () => {
		expect(parseUci('e2e4')).toEqual({ from: 'e2', to: 'e4', promotion: undefined });
		expect(parseUci('e7e8q')).toEqual({ from: 'e7', to: 'e8', promotion: 'q' });
	});
	it('rejects malformed input', () => {
		expect(parseUci('zz')).toBeNull();
		expect(parseUci('e2e9')).toBeNull();
		expect(parseUci('e2e4k')).toBeNull();
	});
});

describe('validateLine', () => {
	it('accepts a legal sequence', () => {
		expect(validateLine(START, ['e2e4', 'e7e5', 'g1f3']).ok).toBe(true);
	});
	it('rejects an illegal move', () => {
		expect(validateLine(START, ['e2e5']).ok).toBe(false);
	});
	it('rejects a bad FEN', () => {
		expect(validateLine('not-a-fen', ['e2e4']).ok).toBe(false);
	});
	it('accepts promotion to mate (castling/EP handled by chess.js)', () => {
		expect(validateLine('7k/4P3/6K1/8/8/8/8/8 w - - 0 1', ['e7e8q']).ok).toBe(true);
	});
});

describe('solverColorFor', () => {
	it('flips side for Lichess setup-move puzzles', () => {
		expect(solverColorFor(START, true)).toBe('b');
		expect(solverColorFor(START, false)).toBe('w');
	});
});

describe('solvingPosition', () => {
	it('applies the auto setup move', () => {
		const fen = solvingPosition(START, ['e2e4'], true);
		expect(fen.split(' ')[1]).toBe('b'); // black to move after the auto e2e4
	});
	it('leaves the position untouched when not setupMoveFirst', () => {
		expect(solvingPosition(START, ['e2e4'], false)).toBe(START);
	});
});
