import { describe, expect, it } from "vitest";
import { TenureGraph, loadGraph } from "./graph";
import { tenuresOverlap } from "./overlap";
import {
  MAX_HOPS,
  findShortestPath,
  generateRandomPair,
  getAllTeammateLinks,
  hasDirectLink,
  type PathStep,
} from "./pathfinding";
import type { GraphData } from "./types";

const STERLING = "134425";
const HAALAND = "418560";
const MESSI = "28003";
const SUAREZ = "44352";

// Pin "today" so open-ended tenures behave deterministically.
const AS_OF = new Date(Date.UTC(2026, 6, 10)); // 2026-07-10

const g = loadGraph();

/** Deterministic PRNG so random-pair tests are reproducible. */
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

/** Assert every consecutive pair in the path is a genuine 30-day link. */
function assertPathIsValid(path: PathStep[], graph: TenureGraph): void {
  expect(path.length).toBeGreaterThanOrEqual(1);
  expect(path[path.length - 1].clubId).toBeNull();
  for (let i = 0; i < path.length - 1; i++) {
    const { playerId, clubId } = path[i];
    const nextId = path[i + 1].playerId;
    expect(clubId).not.toBeNull();
    const mine = graph
      .getTenuresForPlayer(playerId)
      .filter((t) => t.clubId === clubId);
    const theirs = graph
      .getTenuresForPlayer(nextId)
      .filter((t) => t.clubId === clubId);
    const linked = mine.some((a) =>
      theirs.some((b) => tenuresOverlap(a, b, undefined, AS_OF)),
    );
    expect(linked, `link ${playerId} -> ${nextId} via club ${clubId}`).toBe(true);
  }
}

/** Build a chain P0 -C0- P1 -C1- ... where Pi & Pi+1 overlap a full year at Ci. */
function chainGraph(nPlayers: number): TenureGraph {
  const data: GraphData = { players: [], clubs: [], tenures: [] };
  for (let i = 0; i < nPlayers; i++) {
    data.players.push({ id: `P${i}`, name: `Player ${i}`, position: "X", dob: null });
  }
  for (let i = 0; i < nPlayers - 1; i++) {
    data.clubs.push({ id: `C${i}`, name: `Club ${i}`, country: "" });
    // Pi and Pi+1 both spend calendar year (2000+i) at club Ci.
    const start = `${2000 + i}-01-01`;
    const end = `${2001 + i}-01-01`;
    data.tenures.push(
      { playerId: `P${i}`, clubId: `C${i}`, startDate: start, endDate: end },
      { playerId: `P${i + 1}`, clubId: `C${i}`, startDate: start, endDate: end },
    );
  }
  return new TenureGraph(data);
}

describe("findShortestPath on the real dataset", () => {
  it("finds a 2-hop path Sterling -> ? -> Haaland (no direct link, shared City era teammates)", () => {
    // Sterling left Man City 12 days after Haaland arrived (< 30), so no
    // direct link -- but plenty of players overlap both by 30+ days.
    expect(hasDirectLink(g, STERLING, HAALAND, undefined, AS_OF)).toBe(false);

    const path = findShortestPath(STERLING, HAALAND, g, MAX_HOPS, AS_OF);
    expect(path).not.toBeNull();
    expect(path![0].playerId).toBe(STERLING);
    expect(path![path!.length - 1].playerId).toBe(HAALAND);
    expect(path!.length - 1).toBe(2); // exactly one intermediate player
    assertPathIsValid(path!, g);
  });

  it("finds a 1-hop path for direct teammates (Messi -> Suárez)", () => {
    const path = findShortestPath(MESSI, SUAREZ, g, MAX_HOPS, AS_OF);
    expect(path).not.toBeNull();
    expect(path!.length - 1).toBe(1);
    assertPathIsValid(path!, g);
  });

  it("returns a single-step path for start === target", () => {
    expect(findShortestPath(MESSI, MESSI, g, MAX_HOPS, AS_OF)).toEqual([
      { playerId: MESSI, clubId: null },
    ]);
  });

  it("returns null for unknown player ids", () => {
    expect(findShortestPath("nope", MESSI, g, MAX_HOPS, AS_OF)).toBeNull();
    expect(findShortestPath(MESSI, "nope", g, MAX_HOPS, AS_OF)).toBeNull();
  });

  it("agrees with getAllTeammateLinks on direct neighbors", () => {
    const links = getAllTeammateLinks(g, MESSI, undefined, AS_OF);
    expect(links.has(SUAREZ)).toBe(true);
    expect(links.get(SUAREZ)).toBe("131"); // Barcelona
  });
});

