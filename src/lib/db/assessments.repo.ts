import { db, toPlain } from './db';
import type { AssessmentRun } from '../types';

export const assessmentsRepo = {
	async save(a: AssessmentRun): Promise<void> {
		await db.assessments.put(toPlain(a));
	},
	async latestForSet(setId: string): Promise<AssessmentRun | undefined> {
		const all = await db.assessments.where('setId').equals(setId).toArray();
		return all.sort((a, b) => b.createdAt - a.createdAt)[0];
	}
};
