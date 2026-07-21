/**
 * Game state machine for Overlap.
 */

import type { AffiliationGraph } from "../lib/graph";
import type { PuzzlePair } from "../lib/pathfinding";

const LEVEL_STORAGE_KEY = "overlap.level";
const UNDOS_REMAINING_STORAGE_KEY = "overlap.undosRemaining";
const SESSION_STORAGE_KEY = "overlap.session";
const AT_MENU_STORAGE_KEY = "overlap.atMenu";

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
  /** Number of undos remaining for the current run. */
  undosRemaining: number;
  /** Number of entity hops in the shortest known path for the current puzzle. */
  shortestPathLength: number;
}

export type GameAction =
  | { type: "START_GAME"; pair: PuzzlePair }
  | { type: "EXPAND_PLAYER"; playerId: string }
  | { type: "SELECT_ENTITY"; entityId: string }
  | { type: "SELECT_PLAYER"; playerId: string }
  | { type: "UNDO" }
  | { type: "RESET" }
  | { type: "RESET_PROGRESS" }
  | { type: "RESTORE_SESSION"; state: GameState };

type StoredPlayingSession = {
  v: 1;
  kind: "playing";
  level: number;
  startPlayerId: string;
  targetPlayerId: string;
  chain: ChainNode[];
  expanded: ExpandedView | null;
  undosRemaining: number;
  shortestPathLength: number;
};

type StoredAdvanceSession = {
  v: 1;
  kind: "advance";
  undosRemaining: number;
};

type StoredSession = StoredPlayingSession | StoredAdvanceSession;

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

export function loadPersistedUndosRemaining(): number {
  try {
    const raw = localStorage.getItem(UNDOS_REMAINING_STORAGE_KEY);
    if (raw == null) return 3;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 3;
  } catch {
    return 3;
  }
}

export function persistUndosRemaining(value: number): void {
  try {
    localStorage.setItem(UNDOS_REMAINING_STORAGE_KEY, String(Math.max(0, Math.floor(value))));
  } catch {
    // Ignore quota / private-mode failures — in-memory value still works.
  }
}

export function persistAtMenu(atMenu: boolean): void {
  try {
    if (atMenu) {
      localStorage.setItem(AT_MENU_STORAGE_KEY, "1");
    } else {
      localStorage.removeItem(AT_MENU_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

export function loadPersistedAtMenu(): boolean {
  try {
    return localStorage.getItem(AT_MENU_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearGameSession(): void {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Persist in-progress play, or an "advance" marker after a win (so refresh
 * starts the next puzzle instead of restoring the win screen).
 */
export function persistGameSession(state: GameState): void {
  try {
    if (state.phase === "start") {
      // Don't delete — the session was saved during play, and navigating to the
      // Home screen should preserve it so the user can return to the same puzzle.
      return;
    }
    if (state.phase === "won") {
      const payload: StoredAdvanceSession = { v: 1, kind: "advance", undosRemaining: state.undosRemaining };
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));
      persistAtMenu(false);
      return;
    }
    if (!state.startPlayerId || !state.targetPlayerId) return;
    const payload: StoredPlayingSession = {
      v: 1,
      kind: "playing",
      level: state.level,
      startPlayerId: state.startPlayerId,
      targetPlayerId: state.targetPlayerId,
      chain: state.chain,
      expanded: state.expanded,
      undosRemaining: state.undosRemaining,
      shortestPathLength: state.shortestPathLength,
    };
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));
    persistAtMenu(false);
  } catch {
    // Ignore quota / private-mode failures.
  }
}

function isChainNode(value: unknown): value is ChainNode {
  if (!value || typeof value !== "object") return false;
  const node = value as ChainNode;
  return (
    (node.type === "player" || node.type === "entity") &&
    typeof node.id === "string" &&
    node.id.length > 0
  );
}

function isExpandedView(value: unknown): value is ExpandedView | null {
  if (value == null) return true;
  if (typeof value !== "object") return false;
  const view = value as ExpandedView;
  if (view.kind === "entities") {
    return typeof view.playerId === "string" && view.playerId.length > 0;
  }
  if (view.kind === "teammates") {
    return (
      typeof view.entityId === "string" &&
      view.entityId.length > 0 &&
      typeof view.viaPlayerId === "string" &&
      view.viaPlayerId.length > 0
    );
  }
  return false;
}

/** Validate a playing session against the loaded graph; null if unusable. */
export function validatePlayingSession(
  raw: unknown,
  graph: Pick<AffiliationGraph, "players" | "entities">,
): GameState | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Partial<StoredPlayingSession>;
  if (data.v !== 1 || data.kind !== "playing") return null;
  if (
    typeof data.level !== "number" ||
    !Number.isFinite(data.level) ||
    data.level < 1
  ) {
    return null;
  }
  if (
    typeof data.startPlayerId !== "string" ||
    typeof data.targetPlayerId !== "string" ||
    !graph.players.has(data.startPlayerId) ||
    !graph.players.has(data.targetPlayerId) ||
    data.startPlayerId === data.targetPlayerId
  ) {
    return null;
  }
  if (!Array.isArray(data.chain) || data.chain.length < 1) return null;
  if (!data.chain.every(isChainNode)) return null;
  if (!isExpandedView(data.expanded)) return null;

  for (let i = 0; i < data.chain.length; i++) {
    const node = data.chain[i];
    const expectType = i % 2 === 0 ? "player" : "entity";
    if (node.type !== expectType) return null;
    if (node.type === "player" && !graph.players.has(node.id)) return null;
    if (node.type === "entity" && !graph.entities.has(node.id)) return null;
  }

  if (data.chain[0].id !== data.startPlayerId) return null;

  // A finished chain (target reached) belongs to the win screen — not restorable play.
  const tail = data.chain[data.chain.length - 1];
  if (tail.type === "player" && tail.id === data.targetPlayerId) return null;

  const expanded = data.expanded ?? null;
  if (expanded?.kind === "entities") {
    if (currentPlayerId(data.chain) !== expanded.playerId) return null;
  } else if (expanded?.kind === "teammates") {
    if (tail.type !== "entity" || tail.id !== expanded.entityId) return null;
    if (!graph.entities.has(expanded.entityId)) return null;
    if (!graph.players.has(expanded.viaPlayerId)) return null;
  }

  return {
    phase: "playing",
    level: Math.floor(data.level),
    startPlayerId: data.startPlayerId,
    targetPlayerId: data.targetPlayerId,
    chain: data.chain,
    expanded,
    undosRemaining: data.undosRemaining ?? 3,
    shortestPathLength: data.shortestPathLength ?? 0,
  };
}

export function readStoredSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (raw == null) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed || typeof parsed !== "object" || parsed.v !== 1) return null;
    if (parsed.kind === "advance" || parsed.kind === "playing") return parsed;
    return null;
  } catch {
    return null;
  }
}

