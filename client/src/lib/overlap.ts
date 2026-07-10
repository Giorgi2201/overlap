/**
 * Overlap detection between player tenures. 1:1 port of
 * data-pipeline/overlap.py (overlap_days / tenures_overlap).
 *
 * Date ranges are half-open intervals [startDate, endDate): a tenure
 * 2020-01-01 -> 2020-01-31 lasts 30 days. A null endDate means the tenure
 * is ongoing and is compared against a configurable "as of" date
 * (default: today).
 */

import type { Tenure } from "./types";

export const MIN_OVERLAP_DAYS = 30;

const MS_PER_DAY = 86_400_000;

/** Parse an ISO "YYYY-MM-DD" string to a UTC timestamp (ms). */
function toUtcMs(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Normalize an asOf Date (or the current instant) to UTC midnight ms. */
function asOfMs(asOf?: Date): number {
  const d = asOf ?? new Date();
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Number of days the two tenures' date ranges intersect.
 * Zero or negative means they do not intersect. Club is NOT considered
 * here -- this is pure date-range intersection.
 */
export function overlapDays(a: Tenure, b: Tenure, asOf?: Date): number {
  const openEnd = asOfMs(asOf);
  const start = Math.max(toUtcMs(a.startDate), toUtcMs(b.startDate));
  const end = Math.min(
    a.endDate ? toUtcMs(a.endDate) : openEnd,
    b.endDate ? toUtcMs(b.endDate) : openEnd,
  );
  return (end - start) / MS_PER_DAY;
}

/**
 * Whether two tenures form a valid teammate link: same club AND date
 * ranges intersecting for at least `minDays` days.
 */
export function tenuresOverlap(
  a: Tenure,
  b: Tenure,
  minDays: number = MIN_OVERLAP_DAYS,
  asOf?: Date,
): boolean {
  return a.clubId === b.clubId && overlapDays(a, b, asOf) >= minDays;
}
