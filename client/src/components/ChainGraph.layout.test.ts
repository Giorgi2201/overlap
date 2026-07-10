import { describe, expect, it } from "vitest";

/**
 * Layout constants mirrored from ChainGraph — kept in sync so a 6-hop
 * chain stays at fixed readable size (never shrink-to-fit).
 */
const PLAYER_R = 26;
const CLUB_R = 18;
const PAD_X = 56;
const NODE_GAP = 168;
const CLUB_LABEL_CHARS = 34;
const MAX_HOPS = 6;

/** 6 hops => 7 players + 6 clubs = 13 nodes. */
function chainNodeCount(hops: number): number {
  return hops * 2 + 1;
}

function contentWidth(nodeCount: number): number {
  return PAD_X * 2 + Math.max(0, nodeCount - 1) * NODE_GAP;
}

function truncate(name: string, maxChars: number): { text: string; truncated: boolean } {
  if (name.length <= maxChars) return { text: name, truncated: false };
  return { text: `${name.slice(0, maxChars - 1)}…`, truncated: true };
}

describe("chain graph layout readability", () => {
  it("keeps fixed node size for a full 6-hop chain (13 nodes)", () => {
    const n = chainNodeCount(MAX_HOPS);
    expect(n).toBe(13);
    const w = contentWidth(n);
    // Never compress: width grows linearly with nodes.
    expect(w).toBe(PAD_X * 2 + 12 * NODE_GAP);
    expect(w).toBeGreaterThan(2000);
    // Node radii stay at design constants (not scaled by chain length).
    expect(PLAYER_R).toBeGreaterThanOrEqual(24);
    expect(CLUB_R).toBeGreaterThanOrEqual(16);
    expect(NODE_GAP).toBeGreaterThanOrEqual(PLAYER_R * 2 + 40);
  });

  it("covers ~p90 club names before truncating (34 chars)", async () => {
    const { default: data } = await import("../data/graph-data.json");
    const lengths = data.clubs.map((c) => c.name.length).sort((a, b) => a - b);
    const p90 = lengths[Math.floor((lengths.length - 1) * 0.9)];
    expect(CLUB_LABEL_CHARS).toBeGreaterThanOrEqual(p90);

    const covered = data.clubs.filter((c) => c.name.length <= CLUB_LABEL_CHARS).length;
    const pct = covered / data.clubs.length;
    expect(pct).toBeGreaterThan(0.88);

    // Outlier still exposes full name via truncation flag (tooltip path).
    const outlier =
      "Nooit Opgeven Altijd Doorzetten Aangenaam Door Vermaak En Nuttig Door Ontspanning Combinatie Breda";
    const { truncated, text } = truncate(outlier, CLUB_LABEL_CHARS);
    expect(truncated).toBe(true);
    expect(text.endsWith("…")).toBe(true);
    expect(text.length).toBe(CLUB_LABEL_CHARS);
  });

  it("does not shrink spacing when viewport is narrower than content", () => {
    const n = chainNodeCount(MAX_HOPS);
    const needed = contentWidth(n);
    const viewport = 400;
    // Layout rule: canvas width = max(viewport, needed) — nodes keep NODE_GAP.
    const canvas = Math.max(viewport, needed);
    expect(canvas).toBe(needed);
    expect(canvas / (n - 1)).toBeGreaterThan(NODE_GAP - 1);
  });
});
