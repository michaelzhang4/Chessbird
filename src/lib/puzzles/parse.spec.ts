import { describe, it, expect } from 'vitest';
import { parseLichessCsv } from './parseLichessCsv';
import { parseFenSolution } from './parseFenSolution';
import { parsePuzzles, detectFormat } from './parseRouter';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('parseLichessCsv', () => {
	it('parses a header row and marks setupMoveFirst', () => {
		const csv =
			'PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags\n' +
			`00001,${START},e2e4 e7e5,1500,80,90,100,opening fork,https://x,\n`;
		const { puzzles, errors } = parseLichessCsv(csv);
		expect(errors).toHaveLength(0);
		expect(puzzles).toHaveLength(1);
		expect(puzzles[0].setupMoveFirst).toBe(true);
		expect(puzzles[0].solverColor).toBe('b');
		expect(puzzles[0].rating).toBe(1500);
		expect(puzzles[0].themes).toEqual(['opening', 'fork']);
		expect(puzzles[0].id).toBe('lichess_00001');
	});
	it('reports an invalid move line (headerless)', () => {
		const csv = `00002,${START},e2e5,1500,,,,,,\n`;
		const { puzzles, errors } = parseLichessCsv(csv);
		expect(puzzles).toHaveLength(0);
		expect(errors).toHaveLength(1);
	});
});

describe('parseFenSolution', () => {
	it('parses a comma-delimited line; solver is to move by default', () => {
		const { puzzles, errors } = parseFenSolution(`${START}, e2e4 e7e5`);
		expect(errors).toHaveLength(0);
		expect(puzzles[0].setupMoveFirst).toBe(false);
		expect(puzzles[0].solverColor).toBe('w');
	});
	it('errors when there is no delimiter', () => {
		expect(parseFenSolution(`${START} e2e4`).errors).toHaveLength(1);
	});
});

describe('parseRouter', () => {
	it('detects formats', () => {
		expect(detectFormat('PuzzleId,FEN,Moves,Rating')).toBe('lichess-csv');
		expect(detectFormat(`${START}, e2e4`)).toBe('fen-solution');
		expect(detectFormat('hello world')).toBe('unknown');
	});
	it('de-duplicates identical puzzles', () => {
		const r = parsePuzzles(`${START}, e2e4\n${START}, e2e4`, { format: 'fen-solution' });
		expect(r.puzzles).toHaveLength(1);
		expect(r.dropped).toBe(1);
	});
});
