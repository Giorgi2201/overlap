/**
 * Game state machine for Overlap.
 *
 * Managed with useReducer: every click atomically updates several pieces
 * of state at once (chain, expanded panel, win phase), and a reducer keeps
 * those transitions consistent and unit-testable in one place. Context is
 * deliberately not used -- the component tree is two levels deep, so props
 * are simpler.
 */

import type { PuzzlePair } from "../lib/pathfinding";

/** One node of the chain the user is building, in click order. */
export interface ChainNode {
  type: "player" | "club";
  id: string;
}

/** What the ExpandPanel is currently listing. */
export type ExpandedView =
  | { kind: "clubs"; playerId: string }
  | { kind: "teammates"; clubId: string; viaPlayerId: string };

export type GamePhase = "start" | "playing" | "won";

export interface GameState {
  phase: GamePhase;
  startPlayerId: string | null;
  targetPlayerId: string | null;
  /** Ordered player/club nodes clicked so far; starts as [startPlayer]. */
  chain: ChainNode[];
  expanded: ExpandedView | null;
}

export type GameAction =
  | { type: "START_GAME"; pair: PuzzlePair }
  /** Clicking the start-player card to open their clubs list. */
  | { type: "EXPAND_PLAYER"; playerId: string }
  /** Clicking a club in the panel: adds it to the chain, shows teammates. */
  | { type: "SELECT_CLUB"; clubId: string }
  /** Clicking a teammate in the panel: adds them to the chain. */
  | { type: "SELECT_PLAYER"; playerId: string }
  /** Removes the last chain node and restores the matching panel view. */
  | { type: "UNDO" }
  | { type: "RESET" };

export const initialGameState: GameState = {
  phase: "start",
  startPlayerId: null,
  targetPlayerId: null,
  chain: [],
  expanded: null,
};

/** The player the chain currently ends on (last player node). */
export function currentPlayerId(chain: ChainNode[]): string | null {
  for (let i = chain.length - 1; i >= 0; i--) {
    if (chain[i].type === "player") return chain[i].id;
  }
  return null;
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "START_GAME":
      return {
        phase: "playing",
        startPlayerId: action.pair.startPlayerId,
        targetPlayerId: action.pair.targetPlayerId,
        chain: [{ type: "player", id: action.pair.startPlayerId }],
        expanded: null,
      };

    case "EXPAND_PLAYER": {
      // Only the player the chain currently ends on can be expanded;
      // expanding an earlier player would let the next club click append
      // a link that isn't connected to the chain tail.
      if (state.phase !== "playing") return state;
      if (action.playerId !== currentPlayerId(state.chain)) return state;
      return { ...state, expanded: { kind: "clubs", playerId: action.playerId } };
    }

    case "SELECT_CLUB": {
      if (state.phase !== "playing" || state.expanded?.kind !== "clubs") {
        return state;
      }
      const viaPlayerId = state.expanded.playerId;
      return {
        ...state,
        chain: [...state.chain, { type: "club", id: action.clubId }],
        expanded: { kind: "teammates", clubId: action.clubId, viaPlayerId },
      };
    }

    case "SELECT_PLAYER": {
      if (state.phase !== "playing" || state.expanded?.kind !== "teammates") {
        return state;
      }
      const chain: ChainNode[] = [
        ...state.chain,
        { type: "player", id: action.playerId },
      ];
      if (action.playerId === state.targetPlayerId) {
        return { ...state, chain, phase: "won", expanded: null };
      }
      // Immediately show the new player's clubs so the flow keeps moving.
      return {
        ...state,
        chain,
        expanded: { kind: "clubs", playerId: action.playerId },
      };
    }

    case "UNDO": {
      if (state.phase !== "playing" || state.chain.length <= 1) return state;
      const removed = state.chain[state.chain.length - 1];
      const chain = state.chain.slice(0, -1);
      const tail = chain[chain.length - 1];
      // Chain strictly alternates player/club starting with a player, so:
      // undoing a club lands on a player (show their clubs again); undoing
      // a player lands on a club (show its teammates via the player before it).
      const expanded: ExpandedView =
        removed.type === "club"
          ? { kind: "clubs", playerId: tail.id }
          : {
              kind: "teammates",
              clubId: tail.id,
              viaPlayerId: chain[chain.length - 2].id,
            };
      return { ...state, chain, expanded };
    }

    case "RESET":
      return initialGameState;
  }
}
