/**
 * Generates static/data/sets/sample-tactics.json — a few hand-verified mates so the app
 * has data to run before you paste a real Lichess CSV. Every line is validated through
 * chess.js, and `mate:true` entries are asserted to end in checkmate.
 *
 * Run: node scripts/make-sample.mjs
 */
import { Chess } from 'chess.js';
import { writeFileSync, mkdirSync } from 'node:fs';

const sanDefs = [
	{
		title: "Scholar's mate",
		themes: ['mateIn1', 'opening'],
		san: ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#'],
		solveFromPly: 5,
		setupMoveFirst: true,
		mate: true,
		rating: 1000
	},
	{
		title: "Fool's mate",
		themes: ['mateIn1'],
		san: ['f3', 'e5', 'g4', 'Qh4#'],
		solveFromPly: 2,
		setupMoveFirst: true,
		mate: true,
		rating: 800
	}
];

const fenDefs = [
	{
		title: 'Promote to mate',
		themes: ['mateIn1', 'promotion', 'endgame'],
		fen: '7k/4P3/6K1/8/8/8/8/8 w - - 0 1',
		uci: ['e7e8q'],
		setupMoveFirst: false,
		mate: true,
		rating: 1200
	},
	{
		title: 'Back-rank mate',
		themes: ['mateIn1', 'backRank'],
		fen: '6k1/5ppp/8/8/8/8/8/R6K w - - 0 1',
		uci: ['a1a8'],
		setupMoveFirst: false,
		mate: true,
		rating: 1100
	},
	{
		title: 'Smothered mate',
		themes: ['mateIn1', 'smotheredMate'],
		fen: '6rk/6pp/8/6N1/8/8/8/7K w - - 0 1',
		uci: ['g5f7'],
		setupMoveFirst: false,
		mate: true,
		rating: 1500
	}
];

function finalize(d, i, fen, moves) {
	const v = new Chess(fen);
	for (const u of moves) {
		v.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.length === 5 ? u[4] : undefined });
	}
	if (d.mate && !v.isCheckmate()) throw new Error(`${d.title}: final position is not checkmate`);
	const turn = new Chess(fen).turn();
	const solverColor = d.setupMoveFirst ? (turn === 'w' ? 'b' : 'w') : turn;
	return {
		id: `sample_${String(i + 1).padStart(2, '0')}`,
		fen,
		moves,
		setupMoveFirst: d.setupMoveFirst,
		solverColor,
		rating: d.rating,
		themes: d.themes,
		source: 'sample'
	};
}

function fromSan(d, i) {
	const c = new Chess();
	const uciAll = d.san.map((s) => {
		const mv = c.move(s);
		return mv.from + mv.to + (mv.promotion ?? '');
	});
	const c2 = new Chess();
	for (let k = 0; k < d.solveFromPly; k++) c2.move(d.san[k]);
	return finalize(d, i, c2.fen(), uciAll.slice(d.solveFromPly));
}

const puzzles = [
	...sanDefs.map((d, i) => fromSan(d, i)),
	...fenDefs.map((d, i) => finalize(d, i + sanDefs.length, d.fen, d.uci))
];

const file = {
	schema: 'woodpecker-set@1',
	id: 'sample-tactics',
	title: 'Sample Tactics (demo)',
	description:
		'A few hand-verified mates to try the trainer. Paste a Lichess CSV in "New Set" to build a real ~300-puzzle set.',
	createdAt: '2026-06-26',
	source: 'sample',
	puzzles
};

mkdirSync('static/data/sets', { recursive: true });
writeFileSync('static/data/sets/sample-tactics.json', JSON.stringify(file, null, 2));
console.log(`wrote ${puzzles.length} puzzles to static/data/sets/sample-tactics.json`);
