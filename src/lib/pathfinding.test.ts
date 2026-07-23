import { describe, expect, it } from "vitest";
import { AffiliationGraph, loadGraph } from "./graph";
import {
  MAX_HOPS,
  findClubOnlyPath,
  findShortestPath,
  generateRandomPair,
  getAllTeammateLinks,
  hasDirectLink,
  type PathStep,
} from "./pathfinding";
import type { GraphData } from "./types";

const RAMOS = "25557";
const BELLINGHAM = "581678";
const MESSI = "28003";
const SUAREZ = "44352";
const HAALAND = "418560";
const ODEGAARD = "316264";
const NORWAY = "3440";
const GRIEZMANN = "125781";
const LEMAR = "205562";
const ATLETICO = "13";

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

/** Chain of clubs with overlapping dated tenures so each hop is a valid club link. */
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
    const year = 2000 + i;
    data.affiliations.push(
      {
        playerId: `P${i}`,
        entityId: `E${i}`,
        startDate: `${year}-01-01`,
        endDate: `${year}-12-31`,
      },
      {
        playerId: `P${i + 1}`,
        entityId: `E${i}`,
        startDate: `${year}-06-01`,
        endDate: `${year + 1}-01-01`,
      },
    );
  }
  return new AffiliationGraph(data);
}

describe("findShortestPath on the real dataset", () => {
  it("does not treat Ramos–Bellingham as a direct Real Madrid link", () => {
    expect(hasDirectLink(g, RAMOS, BELLINGHAM)).toBe(false);
    const viaRm = getAllTeammateLinks(g, RAMOS).get(BELLINGHAM);
    expect(viaRm).toBeUndefined();
  });

  it("finds a 1-hop path for Messi–Suárez (overlapping Barcelona)", () => {
    const path = findShortestPath(MESSI, SUAREZ, g, MAX_HOPS);
    expect(path).not.toBeNull();
    expect(path!.length - 1).toBe(1);
    assertPathIsValid(path!, g);
  });

  it("finds a 1-hop club path for Griezmann–Lemar via Atlético", () => {
    expect(hasDirectLink(g, GRIEZMANN, LEMAR)).toBe(true);
    const path = findShortestPath(GRIEZMANN, LEMAR, g, MAX_HOPS);
    expect(path).not.toBeNull();
    expect(path!.length - 1).toBe(1);
    expect(path![0].entityId).toBe(ATLETICO);
    assertPathIsValid(path!, g);
  });

  it("finds a 1-hop national-team path for Haaland–Ødegaard via Norway", () => {
    expect(hasDirectLink(g, HAALAND, ODEGAARD)).toBe(true);
    const path = findShortestPath(HAALAND, ODEGAARD, g, MAX_HOPS);
    expect(path).not.toBeNull();
    expect(path!.length - 1).toBe(1);
    expect(path![0].entityId).toBe(NORWAY);
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
        {
          playerId: "A",
          entityId: "E1",
          startDate: "2020-01-01",
          endDate: "2021-01-01",
        },
        {
          playerId: "B",
          entityId: "E2",
          startDate: "2020-01-01",
          endDate: "2021-01-01",
        },
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

  it("rejects non-overlapping club stints even when entity is shared", () => {
    const data: GraphData = {
      players: [
        { id: "A", name: "A", position: "X", dob: null },
        { id: "B", name: "B", position: "X", dob: null },
      ],
      entities: [{ id: "CLUB", name: "Club", type: "club", country: "" }],
      affiliations: [
        {
          playerId: "A",
          entityId: "CLUB",
          startDate: "2010-01-01",
          endDate: "2015-01-01",
        },
        {
          playerId: "B",
          entityId: "CLUB",
          startDate: "2020-01-01",
          endDate: "2025-01-01",
        },
      ],
    };
    const graph = new AffiliationGraph(data);
    expect(hasDirectLink(graph, "A", "B")).toBe(false);
    expect(findShortestPath("A", "B", graph)).toBeNull();
  });
});

describe("findClubOnlyPath", () => {
  it("finds Messi–Suárez via Barcelona (club-only)", () => {
    const path = findClubOnlyPath(MESSI, SUAREZ, g, MAX_HOPS);
    expect(path).not.toBeNull();
    expect(path!.length - 1).toBe(1);
    expect(path![0].entityId).toBe("131");
    assertPathIsValid(path!, g);
  });

  it("returns null when players only connect via a national team", () => {
    const data: GraphData = {
      players: [
        { id: "A", name: "A", position: "X", dob: null },
        { id: "B", name: "B", position: "X", dob: null },
      ],
      entities: [
        { id: "NT", name: "Nation", type: "national_team", country: "" },
        { id: "CA", name: "Club A", type: "club", country: "" },
        { id: "CB", name: "Club B", type: "club", country: "" },
      ],
      affiliations: [
        { playerId: "A", entityId: "NT", startDate: null, endDate: null },
        { playerId: "B", entityId: "NT", startDate: null, endDate: null },
        // Disjoint club careers — no club link, only NT.
        {
          playerId: "A",
          entityId: "CA",
          startDate: "2010-01-01",
          endDate: "2012-01-01",
        },
        {
          playerId: "B",
          entityId: "CB",
          startDate: "2018-01-01",
          endDate: "2020-01-01",
        },
      ],
    };
    const graph = new AffiliationGraph(data);
    expect(findShortestPath("A", "B", graph)).not.toBeNull();
    expect(findShortestPath("A", "B", graph)![0].entityId).toBe("NT");
    expect(findClubOnlyPath("A", "B", graph)).toBeNull();
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
      // Club-only route must exist for every generated puzzle.
      expect(
        findClubOnlyPath(pair.startPlayerId, pair.targetPlayerId, g, MAX_HOPS),
      ).not.toBeNull();
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
        {
          playerId: "A",
          entityId: "E1",
          startDate: "2020-01-01",
          endDate: "2022-01-01",
        },
        {
          playerId: "B",
          entityId: "E1",
          startDate: "2020-06-01",
          endDate: "2021-06-01",
        },
      ],
    };
    expect(() => generateRandomPair(new AffiliationGraph(data))).toThrow(/no valid pair/);
  });

  it("rejects NT-only-solvable pairs that lack a club-only path", () => {
    const data: GraphData = {
      players: [
        { id: "A", name: "A", position: "X", dob: null },
        { id: "B", name: "B", position: "X", dob: null },
      ],
      entities: [
        { id: "NT", name: "Nation", type: "national_team", country: "" },
        { id: "CA", name: "Club A", type: "club", country: "" },
        { id: "CB", name: "Club B", type: "club", country: "" },
      ],
      affiliations: [
        { playerId: "A", entityId: "NT", startDate: null, endDate: null },
        { playerId: "B", entityId: "NT", startDate: null, endDate: null },
        {
          playerId: "A",
          entityId: "CA",
          startDate: "2010-01-01",
          endDate: "2012-01-01",
        },
        {
          playerId: "B",
          entityId: "CB",
          startDate: "2018-01-01",
          endDate: "2020-01-01",
        },
      ],
    };
    const graph = new AffiliationGraph(data);
    expect(findShortestPath("A", "B", graph, MAX_HOPS)).not.toBeNull();
    expect(findClubOnlyPath("A", "B", graph, MAX_HOPS)).toBeNull();
    expect(() =>
      generateRandomPair(graph, { minHops: 1, maxAttempts: 50 }),
    ).toThrow(/no valid pair/);
  });
});
