/**
 * Shared helpers for importing Lichess STUDIES into Woodpecker sets.
 * A study chapter is an exercise: a starting FEN (solver to move) + a SAN mainline.
 * We convert SAN -> UCI with chess.js. No runtime deps beyond chess.js.
 */
import { Chess } from 'chess.js';

export const STUDY_PGN = (id) => `https://lichess.org/study/${id}.pgn`;
export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export function slug(s) {
	return (s || '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60) || 'study';
}

/** Fetch a study's PGN with light retry/backoff (handles lichess 429). */
export async function fetchStudyPgn(id, { retries = 4 } = {}) {
	const url = STUDY_PGN(id);
	for (let attempt = 0; attempt <= retries; attempt++) {
		const res = await fetch(url, { headers: { Accept: 'application/x-chess-pgn' } });
		if (res.ok) return res.text();
		if (res.status === 429 || res.status >= 500) {
			const wait = 2000 * (attempt + 1);
			await new Promise((r) => setTimeout(r, wait));
			continue;
		}
		throw new Error(`${res.status} ${res.statusText}`);
	}
	throw new Error(`gave up after ${retries} retries (rate-limited?)`);
}

const tag = (block, name) => {
	const m = block.match(new RegExp(`\\[${name} "([^"]*)"\\]`));
	return m ? m[1] : undefined;
};

/** Split a multi-chapter study PGN into raw chapter blocks. */
export function splitChapters(pgn) {
	return pgn
		.split(/\n(?=\[Event )/)
		.map((b) => b.trim())
		.filter(Boolean);
}

/** Pull the SAN mainline tokens out of a chapter block. */
function mainlineSans(block) {
	let movetext = block
		.split('\n')
		.filter((l) => !l.startsWith('[') && l.trim())
		.join(' ')
		.replace(/\{[^}]*\}/g, ''); // comments
	// Remove variations, innermost-first, so nested "( ... ( ... ) ... )" fully clears.
	let prev;
	do {
		prev = movetext;
		movetext = movetext.replace(/\([^()]*\)/g, ' ');
	} while (movetext !== prev);
	movetext = movetext
		.replace(/[()]/g, ' ') // any stray unbalanced parens
		.replace(/\$\d+/g, '') // NAGs
		.replace(/\b\d+\.(\.\.)?/g, '') // move numbers
		.replace(/\*|1-0|0-1|1\/2-1\/2/g, '') // results
		.trim();
	return movetext ? movetext.split(/\s+/).filter(Boolean) : [];
}

// ---- variation-tree expansion (for repertoire studies) -----------------------

/** Tokenize movetext into MOVE / '(' / ')' tokens, keeping variations. */
function tokenizeMovetext(block) {
	let mt = block
		.split('\n')
		.filter((l) => !l.startsWith('[') && l.trim())
		.join(' ')
		.replace(/\{[^}]*\}/g, ' ') // comments
		.replace(/\$\d+/g, ' ') // NAGs
		.replace(/\*|1-0|0-1|1\/2-1\/2/g, ' ') // results
		.replace(/\(/g, ' ( ')
		.replace(/\)/g, ' ) ');
	const toks = [];
	for (let t of mt.split(/\s+/).filter(Boolean)) {
		if (t === '(' || t === ')') {
			toks.push(t);
			continue;
		}
		t = t.replace(/^\d+\.(\.\.)?/, ''); // strip "12." / "12..." prefix
		if (!t || /^\d+\.*$/.test(t)) continue; // bare move number
		toks.push(t);
	}
	return toks;
}

/** Parse tokens into plies: [{ move, alts: [plies, …] }]. A '(' attaches to the prior move. */
function parsePlies(toks, start = 0) {
	const plies = [];
	let i = start;
	while (i < toks.length && toks[i] !== ')') {
		if (toks[i] === '(') {
			const sub = parsePlies(toks, i + 1);
			i = sub.next + 1; // consume the matching ')'
			if (plies.length) plies[plies.length - 1].alts.push(sub.plies);
			continue;
		}
		plies.push({ move: toks[i], alts: [] });
		i++;
	}
	return { plies, next: i };
}

/** All root-to-leaf move sequences (SAN) through the tree; bounded by `cap`. */
function enumerateLines(plies, capRef) {
	if (plies.length === 0) return [[]];
	const [p, ...rest] = plies;
	const out = [];
	for (const cont of enumerateLines(rest, capRef)) {
		out.push([p.move, ...cont]);
		if (out.length >= capRef.cap) return out;
	}
	for (const alt of p.alts) {
		for (const line of enumerateLines(alt, capRef)) {
			out.push(line);
			if (out.length >= capRef.cap) return out;
		}
	}
	return out;
}

