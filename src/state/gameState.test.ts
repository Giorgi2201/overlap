import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadGraph } from "../lib/graph";
import { generateRandomPair } from "../lib/pathfinding";
import {
  clearGameSession,
  currentPlayerId,
  gameReducer,
  hydrateGameState,
  initialGameState,
  persistGameSession,
  persistLevel,
  validatePlayingSession,
  type GameState,
} from "./gameState";

const g = loadGraph();

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("gameReducer click flow with real data", () => {
  it("plays a generated puzzle to a win by following the solution path", () => {
    const pair = generateRandomPair(g, { random: mulberry32(1) });
    let state: GameState = gameReducer(initialGameState, {
      type: "START_GAME",
      pair,
    });

    expect(state.phase).toBe("playing");
    expect(state.chain).toEqual([{ type: "player", id: pair.startPlayerId }]);

    for (let i = 0; i < pair.path.length - 1; i++) {
      const { playerId, entityId } = pair.path[i];
      state = gameReducer(state, { type: "EXPAND_PLAYER", playerId });
      expect(state.expanded).toEqual({ kind: "entities", playerId });
      state = gameReducer(state, {
        type: "SELECT_ENTITY",
        entityId: entityId!,
      });
      expect(state.expanded).toEqual({
        kind: "teammates",
        entityId,
        viaPlayerId: playerId,
      });
      state = gameReducer(state, {
        type: "SELECT_PLAYER",
        playerId: pair.path[i + 1].playerId,
      });
    }

    expect(state.phase).toBe("won");
    expect(state.expanded).toBeNull();
    expect(currentPlayerId(state.chain)).toBe(pair.targetPlayerId);
    expect(state.chain.filter((n) => n.type === "entity")).toHaveLength(
      pair.pathLength,
    );
  });

  it("ignores expanding a player who is not the chain tail", () => {
    const pair = generateRandomPair(g, { random: mulberry32(2) });
    let state = gameReducer(initialGameState, { type: "START_GAME", pair });
    state = gameReducer(state, {
      type: "EXPAND_PLAYER",
      playerId: pair.targetPlayerId,
    });
    expect(state.expanded).toBeNull();
  });

  it("resets to the start screen on RESET without clearing level", () => {
    const pair = generateRandomPair(g, { random: mulberry32(3) });
    let state = gameReducer(
      { ...initialGameState, level: 4 },
      { type: "START_GAME", pair },
    );
    state = gameReducer(state, { type: "RESET" });
    expect(state.phase).toBe("start");
    expect(state.level).toBe(4);
    expect(state.chain).toEqual([]);
    expect(state.startPlayerId).toBeNull();
  });

  it("increments level on win and RESET_PROGRESS restores level 1", () => {
    const pair = generateRandomPair(g, { random: mulberry32(8), level: 1 });
    let state: GameState = gameReducer(
      { ...initialGameState, level: 2 },
      { type: "START_GAME", pair },
    );

    for (let i = 0; i < pair.path.length - 1; i++) {
      const { playerId, entityId } = pair.path[i];
      state = gameReducer(state, { type: "EXPAND_PLAYER", playerId });
      state = gameReducer(state, {
        type: "SELECT_ENTITY",
        entityId: entityId!,
      });
      state = gameReducer(state, {
        type: "SELECT_PLAYER",
        playerId: pair.path[i + 1].playerId,
      });
    }

    expect(state.phase).toBe("won");
    expect(state.level).toBe(3);

    state = gameReducer(state, { type: "RESET_PROGRESS" });
    expect(state.phase).toBe("start");
    expect(state.level).toBe(1);
  });

  it("Next level starts a new puzzle at the incremented level without going to start", () => {
    const first = generateRandomPair(g, { random: mulberry32(21), level: 2 });
    let state: GameState = gameReducer(
      { ...initialGameState, level: 2 },
      { type: "START_GAME", pair: first },
    );

    for (let i = 0; i < first.path.length - 1; i++) {
      const { playerId, entityId } = first.path[i];
      state = gameReducer(state, { type: "EXPAND_PLAYER", playerId });
      state = gameReducer(state, {
        type: "SELECT_ENTITY",
        entityId: entityId!,
      });
      state = gameReducer(state, {
        type: "SELECT_PLAYER",
        playerId: first.path[i + 1].playerId,
      });
    }

    expect(state.phase).toBe("won");
    expect(state.level).toBe(3);
    const wonStart = state.startPlayerId;
    const wonTarget = state.targetPlayerId;

    // App's onNextLevel: generate at current (already incremented) level + START_GAME.
    const next = generateRandomPair(g, { random: mulberry32(22), level: state.level });
    state = gameReducer(state, { type: "START_GAME", pair: next });

    expect(state.phase).toBe("playing");
    expect(state.level).toBe(3);
    expect(state.startPlayerId).toBe(next.startPlayerId);
    expect(state.targetPlayerId).toBe(next.targetPlayerId);
    expect(state.chain).toEqual([{ type: "player", id: next.startPlayerId }]);
    expect(state.expanded).toBeNull();
    // Genuinely a new puzzle (seeded differently from the won one).
    expect(
      state.startPlayerId !== wonStart || state.targetPlayerId !== wonTarget,
    ).toBe(true);
  });
});

