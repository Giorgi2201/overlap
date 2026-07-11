/**
 * Connection rules for Overlap.
 *
 * Clubs: same club AND date ranges intersect for at least MIN_OVERLAP_DAYS
 * (half-open [startDate, endDate); null endDate = ongoing vs asOf).
 * Multi-stint: callers check every pairing of stints at that club.
 *
 * National teams: same entity is enough — we have no NT dates to check.
 */

import type { Affiliation, EntityType } from "./types";

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
 * Number of days two dated affiliations' ranges intersect.
 * Zero or negative means they do not intersect. Entity is NOT considered.
 * Affiliations missing startDate cannot overlap (returns 0).
 */
export function overlapDays(
  a: Affiliation,
  b: Affiliation,
  asOf?: Date,
): number {
  if (!a.startDate || !b.startDate) return 0;
  const openEnd = asOfMs(asOf);
  const start = Math.max(toUtcMs(a.startDate), toUtcMs(b.startDate));
  const end = Math.min(
    a.endDate ? toUtcMs(a.endDate) : openEnd,
    b.endDate ? toUtcMs(b.endDate) : openEnd,
  );
  return (end - start) / MS_PER_DAY;
}

/**
 * Club teammate link: same entityId AND date ranges intersect >= minDays.
 * Does not look up entity type — caller must only use this for clubs.
 */
export function clubAffiliationsOverlap(
  a: Affiliation,
  b: Affiliation,
  minDays: number = MIN_OVERLAP_DAYS,
  asOf?: Date,
): boolean {
  return a.entityId === b.entityId && overlapDays(a, b, asOf) >= minDays;
}

/** @deprecated Alias for clubAffiliationsOverlap (pre-rename Tenure API). */
export function tenuresOverlap(
  a: Affiliation,
  b: Affiliation,
  minDays: number = MIN_OVERLAP_DAYS,
  asOf?: Date,
): boolean {
  return clubAffiliationsOverlap(a, b, minDays, asOf);
}

/**
 * Whether two affiliations at a known entity type form a valid link.
 * - club: strict timeline overlap (>= MIN_OVERLAP_DAYS by default)
 * - national_team: same entityId only (dates ignored / usually null)
 */
export function affiliationsLink(
  a: Affiliation,
  b: Affiliation,
  entityType: EntityType,
  minDays: number = MIN_OVERLAP_DAYS,
  asOf?: Date,
): boolean {
  if (a.entityId !== b.entityId) return false;
  if (entityType === "national_team") return true;
  return overlapDays(a, b, asOf) >= minDays;
}

/**
 * Format a club affiliation's date range for UI chips, e.g. "2018–2021".
 * Returns null when both ends are missing (typical for national teams).
 */
export function formatAffiliationYears(
  a: Pick<Affiliation, "startDate" | "endDate">,
): string | null {
  if (!a.startDate && !a.endDate) return null;
  const start = a.startDate ? a.startDate.slice(0, 4) : "?";
  const end = a.endDate ? a.endDate.slice(0, 4) : "present";
  return `${start}–${end}`;
}
