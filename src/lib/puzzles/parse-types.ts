import type { Puzzle } from '../types';

export type ParseFormat = 'lichess-csv' | 'fen-solution' | 'pgn' | 'unknown';

export interface ParseError {
	line: number;
	reason: string;
}

export interface ParseResult {
	format: ParseFormat;
	puzzles: Puzzle[];
	errors: ParseError[];
	/** number of exact-duplicate puzzles removed during routing */
	dropped: number;
}
