/**
 * Dead-end detection for entity / teammate lists.
 *
 * An option is a dead end when picking it cannot lead to the target
 * anymore under the share-any-entity rule, with the chain's already-used
 * players and entities excluded (no trivial backtracking).
 */

import type { AffiliationGraph } from "./graph";
import { reachablePlayers } from "./pathfinding";
import type { Entity, Player } from "./types";

export interface ChainNodeLike {
  type: "player" | "entity" | "club";
  id: string;
}

export interface EntityOption {
  entity: Entity;
  isDeadEnd: boolean;
}

/** @deprecated Use EntityOption. */
export type ClubOption = EntityOption & { club: Entity };

export interface TeammateOption {
  player: Player;
  isDeadEnd: boolean;
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

const reachabilityCache = new WeakMap<
  AffiliationGraph,
  Map<string, Set<string>>
>();

export function clearReachabilityCache(graph?: AffiliationGraph): void {
  if (graph) reachabilityCache.delete(graph);
}

function reachableFromTarget(
  graph: AffiliationGraph,
  targetPlayerId: string,
  exclude: { players: Set<string>; entities: Set<string> },
): Set<string> {
  const key = `${targetPlayerId}|${exclusionKey(exclude)}`;
  let byGraph = reachabilityCache.get(graph);
  if (!byGraph) {
    byGraph = new Map();
    reachabilityCache.set(graph, byGraph);
  }
  let reachable = byGraph.get(key);
  if (!reachable) {
    reachable = reachablePlayers(graph, targetPlayerId, { exclude });
    byGraph.set(key, reachable);
  }
  return reachable;
}

export function getEntityOptions(
  graph: AffiliationGraph,
  playerId: string,
  targetPlayerId: string,
  chain: readonly ChainNodeLike[],
): EntityOption[] {
  const exclude = exclusionsFromChain(chain);
  const reachable = reachableFromTarget(graph, targetPlayerId, exclude);
  return graph.getEntitiesForPlayer(playerId).map((entity) => {
    if (exclude.entities.has(entity.id)) {
      return { entity, isDeadEnd: true };
    }
    const viable = graph
      .getTeammates(playerId, entity.id)
      .some((mate) => reachable.has(mate.id));
    return { entity, isDeadEnd: !viable };
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
): TeammateOption[] {
  const exclude = exclusionsFromChain(chain);
  const reachable = reachableFromTarget(graph, targetPlayerId, exclude);
  return graph.getTeammates(viaPlayerId, entityId).map((player) => ({
    player,
    isDeadEnd: player.id !== targetPlayerId && !reachable.has(player.id),
  }));
}
