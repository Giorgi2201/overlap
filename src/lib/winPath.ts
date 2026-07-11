/**
 * Win-screen helpers: compare the player's chain to the true shortest path
 * under the same mixed overlap rule used in play.
 */

import type { ChainNode } from "../state/gameState";
import type { AffiliationGraph } from "./graph";
import { formatAffiliationYears } from "./overlap";
import {
  MAX_HOPS,
  findShortestPath,
  type PathStep,
} from "./pathfinding";

/** Chip shape for the win-screen path row (matches BreadcrumbChip). */
export interface PathRevealChip {
  key: string;
  label: string;
  kind: "club" | "national_team" | "player";
  years?: string | null;
}

/** Entity hops in the player's click chain (player–entity–player…). */
export function playerHopCount(chain: readonly ChainNode[]): number {
  return chain.filter((n) => n.type === "entity").length;
}

/** Entity hops in a PathStep[] from findShortestPath. */
export function pathHopCount(path: readonly PathStep[]): number {
  return Math.max(0, path.length - 1);
}

export type WinPathReveal =
  | { kind: "optimal"; hops: number }
  | {
      kind: "shorter_exists";
      playerHops: number;
      shortestHops: number;
      chips: PathRevealChip[];
    }
  | { kind: "none" };

/**
 * Build breadcrumb chips for a BFS path (player / entity / player…).
 * Club years use the outgoing player's affiliation at that entity.
 */
export function pathStepsToChips(
  graph: AffiliationGraph,
  path: readonly PathStep[],
): PathRevealChip[] {
  const chips: PathRevealChip[] = [];
  for (let i = 0; i < path.length; i++) {
    const step = path[i];
    const player = graph.players.get(step.playerId);
    chips.push({
      key: `sp-player-${step.playerId}-${i}`,
      label: player?.name ?? step.playerId,
      kind: "player",
    });
    if (step.entityId) {
      const entity = graph.entities.get(step.entityId);
      const kind =
        entity?.type === "national_team" ? "national_team" : "club";
      let years: string | null = null;
      if (kind === "club") {
        const aff = graph
          .getAffiliationsForPlayer(step.playerId)
          .find((a) => a.entityId === step.entityId);
        years = aff ? formatAffiliationYears(aff) : null;
      }
      chips.push({
        key: `sp-entity-${step.entityId}-${i}`,
        label: entity?.name ?? step.entityId,
        kind,
        years,
      });
    }
  }
  return chips;
}

/**
 * Compare the completed player chain to the shortest path under live rules.
 */
export function buildWinPathReveal(
  graph: AffiliationGraph,
  startPlayerId: string,
  targetPlayerId: string,
  chain: readonly ChainNode[],
  maxHops: number = MAX_HOPS,
): WinPathReveal {
  const playerHops = playerHopCount(chain);
  if (playerHops < 1) return { kind: "none" };

  const shortest = findShortestPath(
    startPlayerId,
    targetPlayerId,
    graph,
    maxHops,
  );
  if (!shortest) return { kind: "none" };

  const shortestHops = pathHopCount(shortest);
  if (playerHops <= shortestHops) {
    return { kind: "optimal", hops: playerHops };
  }

  return {
    kind: "shorter_exists",
    playerHops,
    shortestHops,
    chips: pathStepsToChips(graph, shortest),
  };
}
