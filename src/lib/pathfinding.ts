/**
 * BFS pathfinding over the teammate graph. Used only to validate that a
 * puzzle pair is solvable -- never shown to the player.
 *
 * Nodes are players; edges come from AffiliationGraph adjacency under the
 * mixed rule (club = dated overlap, national team = shared affiliation).
 * Reverse-reachability for dead-ends walks the same undirected edges.
 * Puzzle generation additionally requires a club-only path (see findClubOnlyPath).
 */

import {
  DIFFICULTY,
  buildFameTiers,
  pickPlayerIdFromTier,
  pickTier,
  tierWeightsForLevel,
  type FameTiers,
} from "./difficulty";
import type { AffiliationGraph } from "./graph";

/** Default BFS depth cap: a path may use at most this many links. */
export const MAX_HOPS = 6;

/** Attempts before generateRandomPair gives up (indicates data sparsity). */
export const MAX_PAIR_ATTEMPTS = 500;

/**
 * Default minimum links for a generated puzzle.
 *
 * Under the mixed club-overlap / NT-any rule, most random pairs are still
 * short (see hop-distribution.json). Default excludes only direct teammates.
 */
export const MIN_PUZZLE_HOPS = 2;

/**
 * One step of a path. `entityId` is the entity used to link FORWARD to the
 * next player; it is null on the final step.
 */
export interface PathStep {
  playerId: string;
  entityId: string | null;
  /** @deprecated Use entityId. */
  clubId?: string | null;
}

/** Nodes a path is not allowed to route through. */
export interface PathExclusions {
  players?: ReadonlySet<string>;
  entities?: ReadonlySet<string>;
  /** @deprecated Use entities. */
  clubs?: ReadonlySet<string>;
}

export interface PuzzlePair {
  startPlayerId: string;
  targetPlayerId: string;
  path: PathStep[];
  pathLength: number;
}

export interface RandomPairOptions {
  /** Progressive difficulty level (1+). When set, pool + hop rules scale. */
  level?: number;
  minHops?: number;
  maxHops?: number;
  maxAttempts?: number;
  random?: () => number;
  /** Optional precomputed fame tiers (tests / batch generation). */
  fameTiers?: FameTiers;
}

function excludedEntities(exclude?: PathExclusions): ReadonlySet<string> | undefined {
  if (!exclude) return undefined;
  if (exclude.entities && exclude.clubs) {
    return new Set([...exclude.entities, ...exclude.clubs]);
  }
  return exclude.entities ?? exclude.clubs;
}

/**
 * Every player linked to `playerId` under the mixed connection rule.
 * Returns Map of teammate id -> one entityId that links them.
 */
export function getAllTeammateLinks(
  graph: AffiliationGraph,
  playerId: string,
  exclude?: PathExclusions,
): Map<string, string> {
  const links = new Map<string, string>();
  const bannedEntities = excludedEntities(exclude);
  for (const edge of graph.getTeammateAdjacency().get(playerId) ?? []) {
    if (bannedEntities?.has(edge.entityId)) continue;
    if (exclude?.players?.has(edge.neighborId)) continue;
    if (!links.has(edge.neighborId)) links.set(edge.neighborId, edge.entityId);
  }
  return links;
}

