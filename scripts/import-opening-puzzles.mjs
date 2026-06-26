/**
 * Build a tactics set from the Lichess puzzle database, filtered by opening tag.
 * Streams the ~300MB .zst straight through a pure-JS zstd decompressor — nothing
 * big is written to disk; only the filtered set + manifest are produced.
 *
 *   node scripts/import-opening-puzzles.mjs "<tagRegex>" <setId> "<Title>" [cap]
 *   node scripts/import-opening-puzzles.mjs "Hyperaccelerated_Dragon" had-tactics "H-Dragon Tactics" 400
 *
 * Lichess CSV cols: PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags
 * Convention: FEN is before the opponent's setup move, Moves[0] is that auto-played move → setupMoveFirst.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as fzstd from 'fzstd';
import { Chess } from 'chess.js';
import { rebuildManifest } from './rebuild-manifest.mjs';

const [tagPattern, setId, title, capArg] = process.argv.slice(2);
if (!tagPattern || !setId) {
	console.error('Usage: node scripts/import-opening-puzzles.mjs "<tagRegex>" <setId> "<Title>" [cap]');
	process.exit(1);
}
const cap = Number(capArg) || 400;
const re = new RegExp(tagPattern, 'i');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DB = 'https://database.lichess.org/lichess_db_puzzle.csv.zst';

const matched = [];
let scanned = 0, illegal = 0, buffer = '';
const dec = new TextDecoder();

function handleLine(line) {
	if (!line) return;
	if (scanned === 0 && line.startsWith('PuzzleId')) return; // header
	scanned++;
	if (scanned % 500000 === 0) process.stdout.write(`  scanned ${scanned / 1000}k, matched ${matched.length}\r`);
	// quick reject before splitting
	if (!re.test(line)) return;
	const c = line.split(',');
	if (c.length < 10) return;
	const opening = c[9];
	if (!re.test(opening)) return; // ensure the match was the opening tag, not FEN/url
	const fen = c[1];
	const moves = c[2].trim().split(/\s+/).filter(Boolean);
	if (!fen || moves.length === 0) return;
	// validate the line is actually playable
	try {
		const ch = new Chess(fen);
		for (const m of moves) ch.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
	} catch {
		illegal++;
		return;
	}
	const side = fen.split(/\s+/)[1] === 'w' ? 'w' : 'b';
	matched.push({
		id: `lichess_${c[0]}`,
		fen,
		moves,
		setupMoveFirst: true,
		solverColor: side === 'w' ? 'b' : 'w', // solver moves after the setup move
		rating: Number(c[3]) || undefined,
		popularity: Number(c[5]) || 0,
		themes: c[7] ? c[7].split(/\s+/).filter(Boolean) : undefined,
		openingTags: opening ? opening.split(/\s+/).filter(Boolean) : undefined,
		sourceUrl: c[8] || `https://lichess.org/training/${c[0]}`,
		source: 'lichess'
	});
}

console.log(`Downloading + scanning puzzle DB for /${tagPattern}/i …`);
const res = await fetch(DB);
if (!res.ok) { console.error(`DB fetch failed: ${res.status}`); process.exit(1); }
const reader = res.body.getReader();
const stream = new fzstd.Decompress((chunk) => {
	buffer += dec.decode(chunk, { stream: true });
	let nl;
	while ((nl = buffer.indexOf('\n')) >= 0) {
		handleLine(buffer.slice(0, nl));
		buffer = buffer.slice(nl + 1);
	}
});
for (;;) {
	const { done, value } = await reader.read();
	if (done) break;
	stream.push(value, false);
}
if (buffer) handleLine(buffer);

console.log(`\nScanned ${scanned} puzzles · matched ${matched.length} · ${illegal} dropped as illegal`);

// best first (popularity), then cap; sort the kept set by rating for a gentle ramp
matched.sort((a, b) => b.popularity - a.popularity);
const kept = matched.slice(0, cap).sort((a, b) => (a.rating ?? 0) - (b.rating ?? 0));
for (const p of kept) delete p.popularity;

const ratings = kept.map((p) => p.rating).filter((r) => typeof r === 'number').sort((a, b) => a - b);
const setFile = {
	schema: 'woodpecker-set@1',
	id: setId,
	title: title || setId,
	description: `Lichess puzzles tagged ${tagPattern.replace(/_/g, ' ')} (${kept.length} of ${matched.length} found).`,
	createdAt: new Date().toISOString().slice(0, 10),
	source: 'lichess',
	puzzles: kept
};
writeFileSync(join(root, 'static', 'data', 'sets', `${setId}.json`), JSON.stringify(setFile, null, 2) + '\n');
const total = rebuildManifest(root);
console.log(
	`Wrote ${kept.length} puzzles -> ${setId}.json` +
		(ratings.length ? ` · ratings ${ratings[0]}–${ratings[ratings.length - 1]} (median ${ratings[ratings.length >> 1]})` : '') +
		` · manifest now ${total} sets`
);
