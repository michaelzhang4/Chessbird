/**
 * Regenerate static/data/manifest.json by scanning every set file in static/data/sets/.
 * The files on disk are the source of truth, so any importer (Woodpecker, opening
 * puzzles, repertoire) just writes its set file and calls this — no central list to sync.
 *
 *   node scripts/rebuild-manifest.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export function rebuildManifest(root) {
	const dir = join(root, 'static', 'data', 'sets');
	const entries = [];
	for (const f of readdirSync(dir)) {
		if (!f.endsWith('.json')) continue;
		const s = JSON.parse(readFileSync(join(dir, f), 'utf8'));
		const entry = {
			id: s.id,
			title: s.title,
			file: `sets/${f}`,
			count: s.puzzles.length,
			source: s.source || 'library'
		};
		const ratings = s.puzzles.map((p) => p.rating).filter((r) => typeof r === 'number');
		if (ratings.length) entry.ratingRange = [Math.min(...ratings), Math.max(...ratings)];
		const tc = {};
		for (const p of s.puzzles) for (const t of p.themes || []) tc[t] = (tc[t] || 0) + 1;
		const themes = Object.entries(tc).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t);
		if (themes.length) entry.themes = themes;
		if (s.description) entry.description = s.description;
		entries.push(entry);
	}
	// sample last; everything else natural-sorted by title (Part 1,2,…,10 not 1,10,2).
	entries.sort((a, b) => {
		if (a.source === 'sample') return 1;
		if (b.source === 'sample') return -1;
		return a.title.localeCompare(b.title, undefined, { numeric: true });
	});
	writeFileSync(
		join(dir, '..', 'manifest.json'),
		JSON.stringify({ version: 1, sets: entries }, null, 2) + '\n'
	);
	return entries.length;
}

// run standalone
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('rebuild-manifest.mjs')) {
	const root = join(dirname(fileURLToPath(import.meta.url)), '..');
	console.log(`manifest: ${rebuildManifest(root)} sets`);
}
