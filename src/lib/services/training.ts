/** High-level training operations — ties the schedule engine to Dexie persistence. */
import type { Attempt, Puzzle, PuzzleSet, TrainingProgram } from '$lib/types';
import { attemptsRepo, attemptId, programsRepo, setsRepo, db } from '$lib/db';
import {
	createProgram,
	markCycleComplete,
	startNextCycle,
	resetCycleDeadline,
	computeProgramView,
	type ProgramView
} from '$lib/schedule/program';
import type { SolveResult } from '$lib/board/boardController';
import { dayKey } from '$lib/time';

/** Fisher–Yates shuffle (returns a new array). */
function shuffle<T>(a: T[]): T[] {
	const r = [...a];
	for (let i = r.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[r[i], r[j]] = [r[j], r[i]];
	}
	return r;
}

export interface ActiveState {
	program: TrainingProgram;
	set: PuzzleSet;
	solvedThisCycle: number;
	solvedToday: number;
	view: ProgramView;
}

export async function loadActive(now = Date.now()): Promise<ActiveState | null> {
	const program = await programsRepo.getActive();
	if (!program) return null;
	const set = await setsRepo.get(program.setId);
	if (!set) return null;
	const attempts = await attemptsRepo.forCycle(program.id, program.currentCycleIndex);
	const solvedThisCycle = new Set(attempts.filter((a) => a.solved).map((a) => a.puzzleId)).size;
	const today = dayKey(now);
	const solvedToday = attempts.filter((a) => a.solved && dayKey(a.completedAt) === today).length;
	const view = computeProgramView(program, solvedThisCycle, now);
	return { program, set, solvedThisCycle, solvedToday, view };
}

/** Begin a Woodpecker program for a set (snapshots its puzzles into IndexedDB for offline use). */
export async function startProgram(set: PuzzleSet, now = Date.now()): Promise<TrainingProgram> {
	await setsRepo.save(set);
	const program = createProgram({
		setId: set.id,
		setTitle: set.title,
		// Shuffle once at program start; each cycle gets its own order so you train the
		// pattern, not the sequence. The order is stable within a cycle (see buildQueue).
		puzzleOrder: shuffle(set.puzzles.map((p) => p.id)),
		now
	});
	await programsRepo.save(program);
	await programsRepo.setActive(program.id);
	return program;
}

/** The remaining puzzles to solve in the current cycle, in the cycle's (shuffled) order. */
export async function buildQueue(program: TrainingProgram): Promise<string[]> {
	const solved = await attemptsRepo.solvedIdsForCycle(program.id, program.currentCycleIndex);
	return program.puzzleOrder.filter((id) => !solved.has(id));
}

/** Persist a solve; advance the program if the cycle just finished. */
export async function recordSolve(
	program: TrainingProgram,
	puzzle: Puzzle,
	result: SolveResult,
	now = Date.now()
): Promise<{ program: TrainingProgram; solvedThisCycle: number; cycleCompleted: boolean }> {
	const cycleIndex = program.currentCycleIndex;
	const id = attemptId(program.id, cycleIndex, puzzle.id);
	const existing = await db.attempts.get(id);
	const attempt: Attempt = {
		id,
		programId: program.id,
		cycleIndex,
		puzzleId: puzzle.id,
		startedAt: now - result.msTotal,
		completedAt: now,
		msToFirstMove: result.msToFirstMove,
		msTotal: result.msTotal,
		// preserve the honest first-try result if this puzzle was already attempted this cycle
		firstTryCorrect: existing ? existing.firstTryCorrect : result.firstTryCorrect,
		numWrongMoves: result.numWrongMoves,
		solved: result.solved,
		usedSolution: result.usedSolution
	};
	await attemptsRepo.put(attempt);

	const solvedThisCycle = await attemptsRepo.countSolvedForCycle(program.id, cycleIndex);
	let updated = program;
	let cycleCompleted = false;
	if (
		solvedThisCycle >= program.totalPuzzles &&
		program.cycles[cycleIndex].status === 'active'
	) {
		updated = markCycleComplete(program, now);
		await programsRepo.save(updated);
		cycleCompleted = true;
	}
	return { program: updated, solvedThisCycle, cycleCompleted };
}

export async function advanceToNextCycle(
	program: TrainingProgram,
	now = Date.now()
): Promise<TrainingProgram> {
	// Re-shuffle for the new cycle so each repeat presents a different order.
	const started = startNextCycle(program, now);
	const updated = { ...started, puzzleOrder: shuffle(started.puzzleOrder) };
	await programsRepo.save(updated);
	return updated;
}

export async function resetDeadline(
	program: TrainingProgram,
	now = Date.now()
): Promise<TrainingProgram> {
	const updated = resetCycleDeadline(program, now);
	await programsRepo.save(updated);
	return updated;
}

/** Map puzzle id -> Puzzle for the active set. */
export function puzzleMap(set: PuzzleSet): Map<string, Puzzle> {
	return new Map(set.puzzles.map((p) => [p.id, p]));
}
