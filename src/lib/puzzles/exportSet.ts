/** Build the canonical library-format file from a set, and trigger a browser download. */
import type { PuzzleSet } from '../types';
import { setFileSchema, type SetFile } from './schema';

export function buildSetFile(set: PuzzleSet): SetFile {
	const file: SetFile = {
		schema: 'woodpecker-set@1',
		id: set.id,
		title: set.title,
		description: set.description,
		createdAt: set.createdAt,
		source: set.source,
		puzzles: set.puzzles.map((p) => ({
			id: p.id,
			fen: p.fen,
			moves: p.moves,
			setupMoveFirst: p.setupMoveFirst,
			solverColor: p.solverColor,
			rating: p.rating,
			themes: p.themes,
			openingTags: p.openingTags,
			sourceUrl: p.sourceUrl,
			source: p.source
		}))
	};
	// Throws if we ever drift from the schema — fail loudly during dev rather than ship junk.
	return setFileSchema.parse(file);
}

/** Download any JSON-serializable value as a file (browser only). */
export function downloadJson(filename: string, data: unknown): void {
	const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
}
