/**
 * Game state machine for Overlap.
 */

import type { PuzzlePair } from "../lib/pathfinding";

const LEVEL_STORAGE_KEY = "overlap.level";

/** One node of the chain the user is building, in click order. */
export interface ChainNode {
  type: "player" | "entity";
  id: string;
}

/** What the expand panel is currently listing. */
export type ExpandedView =
  | { kind: "entities"; playerId: string }
  | { kind: "teammates"; entityId: string; viaPlayerId: string };

export type GamePhase = "start" | "playing" | "won";

export interface GameState {
  phase: GamePhase;
  /** Progressive difficulty level (1+). Persisted in localStorage. */
  level: number;
  startPlayerId: string | null;
  targetPlayerId: string | null;
  chain: ChainNode[];
  expanded: ExpandedView | null;
}

export type GameAction =
  | { type: "START_GAME"; pair: PuzzlePair }
  | { type: "EXPAND_PLAYER"; playerId: string }
  | { type: "SELECT_ENTITY"; entityId: string }
  | { type: "SELECT_PLAYER"; playerId: string }
  | { type: "UNDO" }
  | { type: "RESET" }
  | { type: "RESET_PROGRESS" };

export function loadPersistedLevel(): number {
  try {
    const raw = localStorage.getItem(LEVEL_STORAGE_KEY);
    if (raw == null) return 1;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n >= 1 ? n : 1;
  } catch {
    return 1;
  }
}

export function persistLevel(level: number): void {
  try {
    localStorage.setItem(LEVEL_STORAGE_KEY, String(Math.max(1, Math.floor(level))));
  } catch {
    // Ignore quota / private-mode failures — in-memory level still works.
  }
}

export function createInitialState(): GameState {
  return {
    phase: "start",
    level: loadPersistedLevel(),
    startPlayerId: null,
    targetPlayerId: null,
    chain: [],
    expanded: null,
  };
}

/** @deprecated Prefer createInitialState() so level is loaded from storage. */
export const initialGameState: GameState = {
  phase: "start",
  level: 1,
  startPlayerId: null,
  targetPlayerId: null,
  chain: [],
  expanded: null,
};

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
        ...state,
        phase: "playing",
        startPlayerId: action.pair.startPlayerId,
        targetPlayerId: action.pair.targetPlayerId,
        chain: [{ type: "player", id: action.pair.startPlayerId }],
        expanded: null,
      };

    case "EXPAND_PLAYER": {
      if (state.phase !== "playing") return state;
      if (action.playerId !== currentPlayerId(state.chain)) return state;
      return {
        ...state,
        expanded: { kind: "entities", playerId: action.playerId },
      };
    }

    case "SELECT_ENTITY": {
      if (state.phase !== "playing" || state.expanded?.kind !== "entities") {
        return state;
      }
      const viaPlayerId = state.expanded.playerId;
      return {
        ...state,
        chain: [...state.chain, { type: "entity", id: action.entityId }],
        expanded: {
          kind: "teammates",
          entityId: action.entityId,
          viaPlayerId,
        },
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
        const level = state.level + 1;
        persistLevel(level);
        return { ...state, chain, phase: "won", expanded: null, level };
      }
      return {
        ...state,
        chain,
        expanded: { kind: "entities", playerId: action.playerId },
      };
    }

    case "UNDO": {
      if (state.phase !== "playing" || state.chain.length <= 1) return state;
      const removed = state.chain[state.chain.length - 1];
      const chain = state.chain.slice(0, -1);
      const tail = chain[chain.length - 1];
      const expanded: ExpandedView =
        removed.type === "entity"
          ? { kind: "entities", playerId: tail.id }
          : {
              kind: "teammates",
              entityId: tail.id,
              viaPlayerId: chain[chain.length - 2].id,
            };
      return { ...state, chain, expanded };
    }

    case "RESET":
      return {
        ...state,
        phase: "start",
        startPlayerId: null,
        targetPlayerId: null,
        chain: [],
        expanded: null,
      };

    case "RESET_PROGRESS": {
      persistLevel(1);
      return {
        ...state,
        phase: "start",
        level: 1,
        startPlayerId: null,
        targetPlayerId: null,
        chain: [],
        expanded: null,
      };
    }
  }
}
