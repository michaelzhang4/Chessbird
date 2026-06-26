import { db, toPlain } from './db';
import type { Attempt } from '../types';

export function attemptId(programId: string, cycleIndex: number, puzzleId: string): string {
	return `${programId}:${cycleIndex}:${puzzleId}`;
}

export const attemptsRepo = {
	async put(a: Attempt): Promise<void> {
		await db.attempts.put(toPlain(a));
	},
	forProgram(programId: string): Promise<Attempt[]> {
		return db.attempts.where('programId').equals(programId).toArray();
	},
	forCycle(programId: string, cycleIndex: number): Promise<Attempt[]> {
		return db.attempts.where('[programId+cycleIndex]').equals([programId, cycleIndex]).toArray();
	},
	async solvedIdsForCycle(programId: string, cycleIndex: number): Promise<Set<string>> {
		const rows = await this.forCycle(programId, cycleIndex);
		return new Set(rows.filter((r) => r.solved).map((r) => r.puzzleId));
	},
	async countSolvedForCycle(programId: string, cycleIndex: number): Promise<number> {
		return (await this.solvedIdsForCycle(programId, cycleIndex)).size;
	}
};
