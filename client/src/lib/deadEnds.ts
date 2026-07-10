/**
 * Dead-end detection for the ExpandPanel lists.
 *
 * An option is a dead end when picking it cannot lead to the target
 * anymore: paths are checked with the chain's already-used players and
 * clubs excluded, so trivial backtracking doesn't count as "a way out".
 *
 * Performance: exclusions DO matter (skipping them falsely marks leaf
 * players as reachable -- measured 10 false-alives on Messi/Barcelona),
 * so we still BFS with exclusions. The cost was rescanning tenures on
 * every BFS visit; that is gone now that TenureGraph precomputes an
 * adjacency list. Reachability results are also cached per
 * (target, exclusion fingerprint) so undo/re-open is free.
 */

import type { TenureGraph } from "./graph";
import { reachablePlayers } from "./pathfinding";
import type { Club, Player } from "./types";

/** Structurally matches the game state's ChainNode. */
export interface ChainNodeLike {
  type: "player" | "club";
  id: string;
}

export interface ClubOption {
  club: Club;
  isDeadEnd: boolean;
}

export interface TeammateOption {
  player: Player;
  isDeadEnd: boolean;
}

function exclusionsFromChain(chain: readonly ChainNodeLike[]): {
  players: Set<string>;
  clubs: Set<string>;
} {
  const players = new Set<string>();
  const clubs = new Set<string>();
  for (const node of chain) {
    (node.type === "player" ? players : clubs).add(node.id);
  }
  return { players, clubs };
}

function exclusionKey(exclude: { players: Set<string>; clubs: Set<string> }): string {
  return (
    [...exclude.players].sort().join(",") +
    "|" +
    [...exclude.clubs].sort().join(",")
  );
}

/** Cache keyed by graph instance, then `${targetId}|${exclusionKey}`. */
const reachabilityCache = new WeakMap<TenureGraph, Map<string, Set<string>>>();

/** Test helper: drop cached reachability for a graph (or all, if omitted). */
export function clearReachabilityCache(graph?: TenureGraph): void {
  if (graph) reachabilityCache.delete(graph);
  // WeakMap has no clear-all; per-graph clear is enough for tests.
}

function reachableFromTarget(
  graph: TenureGraph,
  targetPlayerId: string,
  exclude: { players: Set<string>; clubs: Set<string> },
  asOf?: Date,
): Set<string> {
  // asOf-pinned calls (tests) skip the cache -- adjacency fast path also
  // requires asOf === undefined.
  if (asOf !== undefined) {
    return reachablePlayers(graph, targetPlayerId, { asOf, exclude });
  }
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

/**
 * The clubs list for `playerId`, each flagged as dead end when no
 * teammate reachable through that club still has a path to the target.
 * Clubs already used in the chain are always dead ends.
 */
export function getClubOptions(
  graph: TenureGraph,
  playerId: string,
  targetPlayerId: string,
  chain: readonly ChainNodeLike[],
  asOf?: Date,
): ClubOption[] {
  const exclude = exclusionsFromChain(chain);
  const reachable = reachableFromTarget(graph, targetPlayerId, exclude, asOf);
  return graph.getClubsForPlayer(playerId).map((club) => {
    if (exclude.clubs.has(club.id)) {
      return { club, isDeadEnd: true };
    }
    const viable = graph
      .getTeammates(playerId, club.id, undefined, asOf)
      .some((mate) => reachable.has(mate.id));
    return { club, isDeadEnd: !viable };
  });
}

/**
 * The teammates list for `viaPlayerId` at `clubId`, each flagged as dead
 * end when they are not the target and have no remaining path to it.
 */
export function getTeammateOptions(
  graph: TenureGraph,
  viaPlayerId: string,
  clubId: string,
  targetPlayerId: string,
  chain: readonly ChainNodeLike[],
  asOf?: Date,
): TeammateOption[] {
  const exclude = exclusionsFromChain(chain);
  const reachable = reachableFromTarget(graph, targetPlayerId, exclude, asOf);
  return graph.getTeammates(viaPlayerId, clubId, undefined, asOf).map((player) => ({
    player,
    isDeadEnd: player.id !== targetPlayerId && !reachable.has(player.id),
  }));
}
