/**
 * Level-vs-difficulty curve report.
 *
 * Generates many puzzles at levels 1 / 5 / 10 / 15 and prints hop-length
 * and fame-tier distributions so we can verify the ramp before UI polish.
 */

import { describe, expect, it } from "vitest";
import {
  DIFFICULTY,
  FAME_TIER,
  buildFameTiers,
  tierWeightsForLevel,
  type FameTierName,
} from "./difficulty";
import { loadGraph } from "./graph";
import { generateRandomPair } from "./pathfinding";

const g = loadGraph();
const fameTiers = buildFameTiers(g.players.values());

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

function emptyHopHist(): Record<number, number> {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
}

function emptyTierHist(): Record<FameTierName, number> {
  return { famous: 0, known: 0, deep: 0 };
}

describe("fame tiers", () => {
  it("buckets the 1000-player pool into famous / known / deep by rank", () => {
    expect(fameTiers.pools.famous).toHaveLength(FAME_TIER.FAMOUS_COUNT);
    expect(fameTiers.pools.known).toHaveLength(FAME_TIER.KNOWN_COUNT);
    expect(fameTiers.pools.deep).toHaveLength(
      g.players.size - FAME_TIER.FAMOUS_COUNT - FAME_TIER.KNOWN_COUNT,
    );
    expect(fameTiers.byId.size).toBe(g.players.size);
  });

  it("exposes progressive tier weights across level bands", () => {
    expect(tierWeightsForLevel(1).famous).toBe(1);
    expect(tierWeightsForLevel(1).known).toBe(0);
    expect(tierWeightsForLevel(1).deep).toBe(0);

    const mid = tierWeightsForLevel(5);
    expect(mid.deep).toBe(0);
    expect(mid.known).toBeGreaterThan(0);
    expect(mid.famous).toBeGreaterThan(0);

    const high = tierWeightsForLevel(10);
    expect(high.deep).toBeGreaterThan(0);
    expect(high.deep).toBeGreaterThan(mid.deep);
    expect(tierWeightsForLevel(15).deep).toBeGreaterThan(high.deep);
  });
});

describe("level difficulty curve", () => {
  it("ramps hop length and fame-tier mix across levels 1, 5, 10, 15", () => {
    const levels = [1, 5, 10, 15] as const;
    const samplesPerLevel = 40;
    const report: string[] = [];

    report.push("");
    report.push("=== Level vs difficulty distribution ===");
    report.push(
      `Fame buckets: famous=${FAME_TIER.FAMOUS_COUNT}, known=${FAME_TIER.KNOWN_COUNT}, ` +
        `deep=${fameTiers.pools.deep.length}`,
    );
    report.push(
      `Bands: early≤${DIFFICULTY.EARLY_MAX_LEVEL}, mid≤${DIFFICULTY.MID_MAX_LEVEL}, high≥${DIFFICULTY.MID_MAX_LEVEL + 1}`,
    );

    const summaries: Record<
      number,
      {
        hops: Record<number, number>;
        tiers: Record<FameTierName, number>;
        avgHops: number;
      }
    > = {};

    for (const level of levels) {
      const rng = mulberry32(1000 + level * 17);
      const hops = emptyHopHist();
      const tiers = emptyTierHist();
      let hopSum = 0;

      for (let i = 0; i < samplesPerLevel; i++) {
        const pair = generateRandomPair(g, {
          level,
          random: rng,
          fameTiers,
        });
        hops[pair.pathLength] = (hops[pair.pathLength] ?? 0) + 1;
        hopSum += pair.pathLength;

        const startTier = fameTiers.byId.get(pair.startPlayerId)!;
        const targetTier = fameTiers.byId.get(pair.targetPlayerId)!;
        tiers[startTier]++;
        tiers[targetTier]++;
      }

      const avgHops = hopSum / samplesPerLevel;
      summaries[level] = { hops, tiers, avgHops };

      const hopParts = Object.entries(hops)
        .filter(([, n]) => n > 0)
        .map(([h, n]) => `${h}h=${n} (${((100 * n) / samplesPerLevel).toFixed(0)}%)`)
        .join(", ");
      const endpointN = samplesPerLevel * 2;
      const tierParts = (["famous", "known", "deep"] as const)
        .map(
          (t) =>
            `${t}=${tiers[t]} (${((100 * tiers[t]) / endpointN).toFixed(0)}%)`,
        )
        .join(", ");

      report.push("");
      report.push(
        `Level ${level} (n=${samplesPerLevel})  avgHops=${avgHops.toFixed(2)}  weights=${JSON.stringify(tierWeightsForLevel(level))}`,
      );
      report.push(`  hops: ${hopParts}`);
      report.push(`  endpoint tiers: ${tierParts}`);
    }

    // Soft structural expectations — the printed report is the main deliverable.
    expect(summaries[1].tiers.deep).toBe(0);
    expect(summaries[1].tiers.famous).toBe(samplesPerLevel * 2);
    expect(summaries[1].avgHops).toBeGreaterThanOrEqual(2);
    expect(summaries[1].hops[2] + (summaries[1].hops[3] ?? 0)).toBe(
      samplesPerLevel,
    );

    expect(summaries[5].tiers.known).toBeGreaterThan(0);
    expect(summaries[5].tiers.deep).toBe(0);

    expect(summaries[10].avgHops).toBeGreaterThanOrEqual(3);
    expect(summaries[10].hops[3] + (summaries[10].hops[4] ?? 0)).toBe(
      samplesPerLevel,
    );
    expect(summaries[10].tiers.deep).toBeGreaterThan(0);

    expect(summaries[15].avgHops).toBeGreaterThanOrEqual(3);
    expect(summaries[15].tiers.deep).toBeGreaterThan(summaries[10].tiers.deep);

    // eslint-disable-next-line no-console
    console.log(report.join("\n"));
  }, 120_000);
});