/** Expand a chapter's movetext into every distinct line (≥2 plies). */
export function expandLines(block, cap = 400) {
	const { plies } = parsePlies(tokenizeMovetext(block));
	const lines = enumerateLines(plies, { cap });
	const seen = new Set();
	const out = [];
	for (const l of lines) {
		if (l.length < 2) continue;
		const k = l.join(' ');
		if (seen.has(k)) continue;
		seen.add(k);
		out.push(l);
	}
	return out;
}

/**
 * Convert one study PGN into puzzles for a given setId.
 *
 * opts:
 *  - forceSolver 'w'|'b' : the side the user drills. When the chapter's side-to-move
 *    isn't this side, the opening move(s) auto-play (setupMoveFirst). Used for opening
 *    repertoire studies. Default: solver = side to move, nothing auto-played (tactics).
 *  - defaultStartFen     : chapters with no SetUp FEN start from the initial position
 *    (opening studies begin at move 1). Default: such chapters are skipped.
 *  - expandVariations    : emit one drill per line through the whole variation tree
 *    (the real repertoire), not just the mainline. Default: mainline only.
 *  - maxLinesPerChapter / maxPuzzles : caps to keep a set sane.
 *
 * Returns { studyName, puzzles, skipped[] }.
 */
export function studyToPuzzles(pgn, setId, opts = {}) {
	const {
		forceSolver,
		defaultStartFen = false,
		expandVariations = false,
		maxLinesPerChapter = 250,
		maxPuzzles = 600
	} = opts;
	const blocks = splitChapters(pgn);
	const puzzles = [];
	const skipped = [];
	const seen = new Set(); // dedup identical lines across chapters
	let studyName;

	for (let i = 0; i < blocks.length; i++) {
		if (puzzles.length >= maxPuzzles) break;
		const block = blocks[i];
		const n = i + 1;
		studyName = studyName || tag(block, 'StudyName');
		const fen = tag(block, 'FEN') || (defaultStartFen ? START_FEN : undefined);
		const chapterUrl = tag(block, 'ChapterURL');
		const chapterName = tag(block, 'ChapterName');
		if (!fen) {
			skipped.push({ n, name: chapterName, reason: 'no-fen' });
			continue;
		}
		const fenSide = fen.split(/\s+/)[1] === 'b' ? 'b' : 'w';
		const solverColor = forceSolver || fenSide;
		const setupMoveFirst = forceSolver ? fenSide !== forceSolver : false;

		const lines = expandVariations ? expandLines(block, maxLinesPerChapter) : [mainlineSans(block)];
		const validLines = lines.filter((l) => l.length > 0);
		if (validLines.length === 0) {
			skipped.push({ n, name: chapterName, reason: 'no-moves' });
			continue;
		}

		let lineNo = 0;
		for (const sans of validLines) {
			if (puzzles.length >= maxPuzzles) break;
			const chess = new Chess(fen);
			const moves = [];
			let ok = true;
			for (const san of sans) {
				try {
					const mv = chess.move(san);
					moves.push(mv.from + mv.to + (mv.promotion ?? ''));
				} catch {
					ok = false;
					break;
				}
			}
			if (!ok) continue; // skip an unparseable line, keep the rest of the chapter
			if (setupMoveFirst && moves.length < 2) continue; // solver needs a move
			const key = `${posKey(fen)}|${moves.join(' ')}`;
			if (seen.has(key)) continue;
			seen.add(key);
			lineNo++;
			puzzles.push({
				id: `${setId}_${String(n).padStart(3, '0')}_${String(lineNo).padStart(3, '0')}`,
				fen,
				moves,
				setupMoveFirst,
				solverColor,
				source: 'lichess-study',
				...(chapterUrl ? { sourceUrl: chapterUrl } : {})
			});
		}
	}

	return { studyName, puzzles, skipped };
}

/** Position identity ignoring move clocks: placement + stm + castling + ep. */
export const posKey = (fen) => fen.split(/\s+/).slice(0, 4).join(' ');
/** Full puzzle identity: position + solution. */
export const puzKey = (p) => `${posKey(p.fen)}|${p.moves.join(' ')}`;
