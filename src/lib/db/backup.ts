/** Full local backup: export every table to one JSON blob, and import it back. */
import { db, type MetaRow } from './db';
import type { Attempt, AssessmentRun, PuzzleSet, Session, TrainingProgram } from '../types';

export interface Backup {
	schema: 'woodpecker-backup@1';
	exportedAt: number;
	sets: PuzzleSet[];
	programs: TrainingProgram[];
	attempts: Attempt[];
	assessments: AssessmentRun[];
	sessions: Session[];
	meta: MetaRow[];
}

const TABLES = () => [db.sets, db.programs, db.attempts, db.assessments, db.sessions, db.meta];

export async function exportAll(): Promise<Backup> {
	const [sets, programs, attempts, assessments, sessions, meta] = await Promise.all([
		db.sets.toArray(),
		db.programs.toArray(),
		db.attempts.toArray(),
		db.assessments.toArray(),
		db.sessions.toArray(),
		db.meta.toArray()
	]);
	return {
		schema: 'woodpecker-backup@1',
		exportedAt: Date.now(),
		sets,
		programs,
		attempts,
		assessments,
		sessions,
		meta
	};
}

export function isBackup(x: unknown): x is Backup {
	return !!x && typeof x === 'object' && (x as Backup).schema === 'woodpecker-backup@1';
}

export async function importAll(backup: Backup, mode: 'merge' | 'replace'): Promise<void> {
	await db.transaction('rw', TABLES(), async () => {
		if (mode === 'replace') {
			await Promise.all(TABLES().map((t) => t.clear()));
		}
		await db.sets.bulkPut(backup.sets ?? []);
		await db.programs.bulkPut(backup.programs ?? []);
		await db.attempts.bulkPut(backup.attempts ?? []);
		await db.assessments.bulkPut(backup.assessments ?? []);
		await db.sessions.bulkPut(backup.sessions ?? []);
		await db.meta.bulkPut(backup.meta ?? []);
	});
}

export async function wipeAll(): Promise<void> {
	await db.transaction('rw', TABLES(), async () => {
		await Promise.all(TABLES().map((t) => t.clear()));
	});
}
