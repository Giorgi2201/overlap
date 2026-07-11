/**
 * Types mirroring src/data/graph-data.json (from
 * data-pipeline/build_affiliations.py).
 *
 * Dates stay as ISO "YYYY-MM-DD" strings for the same reasons as before
 * (JSON fidelity, sortability, no timezone pitfalls). They are display
 * metadata on club affiliations only — link validity ignores them.
 */

export type EntityType = "club" | "national_team";

export interface Player {
  id: string;
  name: string;
  position: string;
  /** ISO date string, or null when unknown. */
  dob: string | null;
  /** Peak Transfermarkt market value in EUR — primary fame signal. */
  highestMarketValue?: number;
  /** Senior international caps — fallback fame signal when MV is missing. */
  internationalCaps?: number;
  /** Transfermarkt portrait URL, when available. */
  imageUrl?: string | null;
}

export interface Entity {
  id: string;
  name: string;
  type: EntityType;
  country: string;
}

/** @deprecated Use Entity — kept as an alias during the rename. */
export type Club = Entity;

export interface Affiliation {
  playerId: string;
  entityId: string;
  /** ISO date, club tenures only; null for national teams / unknown. */
  startDate: string | null;
  /** ISO date or null if ongoing / unknown. */
  endDate: string | null;
}

/** @deprecated Use Affiliation. */
export type Tenure = Affiliation;

export interface GraphData {
  players: Player[];
  entities: Entity[];
  affiliations: Affiliation[];
}
