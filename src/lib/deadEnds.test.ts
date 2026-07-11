import { describe, expect, it } from "vitest";
import { AffiliationGraph } from "./graph";
import { getEntityOptions, getTeammateOptions } from "./deadEnds";
import type { GraphData } from "./types";

/**
 * Synthetic graph (overlapping club dates so club edges exist):
 *   A ----E1---- B          (B is a leaf: only at E1)
 *   |            |
 *   +----E1------+ C ----E2---- T
 *
 * Plus an undated national-team edge A--NT--C used only where noted.
 */
function deadEndFixture(): {
  graph: AffiliationGraph;
  ids: Record<string, string>;
} {
  const data: GraphData = {
    players: [
      { id: "A", name: "Alpha", position: "X", dob: null },
      { id: "B", name: "Bravo", position: "X", dob: null },
      { id: "C", name: "Charlie", position: "X", dob: null },
      { id: "T", name: "Target", position: "X", dob: null },
    ],
    entities: [
      { id: "E1", name: "Entity One", type: "club", country: "" },
      { id: "E2", name: "Entity Two", type: "club", country: "" },
    ],
    affiliations: [
      {
        playerId: "A",
        entityId: "E1",
        startDate: "2020-01-01",
        endDate: "2023-01-01",
      },
      {
        playerId: "A",
        entityId: "E2",
        startDate: "2021-01-01",
        endDate: "2024-01-01",
      },
      {
        playerId: "B",
        entityId: "E1",
        startDate: "2020-06-01",
        endDate: "2021-06-01",
      },
      {
        playerId: "C",
        entityId: "E1",
        startDate: "2021-01-01",
        endDate: "2022-01-01",
      },
      {
        playerId: "C",
        entityId: "E2",
        startDate: "2022-01-01",
        endDate: "2025-01-01",
      },
      {
        playerId: "T",
        entityId: "E2",
        startDate: "2022-06-01",
        endDate: "2023-06-01",
      },
    ],
  };
  return {
    graph: new AffiliationGraph(data),
    ids: { A: "A", B: "B", C: "C", T: "T", E1: "E1", E2: "E2" },
  };
}

describe("dead-end detection", () => {
  const { graph, ids } = deadEndFixture();
  const chain = [{ type: "player" as const, id: ids.A }];

  it("flags a leaf teammate who cannot reach the target", () => {
    const chainAtEntity = [
      { type: "player" as const, id: ids.A },
      { type: "entity" as const, id: ids.E1 },
    ];
    const options = getTeammateOptions(
      graph,
      ids.A,
      ids.E1,
      ids.T,
      chainAtEntity,
    );
    expect(options.find((o) => o.player.id === ids.B)?.isDeadEnd).toBe(true);
    expect(options.find((o) => o.player.id === ids.C)?.isDeadEnd).toBe(false);
  });

  it("flags an entity when every teammate through it is a dead end", () => {
    const onlyDead: GraphData = {
      players: [
        { id: "A", name: "Alpha", position: "X", dob: null },
        { id: "B", name: "Bravo", position: "X", dob: null },
        { id: "T", name: "Target", position: "X", dob: null },
      ],
      entities: [
        { id: "Edead", name: "Dead", type: "club", country: "" },
        { id: "Etarget", name: "Target Ent", type: "national_team", country: "" },
      ],
      affiliations: [
        {
          playerId: "A",
          entityId: "Edead",
          startDate: "2020-01-01",
          endDate: "2022-01-01",
        },
        {
          playerId: "B",
          entityId: "Edead",
          startDate: "2020-06-01",
          endDate: "2021-06-01",
        },
        {
          playerId: "T",
          entityId: "Etarget",
          startDate: null,
          endDate: null,
        },
      ],
    };
    const g = new AffiliationGraph(onlyDead);
    const options = getEntityOptions(g, "A", "T", [{ type: "player", id: "A" }]);
    expect(options.find((o) => o.entity.id === "Edead")?.isDeadEnd).toBe(true);
  });

  it("keeps an entity alive when at least one teammate can still reach the target", () => {
    const options = getEntityOptions(graph, ids.A, ids.T, chain);
    expect(options.find((o) => o.entity.id === ids.E1)?.isDeadEnd).toBe(false);
    expect(options.find((o) => o.entity.id === ids.E2)?.isDeadEnd).toBe(false);
  });

  it("marks an already-used entity as dead end", () => {
    const usedChain = [
      { type: "player" as const, id: ids.A },
      { type: "entity" as const, id: ids.E2 },
    ];
    const options = getEntityOptions(graph, ids.C, ids.T, usedChain);
    expect(options.find((o) => o.entity.id === ids.E2)?.isDeadEnd).toBe(true);
  });

  it("never marks the target as a dead-end teammate", () => {
    const options = getTeammateOptions(graph, ids.C, ids.E2, ids.T, [
      { type: "player", id: ids.C },
      { type: "entity", id: ids.E2 },
    ]);
    expect(options.find((o) => o.player.id === ids.T)?.isDeadEnd).toBe(false);
  });

  it("treats undated national-team edges as valid for reachability", () => {
    const data: GraphData = {
      players: [
        { id: "A", name: "A", position: "X", dob: null },
        { id: "M", name: "Middle", position: "X", dob: null },
        { id: "T", name: "T", position: "X", dob: null },
      ],
      entities: [
        { id: "NT", name: "Nation", type: "national_team", country: "" },
        { id: "CLUB", name: "Club", type: "club", country: "" },
      ],
      affiliations: [
        { playerId: "A", entityId: "NT", startDate: null, endDate: null },
        { playerId: "M", entityId: "NT", startDate: null, endDate: null },
        {
          playerId: "M",
          entityId: "CLUB",
          startDate: "2020-01-01",
          endDate: "2022-01-01",
        },
        {
          playerId: "T",
          entityId: "CLUB",
          startDate: "2020-06-01",
          endDate: "2021-06-01",
        },
      ],
    };
    const g = new AffiliationGraph(data);
    const options = getEntityOptions(g, "A", "T", [{ type: "player", id: "A" }]);
    expect(options.find((o) => o.entity.id === "NT")?.isDeadEnd).toBe(false);
  });
});

describe("dead-end detection performance", () => {
  it("Messi/Barcelona teammates case completes under 50ms", async () => {
    const { loadGraph } = await import("./graph");
    const { clearReachabilityCache } = await import("./deadEnds");
    const g = loadGraph();
    clearReachabilityCache(g);

    const messi = "28003";
    const barcelona = "131";
    const teammates = g.getTeammates(messi, barcelona);
    const chain = [
      { type: "player" as const, id: messi },
      { type: "entity" as const, id: barcelona },
    ];
    const target = "418560";

    clearReachabilityCache(g);
    const t0 = performance.now();
    const options = getTeammateOptions(g, messi, barcelona, target, chain);
    const elapsed = performance.now() - t0;

    console.log(
      `[dead-end perf] ${teammates.length} teammates: ${elapsed.toFixed(1)}ms`,
    );
    expect(options).toHaveLength(teammates.length);
    expect(elapsed).toBeLessThan(50);
  });
});
