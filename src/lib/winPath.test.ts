/**
 * Shortest-path win reveal — optimal vs longer player chains.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadGraph } from "./graph";
import { findShortestPath, hasDirectLink } from "./pathfinding";
import {
  buildWinPathReveal,
  pathHopCount,
  pathStepsToChips,
  playerHopCount,
} from "./winPath";
import type { ChainNode } from "../state/gameState";

const MESSI = "28003";
const SUAREZ = "44352";
const BARCELONA = "131";
const GRIEZMANN = "125781";
const LEMAR = "205562";
const ATLETICO = "13";
const HAALAND = "418560";
const ODEGAARD = "316264";
const NORWAY = "3440";

const g = loadGraph();

const here = dirname(fileURLToPath(import.meta.url));
const screenCss = readFileSync(
  join(here, "../components/GameScreen.module.css"),
  "utf8",
);

describe("buildWinPathReveal — optimal path", () => {
  it("marks Messi→Suárez (1-hop Barcelona) as optimal with no chip reveal", () => {
    expect(hasDirectLink(g, MESSI, SUAREZ)).toBe(true);
    const shortest = findShortestPath(MESSI, SUAREZ, g)!;
    expect(pathHopCount(shortest)).toBe(1);
    expect(shortest[0].entityId).toBe(BARCELONA);

    const chain: ChainNode[] = [
      { type: "player", id: MESSI },
      { type: "entity", id: BARCELONA },
      { type: "player", id: SUAREZ },
    ];
    const reveal = buildWinPathReveal(g, MESSI, SUAREZ, chain);
    expect(reveal).toEqual({ kind: "optimal", hops: 1 });
  });

  it("marks Haaland→Ødegaard (1-hop Norway, any-era) as optimal", () => {
    const chain: ChainNode[] = [
      { type: "player", id: HAALAND },
      { type: "entity", id: NORWAY },
      { type: "player", id: ODEGAARD },
    ];
    const reveal = buildWinPathReveal(g, HAALAND, ODEGAARD, chain);
    expect(reveal).toEqual({ kind: "optimal", hops: 1 });
  });
});

describe("buildWinPathReveal — longer than optimal", () => {
  it("reveals the 1-hop shortest when the player took a 2-hop Barça detour", () => {
    // Hand-checked: Messi–Suárez is direct via Barcelona.
    // Detour: Messi → Barça → midfielder who also overlapped Suárez there → Barça → Suárez.
    const mid = g
      .getTeammates(MESSI, BARCELONA)
      .find(
        (p) =>
          p.id !== SUAREZ &&
          g.getTeammates(p.id, BARCELONA).some((m) => m.id === SUAREZ),
      );
    expect(mid).toBeTruthy();

    const longChain: ChainNode[] = [
      { type: "player", id: MESSI },
      { type: "entity", id: BARCELONA },
      { type: "player", id: mid!.id },
      { type: "entity", id: BARCELONA },
      { type: "player", id: SUAREZ },
    ];
    expect(playerHopCount(longChain)).toBe(2);

    const reveal = buildWinPathReveal(g, MESSI, SUAREZ, longChain);
    expect(reveal.kind).toBe("shorter_exists");
    if (reveal.kind !== "shorter_exists") return;

    expect(reveal.playerHops).toBe(2);
    expect(reveal.shortestHops).toBe(1);
    expect(reveal.chips).toHaveLength(3); // player › entity › player
    expect(reveal.chips[0].kind).toBe("player");
    expect(reveal.chips[0].label).toBe("Lionel Messi");
    expect(reveal.chips[1].kind).toBe("club");
    expect(reveal.chips[1].label).toMatch(/Barcelona/i);
    expect(reveal.chips[1].years).toMatch(/\d{4}/);
    expect(reveal.chips[2].label).toMatch(/Suárez|Suarez/);

    // Chips match findShortestPath reconstruction.
    const shortest = findShortestPath(MESSI, SUAREZ, g)!;
    expect(reveal.chips.map((c) => c.label)).toEqual(
      pathStepsToChips(g, shortest).map((c) => c.label),
    );
  });

  it("preserves national-team kind on shortest-path chips", () => {
    // Force a longer chain that still ends at Ødegaard, then check NT meta kind
    // on the true shortest (Norway) when revealed.
    const mid = g
      .getTeammates(HAALAND, NORWAY)
      .find(
        (p) =>
          p.id !== ODEGAARD &&
          g.getTeammates(p.id, NORWAY).some((m) => m.id === ODEGAARD),
      );
    expect(mid).toBeTruthy();

    const longChain: ChainNode[] = [
      { type: "player", id: HAALAND },
      { type: "entity", id: NORWAY },
      { type: "player", id: mid!.id },
      { type: "entity", id: NORWAY },
      { type: "player", id: ODEGAARD },
    ];
    const reveal = buildWinPathReveal(g, HAALAND, ODEGAARD, longChain);
    expect(reveal.kind).toBe("shorter_exists");
    if (reveal.kind !== "shorter_exists") return;
    expect(reveal.shortestHops).toBe(1);
    expect(reveal.chips[1].kind).toBe("national_team");
    expect(reveal.chips[1].label).toBe("Norway");
    expect(reveal.chips[1].years == null || reveal.chips[1].years === null).toBe(
      true,
    );
  });
});

describe("pathStepsToChips club vs NT distinction", () => {
  it("puts years on club hops and not on NT hops", () => {
    const clubPath = findShortestPath(GRIEZMANN, LEMAR, g)!;
    expect(clubPath[0].entityId).toBe(ATLETICO);
    const clubChips = pathStepsToChips(g, clubPath);
    expect(clubChips[1].kind).toBe("club");
    expect(clubChips[1].years).toMatch(/\d{4}/);

    const ntPath = findShortestPath(HAALAND, ODEGAARD, g)!;
    const ntChips = pathStepsToChips(g, ntPath);
    expect(ntChips[1].kind).toBe("national_team");
    expect(ntChips[1].years ?? null).toBeNull();
  });
});

describe("win screen layout contracts", () => {
  it("keeps the reveal compact and horizontally scrollable (no page scroll)", () => {
    expect(screenCss).toMatch(/\.screen\s*\{[^}]*overflow:\s*hidden/s);
    expect(screenCss).toMatch(/\.win\s*\{[^}]*flex-shrink:\s*0/s);
    expect(screenCss).toMatch(/\.shortestChips\s*\{[^}]*overflow-x:\s*auto/s);
    expect(screenCss).toMatch(/\.shortestLabel\s*\{/s);
    expect(screenCss).toMatch(/\.primaryBtn\s*\{/s);
  });
});
