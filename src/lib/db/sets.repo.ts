import { db, toPlain } from './db';
import type { PuzzleSet } from '../types';

/** User-created / imported sets (the shipped library is fetched from static/data instead). */
export const setsRepo = {
	async list(): Promise<PuzzleSet[]> {
		const all = await db.sets.toArray();
		return all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
	},
	get(id: string): Promise<PuzzleSet | undefined> {
		return db.sets.get(id);
	},
	async save(set: PuzzleSet): Promise<void> {
		await db.sets.put(toPlain({ ...set, origin: 'user' }));
	},
	async remove(id: string): Promise<void> {
		await db.sets.delete(id);
	}
};
