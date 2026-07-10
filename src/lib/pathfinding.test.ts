import { describe, expect, it } from "vitest";
import { AffiliationGraph, loadGraph } from "./graph";
import {
  MAX_HOPS,
  findShortestPath,
  generateRandomPair,
  getAllTeammateLinks,
  hasDirectLink,
  type PathStep,
} from "./pathfinding";
import type { GraphData } from "./types";

const RAMOS = "25557";
const BELLINGHAM = "581678";
const REAL_MADRID = "418";
const MESSI = "28003";
const SUAREZ = "44352";

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

function assertPathIsValid(path: PathStep[], graph: AffiliationGraph): void {
  expect(path.length).toBeGreaterThanOrEqual(1);
  expect(path[path.length - 1].entityId).toBeNull();
  for (let i = 0; i < path.length - 1; i++) {
    const { playerId, entityId } = path[i];
    const nextId = path[i + 1].playerId;
    expect(entityId).not.toBeNull();
    const mates = graph.getTeammates(playerId, entityId!);
    expect(mates.some((p) => p.id === nextId)).toBe(true);
  }
}

function chainGraph(nPlayers: number): AffiliationGraph {
  const data: GraphData = { players: [], entities: [], affiliations: [] };
  for (let i = 0; i < nPlayers; i++) {
    data.players.push({ id: `P${i}`, name: `Player ${i}`, position: "X", dob: null });
  }
  for (let i = 0; i < nPlayers - 1; i++) {
    data.entities.push({
      id: `E${i}`,
      name: `Entity ${i}`,
      type: "club",
      country: "",
    });
    data.affiliations.push(
      { playerId: `P${i}`, entityId: `E${i}`, startDate: null, endDate: null },
      { playerId: `P${i + 1}`, entityId: `E${i}`, startDate: null, endDate: null },
    );
  }
  return new AffiliationGraph(data);
}

describe("findShortestPath on the real dataset", () => {
  it("finds a 1-hop path for direct shared-entity pair (Ramos–Bellingham via RM)", () => {
    expect(hasDirectLink(g, RAMOS, BELLINGHAM)).toBe(true);
    const path = findShortestPath(RAMOS, BELLINGHAM, g, MAX_HOPS);
    expect(path).not.toBeNull();
    expect(path!.length - 1).toBe(1);
    expect(path![0].entityId).toBe(REAL_MADRID);
    assertPathIsValid(path!, g);
  });

  it("finds a 1-hop path for Messi–Suárez (still direct via Barcelona)", () => {
    const path = findShortestPath(MESSI, SUAREZ, g, MAX_HOPS);
    expect(path).not.toBeNull();
    expect(path!.length - 1).toBe(1);
    assertPathIsValid(path!, g);
  });

  it("returns a single-step path for start === target", () => {
    expect(findShortestPath(MESSI, MESSI, g, MAX_HOPS)).toEqual([
      { playerId: MESSI, entityId: null, clubId: null },
    ]);
  });

  it("returns null for unknown player ids", () => {
    expect(findShortestPath("nope", MESSI, g, MAX_HOPS)).toBeNull();
  });

  it("agrees with getAllTeammateLinks on direct neighbors", () => {
    const links = getAllTeammateLinks(g, RAMOS);
    expect(links.get(BELLINGHAM)).toBe(REAL_MADRID);
  });
});

describe("findShortestPath null-handling (synthetic graphs)", () => {
  it("returns null when no path exists at all", () => {
    const data: GraphData = {
      players: [
        { id: "A", name: "A", position: "X", dob: null },
        { id: "B", name: "B", position: "X", dob: null },
      ],
      entities: [
        { id: "E1", name: "E1", type: "club", country: "" },
        { id: "E2", name: "E2", type: "club", country: "" },
      ],
      affiliations: [
        { playerId: "A", entityId: "E1", startDate: null, endDate: null },
        { playerId: "B", entityId: "E2", startDate: null, endDate: null },
      ],
    };
    expect(findShortestPath("A", "B", new AffiliationGraph(data))).toBeNull();
  });

  it("respects the depth cap", () => {
    const chain = chainGraph(8);
    expect(findShortestPath("P0", "P7", chain, 6)).toBeNull();
    const path = findShortestPath("P0", "P7", chain, 7);
    expect(path).not.toBeNull();
    expect(path!.length - 1).toBe(7);
  });
});

describe("generateRandomPair", () => {
  it("always returns solvable pairs at default minHops (30 seeded runs)", () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 30; i++) {
      const pair = generateRandomPair(g, { random: rng });
      expect(pair.startPlayerId).not.toBe(pair.targetPlayerId);
      expect(hasDirectLink(g, pair.startPlayerId, pair.targetPlayerId)).toBe(false);
      expect(pair.pathLength).toBeGreaterThanOrEqual(2);
      expect(pair.pathLength).toBeLessThanOrEqual(MAX_HOPS);
      assertPathIsValid(pair.path, g);
    }
  });

  it("throws when the pool cannot produce a valid pair", () => {
    const data: GraphData = {
      players: [
        { id: "A", name: "A", position: "X", dob: null },
        { id: "B", name: "B", position: "X", dob: null },
      ],
      entities: [{ id: "E1", name: "E1", type: "club", country: "" }],
      affiliations: [
        { playerId: "A", entityId: "E1", startDate: null, endDate: null },
        { playerId: "B", entityId: "E1", startDate: null, endDate: null },
      ],
    };
    expect(() => generateRandomPair(new AffiliationGraph(data))).toThrow(/no valid pair/);
  });
});