/**
 * Restore an in-progress puzzle, or (after a win refresh) start the next
 * level's puzzle. Falls back to the start screen on any failure.
 */
export function hydrateGameState(
  graph: Pick<AffiliationGraph, "players" | "entities">,
  nextPair: (level: number) => PuzzlePair,
): GameState {
  const level = loadPersistedLevel();
  const stored = readStoredSession();

  if (stored?.kind === "advance") {
    try {
      const pair = nextPair(level);
      const state: GameState = {
        phase: "playing",
        level,
        startPlayerId: pair.startPlayerId,
        targetPlayerId: pair.targetPlayerId,
        chain: [{ type: "player", id: pair.startPlayerId }],
        expanded: null,
        undosRemaining: stored.undosRemaining,
        shortestPathLength: pair.pathLength,
      };
      persistGameSession(state);
      return state;
    } catch {
      clearGameSession();
      return createInitialState();
    }
  }

  if (stored?.kind === "playing") {
    // If the player deliberately went Home before reloading, show StartScreen.
    // The "Continue" button can still restore the saved session on demand.
    if (loadPersistedAtMenu()) {
      return createInitialState();
    }
    const restored = validatePlayingSession(stored, graph);
    if (restored) {
      persistLevel(restored.level);
      return restored;
    }
    clearGameSession();
  }

  return createInitialState();
}

export function createInitialState(): GameState {
  return {
    phase: "start",
    level: loadPersistedLevel(),
    startPlayerId: null,
    targetPlayerId: null,
    chain: [],
    expanded: null,
    undosRemaining: loadPersistedUndosRemaining(),
    shortestPathLength: 0,
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
  undosRemaining: 3,
  shortestPathLength: 0,
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
        shortestPathLength: action.pair.pathLength,
        // undosRemaining carries over between puzzles — do not reset
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
        const playerHops = chain.filter((n) => n.type === "entity").length;
        const bonus = playerHops <= state.shortestPathLength ? 2 : 1;
        const undosRemaining = state.undosRemaining + bonus;
        persistUndosRemaining(undosRemaining);
        return {
          ...state,
          chain,
          phase: "won",
          expanded: null,
          level,
          undosRemaining,
        };
      }
      return {
        ...state,
        chain,
        expanded: { kind: "entities", playerId: action.playerId },
      };
    }

    case "UNDO": {
      if (state.phase !== "playing" || state.chain.length <= 1 || state.undosRemaining <= 0) return state;
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
      const undosRemaining = state.undosRemaining - 1;
      persistUndosRemaining(undosRemaining);
      return { ...state, chain, expanded, undosRemaining };
    }

    case "RESET":
      persistAtMenu(true);
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
      persistUndosRemaining(3);
      clearGameSession();
      persistAtMenu(false);
      return {
        ...state,
        phase: "start",
        level: 1,
        startPlayerId: null,
        targetPlayerId: null,
        chain: [],
        expanded: null,
        undosRemaining: 3,
      };
    }

    case "RESTORE_SESSION":
      return action.state;
  }
}
