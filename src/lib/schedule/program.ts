/**
 * The Woodpecker scheduling state machine — pure functions over a TrainingProgram.
 * Every call takes `now` (epoch ms) so behaviour is deterministic and unit-testable;
 * the app passes Date.now() at the call site.
 */
import { nanoid } from 'nanoid';
import type { Cycle, TrainingProgram } from '../types';
import { DAY_MS } from '../time';
import { dailyTarget } from './dailyTarget';

/** [allottedDays, breakDaysAfter] per cycle. 7+2+4+1+2+1+1 = ~18 days. */
export const DEFAULT_SCHEDULE: ReadonlyArray<{ allottedDays: number; breakDaysAfter: number }> = [
	{ allottedDays: 7, breakDaysAfter: 2 },
	{ allottedDays: 4, breakDaysAfter: 1 },
	{ allottedDays: 2, breakDaysAfter: 1 },
	{ allottedDays: 1, breakDaysAfter: 0 }
];

export function createProgram(opts: {
	setId: string;
	setTitle: string;
	puzzleOrder: string[];
	now: number;
}): TrainingProgram {
	const cycles: Cycle[] = DEFAULT_SCHEDULE.map((c, i) => ({
		index: i,
		allottedDays: c.allottedDays,
		breakDaysAfter: c.breakDaysAfter,
		status: i === 0 ? 'active' : 'locked',
		startedAt: i === 0 ? opts.now : undefined,
		deadlineAt: i === 0 ? opts.now + c.allottedDays * DAY_MS : undefined,
		deadlineResetCount: 0
	}));
	return {
		id: nanoid(10),
		setId: opts.setId,
		setTitle: opts.setTitle,
		puzzleOrder: opts.puzzleOrder,
		totalPuzzles: opts.puzzleOrder.length,
		startedAt: opts.now,
		status: 'active',
		currentCycleIndex: 0,
		cycles
	};
}

// ---- transitions (return a new program; never mutate) ----

function cloneCycles(p: TrainingProgram): Cycle[] {
	return p.cycles.map((c) => ({ ...c }));
}

/** Complete the current cycle: start its break and, if it was the final cycle, finish the program. */
export function markCycleComplete(program: TrainingProgram, now: number): TrainingProgram {
	const i = program.currentCycleIndex;
	const cycles = cloneCycles(program);
	const c = cycles[i];
	if (c.status === 'completed') return program;
	c.status = 'completed';
	c.completedAt = now;
	c.breakEndsAt = now + c.breakDaysAfter * DAY_MS;
	const isFinal = i >= cycles.length - 1;
	return { ...program, cycles, status: isFinal ? 'completed' : program.status };
}

/** Whether the user may begin the next cycle (current completed, break elapsed, not final). */
export function canStartNextCycle(program: TrainingProgram, now: number): boolean {
	const c = program.cycles[program.currentCycleIndex];
	return (
		c.status === 'completed' &&
		program.currentCycleIndex < program.cycles.length - 1 &&
		now >= (c.breakEndsAt ?? Infinity)
	);
}

/** Begin the next cycle, starting its hard-deadline clock now. */
export function startNextCycle(program: TrainingProgram, now: number): TrainingProgram {
	const i = program.currentCycleIndex;
	if (i >= program.cycles.length - 1) return program;
	const cycles = cloneCycles(program);
	const next = cycles[i + 1];
	next.status = 'active';
	next.startedAt = now;
	next.deadlineAt = now + next.allottedDays * DAY_MS;
	return { ...program, cycles, currentCycleIndex: i + 1 };
}

/** Push an overdue cycle's deadline to `now` (records the reset for honest stats). */
export function resetCycleDeadline(program: TrainingProgram, now: number): TrainingProgram {
	const i = program.currentCycleIndex;
	const cycles = cloneCycles(program);
	const c = cycles[i];
	c.startedAt = now;
	c.deadlineAt = now + c.allottedDays * DAY_MS;
	c.deadlineResetCount += 1;
	return { ...program, cycles };
}

// ---- derived view: "what should I do right now" ----

export type ProgramPhase =
	| 'cycle-active'
	| 'cycle-overdue'
	| 'break'
	| 'next-ready'
	| 'program-complete';

export interface ProgramView {
	phase: ProgramPhase;
	cycleIndex: number;
	cycle: Cycle;
	totalPuzzles: number;
	solvedThisCycle: number;
	remainingPuzzles: number;
	deadlineAt?: number;
	msToDeadline?: number; // negative if overdue
	dayNumber?: number; // 1-based day within the cycle
	totalDays?: number;
	target?: number; // recommended puzzles for today
	breakEndsAt?: number;
	msToBreakEnd?: number;
	nextCycleIndex?: number;
}

/**
 * Compute the current phase + display numbers.
 * `solvedThisCycle` is supplied by the caller (counted from stored attempts).
 */
export function computeProgramView(
	program: TrainingProgram,
	solvedThisCycle: number,
	now: number
): ProgramView {
	const i = program.currentCycleIndex;
	const cycle = program.cycles[i];
	const totalPuzzles = program.totalPuzzles;
	const remainingPuzzles = Math.max(0, totalPuzzles - solvedThisCycle);

	const base = { cycleIndex: i, cycle, totalPuzzles, solvedThisCycle, remainingPuzzles };

	if (program.status === 'completed' && cycle.status === 'completed') {
		return { ...base, phase: 'program-complete' };
	}

	if (cycle.status === 'completed') {
		// In a rest break (or the break has just elapsed).
		const isFinal = i >= program.cycles.length - 1;
		if (isFinal) return { ...base, phase: 'program-complete' };
		const breakEndsAt = cycle.breakEndsAt ?? now;
		if (now >= breakEndsAt) {
			return { ...base, phase: 'next-ready', breakEndsAt, msToBreakEnd: 0, nextCycleIndex: i + 1 };
		}
		return {
			...base,
			phase: 'break',
			breakEndsAt,
			msToBreakEnd: breakEndsAt - now,
			nextCycleIndex: i + 1
		};
	}

	// cycle.status === 'active'
	const deadlineAt = cycle.deadlineAt ?? now;
	const msToDeadline = deadlineAt - now;
	const startedAt = cycle.startedAt ?? now;
	const dayNumber = Math.min(
		cycle.allottedDays,
		Math.max(1, Math.floor((now - startedAt) / DAY_MS) + 1)
	);
	const target = dailyTarget(remainingPuzzles, deadlineAt, now);

	return {
		...base,
		phase: msToDeadline < 0 ? 'cycle-overdue' : 'cycle-active',
		deadlineAt,
		msToDeadline,
		dayNumber,
		totalDays: cycle.allottedDays,
		target
	};
}
