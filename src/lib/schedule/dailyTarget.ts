/** "What should I solve today" — spread the remaining puzzles over the days left in the cycle. */
import { DAY_MS } from '../time';

/** Whole days left before the deadline, floored at 1 (so an overdue cycle says "finish now"). */
export function remainingDays(deadlineAt: number, now: number): number {
	return Math.max(1, Math.ceil((deadlineAt - now) / DAY_MS));
}

/** Recommended number of puzzles to solve today. */
export function dailyTarget(remainingPuzzles: number, deadlineAt: number, now: number): number {
	if (remainingPuzzles <= 0) return 0;
	return Math.ceil(remainingPuzzles / remainingDays(deadlineAt, now));
}
