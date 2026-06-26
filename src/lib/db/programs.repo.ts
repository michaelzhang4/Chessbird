import { db, toPlain } from './db';
import type { TrainingProgram } from '../types';

const ACTIVE_KEY = 'activeProgramId';

export const programsRepo = {
	get(id: string): Promise<TrainingProgram | undefined> {
		return db.programs.get(id);
	},
	async save(p: TrainingProgram): Promise<void> {
		await db.programs.put(toPlain(p));
	},
	async list(): Promise<TrainingProgram[]> {
		const all = await db.programs.toArray();
		return all.sort((a, b) => b.startedAt - a.startedAt);
	},
	async remove(id: string): Promise<void> {
		await db.programs.delete(id);
		const active = await this.getActiveId();
		if (active === id) await this.setActive(null);
	},
	async setActive(id: string | null): Promise<void> {
		await db.meta.put({ key: ACTIVE_KEY, value: id });
	},
	async getActiveId(): Promise<string | null> {
		const row = await db.meta.get(ACTIVE_KEY);
		return (row?.value as string | null) ?? null;
	},
	async getActive(): Promise<TrainingProgram | undefined> {
		const id = await this.getActiveId();
		return id ? db.programs.get(id) : undefined;
	}
};
