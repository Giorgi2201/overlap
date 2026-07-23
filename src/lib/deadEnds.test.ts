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
    // Budget=3 so A→NT→M→CLUB→T works within budget (1 NT hop <= 3).
    const options = getEntityOptions(g, "A", "T", [{ type: "player", id: "A" }], 3);
    expect(options.find((o) => o.entity.id === "NT")?.isDeadEnd).toBe(false);
  });
});

describe("three-state reachability classification", () => {
  it("TRUE_DEAD_END when no path to target exists at all", () => {
    // A ↔ B (club) — T is isolated (no edges).
    const data: GraphData = {
      players: [
        { id: "A", name: "A", position: "X", dob: null },
        { id: "B", name: "B", position: "X", dob: null },
        { id: "T", name: "T", position: "X", dob: null },
      ],
      entities: [
        { id: "C", name: "Club", type: "club", country: "" },
      ],
      affiliations: [
        { playerId: "A", entityId: "C", startDate: "2020-01-01", endDate: "2023-01-01" },
        { playerId: "B", entityId: "C", startDate: "2020-06-01", endDate: "2021-06-01" },
      ],
    };
    const g = new AffiliationGraph(data);
    const chain = [{ type: "player" as const, id: "A" }];
    const options = getEntityOptions(g, "A", "T", chain, 3);
    // Only entity C exists; every teammate through C (just B) has zero path to T.
    expect(options).toHaveLength(1);
    expect(options[0].entity.id).toBe("C");
    expect(options[0].reachability).toBe("true_dead_end");
    expect(options[0].isDeadEnd).toBe(true);
  });

  it("NEEDS_MORE_HOPS when path exists but requires > budget NT hops", () => {
    // A is at NT and CLUB. M is at NT and CLUB. T at CLUB.
    // Through NT: A→NT→M→CLUB→T needs 1 NT hop (A→M via NT) + 0 (M→T via CLUB) = 1 total.
    // Budget=0 → needs_more_hops for NT entity.
    // Through CLUB: A→CLUB→M→CLUB→T needs 0 NT hops → viable.
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
        { playerId: "A", entityId: "CLUB", startDate: "2020-01-01", endDate: "2023-01-01" },
        { playerId: "M", entityId: "NT", startDate: null, endDate: null },
        { playerId: "M", entityId: "CLUB", startDate: "2020-01-01", endDate: "2022-01-01" },
        { playerId: "T", entityId: "CLUB", startDate: "2020-06-01", endDate: "2021-06-01" },
      ],
    };
    const g = new AffiliationGraph(data);
    const chain = [{ type: "player" as const, id: "A" }];
    const options = getEntityOptions(g, "A", "T", chain, 0);
    const ntOpt = options.find((o) => o.entity.id === "NT")!;
    expect(ntOpt.reachability).toBe("needs_more_hops");
    expect(ntOpt.isDeadEnd).toBe(true);
    // Club option: A→CLUB→M→CLUB→T: 0 NT hops → viable
    const clubOpt = options.find((o) => o.entity.id === "CLUB")!;
    expect(clubOpt.reachability).toBe("viable");
    expect(clubOpt.isDeadEnd).toBe(false);
  });

  it("VIABLE when path exists within budget", () => {
    // Same graph but budget=1: NT option becomes viable (1 NT hop ≤ 1).
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
        { playerId: "A", entityId: "CLUB", startDate: "2020-01-01", endDate: "2023-01-01" },
        { playerId: "M", entityId: "NT", startDate: null, endDate: null },
        { playerId: "M", entityId: "CLUB", startDate: "2020-01-01", endDate: "2022-01-01" },
        { playerId: "T", entityId: "CLUB", startDate: "2020-06-01", endDate: "2021-06-01" },
      ],
    };
    const g = new AffiliationGraph(data);
    const chain = [{ type: "player" as const, id: "A" }];
    const options = getEntityOptions(g, "A", "T", chain, 1);
    expect(options.find((o) => o.entity.id === "NT")?.reachability).toBe("viable");
    expect(options.find((o) => o.entity.id === "NT")?.isDeadEnd).toBe(false);
    expect(options.find((o) => o.entity.id === "CLUB")?.reachability).toBe("viable");
    expect(options.find((o) => o.entity.id === "CLUB")?.isDeadEnd).toBe(false);
  });

  it("target teammate is always VIABLE regardless of budget", () => {
    const data: GraphData = {
      players: [
        { id: "A", name: "A", position: "X", dob: null },
        { id: "T", name: "T", position: "X", dob: null },
      ],
      entities: [
        { id: "C", name: "Club", type: "club", country: "" },
      ],
      affiliations: [
        { playerId: "A", entityId: "C", startDate: "2020-01-01", endDate: "2023-01-01" },
        { playerId: "T", entityId: "C", startDate: "2020-06-01", endDate: "2021-06-01" },
      ],
    };
    const g = new AffiliationGraph(data);
    const chain = [
      { type: "player" as const, id: "A" },
      { type: "entity" as const, id: "C" },
    ];
    // Budget=0 should still mark T as viable (target is always reachable)
    const options = getTeammateOptions(g, "A", "C", "T", chain, 0);
    const tOpt = options.find((o) => o.player.id === "T")!;
    expect(tOpt.reachability).toBe("viable");
    expect(tOpt.isDeadEnd).toBe(false);
  });

  it("club-only guarantee: with budget=0 at least one VIABLE option exists when puzzle was generated with club-only path", () => {
    // Build a graph matching a club-only puzzle: A→ClubC→M→ClubD→T, no NT involvement.
    const data: GraphData = {
      players: [
        { id: "A", name: "A", position: "X", dob: null },
        { id: "M", name: "Middle", position: "X", dob: null },
        { id: "T", name: "T", position: "X", dob: null },
      ],
      entities: [
        { id: "CA", name: "CA", type: "club", country: "" },
        { id: "CB", name: "CB", type: "club", country: "" },
      ],
      affiliations: [
        { playerId: "A", entityId: "CA", startDate: "2020-01-01", endDate: "2023-01-01" },
        { playerId: "M", entityId: "CA", startDate: "2020-06-01", endDate: "2021-06-01" },
        { playerId: "M", entityId: "CB", startDate: "2022-01-01", endDate: "2024-01-01" },
        { playerId: "T", entityId: "CB", startDate: "2022-06-01", endDate: "2023-06-01" },
      ],
    };
    const g = new AffiliationGraph(data);
    const chain = [{ type: "player" as const, id: "A" }];
    // Budget=0, but CA connects A→M who can reach T via CB (all club edges, 0 NT hops).
    const options = getEntityOptions(g, "A", "T", chain, 0);
    expect(options.some((o) => o.reachability === "viable")).toBe(true);
    expect(options.every((o) => o.reachability !== "true_dead_end")).toBe(true);
  });
});

