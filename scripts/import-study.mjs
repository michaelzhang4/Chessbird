/**
 * Import ONE Lichess study into a bundled set.
 *
 *   node scripts/import-study.mjs <studyId> <setId> "<Title>" [solverColor]
 *
 * solverColor (w|b) turns on REPERTOIRE mode: chapters start from the opening if they
 * have no SetUp position, and the named side is the one you drill (the other side's
 * moves auto-play). Omit it for tactics-style studies (solver = side to move).
 *
 *   node scripts/import-study.mjs VV8eF6Ge had-repertoire "H-Dragon repertoire" b
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fetchStudyPgn, studyToPuzzles } from './lib/study.mjs';
import { rebuildManifest } from './rebuild-manifest.mjs';

const [studyId, setId, title, solverColor] = process.argv.slice(2);
if (!studyId || !setId) {
	console.error('Usage: node scripts/import-study.mjs <studyId> <setId> "<Title>" [w|b]');
	process.exit(1);
}
const repertoire = solverColor === 'w' || solverColor === 'b';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pgn;
try {
	pgn = await fetchStudyPgn(studyId);
} catch (e) {
	console.error(`Failed to fetch study ${studyId}: ${e.message}`);
	process.exit(1);
}

const { studyName, puzzles, skipped } = studyToPuzzles(pgn, setId, {
	forceSolver: repertoire ? solverColor : undefined,
	defaultStartFen: repertoire
});

const setFile = {
	schema: 'woodpecker-set@1',
	id: setId,
	title: title || studyName || setId,
	description: repertoire
		? `${studyName ?? 'Repertoire'} — drilling ${solverColor === 'b' ? 'Black' : 'White'}. From Lichess study https://lichess.org/study/${studyId}`
		: `Imported from Lichess study https://lichess.org/study/${studyId}`,
	createdAt: new Date().toISOString().slice(0, 10),
	source: repertoire ? 'lichess-repertoire' : 'lichess-study',
	puzzles
};
writeFileSync(
	join(root, 'static', 'data', 'sets', `${setId}.json`),
	JSON.stringify(setFile, null, 2) + '\n'
);
const total = rebuildManifest(root);

console.log(`Wrote ${puzzles.length} puzzles -> ${setId}.json  (manifest now ${total} sets)`);
if (skipped.length) {
	const reasons = {};
	for (const s of skipped) reasons[s.reason.split(':')[0]] = (reasons[s.reason.split(':')[0]] ?? 0) + 1;
	console.log(`Skipped ${skipped.length}: ${JSON.stringify(reasons)}`);
}