describe("gameReducer UNDO", () => {
  it("is a no-op when only the start player remains", () => {
    const pair = generateRandomPair(g, { random: mulberry32(4) });
    let state = gameReducer(initialGameState, { type: "START_GAME", pair });
    const before = state;
    state = gameReducer(state, { type: "UNDO" });
    expect(state).toEqual(before);
  });

  it("undoing an entity restores that player's entities list", () => {
    const pair = generateRandomPair(g, { random: mulberry32(5) });
    let state = gameReducer(initialGameState, { type: "START_GAME", pair });
    const entityId = pair.path[0].entityId!;
    state = gameReducer(state, {
      type: "EXPAND_PLAYER",
      playerId: pair.startPlayerId,
    });
    state = gameReducer(state, { type: "SELECT_ENTITY", entityId });
    state = gameReducer(state, { type: "UNDO" });
    expect(state.chain).toEqual([{ type: "player", id: pair.startPlayerId }]);
    expect(state.expanded).toEqual({
      kind: "entities",
      playerId: pair.startPlayerId,
    });
  });

  it("undoing a player restores the previous entity's teammates list", () => {
    const pair = generateRandomPair(g, { random: mulberry32(6) });
    let state = gameReducer(initialGameState, { type: "START_GAME", pair });
    const entityId = pair.path[0].entityId!;
    const midPlayerId = pair.path[1].playerId;
    state = gameReducer(state, {
      type: "EXPAND_PLAYER",
      playerId: pair.startPlayerId,
    });
    state = gameReducer(state, { type: "SELECT_ENTITY", entityId });
    state = gameReducer(state, { type: "SELECT_PLAYER", playerId: midPlayerId });
    state = gameReducer(state, { type: "UNDO" });
    expect(state.chain).toEqual([
      { type: "player", id: pair.startPlayerId },
      { type: "entity", id: entityId },
    ]);
    expect(state.expanded).toEqual({
      kind: "teammates",
      entityId,
      viaPlayerId: pair.startPlayerId,
    });
  });

  it("multi-step undo walks back to the start player", () => {
    const pair = generateRandomPair(g, { random: mulberry32(7) });
    let state = gameReducer(initialGameState, { type: "START_GAME", pair });
    const entityId = pair.path[0].entityId!;
    const midPlayerId = pair.path[1].playerId;
    state = gameReducer(state, {
      type: "EXPAND_PLAYER",
      playerId: pair.startPlayerId,
    });
    state = gameReducer(state, { type: "SELECT_ENTITY", entityId });
    state = gameReducer(state, { type: "SELECT_PLAYER", playerId: midPlayerId });

    state = gameReducer(state, { type: "UNDO" });
    expect(currentPlayerId(state.chain)).toBe(pair.startPlayerId);
    expect(state.expanded?.kind).toBe("teammates");

    state = gameReducer(state, { type: "UNDO" });
    expect(state.chain).toEqual([{ type: "player", id: pair.startPlayerId }]);
    expect(state.expanded).toEqual({
      kind: "entities",
      playerId: pair.startPlayerId,
    });

    state = gameReducer(state, { type: "UNDO" });
    expect(state.chain).toEqual([{ type: "player", id: pair.startPlayerId }]);
  });
});

