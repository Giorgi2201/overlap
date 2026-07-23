import { describe, it } from "vitest";
import { writeFileSync } from "node:fs";
import { loadGraph } from "./graph";
import {
  MAX_HOPS,
  findClubOnlyPath,
  findShortestPath,
  generateRandomPair,
} from "./pathfinding";

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

describe("hop distribution (mixed + club-only guarantee)", () => {
  it("reports raw hops, club-only rejection rate, and generation cost", {
    timeout: 180_000,
  }, () => {
    const g = loadGraph();
    const rng = mulberry32(1234);
    const ids = [...g.players.keys()];

    const raw = new Map<string, number>();
    let bfsMs = 0;
    let mixedOk = 0;
    let clubOnlyMissing = 0;
    for (let i = 0; i < 500; ) {
      const a = ids[Math.floor(rng() * ids.length)];
      const b = ids[Math.floor(rng() * ids.length)];
      if (a === b) continue;
      i++;
      const t0 = performance.now();
      const path = findShortestPath(a, b, g, MAX_HOPS);
      bfsMs += performance.now() - t0;
      const key = path === null ? "unreachable" : String(path.length - 1);
      raw.set(key, (raw.get(key) ?? 0) + 1);
      if (path) {
        mixedOk++;
        if (findClubOnlyPath(a, b, g, MAX_HOPS) === null) clubOnlyMissing++;
      }
    }

    function sampleFiltered(minHops: number, n = 100) {
      const h = new Map<number, number>();
      let tries = 0;
      let found = 0;
      let rejectedNoClubOnly = 0;
      const r = mulberry32(200 + minHops);
      const t0 = performance.now();
      while (found < n && tries < 50_000) {
        tries++;
        const a = ids[Math.floor(r() * ids.length)];
        const b = ids[Math.floor(r() * ids.length)];
        if (a === b) continue;
        const path = findShortestPath(a, b, g, MAX_HOPS);
        if (!path) continue;
        const len = path.length - 1;
        if (len < minHops) continue;
        if (findClubOnlyPath(a, b, g, MAX_HOPS) === null) {
          rejectedNoClubOnly++;
          continue;
        }
        h.set(len, (h.get(len) ?? 0) + 1);
        found++;
      }
      return {
        dist: Object.fromEntries([...h.entries()].sort()),
        found,
        tries,
        rejectedNoClubOnly,
        successRate: Number((found / tries).toFixed(4)),
        elapsedMs: performance.now() - t0,
      };
    }

    // Measure generateRandomPair attempt pressure via seeded runs.
    const genRng = mulberry32(99);
    const genT0 = performance.now();
    let genOk = 0;
    for (let i = 0; i < 100; i++) {
      generateRandomPair(g, { random: genRng, minHops: 2 });
      genOk++;
    }
    const genElapsedMs = performance.now() - genT0;

    const report = {
      rule: "mixed (club dated + NT any) + generateRandomPair requires club-only path",
      rawPairs500: Object.fromEntries([...raw.entries()].sort()),
      avgBfsMs: Number((bfsMs / 500).toFixed(3)),
      clubOnlyRejection: {
        mixedReachableIn500: mixedOk,
        missingClubOnlyPath: clubOnlyMissing,
        rateAmongMixedReachable: Number(
          (clubOnlyMissing / Math.max(mixedOk, 1)).toFixed(4),
        ),
      },
      puzzles100_minHops2: sampleFiltered(2),
      puzzles100_minHops3: sampleFiltered(3),
      puzzles100_minHops4: sampleFiltered(4),
      generateRandomPair100_minHops2: {
        found: genOk,
        elapsedMs: Number(genElapsedMs.toFixed(1)),
        avgMsPerPair: Number((genElapsedMs / genOk).toFixed(2)),
      },
      previousPrompt18: {
        rawPairs500: { "1": 45, "2": 409, "3": 46 },
        puzzles100_minHops2_successRate: 0.9091,
        puzzles100_minHops3_successRate: 0.0898,
      },
    };

    console.log(JSON.stringify(report, null, 2));
    writeFileSync("hop-distribution.json", JSON.stringify(report, null, 2));
  });
});
