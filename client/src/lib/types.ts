/**
 * Types mirroring the shape of src/data/graph-data.json (produced by
 * data-pipeline/build_graph.py).
 *
 * Dates are kept as ISO "YYYY-MM-DD" strings rather than Date objects:
 * - they match the JSON payload exactly, so no deserialization pass over
 *   ~5.5k tenures is needed at load time;
 * - ISO date strings order correctly under plain string comparison;
 * - Date objects drag in timezone pitfalls (new Date("2020-01-01") is
 *   midnight UTC, but Date arithmetic in local time can be off by a day).
 * The interval math in overlap.ts parses strings to UTC timestamps at the
 * edges instead.
 */

export interface Player {
  id: string;
  name: string;
  position: string;
  /** ISO date string, or null when unknown. */
  dob: string | null;
}

export interface Club {
  id: string;
  name: string;
  country: string;
}

export interface Tenure {
  playerId: string;
  clubId: string;
  /** ISO date string, inclusive start of the spell. */
  startDate: string;
  /** ISO date string (exclusive end, half-open interval) or null if ongoing. */
  endDate: string | null;
}

export interface GraphData {
  players: Player[];
  clubs: Club[];
  tenures: Tenure[];
}