describe("session persistence", () => {
  const memory = new Map<string, string>();

  beforeEach(() => {
    memory.clear();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => memory.get(key) ?? null,
        setItem: (key: string, value: string) => {
          memory.set(key, String(value));
        },
        removeItem: (key: string) => {
          memory.delete(key);
        },
        clear: () => memory.clear(),
      },
    });
    persistLevel(1);
  });

  afterEach(() => {
    memory.clear();
  });

  it("restores a mid-chain playing session on hydrate", () => {
    const pair = generateRandomPair(g, { random: mulberry32(31), level: 2 });
    let state: GameState = gameReducer(
      { ...initialGameState, level: 2 },
      { type: "START_GAME", pair },
    );
    const entityId = pair.path[0].entityId!;
    const midPlayerId = pair.path[1].playerId;
    state = gameReducer(state, {
      type: "EXPAND_PLAYER",
      playerId: pair.startPlayerId,
    });
    state = gameReducer(state, { type: "SELECT_ENTITY", entityId });
    state = gameReducer(state, {
      type: "SELECT_PLAYER",
      playerId: midPlayerId,
    });
    expect(state.phase).toBe("playing");
    persistGameSession(state);

    const restored = hydrateGameState(g, () => {
      throw new Error("should not generate a new pair when restoring play");
    });
    expect(restored.phase).toBe("playing");
    expect(restored.level).toBe(2);
    expect(restored.startPlayerId).toBe(pair.startPlayerId);
    expect(restored.targetPlayerId).toBe(pair.targetPlayerId);
    expect(restored.chain).toEqual(state.chain);
    expect(restored.expanded).toEqual(state.expanded);
  });

  it("after a win refresh, starts a fresh puzzle at the incremented level", () => {
    const pair = generateRandomPair(g, { random: mulberry32(32), level: 1 });
    let state: GameState = gameReducer(
      { ...initialGameState, level: 1 },
      { type: "START_GAME", pair },
    );
    for (let i = 0; i < pair.path.length - 1; i++) {
      const { playerId, entityId } = pair.path[i];
      state = gameReducer(state, { type: "EXPAND_PLAYER", playerId });
      state = gameReducer(state, {
        type: "SELECT_ENTITY",
        entityId: entityId!,
      });
      state = gameReducer(state, {
        type: "SELECT_PLAYER",
        playerId: pair.path[i + 1].playerId,
      });
    }
    expect(state.phase).toBe("won");
    expect(state.level).toBe(2);
    persistGameSession(state);

    const next = generateRandomPair(g, { random: mulberry32(33), level: 2 });
    let generatedLevel: number | null = null;
    const hydrated = hydrateGameState(g, (level) => {
      generatedLevel = level;
      return next;
    });

    expect(generatedLevel).toBe(2);
    expect(hydrated.phase).toBe("playing");
    expect(hydrated.level).toBe(2);
    expect(hydrated.startPlayerId).toBe(next.startPlayerId);
    expect(hydrated.targetPlayerId).toBe(next.targetPlayerId);
    expect(hydrated.chain).toEqual([
      { type: "player", id: next.startPlayerId },
    ]);
    expect(hydrated.expanded).toBeNull();
  });

  it("falls back to start when session references unknown players", () => {
    persistGameSession({
      phase: "playing",
      level: 3,
      startPlayerId: "missing-a",
      targetPlayerId: "missing-b",
      chain: [{ type: "player", id: "missing-a" }],
      expanded: null,
    });
    const hydrated = hydrateGameState(g, () => {
      throw new Error("should not generate");
    });
    expect(hydrated.phase).toBe("start");
    expect(hydrated.startPlayerId).toBeNull();
  });

  it("rejects a finished (won) chain disguised as playing", () => {
    const pair = generateRandomPair(g, { random: mulberry32(34), level: 1 });
    const bogus = {
      v: 1 as const,
      kind: "playing" as const,
      level: 1,
      startPlayerId: pair.startPlayerId,
      targetPlayerId: pair.targetPlayerId,
      chain: [
        { type: "player" as const, id: pair.startPlayerId },
        { type: "entity" as const, id: pair.path[0].entityId! },
        { type: "player" as const, id: pair.targetPlayerId },
      ],
      expanded: null,
    };
    expect(validatePlayingSession(bogus, g)).toBeNull();
  });

  it("RESET_PROGRESS clears the session", () => {
    const pair = generateRandomPair(g, { random: mulberry32(35), level: 2 });
    let state = gameReducer(
      { ...initialGameState, level: 2 },
      { type: "START_GAME", pair },
    );
    persistGameSession(state);
    state = gameReducer(state, { type: "RESET_PROGRESS" });
    expect(state.phase).toBe("start");
    expect(state.level).toBe(1);
    const hydrated = hydrateGameState(g, () => {
      throw new Error("should not generate");
    });
    expect(hydrated.phase).toBe("start");
  });

  it("clearGameSession leaves hydrate on the start screen", () => {
    clearGameSession();
    const hydrated = hydrateGameState(g, () => {
      throw new Error("should not generate");
    });
    expect(hydrated.phase).toBe("start");
  });
});
