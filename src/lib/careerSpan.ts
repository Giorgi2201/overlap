/**
 * Estimated club-derived career spans for national-team era proximity.
 *
 * Club connections still use verified date overlap (see overlap.ts). These
 * helpers estimate each player's active window from club tenures only, so a
 * future NT rule can reject "shared side decades apart" without needing
 * international-caps dates. Not wired into adjacency / pathfinding / UI yet.
 */

import type { AffiliationGraph } from "./graph";

/** Inclusive career window as ISO "YYYY-MM-DD" (matches Affiliation dates). */
export interface CareerSpan {
  start: string;
  end: string;
}

/** Parse ISO date to UTC Y/M/D parts. */
function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split("-").map(Number);
  return [y, m, d];
}

/** Format UTC Y/M/D as ISO "YYYY-MM-DD". */
function toIso(y: number, m: number, d: number): string {
  const dt = new Date(Date.UTC(y, m - 1, d));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Shift an ISO date by whole years (Date.UTC handles month/day overflow). */
export function shiftIsoYears(iso: string, years: number): string {
  const [y, m, d] = parts(iso);
  return toIso(y + years, m, d);
}

/** UTC calendar date for "present" (open-ended club stints). */
function asOfIso(asOf?: Date): string {
  const d = asOf ?? new Date();
  return toIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/**
 * Earliest club startDate → latest club endDate (or asOf if any stint is
 * open-ended). National-team affiliations are ignored (no usable dates).
 * Returns null when the player has no dated club affiliations.
 */
export function estimateCareerSpan(
  playerId: string,
  graph: AffiliationGraph,
  asOf?: Date,
): CareerSpan | null {
  let earliest: string | null = null;
  let latestClosed: string | null = null;
  let openEnded = false;

  for (const a of graph.getAffiliationsForPlayer(playerId)) {
    const entity = graph.entities.get(a.entityId);
    if (!entity || entity.type !== "club") continue;
    if (!a.startDate) continue;

    if (earliest === null || a.startDate < earliest) {
      earliest = a.startDate;
    }
    if (a.endDate === null) {
      openEnded = true;
    } else if (latestClosed === null || a.endDate > latestClosed) {
      latestClosed = a.endDate;
    }
  }

  if (earliest === null) return null;

  const end = openEnded
    ? asOfIso(asOf)
    : (latestClosed ?? earliest);

  // Guard: if every closed end is before the earliest start (bad data), still
  // return a coherent window.
  return {
    start: earliest,
    end: end < earliest ? earliest : end,
  };
}

/** Closed-interval overlap on ISO date strings (lexicographic order is chronological). */
function isoRangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

/**
 * Whether two players' club-derived career eras plausibly overlap for a
 * national-team link. Pads both spans by `toleranceYears` on each end to
 * absorb international careers that start before / extend after club data.
 * Returns false if either span cannot be estimated.
 */
export function estimatedErasOverlap(
  playerA: string,
  playerB: string,
  graph: AffiliationGraph,
  toleranceYears: number = 1,
  asOf?: Date,
): boolean {
  const spanA = estimateCareerSpan(playerA, graph, asOf);
  const spanB = estimateCareerSpan(playerB, graph, asOf);
  if (!spanA || !spanB) return false;

  const pad = Math.max(0, toleranceYears);
  return isoRangesOverlap(
    shiftIsoYears(spanA.start, -pad),
    shiftIsoYears(spanA.end, pad),
    shiftIsoYears(spanB.start, -pad),
    shiftIsoYears(spanB.end, pad),
  );
}
