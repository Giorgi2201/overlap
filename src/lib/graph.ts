/**
 * In-memory index over players / entities / affiliations.
 */

import type { Affiliation, Entity, GraphData, Player } from "./types";
import graphData from "../data/graph-data.json";

/** One directed teammate edge: neighbor linked via a specific entity. */
export interface TeammateEdge {
  neighborId: string;
  entityId: string;
}

export class AffiliationGraph {
  readonly players: Map<string, Player>;
  readonly entities: Map<string, Entity>;
  readonly affiliations: Affiliation[];

  private readonly byEntity: Map<string, Affiliation[]>;
  private readonly byPlayer: Map<string, Affiliation[]>;
  /** Lazy: playerId -> edges. Built once under the share-any-entity rule. */
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
   * Precomputed undirected teammate graph: two players are linked if they
   * share any entity (club or national team), regardless of dates.
   */
  getTeammateAdjacency(): Map<string, TeammateEdge[]> {
    if (this.adjacency) return this.adjacency;
    const adj = new Map<string, TeammateEdge[]>();
    for (const playerId of this.players.keys()) adj.set(playerId, []);

    for (const [, entityAffs] of this.byEntity) {
      const playerIds = [...new Set(entityAffs.map((a) => a.playerId))];
      for (let i = 0; i < playerIds.length; i++) {
        for (let j = i + 1; j < playerIds.length; j++) {
          const a = playerIds[i];
          const b = playerIds[j];
          const entityId = entityAffs[0].entityId;
          adj.get(a)!.push({ neighborId: b, entityId });
          adj.get(b)!.push({ neighborId: a, entityId });
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
        // Clubs first, then national teams; alpha within type.
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
   * Every OTHER player affiliated with `entityId` (any dates).
   */
  getTeammates(playerId: string, entityId: string): Player[] {
    const own = (this.byPlayer.get(playerId) ?? []).some(
      (a) => a.entityId === entityId,
    );
    if (!own) return [];

    const mateIds = new Set<string>();
    for (const other of this.byEntity.get(entityId) ?? []) {
      if (other.playerId !== playerId) mateIds.add(other.playerId);
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