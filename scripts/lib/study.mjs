/**
 * Shared helpers for importing Lichess STUDIES into Woodpecker sets.
 * A study chapter is an exercise: a starting FEN (solver to move) + a SAN mainline.
 * We convert SAN -> UCI with chess.js. No runtime deps beyond chess.js.
 */
import { Chess } from 'chess.js';

export const STUDY_PGN = (id) => `https://lichess.org/study/${id}.pgn`;

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

/**
 * Convert one study PGN into puzzles for a given setId.
 * Returns { studyName, puzzles, skipped[] }.
 */
export function studyToPuzzles(pgn, setId) {
	const blocks = splitChapters(pgn);
	const puzzles = [];
	const skipped = [];
	let studyName;

	blocks.forEach((block, i) => {
		const n = i + 1;
		studyName = studyName || tag(block, 'StudyName');
		const fen = tag(block, 'FEN');
		const chapterUrl = tag(block, 'ChapterURL');
		const chapterName = tag(block, 'ChapterName');
		if (!fen) {
			skipped.push({ n, name: chapterName, reason: 'no-fen' });
			return;
		}
		const sans = mainlineSans(block);
		if (sans.length === 0) {
			skipped.push({ n, name: chapterName, reason: 'no-moves' });
			return;
		}
		const chess = new Chess(fen);
		const moves = [];
		try {
			for (const san of sans) {
				const mv = chess.move(san);
				moves.push(mv.from + mv.to + (mv.promotion ?? ''));
			}
		} catch (e) {
			skipped.push({ n, name: chapterName, reason: `illegal:${e?.message ?? e}` });
			return;
		}
		puzzles.push({
			id: `${setId}_${String(n).padStart(3, '0')}`,
			fen,
			moves,
			setupMoveFirst: false,
			solverColor: fen.split(/\s+/)[1] === 'b' ? 'b' : 'w',
			source: 'lichess-study',
			...(chapterUrl ? { sourceUrl: chapterUrl } : {})
		});
	});

	return { studyName, puzzles, skipped };
}

/** Position identity ignoring move clocks: placement + stm + castling + ep. */
export const posKey = (fen) => fen.split(/\s+/).slice(0, 4).join(' ');
/** Full puzzle identity: position + solution. */
export const puzKey = (p) => `${posKey(p.fen)}|${p.moves.join(' ')}`;
