/** Loads the shipped library (static/data) — the sets that ride along with the deployed app. */
import { base } from '$app/paths';
import { manifestSchema, setFileSchema, type Manifest } from '$lib/puzzles/schema';
import { buildSet } from '$lib/puzzles/set';
import { setsRepo } from '$lib/db';
import type { PuzzleSet } from '$lib/types';

export async function loadManifest(): Promise<Manifest> {
	const res = await fetch(`${base}/data/manifest.json`);
	if (!res.ok) throw new Error('Library manifest not found');
	return manifestSchema.parse(await res.json());
}

export async function loadLibrarySet(file: string): Promise<PuzzleSet> {
	const res = await fetch(`${base}/data/${file}`);
	if (!res.ok) throw new Error('Set file not found');
	const parsed = setFileSchema.parse(await res.json());
	return buildSet({
		id: parsed.id,
		title: parsed.title,
		description: parsed.description,
		source: parsed.source ?? 'library',
		puzzles: parsed.puzzles,
		createdAt: parsed.createdAt,
		origin: 'library'
	});
}

/** Resolve a set by id: a user/saved set (Dexie) wins, otherwise the matching library set. */
export async function loadSetById(id: string): Promise<PuzzleSet | null> {
	const user = await setsRepo.get(id);
	if (user) return user;
	try {
		const manifest = await loadManifest();
		const entry = manifest.sets.find((s) => s.id === id);
		if (entry) return await loadLibrarySet(entry.file);
	} catch {
		/* manifest unavailable offline — fall through */
	}
	return null;
}
