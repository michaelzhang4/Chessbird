/**
 * Batch-import every study listed in scripts/studies.json into bundled sets,
 * then run dedup + quality analysis across the whole pool.
 *
 *   node scripts/import-studies.mjs
 *
 * Writes static/data/sets/<slug>.json per study, rewrites static/data/manifest.json,
 * and prints a consistency/quality report (also saved to scripts/study-report.json).
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { fetchStudyPgn, studyToPuzzles, slug, puzKey, posKey } from './lib/study.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ids = JSON.parse(await readFile(join(root, 'scripts', 'studies.json'), 'utf8'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const sets = []; // { studyId, setId, title, puzzles, skipped, studyName }
const failures = [];
const usedIds = new Set();
const usedTitles = new Map();

for (const studyId of ids) {
	process.stdout.write(`Fetching ${studyId} ... `);
	let pgn;
	try {
		pgn = await fetchStudyPgn(studyId);
	} catch (e) {
		console.log(`FAILED (${e.message})`);
		failures.push({ studyId, error: e.message });
		await sleep(800);
		continue;
	}
	const { studyName, puzzles, skipped } = studyToPuzzles(pgn, 'tmp');
	const name = studyName || `study-${studyId}`;

	let setId = slug(name);
	if (usedIds.has(setId)) setId = `${setId}-${studyId.slice(0, 4).toLowerCase()}`;
	usedIds.add(setId);
	// reassign ids now that we know the setId
	puzzles.forEach((p, i) => (p.id = `${setId}_${String(i + 1).padStart(3, '0')}`));

	let title = name;
	const seenTitle = usedTitles.get(name) ?? 0;
	if (seenTitle > 0) title = `${name} (${seenTitle + 1})`;
	usedTitles.set(name, seenTitle + 1);

	sets.push({ studyId, setId, title, studyName: name, puzzles, skipped });
	console.log(`${puzzles.length} puzzles, ${skipped.length} skipped  -> ${setId}`);
	await sleep(1000); // be polite to lichess
}

// ---- write set files ----
for (const s of sets) {
	const setFile = {
		schema: 'woodpecker-set@1',
		id: s.setId,
		title: s.title,
		description: `Imported from Lichess study https://lichess.org/study/${s.studyId}`,
		createdAt: new Date().toISOString().slice(0, 10),
		source: 'lichess-study',
		puzzles: s.puzzles
	};
	writeFileSync(
		join(root, 'static', 'data', 'sets', `${s.setId}.json`),
		JSON.stringify(setFile, null, 2) + '\n'
	);
}

// ---- manifest (study sets + keep the demo) ----
const manifest = {
	version: 1,
	sets: [
		...sets.map((s) => ({
			id: s.setId,
			title: s.title,
			file: `sets/${s.setId}.json`,
			count: s.puzzles.length,
			source: 'lichess-study',
			description: `From Lichess study ${s.studyId} (${s.puzzles.length} puzzles).`
		})),
		{
			id: 'sample-tactics',
			title: 'Sample Tactics (demo)',
			file: 'sets/sample-tactics.json',
			count: 5,
			ratingRange: [800, 1500],
			themes: ['mateIn1', 'promotion', 'backRank'],
			source: 'sample',
			description: 'Five hand-verified mates to try the trainer end-to-end.'
		}
	]
};
writeFileSync(
	join(root, 'static', 'data', 'manifest.json'),
	JSON.stringify(manifest, null, 2) + '\n'
);

// ---- analysis ----
const allPuzzles = sets.flatMap((s) => s.puzzles.map((p) => ({ ...p, setId: s.setId })));
const byPuz = new Map();
const byPos = new Map();
for (const p of allPuzzles) {
	const k = puzKey(p);
	(byPuz.get(k) ?? byPuz.set(k, []).get(k)).push(p);
	const pk = posKey(p.fen);
	(byPos.get(pk) ?? byPos.set(pk, []).get(pk)).push(p);
}

const exactDupGroups = [...byPuz.values()].filter((g) => g.length > 1);
const exactDupExtra = exactDupGroups.reduce((n, g) => n + (g.length - 1), 0);
const samePosDiffSol = [...byPos.values()].filter(
	(g) => g.length > 1 && new Set(g.map((p) => p.moves.join(' '))).size > 1
);

// cross-study overlap matrix (exact dup puzzles shared between two studies)
const overlap = {};
for (const g of exactDupGroups) {
	const setIds = [...new Set(g.map((p) => p.setId))];
	for (let i = 0; i < setIds.length; i++)
		for (let j = i + 1; j < setIds.length; j++) {
			const key = `${setIds[i]} ∩ ${setIds[j]}`;
			overlap[key] = (overlap[key] ?? 0) + 1;
		}
}

const perStudy = sets.map((s) => {
	const plies = s.puzzles.map((p) => p.moves.length);
	const avg = plies.length ? plies.reduce((a, b) => a + b, 0) / plies.length : 0;
	const reasons = {};
	for (const sk of s.skipped) reasons[sk.reason.split(':')[0]] = (reasons[sk.reason.split(':')[0]] ?? 0) + 1;
	return {
		setId: s.setId,
		title: s.title,
		studyId: s.studyId,
		puzzles: s.puzzles.length,
		skipped: s.skipped.length,
		skipReasons: reasons,
		singleMove: plies.filter((n) => n === 1).length,
		avgPlies: Number(avg.toFixed(1)),
		maxPlies: plies.length ? Math.max(...plies) : 0
	};
});

const totalRaw = allPuzzles.length;
const uniquePuzzles = byPuz.size;

const report = {
	totals: {
		studies: sets.length,
		failedStudies: failures.length,
		rawPuzzles: totalRaw,
		uniquePuzzles,
		exactDuplicatePuzzles: exactDupExtra,
		samePositionDifferentSolution: samePosDiffSol.length
	},
	failures,
	crossStudyOverlap: Object.fromEntries(
		Object.entries(overlap).sort((a, b) => b[1] - a[1])
	),
	perStudy
};
writeFileSync(join(root, 'scripts', 'study-report.json'), JSON.stringify(report, null, 2) + '\n');

// ---- console summary ----
console.log('\n===== POOL ANALYSIS =====');
console.log(
	`Studies: ${sets.length} ok, ${failures.length} failed | ` +
		`Raw puzzles: ${totalRaw} | Unique: ${uniquePuzzles} | ` +
		`Exact dups: ${exactDupExtra} | Same-pos/diff-solution: ${samePosDiffSol.length}`
);
if (failures.length) {
	console.log('\nFailed studies:');
	for (const f of failures) console.log(`  ${f.studyId}: ${f.error}`);
}
console.log('\nPer study (puzzles | skipped | single-move | avg plies | max):');
for (const s of perStudy) {
	const sk = s.skipped ? ` skip=${s.skipped}${JSON.stringify(s.skipReasons)}` : '';
	console.log(
		`  ${String(s.puzzles).padStart(3)} | sm=${String(s.singleMove).padStart(3)} | ` +
			`avg=${String(s.avgPlies).padStart(4)} | max=${String(s.maxPlies).padStart(2)} | ` +
			`${s.title}${sk}`
	);
}
const topOverlap = Object.entries(overlap)
	.sort((a, b) => b[1] - a[1])
	.slice(0, 12);
if (topOverlap.length) {
	console.log('\nTop cross-study overlaps (shared identical puzzles):');
	for (const [pair, n] of topOverlap) console.log(`  ${n.toString().padStart(3)}  ${pair}`);
} else {
	console.log('\nNo cross-study duplicate puzzles found.');
}
console.log('\nWrote per-study set files + manifest. Report: scripts/study-report.json');
