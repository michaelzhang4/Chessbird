import { db, toPlain } from './db';
import type { Session } from '../types';

/** One resumable "today's queue" per program (keyed by programId). */
export const sessionsRepo = {
	get(programId: string): Promise<Session | undefined> {
		return db.sessions.get(programId);
	},
	async save(s: Session): Promise<void> {
		await db.sessions.put(toPlain(s));
	},
	async clear(programId: string): Promise<void> {
		await db.sessions.delete(programId);
	}
};