export function reachablePlayers(
  graph: AffiliationGraph,
  fromPlayerId: string,
  options: { maxHops?: number; exclude?: PathExclusions } = {},
): Set<string> {
  const { maxHops = Infinity, exclude } = options;
  const adj = graph.getTeammateAdjacency();
  const bannedEntities = excludedEntities(exclude);
  const visited = new Set([fromPlayerId]);
  let frontier = [fromPlayerId];
  for (let depth = 0; depth < maxHops && frontier.length > 0; depth++) {
    const next: string[] = [];
    for (const current of frontier) {
      for (const edge of adj.get(current) ?? []) {
        if (bannedEntities?.has(edge.entityId)) continue;
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

export function hasDirectLink(
  graph: AffiliationGraph,
  playerIdA: string,
  playerIdB: string,
): boolean {
  for (const edge of graph.getTeammateAdjacency().get(playerIdA) ?? []) {
    if (edge.neighborId === playerIdB) return true;
  }
  return false;
}

export function findShortestPath(
  startPlayerId: string,
  targetPlayerId: string,
  graph: AffiliationGraph,
  maxHops: number = MAX_HOPS,
): PathStep[] | null {
  if (!graph.players.has(startPlayerId) || !graph.players.has(targetPlayerId)) {
    return null;
  }
  if (startPlayerId === targetPlayerId) {
    return [{ playerId: startPlayerId, entityId: null, clubId: null }];
  }

  const parent = new Map<string, [string, string]>();
  let frontier = [startPlayerId];
  const visited = new Set(frontier);

  for (let depth = 0; depth < maxHops && frontier.length > 0; depth++) {
    const next: string[] = [];
    for (const current of frontier) {
      for (const [neighborId, entityId] of getAllTeammateLinks(graph, current)) {
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);
        parent.set(neighborId, [current, entityId]);
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

/**
 * BFS using only club-type edges — national-team links are ignored.
 * Guarantees a pure club route exists so a future NT-hop resource limit
 * cannot soft-lock a puzzle.
 */
export function findClubOnlyPath(
  startPlayerId: string,
  targetPlayerId: string,
  graph: AffiliationGraph,
  maxHops: number = MAX_HOPS,
): PathStep[] | null {
  if (!graph.players.has(startPlayerId) || !graph.players.has(targetPlayerId)) {
    return null;
  }
  if (startPlayerId === targetPlayerId) {
    return [{ playerId: startPlayerId, entityId: null, clubId: null }];
  }

  const adj = graph.getTeammateAdjacency();
  const parent = new Map<string, [string, string]>();
  let frontier = [startPlayerId];
  const visited = new Set(frontier);

  for (let depth = 0; depth < maxHops && frontier.length > 0; depth++) {
    const next: string[] = [];
    for (const current of frontier) {
      for (const edge of adj.get(current) ?? []) {
        if (graph.entities.get(edge.entityId)?.type !== "club") continue;
        if (visited.has(edge.neighborId)) continue;
        visited.add(edge.neighborId);
        parent.set(edge.neighborId, [current, edge.entityId]);
        if (edge.neighborId === targetPlayerId) {
          return reconstructPath(parent, startPlayerId, targetPlayerId);
        }
        next.push(edge.neighborId);
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
  const steps: PathStep[] = [
    { playerId: targetPlayerId, entityId: null, clubId: null },
  ];
  let current = targetPlayerId;
  while (current !== startPlayerId) {
    const [prev, entityId] = parent.get(current)!;
    steps.push({ playerId: prev, entityId, clubId: entityId });
    current = prev;
  }
  return steps.reverse();
}

function tryRandomPair(
  graph: AffiliationGraph,
  options: {
    minHops: number;
    maxHops: number;
    maxAttempts: number;
    pickPair: () => [string, string];
  },
): PuzzlePair | null {
  const { minHops, maxHops, maxAttempts, pickPair } = options;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const [startPlayerId, targetPlayerId] = pickPair();
    if (startPlayerId === targetPlayerId) continue;
    if (minHops >= 2 && hasDirectLink(graph, startPlayerId, targetPlayerId)) {
      continue;
    }

    const path = findShortestPath(startPlayerId, targetPlayerId, graph, maxHops);
    if (path === null || path.length - 1 < minHops) continue;

    // Must also be solvable with clubs only (NT-hop resource soft-lock guard).
    if (findClubOnlyPath(startPlayerId, targetPlayerId, graph, maxHops) === null) {
      continue;
    }

    return {
      startPlayerId,
      targetPlayerId,
      path,
      pathLength: path.length - 1,
    };
  }
  return null;
}

function pickEndpointsForLevel(
  tiers: FameTiers,
  level: number,
  random: () => number,
): [string, string] {
  const weights = tierWeightsForLevel(level);
  const startTier = pickTier(weights, random);
  const targetTier = pickTier(weights, random);
  const startPlayerId = pickPlayerIdFromTier(tiers, startTier, random);
  const targetPlayerId = pickPlayerIdFromTier(
    tiers,
    targetTier,
    random,
    startPlayerId,
  );
  return [startPlayerId, targetPlayerId];
}

function generateForLevel(
  graph: AffiliationGraph,
  level: number,
  options: RandomPairOptions,
): PuzzlePair {
  const random = options.random ?? Math.random;
  const maxHops = options.maxHops ?? MAX_HOPS;
  const tiers = options.fameTiers ?? buildFameTiers(graph.players.values());
  const L = Math.max(1, Math.floor(level));
  const pickPair = () => pickEndpointsForLevel(tiers, L, random);

  if (L <= DIFFICULTY.EARLY_MAX_LEVEL) {
    const pair = tryRandomPair(graph, {
      minHops: options.minHops ?? DIFFICULTY.EARLY_MIN_HOPS,
      maxHops,
      maxAttempts: options.maxAttempts ?? DIFFICULTY.EARLY_MAX_ATTEMPTS,
      pickPair,
    });
    if (pair) return pair;
  } else if (L <= DIFFICULTY.MID_MAX_LEVEL) {
    // Prefer a longer path when one appears within the preferred budget.
    const preferred = tryRandomPair(graph, {
      minHops: options.minHops ?? DIFFICULTY.MID_PREFERRED_HOPS,
      maxHops,
      maxAttempts: options.maxAttempts ?? DIFFICULTY.MID_PREFERRED_ATTEMPTS,
      pickPair,
    });
    if (preferred) return preferred;

    const fallback = tryRandomPair(graph, {
      minHops: options.minHops ?? DIFFICULTY.MID_MIN_HOPS,
      maxHops,
      maxAttempts: DIFFICULTY.MID_FALLBACK_ATTEMPTS,
      pickPair,
    });
    if (fallback) return fallback;
  } else {
    const pair = tryRandomPair(graph, {
      minHops: options.minHops ?? DIFFICULTY.HIGH_MIN_HOPS,
      maxHops,
      maxAttempts: options.maxAttempts ?? DIFFICULTY.HIGH_MAX_ATTEMPTS,
      pickPair,
    });
    if (pair) return pair;
  }

  throw new Error(
    `generateRandomPair: no valid pair for level ${L} -- ` +
      "the player pool looks too sparse for solvable puzzles",
  );
}

export function generateRandomPair(
  graph: AffiliationGraph,
  options: RandomPairOptions = {},
): PuzzlePair {
  if (options.level != null) {
    return generateForLevel(graph, options.level, options);
  }

  const {
    minHops = MIN_PUZZLE_HOPS,
    maxHops = MAX_HOPS,
    maxAttempts = MAX_PAIR_ATTEMPTS,
    random = Math.random,
  } = options;
  const playerIds = [...graph.players.keys()];
  if (playerIds.length < 2) {
    throw new Error("generateRandomPair: need at least 2 players");
  }

  const pair = tryRandomPair(graph, {
    minHops,
    maxHops,
    maxAttempts,
    pickPair: () => {
      const startPlayerId = playerIds[Math.floor(random() * playerIds.length)];
      const targetPlayerId = playerIds[Math.floor(random() * playerIds.length)];
      return [startPlayerId, targetPlayerId];
    },
  });

  if (pair) return pair;

  throw new Error(
    `generateRandomPair: no valid pair after ${maxAttempts} attempts -- ` +
      "the player pool looks too sparse for solvable puzzles",
  );
}
