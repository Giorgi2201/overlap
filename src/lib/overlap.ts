/**
 * Shared-entity checks for Overlap.
 *
 * A link between two players is valid when they share ANY entity (club or
 * national team) in their affiliations — no date-range intersection.
 */

import type { Affiliation } from "./types";

/**
 * True when both affiliations point at the same entity.
 * Dates are ignored.
 */
export function sharesEntity(a: Affiliation, b: Affiliation): boolean {
  return a.entityId === b.entityId;
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
