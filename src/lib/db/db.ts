/** Dexie (IndexedDB) instance + schema. All access goes through the repos in this folder. */
import Dexie, { type EntityTable } from 'dexie';
import type { Attempt, AssessmentRun, PuzzleSet, Session, TrainingProgram } from '../types';

export interface MetaRow {
	key: string;
	value: unknown;
}

export class WoodpeckerDB extends Dexie {
	sets!: EntityTable<PuzzleSet, 'id'>;
	programs!: EntityTable<TrainingProgram, 'id'>;
	attempts!: EntityTable<Attempt, 'id'>;
	assessments!: EntityTable<AssessmentRun, 'id'>;
	sessions!: EntityTable<Session, 'id'>;
	meta!: EntityTable<MetaRow, 'key'>;

	constructor() {
		super('woodpecker');
		// Only listed fields are indexes; full objects are stored regardless.
		this.version(1).stores({
			sets: 'id, createdAt, origin',
			programs: 'id, status, startedAt',
			attempts: 'id, programId, puzzleId, [programId+cycleIndex]',
			assessments: 'id, setId, createdAt',
			sessions: 'id, programId',
			meta: 'key'
		});
	}
}

export const db = new WoodpeckerDB();

/**
 * Strip Svelte 5 `$state` proxies (and anything else non-cloneable) before writing to
 * IndexedDB — a structured clone of a proxy throws DataCloneError. Our records are plain
 * JSON data (numbers/strings/arrays), so a JSON round-trip is a safe, cheap snapshot.
 */
export function toPlain<T>(value: T): T {
	return value == null ? value : (JSON.parse(JSON.stringify(value)) as T);
}
