/**
 * Tunable progressive-difficulty constants for puzzle generation.
 *
 * Fame tiers are ranked by peak market value (primary), then international
 * caps (tiebreak). Bucket sizes are based on the ~1000-player pool:
 *   - famous: top 100  (~€80M+ peak) — household names
 *   - known:  next 300 (~€45–80M) — recognizable pros
 *   - deep:   remaining ~600 (~€25–45M) — solid but less famous
 *
 * Level bands ramp gradually rather than hard-switching pools.
 */

import type { Player } from "./types";

/** Rank-based fame buckets (counts from the top of the notability sort). */
export const FAME_TIER = {
  FAMOUS_COUNT: 100,
  KNOWN_COUNT: 300,
} as const;

export type FameTierName = "famous" | "known" | "deep";

/** Level thresholds and generation budgets — tune after playtesting. */
export const DIFFICULTY = {
  /** Levels 1..EARLY_MAX_LEVEL: famous×famous, minHops 2. */
  EARLY_MAX_LEVEL: 3,
  /** Levels EARLY+1..MID_MAX_LEVEL: widen to known; prefer 3-hop then fall back. */
  MID_MAX_LEVEL: 7,
  /** Levels MID+1 and up: deep pool weight grows; minHops 3 required. */

  EARLY_MIN_HOPS: 2,
  EARLY_MAX_ATTEMPTS: 500,

  MID_MIN_HOPS: 2,
  MID_PREFERRED_HOPS: 3,
  /** Attempts spent hunting a preferred (harder) hop length before fallback. */
  MID_PREFERRED_ATTEMPTS: 250,
  MID_FALLBACK_ATTEMPTS: 500,

  HIGH_MIN_HOPS: 3,
  /** 3-hop pairs are ~1.2% of random draws — need a large budget. */
  HIGH_MAX_ATTEMPTS: 8000,

  /**
   * At mid levels, probability an endpoint is drawn from "known" (else famous).
   * Interpolated from MID_KNOWN_WEIGHT_AT_START → MID_KNOWN_WEIGHT_AT_END.
   */
  MID_KNOWN_WEIGHT_AT_START: 0.2,
  MID_KNOWN_WEIGHT_AT_END: 0.65,

  /**
   * At high levels, probability an endpoint is drawn from "deep".
   * Interpolated over HIGH_DEEP_RAMP_LEVELS starting at MID_MAX_LEVEL+1.
   */
  HIGH_DEEP_WEIGHT_AT_START: 0.25,
  HIGH_DEEP_WEIGHT_AT_END: 0.8,
  HIGH_DEEP_RAMP_LEVELS: 10,
  /** Of the non-deep remainder at high levels, share that goes to famous (rest known). */
  HIGH_FAMOUS_SHARE_OF_REMAINDER: 0.25,
} as const;

export interface FameTiers {
  byId: Map<string, FameTierName>;
  pools: Record<FameTierName, string[]>;
}

/** Peak market value, falling back to international caps when MV is missing/zero. */
export function notabilityScore(player: Player): number {
  const mv = player.highestMarketValue ?? 0;
  if (mv > 0) return mv;
  return player.internationalCaps ?? 0;
}

export function buildFameTiers(players: Iterable<Player>): FameTiers {
  const ranked = [...players].sort((a, b) => {
    const diff = notabilityScore(b) - notabilityScore(a);
    if (diff !== 0) return diff;
    // Stable secondary: more caps, then id.
    const caps = (b.internationalCaps ?? 0) - (a.internationalCaps ?? 0);
    if (caps !== 0) return caps;
    return a.id.localeCompare(b.id);
  });

  const byId = new Map<string, FameTierName>();
  const pools: Record<FameTierName, string[]> = {
    famous: [],
    known: [],
    deep: [],
  };

  ranked.forEach((p, index) => {
    let tier: FameTierName;
    if (index < FAME_TIER.FAMOUS_COUNT) tier = "famous";
    else if (index < FAME_TIER.FAMOUS_COUNT + FAME_TIER.KNOWN_COUNT) tier = "known";
    else tier = "deep";
    byId.set(p.id, tier);
    pools[tier].push(p.id);
  });

  return { byId, pools };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

/** Tier draw weights for a single puzzle endpoint at `level`. */
export function tierWeightsForLevel(
  level: number,
): Record<FameTierName, number> {
  const L = Math.max(1, Math.floor(level));
  const { EARLY_MAX_LEVEL, MID_MAX_LEVEL } = DIFFICULTY;

  if (L <= EARLY_MAX_LEVEL) {
    return { famous: 1, known: 0, deep: 0 };
  }

  if (L <= MID_MAX_LEVEL) {
    const span = MID_MAX_LEVEL - EARLY_MAX_LEVEL;
    const t = span <= 0 ? 1 : (L - EARLY_MAX_LEVEL) / span;
    const known = lerp(
      DIFFICULTY.MID_KNOWN_WEIGHT_AT_START,
      DIFFICULTY.MID_KNOWN_WEIGHT_AT_END,
      t,
    );
    return { famous: 1 - known, known, deep: 0 };
  }

  const ramp = DIFFICULTY.HIGH_DEEP_RAMP_LEVELS;
  const t = ramp <= 0 ? 1 : (L - MID_MAX_LEVEL) / ramp;
  const deep = lerp(
    DIFFICULTY.HIGH_DEEP_WEIGHT_AT_START,
    DIFFICULTY.HIGH_DEEP_WEIGHT_AT_END,
    t,
  );
  const rem = 1 - deep;
  const famous = rem * DIFFICULTY.HIGH_FAMOUS_SHARE_OF_REMAINDER;
  const known = rem - famous;
  return { famous, known, deep };
}

export function pickTier(
  weights: Record<FameTierName, number>,
  random: () => number,
): FameTierName {
  const total = weights.famous + weights.known + weights.deep;
  if (total <= 0) return "famous";
  let r = random() * total;
  if (r < weights.famous) return "famous";
  r -= weights.famous;
  if (r < weights.known) return "known";
  return "deep";
}

export function pickPlayerIdFromTier(
  tiers: FameTiers,
  tier: FameTierName,
  random: () => number,
  avoidId?: string,
): string {
  const pool = tiers.pools[tier];
  if (pool.length === 0) {
    // Degenerate graph: fall through to any non-empty pool.
    for (const name of ["famous", "known", "deep"] as const) {
      if (tiers.pools[name].length > 0) {
        return pickPlayerIdFromTier(tiers, name, random, avoidId);
      }
    }
    throw new Error("pickPlayerIdFromTier: empty fame pools");
  }

  for (let i = 0; i < 20; i++) {
    const id = pool[Math.floor(random() * pool.length)];
    if (id !== avoidId) return id;
  }
  const fallback = pool.find((id) => id !== avoidId);
  if (!fallback) {
    throw new Error("pickPlayerIdFromTier: need at least 2 distinct players");
  }
  return fallback;
}
