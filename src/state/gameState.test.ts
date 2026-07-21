import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadGraph } from "../lib/graph";
import { generateRandomPair } from "../lib/pathfinding";
import {
  clearGameSession,
  createInitialState,
  currentPlayerId,
  gameReducer,
  hydrateGameState,
  initialGameState,
  loadPersistedAtMenu,
  loadPersistedUndosRemaining,
  persistAtMenu,
  persistGameSession,
  persistLevel,
  persistUndosRemaining,
  readStoredSession,
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

describe("gameReducer undosRemaining", () => {
  it("starts with undosRemaining = 3 on a fresh run", () => {
    // Via createInitialState
    expect(createInitialState().undosRemaining).toBe(3);
    // Via initialGameState
    expect(initialGameState.undosRemaining).toBe(3);
    // After starting a game
    const pair = generateRandomPair(g, { random: mulberry32(40) });
    const state = gameReducer(initialGameState, { type: "START_GAME", pair });
    expect(state.undosRemaining).toBe(3);
  });

  it("UNDO decreases undosRemaining by 1", () => {
    const pair = generateRandomPair(g, { random: mulberry32(41) });
    let state = gameReducer(initialGameState, { type: "START_GAME", pair });
    const entityId = pair.path[0].entityId!;
    state = gameReducer(state, {
      type: "EXPAND_PLAYER",
      playerId: pair.startPlayerId,
    });
    state = gameReducer(state, { type: "SELECT_ENTITY", entityId });
    expect(state.undosRemaining).toBe(3);

    state = gameReducer(state, { type: "UNDO" });
    expect(state.undosRemaining).toBe(2);
    expect(state.chain).toEqual([{ type: "player", id: pair.startPlayerId }]);
  });

  it("UNDO is a no-op when undosRemaining is 0", () => {
    const pair = generateRandomPair(g, { random: mulberry32(42) });
    const entityId = pair.path[0].entityId!;
    // Start with 0 undosRemaining
    let state = gameReducer(
      { ...initialGameState, undosRemaining: 0 },
      { type: "START_GAME", pair },
    );
    state = gameReducer(state, {
      type: "EXPAND_PLAYER",
      playerId: pair.startPlayerId,
    });
    state = gameReducer(state, { type: "SELECT_ENTITY", entityId });
    const before = state;

    state = gameReducer(state, { type: "UNDO" });
    expect(state).toEqual(before);
    expect(state.undosRemaining).toBe(0);
  });

  it("winning with an optimal solve adds 2 to undosRemaining", () => {
    const pair = generateRandomPair(g, { random: mulberry32(43), level: 1 });
    let state = gameReducer(
      { ...initialGameState, undosRemaining: 1 },
      { type: "START_GAME", pair },
    );
    // Play the optimal (shortest) path
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
    // Optimal solve: +2 to undosRemaining (started at 1, now should be 3)
    expect(state.undosRemaining).toBe(3);
  });

  it("winning with a non-optimal solve adds 1 to undosRemaining", () => {
    // Build a state manually so shortestPathLength is shorter than the player's chain.
    const pair = generateRandomPair(g, { random: mulberry32(44), level: 1 });
    const lastIdx = pair.path.length - 1;
    const secondLast = pair.path[lastIdx - 1];
    const entityId = secondLast.entityId!;
    // Chain: startPlayer → entity0 → player1 → ... → secondLastPlayer → secondLastEntity
    const chain: import("./gameState").ChainNode[] = [];
    for (const step of pair.path.slice(0, lastIdx)) {
      chain.push({ type: "player", id: step.playerId });
      if (step.entityId) chain.push({ type: "entity", id: step.entityId });
    }
    chain.push({ type: "player", id: secondLast.playerId });
    chain.push({ type: "entity", id: entityId });

    const preWinState: GameState = {
      phase: "playing",
      level: 1,
      startPlayerId: pair.startPlayerId,
      targetPlayerId: pair.targetPlayerId,
      chain,
      expanded: {
        kind: "teammates",
        entityId,
        viaPlayerId: secondLast.playerId,
      },
      undosRemaining: 1,
      shortestPathLength: 0, // shorter than the actual path, making this non-optimal
    };

    const state = gameReducer(preWinState, {
      type: "SELECT_PLAYER",
      playerId: pair.targetPlayerId,
    });
    expect(state.phase).toBe("won");
    // Non-optimal: playerHops === pair.pathLength > 0 (shortestPathLength)
    // bonus = 1, so undosRemaining = 1 + 1 = 2
    expect(state.undosRemaining).toBe(2);
  });

  it("starting a new puzzle (START_GAME) does NOT reset undosRemaining", () => {
    const first = generateRandomPair(g, { random: mulberry32(45) });
    let state = gameReducer(
      { ...initialGameState, undosRemaining: 5 },
      { type: "START_GAME", pair: first },
    );
    expect(state.undosRemaining).toBe(5);

    // Start another puzzle (simulating "Next level" or "New puzzle")
    const second = generateRandomPair(g, { random: mulberry32(46) });
    state = gameReducer(state, { type: "START_GAME", pair: second });
    expect(state.undosRemaining).toBe(5);
  });

  it("exhausting undosRemaining to 0 then UNDO does nothing", () => {
    const pair = generateRandomPair(g, { random: mulberry32(47) });
    const entityId = pair.path[0].entityId!;
    // Start with exactly 1 undo remaining
    let state = gameReducer(
      { ...initialGameState, undosRemaining: 1 },
      { type: "START_GAME", pair },
    );
    state = gameReducer(state, {
      type: "EXPAND_PLAYER",
      playerId: pair.startPlayerId,
    });
    state = gameReducer(state, { type: "SELECT_ENTITY", entityId });
    expect(state.undosRemaining).toBe(1);

    // Use the last undo
    state = gameReducer(state, { type: "UNDO" });
    expect(state.undosRemaining).toBe(0);
    expect(state.chain).toEqual([{ type: "player", id: pair.startPlayerId }]);

    // Followed by a move & another UNDO attempt — no-op
    state = gameReducer(state, { type: "SELECT_ENTITY", entityId });
    const before = state;
    state = gameReducer(state, { type: "UNDO" });
    expect(state).toEqual(before);
    expect(state.undosRemaining).toBe(0);
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

  it("RESET does NOT clear the stored playing session (session survives for Continue)", () => {
    const pair = generateRandomPair(g, { random: mulberry32(36), level: 2 });
    let state = gameReducer(
      { ...initialGameState, level: 2 },
      { type: "START_GAME", pair },
    );
    // Make some progress in the puzzle
    const entityId = pair.path[0].entityId!;
    state = gameReducer(state, {
      type: "EXPAND_PLAYER",
      playerId: pair.startPlayerId,
    });
    state = gameReducer(state, { type: "SELECT_ENTITY", entityId });
    const savedChain = state.chain;
    // Save the playing session (simulating what the useEffect does during play)
    persistGameSession(state);
    expect(memory.get("overlap.session")).toBeTruthy();

    // Navigate Home (RESET)
    state = gameReducer(state, { type: "RESET" });
    expect(state.phase).toBe("start");
    // The session should still be in localStorage for the Continue button
    expect(memory.get("overlap.session")).toBeTruthy();
    // atMenu flag is set
    expect(loadPersistedAtMenu()).toBe(true);

    // hydrateGameState now respects the atMenu flag: shows StartScreen, not auto-restore
    const hydrated = hydrateGameState(g, () => {
      throw new Error("should not generate a new pair");
    });
    expect(hydrated.phase).toBe("start");

    // But the session IS restorable via the Continue path (not auto-restore)
    const stored = readStoredSession();
    const restored = validatePlayingSession(stored, g);
    expect(restored).not.toBeNull();
    expect(restored!.chain).toEqual(savedChain);
  });

  it("START_GAME after RESET overwrites the saved session with a new puzzle", () => {
    const first = generateRandomPair(g, { random: mulberry32(37), level: 2 });
    let state = gameReducer(
      { ...initialGameState, level: 2 },
      { type: "START_GAME", pair: first },
    );
    persistGameSession(state);
    // Navigate Home
    state = gameReducer(state, { type: "RESET" });
    // Click "New puzzle"
    const second = generateRandomPair(g, { random: mulberry32(38), level: 2 });
    state = gameReducer(state, { type: "START_GAME", pair: second });
    // Should be a new puzzle
    expect(state.startPlayerId).toBe(second.startPlayerId);
    expect(state.targetPlayerId).toBe(second.targetPlayerId);
    expect(state.chain).toEqual([
      { type: "player", id: second.startPlayerId },
    ]);
  });

  it("simulates the in-app Continue flow — restores puzzle without page refresh", () => {
    // This test directly exercises the readStoredSession → validatePlayingSession →
    // RESTORE_SESSION dispatch path that the "Continue" button uses, with zero
    // calls to hydrateGameState (i.e. no page refresh involved).
    const pair = generateRandomPair(g, { random: mulberry32(50), level: 2 });
    let state = gameReducer(
      { ...initialGameState, level: 2 },
      { type: "START_GAME", pair },
    );
    // Make a couple of moves
    const entityId = pair.path[0].entityId!;
    state = gameReducer(state, {
      type: "EXPAND_PLAYER",
      playerId: pair.startPlayerId,
    });
    state = gameReducer(state, { type: "SELECT_ENTITY", entityId });
    const midPlayerId = pair.path[1].playerId;
    state = gameReducer(state, { type: "SELECT_PLAYER", playerId: midPlayerId });
    // Save to localStorage (as useEffect does during play)
    persistGameSession(state);
    const savedChain = state.chain;
    const savedExpanded = state.expanded;

    // Navigate Home (RESET) — clears in-memory state
    state = gameReducer(state, { type: "RESET" });
    expect(state.phase).toBe("start");
    expect(state.chain).toEqual([]);

    // === This is the "Continue" button logic, no hydrateGameState ===
    const stored = readStoredSession();
    expect(stored).not.toBeNull();
    expect(stored!.kind).toBe("playing");
    const restored = validatePlayingSession(stored, g);
    expect(restored).not.toBeNull();
    state = gameReducer(state, { type: "RESTORE_SESSION", state: restored! });
    // === End of Continue logic ===

    // Verify the SAME puzzle and SAME progress is back, without a page refresh
    expect(state.phase).toBe("playing");
    expect(state.startPlayerId).toBe(pair.startPlayerId);
    expect(state.targetPlayerId).toBe(pair.targetPlayerId);
    expect(state.chain).toEqual(savedChain);
    expect(state.expanded).toEqual(savedExpanded);
  });

  it("Continue flow with no saved session still generates a fresh puzzle", () => {
    // No session saved — the Continue button should fall through to START_GAME
    const pair = generateRandomPair(g, { random: mulberry32(51), level: 2 });
    const state = gameReducer(initialGameState, { type: "START_GAME", pair });
    expect(state.startPlayerId).toBe(pair.startPlayerId);
    expect(state.targetPlayerId).toBe(pair.targetPlayerId);
    expect(state.chain).toEqual([
      { type: "player", id: pair.startPlayerId },
    ]);
  });

  describe("atMenu flag (overcorrection fix)", () => {
    it("Scenario 6: Home + refresh shows StartScreen, does NOT auto-restore", () => {
      // Play puzzle, go Home, then refresh — hydrateGameState should return start screen
      const pair = generateRandomPair(g, { random: mulberry32(60), level: 2 });
      let state = gameReducer(
        { ...initialGameState, level: 2 },
        { type: "START_GAME", pair },
      );
      state = gameReducer(state, {
        type: "EXPAND_PLAYER",
        playerId: pair.startPlayerId,
      });
      // Save playing session (simulating useEffect during play)
      persistGameSession(state);
      expect(loadPersistedAtMenu()).toBe(false);

      // Navigate Home — this sets atMenu = true
      state = gameReducer(state, { type: "RESET" });
      expect(loadPersistedAtMenu()).toBe(true);

      // Refresh (simulated by hydrateGameState) — should show StartScreen, not restore
      const hydrated = hydrateGameState(g, () => {
        throw new Error("should not generate");
      });
      expect(hydrated.phase).toBe("start");
      expect(hydrated.startPlayerId).toBeNull();

      // But the saved session is still in localStorage for the Continue button
      const stored = readStoredSession();
      expect(stored).not.toBeNull();
      expect(stored!.kind).toBe("playing");
    });

    it("Scenario 7: Refresh mid-puzzle (no Home) auto-restores gameplay", () => {
      // Play puzzle, DO NOT go Home, refresh — hydrateGameState auto-restores
      const pair = generateRandomPair(g, { random: mulberry32(61), level: 2 });
      let state = gameReducer(
        { ...initialGameState, level: 2 },
        { type: "START_GAME", pair },
      );
      state = gameReducer(state, {
        type: "EXPAND_PLAYER",
        playerId: pair.startPlayerId,
      });
      persistGameSession(state);
      expect(loadPersistedAtMenu()).toBe(false);

      // Refresh (simulated by hydrateGameState) — should auto-restore
      const hydrated = hydrateGameState(g, () => {
        throw new Error("should not generate");
      });
      expect(hydrated.phase).toBe("playing");
      expect(hydrated.startPlayerId).toBe(pair.startPlayerId);
      expect(hydrated.chain).toEqual(state.chain);
    });

    it("Scenario 8: Home + Continue (no refresh) still restores puzzle", () => {
      // Play puzzle, go Home, click Continue — RESTORE_SESSION path still works
      const pair = generateRandomPair(g, { random: mulberry32(62), level: 2 });
      let state = gameReducer(
        { ...initialGameState, level: 2 },
        { type: "START_GAME", pair },
      );
      state = gameReducer(state, {
        type: "EXPAND_PLAYER",
        playerId: pair.startPlayerId,
      });
      persistGameSession(state);
      const savedChain = state.chain;

      // Navigate Home
      state = gameReducer(state, { type: "RESET" });
      expect(loadPersistedAtMenu()).toBe(true);

      // Click Continue — uses readStoredSession + validatePlayingSession + RESTORE_SESSION
      const stored = readStoredSession();
      expect(stored).not.toBeNull();
      expect(stored!.kind).toBe("playing");
      const restored = validatePlayingSession(stored, g);
      expect(restored).not.toBeNull();
      state = gameReducer(state, { type: "RESTORE_SESSION", state: restored! });
      // The real app's useEffect fires after RESTORE_SESSION, calling persistGameSession
      // which sets atMenu=false via the playing-session persistence path
      persistGameSession(state);

      expect(state.phase).toBe("playing");
      expect(state.chain).toEqual(savedChain);
      // After Continue (and the effect), atMenu should be false again
      expect(loadPersistedAtMenu()).toBe(false);
    });

    it("Scenario 9: Reset progress lands on StartScreen with no Continue option", () => {
      // Set up a playing session
      const pair = generateRandomPair(g, { random: mulberry32(63), level: 3 });
      let state = gameReducer(
        { ...initialGameState, level: 3 },
        { type: "START_GAME", pair },
      );
      persistGameSession(state);

      // Reset progress
      state = gameReducer(state, { type: "RESET_PROGRESS" });
      expect(state.phase).toBe("start");
      expect(state.level).toBe(1);

      // Session is cleared
      expect(readStoredSession()).toBeNull();
      // atMenu is false (no saved session to restore either way)
      expect(loadPersistedAtMenu()).toBe(false);

      // Refresh would also land on StartScreen (no session to restore)
      const hydrated = hydrateGameState(g, () => {
        throw new Error("should not generate");
      });
      expect(hydrated.phase).toBe("start");
    });

    it("START_GAME clears atMenu (entering gameplay)", () => {
      persistAtMenu(true);
      expect(loadPersistedAtMenu()).toBe(true);

      const pair = generateRandomPair(g, { random: mulberry32(64), level: 1 });
      const state = gameReducer(initialGameState, { type: "START_GAME", pair });
      expect(state.phase).toBe("playing");
      // The effect would call persistGameSession which sets atMenu = false
      persistGameSession(state);
      expect(loadPersistedAtMenu()).toBe(false);
    });
  });
});

describe("undosRemaining localStorage persistence", () => {
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
  });

  afterEach(() => {
    memory.clear();
  });

  it("persists and loads undosRemaining round-trip", () => {
    persistUndosRemaining(7);
    expect(loadPersistedUndosRemaining()).toBe(7);
  });

  it("defaults to 3 when no value is stored", () => {
    expect(loadPersistedUndosRemaining()).toBe(3);
  });

  it("defaults to 3 when stored value is corrupt", () => {
    memory.set("overlap.undosRemaining", "not-a-number");
    expect(loadPersistedUndosRemaining()).toBe(3);
  });

  it("defaults to 3 when stored value is negative", () => {
    memory.set("overlap.undosRemaining", "-1");
    expect(loadPersistedUndosRemaining()).toBe(3);
  });

  it("persists undosRemaining on UNDO action", () => {
    const pair = generateRandomPair(g, { random: mulberry32(48) });
    let state = gameReducer(initialGameState, { type: "START_GAME", pair });
    const entityId = pair.path[0].entityId!;
    state = gameReducer(state, {
      type: "EXPAND_PLAYER",
      playerId: pair.startPlayerId,
    });
    state = gameReducer(state, { type: "SELECT_ENTITY", entityId });
    // Before UNDO: stored value is 3
    expect(loadPersistedUndosRemaining()).toBe(3);

    state = gameReducer(state, { type: "UNDO" });
    // After UNDO: stored value decreased to 2
    expect(loadPersistedUndosRemaining()).toBe(2);
  });

  it("persists undosRemaining on optimal win", () => {
    const pair = generateRandomPair(g, { random: mulberry32(49), level: 1 });
    let state = gameReducer(
      { ...initialGameState, undosRemaining: 1 },
      { type: "START_GAME", pair },
    );
    // Play the optimal path
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
    // Optimal win: +2, so stored value = 1 + 2 = 3
    expect(loadPersistedUndosRemaining()).toBe(3);
  });

  it("RESET_PROGRESS resets undosRemaining to 3 in state and localStorage", () => {
    // Set a non-default undosRemaining
    persistUndosRemaining(10);
    let state: GameState = { ...initialGameState, undosRemaining: 10 };

    state = gameReducer(state, { type: "RESET_PROGRESS" });
    expect(state.undosRemaining).toBe(3);
    expect(loadPersistedUndosRemaining()).toBe(3);
  });

  it("createInitialState loads persisted undosRemaining", () => {
    persistUndosRemaining(5);
    expect(createInitialState().undosRemaining).toBe(5);
  });
});
