/**
 * In-memory index over the players/clubs/tenures dataset. Port of
 * TenureGraph from data-pipeline/overlap.py.
 */

import type { Club, GraphData, Player, Tenure } from "./types";
import { MIN_OVERLAP_DAYS, tenuresOverlap } from "./overlap";
import graphData from "../data/graph-data.json";

/** One directed teammate edge: neighbor linked via a specific club. */
export interface TeammateEdge {
  neighborId: string;
  clubId: string;
}

export class TenureGraph {
  readonly players: Map<string, Player>;
  readonly clubs: Map<string, Club>;
  readonly tenures: Tenure[];

  private readonly byClub: Map<string, Tenure[]>;
  private readonly byPlayer: Map<string, Tenure[]>;
  /** Lazy: playerId -> edges. Built once; open-ended tenures treated as ongoing. */
  private adjacency: Map<string, TeammateEdge[]> | null = null;

  constructor(data: GraphData) {
    this.players = new Map(data.players.map((p) => [p.id, p]));
    this.clubs = new Map(data.clubs.map((c) => [c.id, c]));
    this.tenures = data.tenures;
    this.byClub = new Map();
    this.byPlayer = new Map();
    for (const t of this.tenures) {
      push(this.byClub, t.clubId, t);
      push(this.byPlayer, t.playerId, t);
    }
  }

  /**
   * Precomputed undirected teammate graph: for each player, every other
   * player they overlap with (>= 30 days) and the club that links them.
   * Built once on first access (~tens of ms), then BFS is a cheap walk.
   */
  getTeammateAdjacency(): Map<string, TeammateEdge[]> {
    if (this.adjacency) return this.adjacency;
    // Far-future asOf so open-ended (null endDate) tenures count as
    // currently overlapping -- matches in-game "ongoing" semantics.
    const asOf = new Date(Date.UTC(9999, 0, 1));
    const adj = new Map<string, TeammateEdge[]>();
    for (const playerId of this.players.keys()) adj.set(playerId, []);

    // Pair every tenure against others at the same club once.
    for (const [, clubTenures] of this.byClub) {
      for (let i = 0; i < clubTenures.length; i++) {
        const a = clubTenures[i];
        for (let j = i + 1; j < clubTenures.length; j++) {
          const b = clubTenures[j];
          if (a.playerId === b.playerId) continue;
          if (!tenuresOverlap(a, b, MIN_OVERLAP_DAYS, asOf)) continue;
          adj.get(a.playerId)!.push({ neighborId: b.playerId, clubId: a.clubId });
          adj.get(b.playerId)!.push({ neighborId: a.playerId, clubId: a.clubId });
        }
      }
    }
    this.adjacency = adj;
    return adj;
  }

  /** All tenures belonging to the player (empty if unknown). */
  getTenuresForPlayer(playerId: string): Tenure[] {
    return this.byPlayer.get(playerId) ?? [];
  }

  /** All tenures at the club, across all players (empty if unknown). */
  getTenuresAtClub(clubId: string): Tenure[] {
    return this.byClub.get(clubId) ?? [];
  }

  /** All clubs the player has at least one tenure at. */
  getClubsForPlayer(playerId: string): Club[] {
    const clubIds = new Set(
      (this.byPlayer.get(playerId) ?? []).map((t) => t.clubId),
    );
    return [...clubIds]
      .map((id) => this.clubs.get(id)!)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * The player's current club: open-ended tenure if any, otherwise the
   * club from their most recent tenure. Null when they have no tenures.
   */
  getCurrentClub(playerId: string): Club | null {
    const tenures = this.byPlayer.get(playerId) ?? [];
    if (tenures.length === 0) return null;
    const open = tenures.filter((t) => t.endDate === null);
    const pick =
      open.length > 0
        ? open.reduce((a, b) => (a.startDate >= b.startDate ? a : b))
        : tenures.reduce((a, b) => {
            const aEnd = a.endDate ?? a.startDate;
            const bEnd = b.endDate ?? b.startDate;
            return aEnd >= bEnd ? a : b;
          });
    return this.clubs.get(pick.clubId) ?? null;
  }

  /**
   * Every OTHER player with a tenure at `clubId` overlapping any of
   * `playerId`'s tenures there by at least `minDays` days.
   *
   * A player may have several non-overlapping stints at the same club
   * (loan then permanent return); a link exists if ANY pairing of stints
   * satisfies the rule. Returns players sorted by name; empty array if
   * `playerId` never played at `clubId`.
   */
  getTeammates(
    playerId: string,
    clubId: string,
    minDays: number = MIN_OVERLAP_DAYS,
    asOf?: Date,
  ): Player[] {
    const own = (this.byPlayer.get(playerId) ?? []).filter(
      (t) => t.clubId === clubId,
    );
    if (own.length === 0) return [];

    const mateIds = new Set<string>();
    for (const other of this.byClub.get(clubId) ?? []) {
      if (other.playerId === playerId || mateIds.has(other.playerId)) continue;
      if (own.some((mine) => tenuresOverlap(mine, other, minDays, asOf))) {
        mateIds.add(other.playerId);
      }
    }
    return [...mateIds]
      .map((id) => this.players.get(id)!)
      .sort((a, b) => a.name.localeCompare(b.name));
  }
}

function push(map: Map<string, Tenure[]>, key: string, t: Tenure): void {
  const list = map.get(key);
  if (list) list.push(t);
  else map.set(key, [t]);
}

let cached: TenureGraph | undefined;

/** Load the bundled graph-data.json into an indexed TenureGraph (memoized). */
export function loadGraph(): TenureGraph {
  if (!cached) {
    cached = new TenureGraph(graphData as GraphData);
    // Warm the adjacency list at load so the first ExpandPanel open is
    // not paying the one-time build cost on a click.
    cached.getTeammateAdjacency();
  }
  return cached;
}
