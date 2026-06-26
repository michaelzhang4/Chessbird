/** Small time helpers. All timestamps are absolute epoch ms; "days" are local. */

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Local calendar day key, e.g. "2026-06-26" — used to bucket attempts into days. */
export function dayKey(ms: number): string {
	const d = new Date(ms);
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${d.getFullYear()}-${m}-${day}`;
}

/** Start of the local day containing `ms`. */
export function startOfLocalDay(ms: number): number {
	const d = new Date(ms);
	d.setHours(0, 0, 0, 0);
	return d.getTime();
}

/** Coarse human duration: "2d 4h", "3h 12m", "12m", "45s". Clamped at 0. */
export function formatDuration(ms: number): string {
	const s = Math.max(0, Math.floor(ms / 1000));
	const d = Math.floor(s / 86400);
	const h = Math.floor((s % 86400) / 3600);
	const m = Math.floor((s % 3600) / 60);
	if (d > 0) return `${d}d ${h}h`;
	if (h > 0) return `${h}h ${m}m`;
	if (m > 0) return `${m}m`;
	return `${s}s`;
}

/** mm:ss clock for a per-puzzle timer. */
export function formatClock(ms: number): string {
	const s = Math.max(0, Math.floor(ms / 1000));
	const mm = Math.floor(s / 60);
	const ss = s % 60;
	return `${mm}:${String(ss).padStart(2, '0')}`;
}

/** Median of a numeric array (0 if empty). */
export function median(values: number[]): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}
