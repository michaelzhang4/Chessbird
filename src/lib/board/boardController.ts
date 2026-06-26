/**
 * PuzzleBoard — glues chessground (rendering + input) to chess.js (rules), and runs the
 * solve loop for a single puzzle. Framework-free, so it ports unchanged to any UI.
 *
 * Convention: with `setupMoveFirst`, `moves[0]` is auto-played; the human then plays the
 * even-indexed moves of the remaining line and the opponent replies are auto-played.
 */
import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import type { Key, Dests } from '@lichess-org/chessground/types';
import { Chess, type Square } from 'chess.js';
import type { Color, Puzzle } from '../types';
import { colorWord, type Promotion } from '../chess';

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface SolveResult {
	solved: boolean;
	firstTryCorrect: boolean;
	numWrongMoves: number;
	usedSolution: boolean;
	msToFirstMove: number;
	msTotal: number;
}

export interface LoadCallbacks {
	onFirstMove?: () => void;
	onCorrect?: () => void;
	onWrong?: (numWrongMoves: number) => void;
	onSolved?: (result: SolveResult) => void;
	/** Fires once the puzzle concludes and on every review navigation/exploration step. */
	onReview?: (state: ReviewState) => void;
}

/** Snapshot of post-puzzle review state, emitted to the UI for nav controls + move list. */
export interface ReviewState {
	ply: number; // moves applied from the puzzle's starting position (cursor)
	total: number; // length of the line currently being viewed
	solutionLen: number; // length of the original solution line
	branched: boolean; // user has explored a move off the solution line
	sideToMove: Color;
	fen: string; // the position currently being viewed (for engine analysis)
	san: string[]; // SAN for each move in the current line
}

export interface PuzzleBoardOptions {
	/** Ask the UI which piece to promote to; resolve null to cancel the move. */
	requestPromotion?: (color: Color, dest: string) => Promise<Promotion | null>;
	now?: () => number;
	viewOnly?: boolean;
}

export class PuzzleBoard {
	private cg: Api;
	private chess = new Chess();
	private expectedLine: string[] = [];
	private lineIndex = 0;
	private solverColor: Color = 'w';
	private cb: LoadCallbacks = {};
	private readonly now: () => number;
	private readonly requestPromotion?: PuzzleBoardOptions['requestPromotion'];
	private readonly viewOnly: boolean;

	// per-puzzle state
	private startedAt = 0;
	private firstMoveAt = 0;
	private numWrongMoves = 0;
	private firstTryClean = true;
	private usedSolution = false;
	private finished = false;
	private busy = false;

	// post-puzzle review/exploration state
	private reviewing = false;
	private puzzleFen = '';
	private solutionLine: string[] = []; // the full scripted line (incl. setup move)
	private reviewLine: string[] = []; // the working line (may branch from the solution)
	private reviewCursor = 0;
	private reviewChess = new Chess();
	private branched = false;

	constructor(el: HTMLElement, opts: PuzzleBoardOptions = {}) {
		this.now = opts.now ?? (() => Date.now());
		this.requestPromotion = opts.requestPromotion;
		this.viewOnly = opts.viewOnly ?? false;
		this.cg = Chessground(el, {
			coordinates: false,
			animation: { enabled: true, duration: 230 },
			draggable: { enabled: !this.viewOnly, showGhost: true },
			selectable: { enabled: !this.viewOnly },
			movable: { free: false, color: undefined, showDests: true },
			drawable: { enabled: false, visible: true },
			highlight: { lastMove: true, check: true }
		});
	}

	destroy(): void {
		this.cg.destroy();
	}

	/** Static display of a position (set previews). */
	setViewFen(fen: string, orientation: Color): void {
		this.chess = new Chess(fen);
		this.cg.set({
			fen,
			orientation: colorWord(orientation),
			viewOnly: true,
			lastMove: undefined,
			movable: { color: undefined, dests: new Map() }
		});
	}

	async loadPuzzle(puzzle: Puzzle, cb: LoadCallbacks = {}): Promise<void> {
		this.cb = cb;
		this.finished = false;
		this.busy = true;
		this.numWrongMoves = 0;
		this.firstTryClean = true;
		this.usedSolution = false;
		this.firstMoveAt = 0;

		this.chess = new Chess(puzzle.fen);
		this.solverColor = puzzle.solverColor;
		this.reviewing = false;
		this.branched = false;
		this.puzzleFen = puzzle.fen;
		this.solutionLine = [...puzzle.moves];

		this.cg.set({
			fen: this.chess.fen(),
			orientation: colorWord(this.solverColor),
			turnColor: colorWord(this.chess.turn() as Color),
			lastMove: undefined,
			check: false,
			viewOnly: this.viewOnly,
			movable: { free: false, color: undefined, dests: new Map() }
		});

		if (puzzle.setupMoveFirst && puzzle.moves.length > 0) {
			this.expectedLine = puzzle.moves.slice(1);
			await delay(350);
			this.applyMove(puzzle.moves[0]);
		} else {
			this.expectedLine = [...puzzle.moves];
		}

		this.lineIndex = 0;
		this.busy = false;
		this.startedAt = this.now();
		if (!this.viewOnly) this.setUserToMove();
	}

