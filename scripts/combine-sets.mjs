/**
 * Merge several library sets into one, de-duplicating by position.
 * The Woodpecker studies are community transcriptions of the same book, so the same
 * position recurs across sets; we keep the most complete solution line per position.
 *
 *   node scripts/combine-sets.mjs <out-id> "<Title>" <srcId...> [--remove-sources]
 *   node scripts/combine-sets.mjs the-woodpecker-method "The Woodpecker Method" \
 *     --match "^(the-woodpecker-method-(part-[0-9]+|1-25|26-50)|woodpecker-method-(easy|tactic).*)$" --remove-sources
 *
 * --match <regex>   pick source sets by id (instead of listing them)
 * --remove-sources  delete the source set files after combining (declutter)
 * --desc "<text>"   custom description
 */
import { readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { rebuildManifest } from './rebuild-manifest.mjs';
import { posKey } from './lib/study.mjs';

const argv = process.argv.slice(2);
const positional = [];
const flags = {};
for (let i = 0; i < argv.length; i++) {
	const a = argv[i];
	if (a.startsWith('--')) {
		const k = a.slice(2);
		const nx = argv[i + 1];
		if (nx === undefined || nx.startsWith('--')) flags[k] = true;
		else { flags[k] = nx; i++; }
	} else positional.push(a);
}

const [outId, title] = positional;
if (!outId || !title) {
	console.error('Usage: node scripts/combine-sets.mjs <out-id> "<Title>" [srcId...] [--match <regex>] [--remove-sources] [--desc "<text>"]');
	process.exit(1);
}
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const setsDir = join(root, 'static', 'data', 'sets');

// Resolve the source set ids — either listed explicitly or matched by regex.
let srcIds = positional.slice(2);
if (flags.match) {
	const re = new RegExp(flags.match);
	srcIds = readdirSync(setsDir)
		.filter((f) => f.endsWith('.json'))
		.map((f) => f.slice(0, -5))
		.filter((id) => re.test(id));
}
srcIds = [...new Set(srcIds)].filter((id) => id && id !== outId).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
if (!srcIds.length) { console.error('No source sets matched.'); process.exit(1); }

console.log(`Combining ${srcIds.length} sets -> ${outId}:`);
const all = [];
for (const id of srcIds) {
	let s;
	try { s = JSON.parse(readFileSync(join(setsDir, `${id}.json`), 'utf8')); }
	catch { console.error(`  ! skip ${id} (unreadable)`); continue; }
	console.log(`  + ${id} (${s.puzzles.length})`);
	all.push(...s.puzzles);
}

// Dedup by position, keeping the longest solution line (the most complete recording).
const byPos = new Map();
for (const p of all) {
	const k = posKey(p.fen);
	const cur = byPos.get(k);
	if (!cur || p.moves.length > cur.moves.length) byPos.set(k, p);
}
const puzzles = [...byPos.values()].map((p, i) => ({
	id: `${outId}_${String(i + 1).padStart(4, '0')}`,
	fen: p.fen,
	moves: p.moves,
	setupMoveFirst: p.setupMoveFirst,
	solverColor: p.solverColor,
	...(typeof p.rating === 'number' ? { rating: p.rating } : {}),
	...(p.themes?.length ? { themes: p.themes } : {}),
	...(p.openingTags?.length ? { openingTags: p.openingTags } : {}),
	...(p.sourceUrl ? { sourceUrl: p.sourceUrl } : {}),
	source: p.source || 'lichess-study'
}));

const setFile = {
	schema: 'woodpecker-set@1',
	id: outId,
	title,
	description:
		flags.desc ||
		`${puzzles.length} unique puzzles, combined from ${srcIds.length} study transcriptions (deduplicated by position).`,
	createdAt: new Date().toISOString().slice(0, 10),
	source: 'lichess-study',
	puzzles
};
writeFileSync(join(setsDir, `${outId}.json`), JSON.stringify(setFile, null, 2) + '\n');
console.log(`Wrote ${puzzles.length} unique puzzles (from ${all.length} total, ${all.length - puzzles.length} dupes merged) -> ${outId}.json`);

if (flags['remove-sources']) {
	for (const id of srcIds) {
		try { rmSync(join(setsDir, `${id}.json`)); console.log(`  - removed ${id}.json`); }
		catch { /* already gone */ }
	}
}
const total = rebuildManifest(root);
console.log(`Manifest now ${total} sets.`);
