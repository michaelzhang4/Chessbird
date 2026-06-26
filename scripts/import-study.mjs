/**
 * Import a Lichess STUDY into a bundled Woodpecker set.
 *
 *   node scripts/import-study.mjs <studyId> <setId> "<Title>"
 *   e.g. node scripts/import-study.mjs fmCGaziQ woodpecker-1-25 "Woodpecker 1-25: Easy"
 *
 * Each study chapter is an exercise: a starting FEN where the SOLVER is to move,
 * plus a mainline solution. We convert the SAN mainline to UCI with chess.js and
 * emit static/data/sets/<setId>.json (schema woodpecker-set@1). The solver is to
 * move in the FEN, so setupMoveFirst=false and solverColor = side-to-move.
 *
 * Re-run any time the study changes. Then add/refresh the manifest entry it prints.
 */
import { Chess } from 'chess.js';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const [studyId, setId, ...titleParts] = process.argv.slice(2);
if (!studyId || !setId) {
	console.error('Usage: node scripts/import-study.mjs <studyId> <setId> "<Title>"');
	process.exit(1);
}
const title = titleParts.join(' ') || setId;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const url = `https://lichess.org/study/${studyId}.pgn`;

const res = await fetch(url, { headers: { Accept: 'application/x-chess-pgn' } });
if (!res.ok) {
	console.error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
	process.exit(1);
}
const pgn = await res.text();

// Split into chapter blocks (each starts with an [Event ...] tag).
const blocks = pgn.split(/\n(?=\[Event )/).map((b) => b.trim()).filter(Boolean);

const tag = (block, name) => {
	const m = block.match(new RegExp(`\\[${name} "([^"]*)"\\]`));
	return m ? m[1] : undefined;
};

const puzzles = [];
const skipped = [];

blocks.forEach((block, i) => {
	const n = i + 1;
	const fen = tag(block, 'FEN');
	const chapterUrl = tag(block, 'ChapterURL');
	if (!fen) {
		skipped.push({ n, reason: 'no FEN (chapter has no SetUp position)' });
		return;
	}

	// Movetext = everything after the header lines.
	const movetext = block
		.split('\n')
		.filter((l) => !l.startsWith('[') && l.trim())
		.join(' ')
		.replace(/\{[^}]*\}/g, '') // strip comments
		.replace(/\([^)]*\)/g, '') // strip variations (shallow)
		.replace(/\$\d+/g, '') // strip NAGs
		.replace(/\b\d+\.(\.\.)?/g, '') // strip move numbers "1." / "1..."
		.replace(/\*|1-0|0-1|1\/2-1\/2/g, '') // strip results
		.trim();

	const sans = movetext.split(/\s+/).filter(Boolean);
	if (sans.length === 0) {
		skipped.push({ n, reason: 'no moves in mainline' });
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
		skipped.push({ n, reason: `illegal move "${e?.message ?? e}"` });
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

const setFile = {
	schema: 'woodpecker-set@1',
	id: setId,
	title,
	description: `Imported from Lichess study https://lichess.org/study/${studyId}`,
	createdAt: new Date().toISOString().slice(0, 10),
	source: 'lichess-study',
	puzzles
};

const outPath = join(root, 'static', 'data', 'sets', `${setId}.json`);
writeFileSync(outPath, JSON.stringify(setFile, null, 2) + '\n');

console.log(`Wrote ${puzzles.length} puzzles -> ${outPath}`);
if (skipped.length) {
	console.log(`Skipped ${skipped.length}:`);
	for (const s of skipped) console.log(`  chapter ${s.n}: ${s.reason}`);
}
console.log('\nManifest entry:');
console.log(
	JSON.stringify(
		{
			id: setId,
			title,
			file: `sets/${setId}.json`,
			count: puzzles.length,
			source: 'lichess-study'
		},
		null,
		2
	)
);