	async showSolution(): Promise<void> {
		if (this.finished || this.busy) return;
		this.usedSolution = true;
		this.firstTryClean = false;
		this.busy = true;
		this.cg.set({ movable: { color: undefined, dests: new Map() } });
		for (let i = this.lineIndex; i < this.expectedLine.length; i++) {
			await delay(500);
			const uci = this.expectedLine[i];
			this.applyMove(uci);
			this.cg.setShapes([{ orig: uci.slice(0, 2) as Key, dest: uci.slice(2, 4) as Key, brush: 'green' }]);
		}
		this.lineIndex = this.expectedLine.length;
		this.busy = false;
		this.finishSolved();
	}

	// ---- internals ----

	private applyMove(uci: string): void {
		const from = uci.slice(0, 2);
		const to = uci.slice(2, 4);
		const promotion = uci.length === 5 ? (uci[4] as Promotion) : undefined;
		this.chess.move({ from, to, promotion });
		this.cg.set({
			fen: this.chess.fen(),
			turnColor: colorWord(this.chess.turn() as Color),
			lastMove: [from as Key, to as Key],
			check: this.chess.inCheck()
		});
	}

	private legalDests(chess: Chess = this.chess): Dests {
		const dests: Dests = new Map();
		for (const m of chess.moves({ verbose: true })) {
			const arr = dests.get(m.from as Key) ?? [];
			arr.push(m.to as Key);
			dests.set(m.from as Key, arr);
		}
		return dests;
	}

	private setUserToMove(): void {
		this.cg.setShapes([]);
		this.cg.set({
			turnColor: colorWord(this.solverColor),
			movable: {
				free: false,
				color: colorWord(this.solverColor),
				dests: this.legalDests(),
				showDests: true,
				events: {
					after: (orig: Key, dest: Key) => {
						void this.onUserMove(orig, dest);
					}
				}
			}
		});
	}

	private async onUserMove(orig: Key, dest: Key): Promise<void> {
		if (this.finished || this.busy) return;
		if (this.firstMoveAt === 0) {
			this.firstMoveAt = this.now();
			this.cb.onFirstMove?.();
		}

		const piece = this.chess.get(orig as Square);
		let promotion: Promotion | undefined;
		const toLastRank = dest[1] === '8' || dest[1] === '1';
		if (piece && piece.type === 'p' && toLastRank) {
			const choice = this.requestPromotion
				? await this.requestPromotion(this.solverColor, dest)
				: 'q';
			if (!choice) {
				// cancelled — snap back
				this.cg.set({ fen: this.chess.fen() });
				this.setUserToMove();
				return;
			}
			promotion = choice;
		}

		const candidate = `${orig}${dest}${promotion ?? ''}`;
		if (this.isCorrect(candidate)) {
			await this.acceptUserMove(candidate);
		} else {
			this.rejectUserMove();
		}
	}

	/** Exact match against the scripted move; plus: accept any mating move on the final ply. */
	private isCorrect(candidate: string): boolean {
		const expected = this.expectedLine[this.lineIndex];
		if (!expected) return false;
		if (candidate === expected) return true;
		const isFinalPly = this.lineIndex === this.expectedLine.length - 1;
		if (isFinalPly) {
			const clone = new Chess(this.chess.fen());
			try {
				clone.move({
					from: candidate.slice(0, 2),
					to: candidate.slice(2, 4),
					promotion: candidate.length === 5 ? (candidate[4] as Promotion) : undefined
				});
				if (clone.isCheckmate()) return true;
			} catch {
				/* illegal — fall through to incorrect */
			}
		}
		return false;
	}

	private async acceptUserMove(candidate: string): Promise<void> {
		this.busy = true;
		this.applyMove(candidate);
		this.lineIndex++;
		this.cb.onCorrect?.();

		if (this.lineIndex >= this.expectedLine.length) {
			this.busy = false;
			this.finishSolved();
			return;
		}
		// auto-play the opponent's reply
		await delay(300);
		this.applyMove(this.expectedLine[this.lineIndex]);
		this.lineIndex++;
		if (this.lineIndex >= this.expectedLine.length) {
			this.busy = false;
			this.finishSolved();
			return;
		}
		this.busy = false;
		this.setUserToMove();
	}

	private rejectUserMove(): void {
		this.numWrongMoves++;
		this.firstTryClean = false;
		this.cg.set({ fen: this.chess.fen() }); // snap back
		this.setUserToMove();
		this.cb.onWrong?.(this.numWrongMoves);
	}

