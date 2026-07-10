import { describe, expect, it } from "vitest";
import { TenureGraph } from "./graph";
import { getClubOptions, getTeammateOptions } from "./deadEnds";
import type { GraphData } from "./types";

/**
 * Synthetic graph for dead-end tests:
 *
 *   A ----C1---- B          (B is a leaf: only ever at C1)
 *   |            |
 *   +----C1------+ C ----C2---- T
 *
 * From A at C1: teammate B cannot reach T once A is in the chain;
 * teammate C can still reach T via C2.
 * From A's clubs: C1 is dead (only B is viable teammate), C2 is alive.
 */
function deadEndFixture(): { graph: TenureGraph; ids: Record<string, string> } {
  const data: GraphData = {
    players: [
      { id: "A", name: "Alpha", position: "X", dob: null },
      { id: "B", name: "Bravo", position: "X", dob: null },
      { id: "C", name: "Charlie", position: "X", dob: null },
      { id: "T", name: "Target", position: "X", dob: null },
    ],
    clubs: [
      { id: "C1", name: "Club One", country: "" },
      { id: "C2", name: "Club Two", country: "" },
    ],
    tenures: [
      { playerId: "A", clubId: "C1", startDate: "2010-01-01", endDate: "2015-01-01" },
      { playerId: "A", clubId: "C2", startDate: "2010-01-01", endDate: "2015-01-01" },
      { playerId: "B", clubId: "C1", startDate: "2010-01-01", endDate: "2015-01-01" },
      { playerId: "C", clubId: "C1", startDate: "2010-01-01", endDate: "2015-01-01" },
      { playerId: "C", clubId: "C2", startDate: "2010-01-01", endDate: "2015-01-01" },
      { playerId: "T", clubId: "C2", startDate: "2010-01-01", endDate: "2015-01-01" },
    ],
  };
  return { graph: new TenureGraph(data), ids: { A: "A", B: "B", C: "C", T: "T", C1: "C1", C2: "C2" } };
}

describe("dead-end detection", () => {
  const { graph, ids } = deadEndFixture();
  const chain = [{ type: "player" as const, id: ids.A }];

  it("flags a leaf teammate who cannot reach the target", () => {
    const chainAtClub = [
      { type: "player" as const, id: ids.A },
      { type: "club" as const, id: ids.C1 },
    ];
    const options = getTeammateOptions(graph, ids.A, ids.C1, ids.T, chainAtClub);
    const b = options.find((o) => o.player.id === ids.B);
    const c = options.find((o) => o.player.id === ids.C);
    expect(b?.isDeadEnd).toBe(true);
    expect(c?.isDeadEnd).toBe(false);
  });

  it("flags a club when every teammate through it is a dead end", () => {
    const onlyDead: GraphData = {
      players: [
        { id: "A", name: "Alpha", position: "X", dob: null },
        { id: "B", name: "Bravo", position: "X", dob: null },
        { id: "T", name: "Target", position: "X", dob: null },
      ],
      clubs: [
        { id: "Cdead", name: "Dead Club", country: "" },
        { id: "Ctarget", name: "Target Club", country: "" },
      ],
      tenures: [
        { playerId: "A", clubId: "Cdead", startDate: "2010-01-01", endDate: "2015-01-01" },
        { playerId: "B", clubId: "Cdead", startDate: "2010-01-01", endDate: "2015-01-01" },
        { playerId: "T", clubId: "Ctarget", startDate: "2010-01-01", endDate: "2015-01-01" },
      ],
    };
    const g = new TenureGraph(onlyDead);
    const options = getClubOptions(g, "A", "T", [{ type: "player", id: "A" }]);
    expect(options.find((o) => o.club.id === "Cdead")?.isDeadEnd).toBe(true);
  });

  it("keeps a club alive when at least one teammate can still reach the target", () => {
    const options = getClubOptions(graph, ids.A, ids.T, chain);
    const c1 = options.find((o) => o.club.id === ids.C1);
    const c2 = options.find((o) => o.club.id === ids.C2);
    expect(c1?.isDeadEnd).toBe(false); // C at C1 can still reach T
    expect(c2?.isDeadEnd).toBe(false);
  });

  it("marks an already-used club as dead end", () => {
    const usedChain = [
      { type: "player" as const, id: ids.A },
      { type: "club" as const, id: ids.C2 },
    ];
    const options = getClubOptions(graph, ids.C, ids.T, usedChain);
    const c2 = options.find((o) => o.club.id === ids.C2);
    expect(c2?.isDeadEnd).toBe(true);
  });

  it("never marks the target as a dead-end teammate", () => {
    // Put A on C2 with T so T appears in the teammates list.
    const options = getTeammateOptions(graph, ids.C, ids.C2, ids.T, [
      { type: "player", id: ids.C },
      { type: "club", id: ids.C2 },
    ]);
    const t = options.find((o) => o.player.id === ids.T);
    expect(t?.isDeadEnd).toBe(false);
  });
});

describe("dead-end detection performance", () => {
  it("Messi/Barcelona 37-teammate case completes under 50ms", async () => {
    const { loadGraph } = await import("./graph");
    const { clearReachabilityCache } = await import("./deadEnds");
    const g = loadGraph(); // warms adjacency
    clearReachabilityCache(g);

    const messi = "28003";
    const barcelona = "131";
    const teammates = g.getTeammates(messi, barcelona);
    const chain = [
      { type: "player" as const, id: messi },
      { type: "club" as const, id: barcelona },
    ];
    const target = "418560"; // Haaland

    // Warm-up JIT, then measure a fresh (uncached) reachability pass.
    clearReachabilityCache(g);
    const t0 = performance.now();
    const options = getTeammateOptions(g, messi, barcelona, target, chain);
    const elapsed = performance.now() - t0;

    // Cached repeat should be near-instant (lookup only).
    const t1 = performance.now();
    getTeammateOptions(g, messi, barcelona, target, chain);
    const cachedElapsed = performance.now() - t1;

    console.log(
      `[dead-end perf] ${teammates.length} teammates: ` +
        `first=${elapsed.toFixed(1)}ms, cached=${cachedElapsed.toFixed(1)}ms`,
    );
    expect(options).toHaveLength(teammates.length);
    expect(elapsed).toBeLessThan(50);
  });
});
