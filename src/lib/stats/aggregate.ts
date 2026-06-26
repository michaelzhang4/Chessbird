/** Per-cycle aggregates and the cross-cycle "improvement" view (the Woodpecker payoff). */
import type { Attempt, TrainingProgram } from '../types';
import { median } from '../time';

export interface CycleStats {
	cycleIndex: number;
	solved: number;
	firstTryCorrect: number;
	firstTryAccuracy: number; // over solved puzzles
	totalMs: number;
	avgMs: number;
	medianMs: number;
}

export function cycleStats(cycleIndex: number, attempts: Attempt[]): CycleStats {
	const solvedAttempts = attempts.filter((a) => a.cycleIndex === cycleIndex && a.solved);
	const solved = solvedAttempts.length;
	const ftc = solvedAttempts.filter((a) => a.firstTryCorrect).length;
	const times = solvedAttempts.map((a) => a.msTotal);
	const totalMs = times.reduce((s, t) => s + t, 0);
	return {
		cycleIndex,
		solved,
		firstTryCorrect: ftc,
		firstTryAccuracy: solved ? ftc / solved : 0,
		totalMs,
		avgMs: solved ? Math.round(totalMs / solved) : 0,
		medianMs: median(times)
	};
}

export interface Leech {
	puzzleId: string;
	failedCycles: number[];
}

export interface ProgramStats {
	perCycle: CycleStats[];
	/** puzzles failed first-try in >= 2 cycles, worst first */
	leeches: Leech[];
}

export function programStats(program: TrainingProgram, attempts: Attempt[]): ProgramStats {
	const perCycle = program.cycles.map((c) => cycleStats(c.index, attempts));

	const byPuzzle = new Map<string, number[]>();
	for (const a of attempts) {
		if (a.solved && !a.firstTryCorrect) {
			const arr = byPuzzle.get(a.puzzleId) ?? [];
			arr.push(a.cycleIndex);
			byPuzzle.set(a.puzzleId, arr);
		}
	}
	const leeches: Leech[] = [...byPuzzle.entries()]
		.filter(([, cy]) => cy.length >= 2)
		.map(([puzzleId, failedCycles]) => ({
			puzzleId,
			failedCycles: failedCycles.sort((a, b) => a - b)
		}))
		.sort((a, b) => b.failedCycles.length - a.failedCycles.length);

	return { perCycle, leeches };
}