describe("findShortestPath null-handling (synthetic graphs)", () => {
  it("returns null when no path exists at all", () => {
    const data: GraphData = {
      players: [
        { id: "A", name: "A", position: "X", dob: null },
        { id: "B", name: "B", position: "X", dob: null },
      ],
      clubs: [
        { id: "C1", name: "C1", country: "" },
        { id: "C2", name: "C2", country: "" },
      ],
      tenures: [
        { playerId: "A", clubId: "C1", startDate: "2010-01-01", endDate: "2015-01-01" },
        { playerId: "B", clubId: "C2", startDate: "2010-01-01", endDate: "2015-01-01" },
      ],
    };
    expect(findShortestPath("A", "B", new TenureGraph(data))).toBeNull();
  });

  it("respects the depth cap and finds the path once the cap allows it", () => {
    const chain = chainGraph(8); // P0..P7 => shortest path is 7 hops
    expect(findShortestPath("P0", "P7", chain, 6)).toBeNull();
    const path = findShortestPath("P0", "P7", chain, 7);
    expect(path).not.toBeNull();
    expect(path!.length - 1).toBe(7);
  });
});

describe("generateRandomPair", () => {
  it("always returns solvable 3+ hop pairs with no direct overlap (30 seeded runs)", () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 30; i++) {
      const pair = generateRandomPair(g, { asOf: AS_OF, random: rng });
      expect(pair.startPlayerId).not.toBe(pair.targetPlayerId);
      expect(
        hasDirectLink(g, pair.startPlayerId, pair.targetPlayerId, undefined, AS_OF),
      ).toBe(false);
      expect(pair.pathLength).toBeGreaterThanOrEqual(3); // default minHops
      expect(pair.pathLength).toBeLessThanOrEqual(MAX_HOPS);
      assertPathIsValid(pair.path, g);
    }
  });

  it("allows easier puzzles via the minHops override", () => {
    const rng = mulberry32(99);
    const lengths = new Set<number>();
    for (let i = 0; i < 20; i++) {
      const pair = generateRandomPair(g, { minHops: 2, asOf: AS_OF, random: rng });
      expect(pair.pathLength).toBeGreaterThanOrEqual(2);
      lengths.add(pair.pathLength);
    }
    // With minHops 2 the (dominant) 2-hop pairs must show up again.
    expect(lengths).toContain(2);
  });

  it("throws a clear error when the pool cannot produce a valid pair", () => {
    const data: GraphData = {
      players: [
        { id: "A", name: "A", position: "X", dob: null },
        { id: "B", name: "B", position: "X", dob: null },
      ],
      clubs: [{ id: "C1", name: "C1", country: "" }],
      tenures: [
        { playerId: "A", clubId: "C1", startDate: "2010-01-01", endDate: "2015-01-01" },
        { playerId: "B", clubId: "C1", startDate: "2010-01-01", endDate: "2015-01-01" },
      ],
    };
    // A and B are DIRECT teammates, so no valid indirect pair exists.
    expect(() => generateRandomPair(new TenureGraph(data))).toThrow(/no valid pair/);
  });

  it("reports the path-length distribution of 20 random puzzles", () => {
    const rng = mulberry32(7);
    const histogram = new Map<number, number>();
    const started = performance.now();
    for (let i = 0; i < 20; i++) {
      const pair = generateRandomPair(g, { asOf: AS_OF, random: rng });
      histogram.set(pair.pathLength, (histogram.get(pair.pathLength) ?? 0) + 1);
    }
    const elapsed = performance.now() - started;

    const summary = [...histogram.entries()]
      .sort(([a], [b]) => a - b)
      .map(([hops, count]) => `${hops} hops: ${count}`)
      .join(", ");
    console.log(`[pair distribution over 20 puzzles] ${summary}`);
    console.log(`[timing] 20 generateRandomPair calls took ${elapsed.toFixed(1)}ms`);

    expect([...histogram.values()].reduce((a, b) => a + b, 0)).toBe(20);
  });
});
