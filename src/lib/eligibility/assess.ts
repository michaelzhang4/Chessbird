/**
 * Eligibility assessment: sample 30 puzzles, solve them first-try-only, and judge whether
 * the set is well-calibrated for Woodpecker (you should recognise ~75% on sight, not grind).
 */
import { nanoid } from 'nanoid';
import type { AssessmentItem, AssessmentRun, Verdict } from '../types';
import { median } from '../time';

export const ASSESS_SAMPLE_SIZE = 30;
/** A puzzle whose first move takes longer than this reads as "calculating", not "recognising". */
export const SLOW_MS = 90_000;

export const VERDICT_THRESHOLDS = {
	eligible: 0.75,
	borderline: 0.6,
	tooEasyAccuracy: 0.95,
	tooEasyMedianMs: 10_000
} as const;

// mulberry32 — tiny deterministic PRNG so an assessment can be reproduced from a seed.
function mulberry32(seed: number): () => number {
	return () => {
		let t = (seed += 0x6d2b79f5);
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Sample up to `n` items without replacement (seeded if provided). */
export function sample<T>(arr: T[], n: number, seed?: number): T[] {
	const rng = seed != null ? mulberry32(seed) : Math.random;
	const copy = [...arr];
	for (let i = copy.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[copy[i], copy[j]] = [copy[j], copy[i]];
	}
	return copy.slice(0, Math.min(n, copy.length));
}

export function isSlow(msToFirstMove: number): boolean {
	return msToFirstMove > SLOW_MS;
}

export function classify(firstTryAccuracy: number, medianMs: number): Verdict {
	if (
		firstTryAccuracy >= VERDICT_THRESHOLDS.tooEasyAccuracy &&
		medianMs <= VERDICT_THRESHOLDS.tooEasyMedianMs
	) {
		return 'too_easy';
	}
	if (firstTryAccuracy >= VERDICT_THRESHOLDS.eligible) return 'eligible';
	if (firstTryAccuracy >= VERDICT_THRESHOLDS.borderline) return 'borderline';
	return 'too_hard';
}

export function buildAssessment(opts: {
	setId: string;
	setTitle: string;
	items: AssessmentItem[];
	now: number;
}): AssessmentRun {
	const { items } = opts;
	const n = items.length;
	const correct = items.filter((i) => i.firstTryCorrect).length;
	const firstTryAccuracy = n ? correct / n : 0;
	const medianMs = median(items.map((i) => i.msToFirstMove));
	return {
		id: nanoid(10),
		setId: opts.setId,
		setTitle: opts.setTitle,
		createdAt: opts.now,
		sampleSize: n,
		items,
		firstTryAccuracy,
		medianMsToFirstMove: medianMs,
		slowCount: items.filter((i) => i.slowFlag).length,
		verdict: classify(firstTryAccuracy, medianMs)
	};
}

export const VERDICT_LABEL: Record<Verdict, string> = {
	eligible: 'Eligible',
	borderline: 'Borderline',
	too_hard: 'Too hard',
	too_easy: 'Too easy'
};

export const VERDICT_BLURB: Record<Verdict, string> = {
	eligible: 'Well-calibrated. You recognise most of these — perfect for drilling speed.',
	borderline: 'Workable, but on the hard side. Expect slower early cycles.',
	too_hard: "You're calculating, not recognising. Try an easier set or lower rating.",
	too_easy: 'You already know these cold. Consider harder puzzles to get value.'
};
