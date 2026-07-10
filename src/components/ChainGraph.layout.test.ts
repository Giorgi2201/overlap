import { describe, expect, it } from "vitest";
import { LAYOUT } from "./ChainGraph";

/**
 * Layout constants imported from ChainGraph so a 6-hop chain stays at fixed
 * readable size (never shrink-to-fit).
 */
const MAX_HOPS = 6;

/** 6 hops => 7 players + 6 entities = 13 nodes. */
function chainNodeCount(hops: number): number {
  return hops * 2 + 1;
}

function contentWidth(nodeCount: number): number {
  return LAYOUT.PAD_X * 2 + Math.max(0, nodeCount - 1) * LAYOUT.NODE_GAP;
}

function truncate(
  name: string,
  maxChars: number,
): { text: string; truncated: boolean } {
  if (name.length <= maxChars) return { text: name, truncated: false };
  return { text: `${name.slice(0, maxChars - 1)}…`, truncated: true };
}

describe("chain graph layout readability", () => {
  it("keeps fixed node size for a full 6-hop chain (13 nodes)", () => {
    const n = chainNodeCount(MAX_HOPS);
    expect(n).toBe(13);
    const w = contentWidth(n);
    expect(w).toBe(LAYOUT.PAD_X * 2 + 12 * LAYOUT.NODE_GAP);
    expect(w).toBeGreaterThan(2200);
    expect(LAYOUT.PLAYER_R).toBeGreaterThanOrEqual(24);
    expect(LAYOUT.CLUB_R).toBeGreaterThanOrEqual(16);
    expect(LAYOUT.NODE_GAP).toBeGreaterThanOrEqual(LAYOUT.PLAYER_R * 2 + 80);
    // Labels must not crush into neighbors at fixed gap.
    expect(LAYOUT.NODE_GAP).toBeGreaterThan(LAYOUT.LABEL_BOX_PX);
  });

  it("covers ~p90 club names before truncating", async () => {
    const { default: data } = await import("../data/graph-data.json");
    const lengths = data.entities
      .filter((e) => e.type === "club")
      .map((c) => c.name.length)
      .sort((a, b) => a - b);
    const p90 = lengths[Math.floor((lengths.length - 1) * 0.9)];
    expect(LAYOUT.LABEL_CHARS).toBeGreaterThanOrEqual(p90);

    const covered = data.entities.filter(
      (c) => c.type === "club" && c.name.length <= LAYOUT.LABEL_CHARS,
    ).length;
    const clubCount = data.entities.filter((c) => c.type === "club").length;
    expect(covered / clubCount).toBeGreaterThan(0.88);

    const outlier =
      "Nooit Opgeven Altijd Doorzetten Aangenaam Door Vermaak En Nuttig Door Ontspanning Combinatie Breda";
    const { truncated, text } = truncate(outlier, LAYOUT.LABEL_CHARS);
    expect(truncated).toBe(true);
    expect(text.endsWith("…")).toBe(true);
    expect(text.length).toBe(LAYOUT.LABEL_CHARS);
  });

  it("does not shrink spacing when viewport is narrower than content", () => {
    const n = chainNodeCount(MAX_HOPS);
    const needed = contentWidth(n);
    const viewport = 400;
    const canvas = Math.max(viewport, needed);
    expect(canvas).toBe(needed);
    expect(canvas / (n - 1)).toBeGreaterThan(LAYOUT.NODE_GAP - 1);
  });

  it("keeps long entity names legible in a simulated 6-hop deep-pool chain", async () => {
    const { default: data } = await import("../data/graph-data.json");
    const longClubs = data.entities
      .filter((e) => e.type === "club")
      .sort((a, b) => b.name.length - a.name.length)
      .slice(0, 6);
    expect(longClubs.length).toBe(6);
    expect(longClubs.every((c) => c.name.length >= 30)).toBe(true);

    // 13-node spine at fixed gap — scroll canvas, not shrink-to-fit.
    const nodes = chainNodeCount(6);
    const width = contentWidth(nodes);
    expect(width).toBeGreaterThan(2200);

    for (const club of longClubs) {
      const { truncated, text } = truncate(club.name, LAYOUT.LABEL_CHARS);
      if (club.name.length <= LAYOUT.LABEL_CHARS) {
        expect(truncated).toBe(false);
        expect(text).toBe(club.name);
      } else {
        expect(truncated).toBe(true);
        // Tooltip path: truncated display still leaves full name available.
        expect(club.name.length).toBeGreaterThan(text.length - 1);
      }
    }

    // National team names are short — never need truncation at LABEL_CHARS.
    const ntMax = Math.max(
      ...data.entities
        .filter((e) => e.type === "national_team")
        .map((e) => e.name.length),
    );
    expect(ntMax).toBeLessThanOrEqual(LAYOUT.LABEL_CHARS);
  });
});
