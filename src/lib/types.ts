/**
 * Core domain types — framework-free, no runtime deps.
 * Everything (parsers, db, board, schedule, stats, UI) speaks these shapes.
 */

export type Color = 'w' | 'b';

/**
 * A normalized puzzle. Both Lichess rows and hand-pasted "best move" positions
 * (opening/positional) map onto this single shape.
 *
 * `fen` is the raw starting position. If `setupMoveFirst` is true (Lichess style),
 * `moves[0]` is the opponent's move that is auto-played; the human then plays
 * `moves[1], moves[3], ...` and the opponent replies `moves[2], moves[4], ...`.
 * If false (manual style), the human is to move in `fen` and plays `moves[0], moves[2], ...`.
 */
export interface Puzzle {
	id: string;
	fen: string;
	moves: string[]; // UCI, e.g. "e2e4", "e7e8q" (promotion), "e1g1" (castle)
	setupMoveFirst: boolean;
	solverColor: Color; // side the human plays — board orientation
	rating?: number;
	themes?: string[];
	openingTags?: string[];
	sourceUrl?: string;
	source?: string; // 'lichess' | 'manual' | 'pgn' | ...
}

/** A reusable set of puzzles — a shipped library file or a user-created set. */
export interface PuzzleSet {
	id: string;
	title: string;
	description?: string;
	createdAt: string; // ISO date
	source: string; // 'lichess-csv' | 'manual' | 'pgn' | 'library'
	count: number;
	ratingMin?: number;
	ratingMax?: number;
	ratingMedian?: number;
	themeCounts?: Record<string, number>;
	puzzles: Puzzle[];
	/** runtime-only: where the set was loaded from (not persisted in the file). */
	origin?: 'library' | 'user';
}

// ---------------------------------------------------------------------------
// Training program (a Woodpecker run over one set)
// ---------------------------------------------------------------------------

export type CycleStatus = 'locked' | 'active' | 'completed';
export type ProgramStatus = 'active' | 'completed' | 'abandoned';

export interface Cycle {
	index: number; // 0..3
	allottedDays: number; // hard deadline budget
	breakDaysAfter: number; // mandatory rest after finishing the set
	status: CycleStatus;
	startedAt?: number; // epoch ms — clock starts here
	deadlineAt?: number; // startedAt + allottedDays
	completedAt?: number; // when the last puzzle of the cycle was solved
	breakEndsAt?: number; // completedAt + breakDaysAfter (gates the next cycle)
	deadlineResetCount: number; // honest stat if the user resets an overdue deadline
}

export interface TrainingProgram {
	id: string;
	setId: string;
	setTitle: string;
	puzzleOrder: string[]; // frozen order of puzzle ids — identical every cycle
	totalPuzzles: number;
	startedAt: number;
	status: ProgramStatus;
	currentCycleIndex: number; // 0..3
	cycles: Cycle[]; // length 4
}

// ---------------------------------------------------------------------------
// Per-puzzle attempt — one row per (program, cycle, puzzle)
// ---------------------------------------------------------------------------

export interface Attempt {
	id: string; // `${programId}:${cycleIndex}:${puzzleId}`
	programId: string;
	cycleIndex: number;
	puzzleId: string;
	startedAt: number;
	completedAt: number;
	msToFirstMove: number;
	msTotal: number;
	firstTryCorrect: boolean;
	numWrongMoves: number;
	solved: boolean;
	usedSolution: boolean;
}

// ---------------------------------------------------------------------------
// Eligibility assessment
// ---------------------------------------------------------------------------

export type Verdict = 'eligible' | 'borderline' | 'too_hard' | 'too_easy';

export interface AssessmentItem {
	puzzleId: string;
	firstTryCorrect: boolean;
	msToFirstMove: number;
	msTotal: number;
	slowFlag: boolean;
}

export interface AssessmentRun {
	id: string;
	setId: string;
	setTitle: string;
	createdAt: number;
	sampleSize: number;
	items: AssessmentItem[];
	firstTryAccuracy: number; // 0..1
	medianMsToFirstMove: number;
	slowCount: number;
	verdict: Verdict;
}

// ---------------------------------------------------------------------------
// Resume session — the current sitting's queue of puzzle ids
// ---------------------------------------------------------------------------

export interface Session {
	id: string; // = programId (one active session per program)
	programId: string;
	cycleIndex: number;
	dayKey: string; // local YYYY-MM-DD when the queue was built
	queue: string[];
	cursor: number;
	startedAt: number;
}
