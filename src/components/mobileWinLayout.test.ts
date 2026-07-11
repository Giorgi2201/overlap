/**
 * Layout contracts still in force after reverting the won-board collapse.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadGraph } from "../lib/graph";
import { buildWinPathReveal } from "../lib/winPath";
import type { ChainNode } from "../state/gameState";

const here = dirname(fileURLToPath(import.meta.url));
const cardSrc = readFileSync(join(here, "PlayerCard.tsx"), "utf8");
const cardCss = readFileSync(join(here, "PlayerCard.module.css"), "utf8");
const screenCss = readFileSync(join(here, "GameScreen.module.css"), "utf8");
const screenSrc = readFileSync(join(here, "GameScreen.tsx"), "utf8");
const panelCss = readFileSync(join(here, "ConnectionPanel.module.css"), "utf8");

const g = loadGraph();

const MESSI = "28003";
const SUAREZ = "44352";
const BARCELONA = "131";

describe("PlayerCard national-team height slot", () => {
  it("always renders an NT slot (empty placeholder when missing)", () => {
    expect(cardSrc).toMatch(/NationalTeamSlot/);
    expect(cardSrc).toMatch(/nationalTeamEmpty/);
    expect(cardCss).toMatch(/\.nationalTeamEmpty\s*\{[^}]*visibility:\s*hidden/s);
    expect(cardCss).toMatch(/\.nationalTeam\s*\{[^}]*min-height:/s);
  });
});

describe("won board layout (pre-collapse behavior)", () => {
  it("does not collapse the board or hide the options well on win", () => {
    expect(screenSrc).not.toMatch(/screenWon/);
    expect(screenCss).not.toMatch(/\.screenWon/);
    expect(panelCss).not.toMatch(/\.panelWon/);
    expect(screenCss).toMatch(/\.board\s*\{[^}]*flex:\s*1/s);
  });

  it("still computes optimal and shorter_exists reveals", () => {
    const optimalChain: ChainNode[] = [
      { type: "player", id: MESSI },
      { type: "entity", id: BARCELONA },
      { type: "player", id: SUAREZ },
    ];
    expect(buildWinPathReveal(g, MESSI, SUAREZ, optimalChain).kind).toBe(
      "optimal",
    );

    const mid = g
      .getTeammates(MESSI, BARCELONA)
      .find(
        (p) =>
          p.id !== SUAREZ &&
          g.getTeammates(p.id, BARCELONA).some((m) => m.id === SUAREZ),
      )!;
    const longChain: ChainNode[] = [
      { type: "player", id: MESSI },
      { type: "entity", id: BARCELONA },
      { type: "player", id: mid.id },
      { type: "entity", id: BARCELONA },
      { type: "player", id: SUAREZ },
    ];
    expect(buildWinPathReveal(g, MESSI, SUAREZ, longChain).kind).toBe(
      "shorter_exists",
    );
  });
});
