import { describe, it, expect } from 'vitest';
import { classify, sample, buildAssessment } from './assess';
import type { AssessmentItem } from '../types';

describe('classify', () => {
	it('applies the verdict thresholds', () => {
		expect(classify(0.8, 30_000)).toBe('eligible');
		expect(classify(0.65, 30_000)).toBe('borderline');
		expect(classify(0.4, 30_000)).toBe('too_hard');
		expect(classify(0.97, 5_000)).toBe('too_easy');
		expect(classify(0.97, 30_000)).toBe('eligible'); // accurate but not lightning-fast
	});
});

describe('sample', () => {
	it('respects the requested size and caps at array length', () => {
		const arr = Array.from({ length: 50 }, (_, i) => i);
		expect(sample(arr, 30, 1)).toHaveLength(30);
		expect(sample(arr, 100, 1)).toHaveLength(50);
	});
	it('is deterministic with a seed', () => {
		const arr = Array.from({ length: 50 }, (_, i) => i);
		expect(sample(arr, 30, 7)).toEqual(sample(arr, 30, 7));
	});
});

describe('buildAssessment', () => {
	it('computes first-try accuracy and verdict', () => {
		const items: AssessmentItem[] = Array.from({ length: 4 }, (_, i) => ({
			puzzleId: `p${i}`,
			firstTryCorrect: i < 3,
			msToFirstMove: 1000,
			msTotal: 1000,
			slowFlag: false
		}));
		const a = buildAssessment({ setId: 's', setTitle: 'S', items, now: 123 });
		expect(a.firstTryAccuracy).toBe(0.75);
		expect(a.verdict).toBe('eligible');
		expect(a.sampleSize).toBe(4);
		expect(a.createdAt).toBe(123);
	});
});