describe("multi-NT-hop chain classification", () => {
  it("classifies entity correctly when path through entity needs NT hops", () => {
    // Chain: A↔NT1↔B↔NT2↔C↔CLUB↔T
    // Distances from T backwards: T=0, C=0, B=1 (via NT2), A=2 (via NT1).
    // Through NT1 entity: teammate B has dist=1 → needs 1 NT hop.
    const data: GraphData = {
      players: [
        { id: "A", name: "A", position: "X", dob: null },
        { id: "B", name: "B", position: "X", dob: null },
        { id: "C", name: "C", position: "X", dob: null },
        { id: "T", name: "T", position: "X", dob: null },
      ],
      entities: [
        { id: "NT1", name: "NT1", type: "national_team", country: "" },
        { id: "NT2", name: "NT2", type: "national_team", country: "" },
        { id: "CLUB", name: "Club", type: "club", country: "" },
      ],
      affiliations: [
        { playerId: "A", entityId: "NT1", startDate: null, endDate: null },
        { playerId: "B", entityId: "NT1", startDate: null, endDate: null },
        { playerId: "B", entityId: "NT2", startDate: null, endDate: null },
        { playerId: "C", entityId: "NT2", startDate: null, endDate: null },
        { playerId: "C", entityId: "CLUB", startDate: "2020-01-01", endDate: "2022-01-01" },
        { playerId: "T", entityId: "CLUB", startDate: "2020-06-01", endDate: "2021-06-01" },
      ],
    };
    const g = new AffiliationGraph(data);

    // Exclusions: players={A}, entities={NT1}
    // T→CLUB→C (club, 0, allowed), C→NT2→B (NT, 1, allowed), B→NT1→A (NT, 1, but NT1 excluded).
    // dist: T=0, C=0, B=1, A=unreachable.
    // Through NT1: entityCost=1, dist[B]=1. Total=2.
    const entityOpts0 = getEntityOptions(g, "A", "T", [{ type: "player", id: "A" }], 0);
    expect(entityOpts0.find((o) => o.entity.id === "NT1")?.reachability).toBe("needs_more_hops");

    // Budget=1: total=2 > 1 → needs_more_hops
    const entityOpts1 = getEntityOptions(g, "A", "T", [{ type: "player", id: "A" }], 1);
    expect(entityOpts1.find((o) => o.entity.id === "NT1")?.reachability).toBe("needs_more_hops");

    // Budget=2: total=2 ≤ 2 → viable
    const entityOpts2 = getEntityOptions(g, "A", "T", [{ type: "player", id: "A" }], 2);
    expect(entityOpts2.find((o) => o.entity.id === "NT1")?.reachability).toBe("viable");
  });

  it("classifies getTeammateOptions with needs_more_hops", () => {
    // A↔NT↔B (A and B share NT). B↔NT2↔C (B and C share NT2). C↔CLUB↔T.
    // From A through NT: teammate B. Distances from T: T=0, C=0 (club), B=1 (NT2), A=unreachable (NT1 excluded).
    // B needs 1 NT hop → budget=0 → needs_more_hops.
    const data: GraphData = {
      players: [
        { id: "A", name: "A", position: "X", dob: null },
        { id: "B", name: "B", position: "X", dob: null },
        { id: "C", name: "C", position: "X", dob: null },
        { id: "T", name: "T", position: "X", dob: null },
      ],
      entities: [
        { id: "NT1", name: "NT1", type: "national_team", country: "" },
        { id: "NT2", name: "NT2", type: "national_team", country: "" },
        { id: "CLUB", name: "Club", type: "club", country: "" },
      ],
      affiliations: [
        { playerId: "A", entityId: "NT1", startDate: null, endDate: null },
        { playerId: "B", entityId: "NT1", startDate: null, endDate: null },
        { playerId: "B", entityId: "NT2", startDate: null, endDate: null },
        { playerId: "C", entityId: "NT2", startDate: null, endDate: null },
        { playerId: "C", entityId: "CLUB", startDate: "2020-01-01", endDate: "2022-01-01" },
        { playerId: "T", entityId: "CLUB", startDate: "2020-06-01", endDate: "2021-06-01" },
      ],
    };
    const g = new AffiliationGraph(data);

    // Chain: A at NT1. Exclusions: players={A}, entities={NT1}.
    // T→CLUB→C (allowed, cost 0): dist[C]=0.
    // C→NT2→B (allowed, cost 1): dist[B]=1.
    // B→NT1→A (blocked — NT1 excluded).
    // Teammates of A through NT1: B. dist[B]=1, budget=0 → needs_more_hops.
    const chain: import("./deadEnds").ChainNodeLike[] = [
      { type: "player", id: "A" },
      { type: "entity", id: "NT1" },
    ];
    const options = getTeammateOptions(g, "A", "NT1", "T", chain, 0);
    const bOpt = options.find((o) => o.player.id === "B")!;
    expect(bOpt.reachability).toBe("needs_more_hops");
    expect(bOpt.isDeadEnd).toBe(true);

    // With budget=1: B needs 1 NT hop → viable
    const options1 = getTeammateOptions(g, "A", "NT1", "T", chain, 1);
    expect(options1.find((o) => o.player.id === "B")?.reachability).toBe("viable");
    expect(options1.find((o) => o.player.id === "B")?.isDeadEnd).toBe(false);
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
