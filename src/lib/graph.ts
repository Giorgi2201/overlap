/**
 * In-memory index over players / entities / affiliations.
 *
 * Teammate edges:
 * - clubs: any pair of stints at that club with >= 30-day date overlap
 * - national teams: any shared affiliation (no dates)
 */

import type { Affiliation, Entity, GraphData, Player } from "./types";
import {
  MIN_OVERLAP_DAYS,
  affiliationsLink,
  clubAffiliationsOverlap,
} from "./overlap";
import graphData from "../data/graph-data.json";

/** One directed teammate edge: neighbor linked via a specific entity. */
export interface TeammateEdge {
  neighborId: string;
  entityId: string;
}

/**
 * Far-future asOf so open-ended club tenures count as currently overlapping
 * indefinitely. Shared by adjacency and getTeammates so pathfinding and UI
 * agree (two current squadmates link even if they've only overlapped <30 days
 * so far — they will keep overlapping).
 */
export const OPEN_ENDED_AS_OF = new Date(Date.UTC(9999, 0, 1));

export class AffiliationGraph {
  readonly players: Map<string, Player>;
  readonly entities: Map<string, Entity>;
  readonly affiliations: Affiliation[];

  private readonly byEntity: Map<string, Affiliation[]>;
  private readonly byPlayer: Map<string, Affiliation[]>;
  /** Lazy: playerId -> edges under the mixed club/NT rule. */
  private adjacency: Map<string, TeammateEdge[]> | null = null;

  constructor(data: GraphData) {
    this.players = new Map(data.players.map((p) => [p.id, p]));
    this.entities = new Map(data.entities.map((e) => [e.id, e]));
    this.affiliations = data.affiliations;
    this.byEntity = new Map();
    this.byPlayer = new Map();
    for (const a of this.affiliations) {
      push(this.byEntity, a.entityId, a);
      push(this.byPlayer, a.playerId, a);
    }
  }

  /**
   * Precomputed undirected teammate graph under the mixed connection rule.
   */
  getTeammateAdjacency(): Map<string, TeammateEdge[]> {
    if (this.adjacency) return this.adjacency;
    const adj = new Map<string, TeammateEdge[]>();
    for (const playerId of this.players.keys()) adj.set(playerId, []);

    for (const [entityId, entityAffs] of this.byEntity) {
      const entity = this.entities.get(entityId);
      if (!entity) continue;

      if (entity.type === "national_team") {
        const playerIds = [...new Set(entityAffs.map((a) => a.playerId))];
        for (let i = 0; i < playerIds.length; i++) {
          for (let j = i + 1; j < playerIds.length; j++) {
            const a = playerIds[i];
            const b = playerIds[j];
            adj.get(a)!.push({ neighborId: b, entityId });
            adj.get(b)!.push({ neighborId: a, entityId });
          }
        }
        continue;
      }

      // Club: compare every pair of stints (multi-stint support).
      for (let i = 0; i < entityAffs.length; i++) {
        const a = entityAffs[i];
        for (let j = i + 1; j < entityAffs.length; j++) {
          const b = entityAffs[j];
          if (a.playerId === b.playerId) continue;
          if (!clubAffiliationsOverlap(a, b, MIN_OVERLAP_DAYS, OPEN_ENDED_AS_OF)) {
            continue;
          }
          adj.get(a.playerId)!.push({ neighborId: b.playerId, entityId });
          adj.get(b.playerId)!.push({ neighborId: a.playerId, entityId });
        }
      }
    }
    this.adjacency = adj;
    return adj;
  }

  getAffiliationsForPlayer(playerId: string): Affiliation[] {
    return this.byPlayer.get(playerId) ?? [];
  }

  getAffiliationsAtEntity(entityId: string): Affiliation[] {
    return this.byEntity.get(entityId) ?? [];
  }

  /** All entities (clubs + national teams) the player is affiliated with. */
  getEntitiesForPlayer(playerId: string): Entity[] {
    const ids = new Set(
      (this.byPlayer.get(playerId) ?? []).map((a) => a.entityId),
    );
    return [...ids]
      .map((id) => this.entities.get(id)!)
      .filter(Boolean)
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === "club" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }

  /**
   * Current club for display on player cards: open-ended club affiliation
   * if any, else most recent club affiliation by end/start date.
   */
  getCurrentClub(playerId: string): Entity | null {
    const clubs = (this.byPlayer.get(playerId) ?? []).filter((a) => {
      const e = this.entities.get(a.entityId);
      return e?.type === "club";
    });
    if (clubs.length === 0) return null;
    const open = clubs.filter((a) => a.endDate === null);
    const pick =
      open.length > 0
        ? open.reduce((a, b) =>
            (a.startDate ?? "") >= (b.startDate ?? "") ? a : b,
          )
        : clubs.reduce((a, b) => {
            const aEnd = a.endDate ?? a.startDate ?? "";
            const bEnd = b.endDate ?? b.startDate ?? "";
            return aEnd >= bEnd ? a : b;
          });
    return this.entities.get(pick.entityId) ?? null;
  }

  /**
   * Every OTHER player linked to `playerId` via `entityId` under the mixed
   * rule. For clubs, any pairing of multi-stints that overlaps counts.
   */
  getTeammates(
    playerId: string,
    entityId: string,
    minDays: number = MIN_OVERLAP_DAYS,
    asOf: Date = OPEN_ENDED_AS_OF,
  ): Player[] {
    const entity = this.entities.get(entityId);
    if (!entity) return [];

    const own = (this.byPlayer.get(playerId) ?? []).filter(
      (a) => a.entityId === entityId,
    );
    if (own.length === 0) return [];

    const mateIds = new Set<string>();
    for (const other of this.byEntity.get(entityId) ?? []) {
      if (other.playerId === playerId || mateIds.has(other.playerId)) continue;
      const linked = own.some((mine) =>
        affiliationsLink(mine, other, entity.type, minDays, asOf),
      );
      if (linked) mateIds.add(other.playerId);
    }
    return [...mateIds]
      .map((id) => this.players.get(id)!)
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));
  }
}

/** @deprecated Use AffiliationGraph. */
export type TenureGraph = AffiliationGraph;
/** @deprecated Use AffiliationGraph. */
export const TenureGraph = AffiliationGraph;

function push(map: Map<string, Affiliation[]>, key: string, a: Affiliation): void {
  const list = map.get(key);
  if (list) list.push(a);
  else map.set(key, [a]);
}

let cached: AffiliationGraph | undefined;

/** Load the bundled graph-data.json into an indexed graph (memoized). */
export function loadGraph(): AffiliationGraph {
  if (!cached) {
    cached = new AffiliationGraph(graphData as GraphData);
    cached.getTeammateAdjacency();
  }
  return cached;
}
