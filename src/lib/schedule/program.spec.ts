import { describe, it, expect } from 'vitest';
import {
	createProgram,
	computeProgramView,
	markCycleComplete,
	startNextCycle,
	canStartNextCycle,
	resetCycleDeadline
} from './program';
import { dailyTarget } from './dailyTarget';
import { DAY_MS } from '../time';

const order = Array.from({ length: 300 }, (_, i) => `p${i}`);
const prog = (now = 0) => createProgram({ setId: 's', setTitle: 'S', puzzleOrder: order, now });

describe('createProgram', () => {
	it('starts cycle 0 active with a 7-day deadline; later cycles locked', () => {
		const p = prog(1000);
		expect(p.cycles[0].status).toBe('active');
		expect(p.cycles[0].deadlineAt).toBe(1000 + 7 * DAY_MS);
		expect(p.cycles[1].status).toBe('locked');
		expect(p.totalPuzzles).toBe(300);
	});
});

describe('computeProgramView', () => {
	it('reports active with day number + daily target', () => {
		const v = computeProgramView(prog(0), 0, 0);
		expect(v.phase).toBe('cycle-active');
		expect(v.dayNumber).toBe(1);
		expect(v.target).toBe(Math.ceil(300 / 7));
	});
	it('reports overdue past the deadline', () => {
		const v = computeProgramView(prog(0), 100, 8 * DAY_MS);
		expect(v.phase).toBe('cycle-overdue');
		expect(v.remainingPuzzles).toBe(200);
	});
	it('locks during the break and unlocks when it elapses', () => {
		const p = markCycleComplete(prog(0), 1000);
		expect(computeProgramView(p, 300, 1000 + DAY_MS).phase).toBe('break');
		expect(computeProgramView(p, 300, 1000 + 2 * DAY_MS + 1).phase).toBe('next-ready');
	});
	it('is complete after the final cycle', () => {
		let p = prog(0);
		for (let i = 0; i < 4; i++) {
			p = markCycleComplete(p, 0);
			if (i < 3) p = startNextCycle(p, 0);
		}
		expect(computeProgramView(p, 300, 0).phase).toBe('program-complete');
	});
});

describe('dailyTarget', () => {
	it('spreads remaining puzzles over remaining days', () => {
		expect(dailyTarget(300, 7 * DAY_MS, 0)).toBe(Math.ceil(300 / 7));
		expect(dailyTarget(40, DAY_MS, 0)).toBe(40);
		expect(dailyTarget(0, DAY_MS, 0)).toBe(0);
	});
	it('says finish-now when overdue', () => {
		expect(dailyTarget(40, -DAY_MS, 0)).toBe(40);
	});
});

describe('transitions', () => {
	it('gates the next cycle behind the break', () => {
		const p = markCycleComplete(prog(0), 0);
		expect(canStartNextCycle(p, DAY_MS)).toBe(false);
		expect(canStartNextCycle(p, 2 * DAY_MS + 1)).toBe(true);
	});
	it('activates the next cycle with a fresh deadline', () => {
		let p = markCycleComplete(prog(0), 0);
		p = startNextCycle(p, 5000);
		expect(p.currentCycleIndex).toBe(1);
		expect(p.cycles[1].status).toBe('active');
		expect(p.cycles[1].deadlineAt).toBe(5000 + 4 * DAY_MS);
	});
	it('resets an overdue deadline and counts it', () => {
		const p = resetCycleDeadline(prog(0), 10000);
		expect(p.cycles[0].deadlineAt).toBe(10000 + 7 * DAY_MS);
		expect(p.cycles[0].deadlineResetCount).toBe(1);
	});
});
