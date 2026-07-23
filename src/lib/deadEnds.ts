/**
 * Dead-end detection for entity / teammate lists.
 *
 * An option is a dead end when picking it cannot lead to the target
 * anymore under the mixed connection rule (club dated overlap / NT any
 * shared affiliation), with the chain's already-used players and entities
 * excluded (no trivial backtracking). Reachability walks the same
 * precomputed adjacency as pathfinding.
 *
 * Three-state reachability classification:
 * - viable: a path to target exists using at most nationalTeamHopsRemaining NT hops
 * - needs_more_hops: a path exists but requires MORE NT hops than the player has
 * - true_dead_end: no path to target exists at all
 */

import type { AffiliationGraph } from "./graph";
import type { Entity, Player } from "./types";

export interface ChainNodeLike {
  type: "player" | "entity" | "club";
  id: string;
}

export type ReachabilityState = "viable" | "needs_more_hops" | "true_dead_end";

export interface EntityOption {
  entity: Entity;
  isDeadEnd: boolean;
  reachability: ReachabilityState;
}

/** @deprecated Use EntityOption. */
export type ClubOption = EntityOption & { club: Entity };

export interface TeammateOption {
  player: Player;
  isDeadEnd: boolean;
  reachability: ReachabilityState;
}

function exclusionsFromChain(chain: readonly ChainNodeLike[]): {
  players: Set<string>;
  entities: Set<string>;
} {
  const players = new Set<string>();
  const entities = new Set<string>();
  for (const node of chain) {
    if (node.type === "player") players.add(node.id);
    else entities.add(node.id);
  }
  return { players, entities };
}

function exclusionKey(exclude: {
  players: Set<string>;
  entities: Set<string>;
}): string {
  return (
    [...exclude.players].sort().join(",") +
    "|" +
    [...exclude.entities].sort().join(",")
  );
}

const ntHopDistCache = new WeakMap<
  AffiliationGraph,
  Map<string, Map<string, number>>
>();

export function clearReachabilityCache(graph?: AffiliationGraph): void {
  if (graph) {
    ntHopDistCache.delete(graph);
  }
}

/**
 * 0-1 BFS from targetPlayerId (backwards) computing the MINIMUM number of
 * national-team hops required to reach the target from each player.
 * Club edges have cost 0, national-team edges have cost 1.
 * Returns a Map<playerId, minNT> — Infinity for unreachable players.
 * Cached per (targetPlayerId, exclusionKey) pair, same strategy as
 * reachableFromTarget.
 */
function minNTFromTarget(
  graph: AffiliationGraph,
  targetPlayerId: string,
  exclude: { players: Set<string>; entities: Set<string> },
): Map<string, number> {
  const key = `${targetPlayerId}|${exclusionKey(exclude)}`;
  let byGraph = ntHopDistCache.get(graph);
  if (!byGraph) {
    byGraph = new Map();
    ntHopDistCache.set(graph, byGraph);
  }
  const cached = byGraph.get(key);
  if (cached) return cached;

  const adj = graph.getTeammateAdjacency();
  // Use a plain Map: Infinity means unreachable (never visited).
  const dist = new Map<string, number>();
  dist.set(targetPlayerId, 0);

  // 0-1 BFS deque: shift/unshift for 0/1 cost edges.
  const deque: string[] = [targetPlayerId];

  while (deque.length > 0) {
    const current = deque.shift()!;
    const currentDist = dist.get(current)!;

    for (const edge of adj.get(current) ?? []) {
      if (exclude.players.has(edge.neighborId)) continue;
      if (exclude.entities.has(edge.entityId)) continue;

      const entity = graph.entities.get(edge.entityId);
      if (!entity) continue;

      const edgeCost = entity.type === "national_team" ? 1 : 0;
      const newDist = currentDist + edgeCost;

      const existing = dist.get(edge.neighborId);
      if (existing !== undefined && existing <= newDist) continue;

      dist.set(edge.neighborId, newDist);
      if (edgeCost === 0) {
        deque.unshift(edge.neighborId);
      } else {
        deque.push(edge.neighborId);
      }
    }
  }

  byGraph.set(key, dist);
  return dist;
}

/**
 * Classify one player's distance-to-target into the three-state
 * reachability scale given the current NT-hop budget.
 */
function classifyReachability(
  minNT: number | undefined,
  nationalTeamHopsRemaining: number,
): ReachabilityState {
  if (minNT === undefined) return "true_dead_end";
  if (minNT === Infinity) return "true_dead_end";
  if (minNT <= nationalTeamHopsRemaining) return "viable";
  return "needs_more_hops";
}

export function getEntityOptions(
  graph: AffiliationGraph,
  playerId: string,
  targetPlayerId: string,
  chain: readonly ChainNodeLike[],
  nationalTeamHopsRemaining: number = 0,
): EntityOption[] {
  const exclude = exclusionsFromChain(chain);
  const distances = minNTFromTarget(graph, targetPlayerId, exclude);
  return graph.getEntitiesForPlayer(playerId).map((entity) => {
    if (exclude.entities.has(entity.id)) {
      return {
        entity,
        isDeadEnd: true,
        reachability: "true_dead_end" as const,
      };
    }
    const teammates = graph.getTeammates(playerId, entity.id);
    // Find the LOWEST min-NT-hop cost among teammates through this entity.
    // The entity edge itself costs 1 if it's a national team (club edges cost 0).
    const entityCost = entity.type === "national_team" ? 1 : 0;
    let minNT = Infinity;
    for (const mate of teammates) {
      const d = distances.get(mate.id) ?? Infinity;
      const total = d + entityCost;
      if (total < minNT) minNT = total;
    }
    const reachability = classifyReachability(minNT, nationalTeamHopsRemaining);
    return {
      entity,
      isDeadEnd: reachability !== "viable",
      reachability,
    };
  });
}

/** @deprecated Use getEntityOptions. */
export function getClubOptions(
  graph: AffiliationGraph,
  playerId: string,
  targetPlayerId: string,
  chain: readonly ChainNodeLike[],
): ClubOption[] {
  return getEntityOptions(graph, playerId, targetPlayerId, chain).map((o) => ({
    ...o,
    club: o.entity,
  }));
}

export function getTeammateOptions(
  graph: AffiliationGraph,
  viaPlayerId: string,
  entityId: string,
  targetPlayerId: string,
  chain: readonly ChainNodeLike[],
  nationalTeamHopsRemaining: number = 0,
): TeammateOption[] {
  const exclude = exclusionsFromChain(chain);
  const distances = minNTFromTarget(graph, targetPlayerId, exclude);
  return graph.getTeammates(viaPlayerId, entityId).map((player) => {
    if (player.id === targetPlayerId) {
      return {
        player,
        isDeadEnd: false,
        reachability: "viable" as const,
      };
    }
    const minNT = distances.get(player.id) ?? Infinity;
    const reachability = classifyReachability(minNT, nationalTeamHopsRemaining);
    return {
      player,
      isDeadEnd: reachability !== "viable",
      reachability,
    };
  });
}