	private finishSolved(): void {
		if (this.finished) return;
		this.finished = true;
		this.cg.set({ movable: { color: undefined, dests: new Map() } });
		const end = this.now();
		this.cb.onSolved?.({
			solved: true,
			firstTryCorrect: this.firstTryClean && !this.usedSolution,
			numWrongMoves: this.numWrongMoves,
			usedSolution: this.usedSolution,
			msToFirstMove: Math.max(0, (this.firstMoveAt || end) - this.startedAt),
			msTotal: Math.max(0, end - this.startedAt)
		});
		if (!this.viewOnly) this.enterReview();
	}

	// ---- post-puzzle review / free exploration ----

	/** After the puzzle concludes, let the user scrub the line and try their own moves. */
	private enterReview(): void {
		this.reviewing = true;
		this.branched = false;
		this.reviewLine = [...this.solutionLine];
		this.reviewCursor = this.reviewLine.length; // start on the final position
		this.renderReview();
	}

	/** Replay the working line up to the cursor and re-arm the board for free play. */
	private renderReview(): void {
		const ch = new Chess(this.puzzleFen);
		for (let i = 0; i < this.reviewCursor; i++) this.playUci(ch, this.reviewLine[i]);
		this.reviewChess = ch;
		const last = this.reviewCursor > 0 ? this.reviewLine[this.reviewCursor - 1] : undefined;
		this.cg.set({
			fen: ch.fen(),
			orientation: colorWord(this.solverColor),
			turnColor: colorWord(ch.turn() as Color),
			lastMove: last ? [last.slice(0, 2) as Key, last.slice(2, 4) as Key] : undefined,
			check: ch.inCheck(),
			movable: {
				free: false,
				color: colorWord(ch.turn() as Color),
				dests: this.legalDests(ch),
				showDests: true,
				events: { after: (orig: Key, dest: Key) => void this.onReviewMove(orig, dest) }
			}
		});
		this.cg.setShapes([]);
		this.emitReview();
	}

	/** A move played on the board during review: follow the line, or branch a new variation. */
	private async onReviewMove(orig: Key, dest: Key): Promise<void> {
		if (!this.reviewing) return;
		const ch = this.reviewChess;
		const piece = ch.get(orig as Square);
		let promotion: Promotion | undefined;
		const toLastRank = dest[1] === '8' || dest[1] === '1';
		if (piece && piece.type === 'p' && toLastRank) {
			const choice = this.requestPromotion
				? await this.requestPromotion(ch.turn() as Color, dest)
				: 'q';
			if (!choice) {
				this.renderReview(); // cancelled — snap back
				return;
			}
			promotion = choice;
		}
		const uci = `${orig}${dest}${promotion ?? ''}`;
		if (this.reviewLine[this.reviewCursor] === uci) {
			this.reviewCursor++; // same as the next move in view — just step forward
		} else {
			this.reviewLine = this.reviewLine.slice(0, this.reviewCursor);
			this.reviewLine.push(uci);
			this.reviewCursor++;
			this.branched = true;
		}
		this.renderReview();
	}

	private playUci(ch: Chess, uci: string): void {
		ch.move({
			from: uci.slice(0, 2),
			to: uci.slice(2, 4),
			promotion: uci.length === 5 ? (uci[4] as Promotion) : undefined
		});
	}

	private emitReview(): void {
		if (!this.cb.onReview) return;
		const ch = new Chess(this.puzzleFen);
		const san: string[] = [];
		for (const uci of this.reviewLine) {
			const m = ch.move({
				from: uci.slice(0, 2),
				to: uci.slice(2, 4),
				promotion: uci.length === 5 ? (uci[4] as Promotion) : undefined
			});
			san.push(m.san);
		}
		this.cb.onReview({
			ply: this.reviewCursor,
			total: this.reviewLine.length,
			solutionLen: this.solutionLine.length,
			branched: this.branched,
			sideToMove: this.reviewChess.turn() as Color,
			fen: this.reviewChess.fen(),
			san
		});
	}

	/** Jump to a specific point in the line (0 = starting position, n = after move n). */
	reviewGoto(ply: number): void {
		if (!this.reviewing) return;
		this.reviewCursor = Math.max(0, Math.min(this.reviewLine.length, ply));
		this.renderReview();
	}
	reviewBack(): void {
		this.reviewGoto(this.reviewCursor - 1);
	}
	reviewForward(): void {
		this.reviewGoto(this.reviewCursor + 1);
	}
	reviewStart(): void {
		this.reviewGoto(0);
	}
	reviewEnd(): void {
		this.reviewGoto(this.reviewLine.length);
	}
	/** Discard any explored variation and restore the engine solution line. */
	reviewReset(): void {
		if (!this.reviewing) return;
		this.branched = false;
		this.reviewLine = [...this.solutionLine];
		this.reviewCursor = this.reviewLine.length;
		this.renderReview();
	}
}
