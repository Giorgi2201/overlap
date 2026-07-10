/**
 * BFS pathfinding over the teammate graph. Used only to validate that a
 * puzzle pair is solvable -- never shown to the player.
 *
 * Nodes are players; an edge exists between two players if they have a
 * valid teammate overlap (same club, >= 30 days) at ANY shared club.
 * Neighbors are looked up from TenureGraph's precomputed adjacency list
 * (built once on first access / loadGraph). A full BFS is then a cheap
 * walk over ~1000 nodes; exclusions for dead-end detection stay correct.
 */

import type { TenureGraph } from "./graph";
import { MIN_OVERLAP_DAYS, tenuresOverlap } from "./overlap";

/** Default BFS depth cap: a path may use at most this many links. */
export const MAX_HOPS = 6;

/** Attempts before generateRandomPair gives up (indicates data sparsity). */
export const MAX_PAIR_ATTEMPTS = 200;

/**
 * Default minimum links for a generated puzzle. 2-hop puzzles proved too
 * easy in distribution testing (~two-thirds of random pairs), so the
 * default requires 3+; pass a lower minHops for an easier difficulty.
 */
export const MIN_PUZZLE_HOPS = 3;

/**
 * One step of a path. `clubId` is the club used to link FORWARD to the
 * next player; it is null on the final step.
 */
export interface PathStep {
  playerId: string;
  clubId: string | null;
}

/** Nodes a path is not allowed to route through. */
export interface PathExclusions {
  players?: ReadonlySet<string>;
  clubs?: ReadonlySet<string>;
}

export interface PuzzlePair {
  startPlayerId: string;
  targetPlayerId: string;
  /** The shortest path found, kept for diagnostics (never shown to the player). */
  path: PathStep[];
  /** Number of links in that path (path.length - 1). Always >= minHops. */
  pathLength: number;
}

export interface RandomPairOptions {
  /** Minimum links in the shortest path (default MIN_PUZZLE_HOPS = 3). */
  minHops?: number;
  /** Maximum links in the shortest path (default MAX_HOPS = 6). */
  maxHops?: number;
  /** "Today" for open-ended tenures (default: actual today). */
  asOf?: Date;
  /** Random source, injectable for deterministic tests. */
  random?: () => number;
}

/**
 * Every player with a valid teammate overlap with `playerId` at ANY shared
 * club. Returns a Map of teammate player id -> the clubId of one club
 * where they overlapped (the first found; a pair may share several).
 *
 * Uses the precomputed adjacency list when `asOf` is omitted (the common
 * game path). With an explicit `asOf`, falls back to scanning tenures so
 * tests that pin "today" stay exact.
 */
export function getAllTeammateLinks(
  graph: TenureGraph,
  playerId: string,
  minDays: number = MIN_OVERLAP_DAYS,
  asOf?: Date,
  exclude?: PathExclusions,
): Map<string, string> {
  const links = new Map<string, string>();

  if (asOf === undefined && minDays === MIN_OVERLAP_DAYS) {
    for (const edge of graph.getTeammateAdjacency().get(playerId) ?? []) {
      if (exclude?.clubs?.has(edge.clubId)) continue;
      if (exclude?.players?.has(edge.neighborId)) continue;
      if (!links.has(edge.neighborId)) links.set(edge.neighborId, edge.clubId);
    }
    return links;
  }

  for (const mine of graph.getTenuresForPlayer(playerId)) {
    if (exclude?.clubs?.has(mine.clubId)) continue;
    for (const other of graph.getTenuresAtClub(mine.clubId)) {
      if (other.playerId === playerId || links.has(other.playerId)) continue;
      if (exclude?.players?.has(other.playerId)) continue;
      if (tenuresOverlap(mine, other, minDays, asOf)) {
        links.set(other.playerId, mine.clubId);
      }
    }
  }
  return links;
}

/**
 * All players reachable from `fromPlayerId` through valid teammate links,
 * optionally avoiding excluded players/clubs entirely. Includes
 * `fromPlayerId` itself. One BFS answers "can X still reach the target?"
 * for every X at once -- much cheaper than a findShortestPath call per
 * candidate when marking dead ends in a list.
 *
 * Walks the precomputed adjacency list, so a full-graph BFS with
 * exclusions is typically a few milliseconds after the one-time build.
 */
