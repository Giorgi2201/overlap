import { describe, expect, it } from "vitest";
import { loadGraph } from "../lib/graph";
import { generateRandomPair } from "../lib/pathfinding";
import {
  currentPlayerId,
  gameReducer,
  initialGameState,
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

    // Drive the UI actions along the known shortest path:
    // expand player -> click club -> click next player -> ...
    for (let i = 0; i < pair.path.length - 1; i++) {
      const { playerId, clubId } = pair.path[i];
      state = gameReducer(state, { type: "EXPAND_PLAYER", playerId });
      expect(state.expanded).toEqual({ kind: "clubs", playerId });
      state = gameReducer(state, { type: "SELECT_CLUB", clubId: clubId! });
      expect(state.expanded).toEqual({
        kind: "teammates",
        clubId,
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
    expect(state.chain.filter((n) => n.type === "club")).toHaveLength(
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

  it("resets to the start screen on RESET", () => {
    const pair = generateRandomPair(g, { random: mulberry32(3) });
    let state = gameReducer(initialGameState, { type: "START_GAME", pair });
    state = gameReducer(state, { type: "RESET" });
    expect(state).toEqual(initialGameState);
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

  it("undoing a club restores that player's clubs list", () => {
    const pair = generateRandomPair(g, { random: mulberry32(5) });
    let state = gameReducer(initialGameState, { type: "START_GAME", pair });
    const clubId = pair.path[0].clubId!;
    state = gameReducer(state, {
      type: "EXPAND_PLAYER",
      playerId: pair.startPlayerId,
    });
    state = gameReducer(state, { type: "SELECT_CLUB", clubId });
    state = gameReducer(state, { type: "UNDO" });
    expect(state.chain).toEqual([{ type: "player", id: pair.startPlayerId }]);
    expect(state.expanded).toEqual({
      kind: "clubs",
      playerId: pair.startPlayerId,
    });
  });

  it("undoing a player restores the previous club's teammates list", () => {
    const pair = generateRandomPair(g, { random: mulberry32(6) });
    let state = gameReducer(initialGameState, { type: "START_GAME", pair });
    const clubId = pair.path[0].clubId!;
    const midPlayerId = pair.path[1].playerId;
    state = gameReducer(state, {
      type: "EXPAND_PLAYER",
      playerId: pair.startPlayerId,
    });
    state = gameReducer(state, { type: "SELECT_CLUB", clubId });
    state = gameReducer(state, { type: "SELECT_PLAYER", playerId: midPlayerId });
    state = gameReducer(state, { type: "UNDO" });
    expect(state.chain).toEqual([
      { type: "player", id: pair.startPlayerId },
      { type: "club", id: clubId },
    ]);
    expect(state.expanded).toEqual({
      kind: "teammates",
      clubId,
      viaPlayerId: pair.startPlayerId,
    });
  });

  it("multi-step undo walks back to the start player", () => {
    const pair = generateRandomPair(g, { random: mulberry32(7) });
    let state = gameReducer(initialGameState, { type: "START_GAME", pair });
    const clubId = pair.path[0].clubId!;
    const midPlayerId = pair.path[1].playerId;
    state = gameReducer(state, {
      type: "EXPAND_PLAYER",
      playerId: pair.startPlayerId,
    });
    state = gameReducer(state, { type: "SELECT_CLUB", clubId });
    state = gameReducer(state, { type: "SELECT_PLAYER", playerId: midPlayerId });

    state = gameReducer(state, { type: "UNDO" });
    expect(currentPlayerId(state.chain)).toBe(pair.startPlayerId);
    expect(state.expanded?.kind).toBe("teammates");

    state = gameReducer(state, { type: "UNDO" });
    expect(state.chain).toEqual([{ type: "player", id: pair.startPlayerId }]);
    expect(state.expanded).toEqual({
      kind: "clubs",
      playerId: pair.startPlayerId,
    });

    state = gameReducer(state, { type: "UNDO" });
    expect(state.chain).toEqual([{ type: "player", id: pair.startPlayerId }]);
  });
});