export function reachablePlayers(
  graph: TenureGraph,
  fromPlayerId: string,
  options: { maxHops?: number; asOf?: Date; exclude?: PathExclusions } = {},
): Set<string> {
  const { maxHops = Infinity, asOf, exclude } = options;

  // Fast path: adjacency walk (no asOf pin).
  if (asOf === undefined) {
    const adj = graph.getTeammateAdjacency();
    const visited = new Set([fromPlayerId]);
    let frontier = [fromPlayerId];
    for (let depth = 0; depth < maxHops && frontier.length > 0; depth++) {
      const next: string[] = [];
      for (const current of frontier) {
        for (const edge of adj.get(current) ?? []) {
          if (exclude?.clubs?.has(edge.clubId)) continue;
          if (exclude?.players?.has(edge.neighborId)) continue;
          if (visited.has(edge.neighborId)) continue;
          visited.add(edge.neighborId);
          next.push(edge.neighborId);
        }
      }
      frontier = next;
    }
    return visited;
  }

  const visited = new Set([fromPlayerId]);
  let frontier = [fromPlayerId];
  for (let depth = 0; depth < maxHops && frontier.length > 0; depth++) {
    const next: string[] = [];
    for (const current of frontier) {
      for (const neighborId of getAllTeammateLinks(
        graph, current, MIN_OVERLAP_DAYS, asOf, exclude,
      ).keys()) {
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          next.push(neighborId);
        }
      }
    }
    frontier = next;
  }
  return visited;
}

/** Whether two players have a valid teammate overlap at any shared club. */
export function hasDirectLink(
  graph: TenureGraph,
  playerIdA: string,
  playerIdB: string,
  minDays: number = MIN_OVERLAP_DAYS,
  asOf?: Date,
): boolean {
  for (const mine of graph.getTenuresForPlayer(playerIdA)) {
    for (const other of graph.getTenuresAtClub(mine.clubId)) {
      if (other.playerId === playerIdB && tenuresOverlap(mine, other, minDays, asOf)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Breadth-first search for the shortest player -> club -> player chain
 * from `startPlayerId` to `targetPlayerId`.
 *
 * Returns the path as steps [{playerId, clubId-linking-forward}, ...,
 * {playerId: target, clubId: null}], or null if the target is not
 * reachable within `maxHops` links.
 */
export function findShortestPath(
  startPlayerId: string,
  targetPlayerId: string,
  graph: TenureGraph,
  maxHops: number = MAX_HOPS,
  asOf?: Date,
): PathStep[] | null {
  if (!graph.players.has(startPlayerId) || !graph.players.has(targetPlayerId)) {
    return null;
  }
  if (startPlayerId === targetPlayerId) {
    return [{ playerId: startPlayerId, clubId: null }];
  }

  // parent: child playerId -> [parent playerId, club linking parent->child]
  const parent = new Map<string, [string, string]>();
  let frontier = [startPlayerId];
  const visited = new Set(frontier);

  for (let depth = 0; depth < maxHops && frontier.length > 0; depth++) {
    const next: string[] = [];
    for (const current of frontier) {
      for (const [neighborId, clubId] of getAllTeammateLinks(graph, current, MIN_OVERLAP_DAYS, asOf)) {
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);
        parent.set(neighborId, [current, clubId]);
        if (neighborId === targetPlayerId) {
          return reconstructPath(parent, startPlayerId, targetPlayerId);
        }
        next.push(neighborId);
      }
    }
    frontier = next;
  }
  return null;
}

function reconstructPath(
  parent: Map<string, [string, string]>,
  startPlayerId: string,
  targetPlayerId: string,
): PathStep[] {
  const steps: PathStep[] = [{ playerId: targetPlayerId, clubId: null }];
  let current = targetPlayerId;
  while (current !== startPlayerId) {
    const [prev, clubId] = parent.get(current)!;
    steps.push({ playerId: prev, clubId });
    current = prev;
  }
  return steps.reverse();
}

/**
 * Picks two random players whose shortest teammate path is between
 * `minHops` and `maxHops` links, so every puzzle needs intermediate
 * players but is guaranteed solvable.
 *
 * Throws after MAX_PAIR_ATTEMPTS failed attempts -- if that ever fires,
 * the player pool is too sparse and the dataset needs revisiting.
 */
export function generateRandomPair(
  graph: TenureGraph,
  options: RandomPairOptions = {},
): PuzzlePair {
  const {
    minHops = MIN_PUZZLE_HOPS,
    maxHops = MAX_HOPS,
    asOf,
    random = Math.random,
  } = options;
  const playerIds = [...graph.players.keys()];
  if (playerIds.length < 2) {
    throw new Error("generateRandomPair: need at least 2 players");
  }

  for (let attempt = 0; attempt < MAX_PAIR_ATTEMPTS; attempt++) {
    const startPlayerId = playerIds[Math.floor(random() * playerIds.length)];
    const targetPlayerId = playerIds[Math.floor(random() * playerIds.length)];
    if (startPlayerId === targetPlayerId) continue;
    // Cheap pre-check before running a BFS: minHops >= 2 always excludes
    // direct teammates.
    if (hasDirectLink(graph, startPlayerId, targetPlayerId, MIN_OVERLAP_DAYS, asOf)) continue;

    const path = findShortestPath(startPlayerId, targetPlayerId, graph, maxHops, asOf);
    if (path === null || path.length - 1 < minHops) continue;

    return { startPlayerId, targetPlayerId, path, pathLength: path.length - 1 };
  }

  throw new Error(
    `generateRandomPair: no valid pair after ${MAX_PAIR_ATTEMPTS} attempts -- ` +
      "the player pool looks too sparse for solvable puzzles",
  );
}
