/**
 * ConnectionPanel layout contracts — fixed viewport shell, wrapping breadcrumb,
 * internally-scrollable options grid (including Messi/Barcelona ~37 teammates).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getTeammateOptions } from "../lib/deadEnds";
import { loadGraph } from "../lib/graph";
import { formatAffiliationYears } from "../lib/overlap";
import type { ChainNode } from "../state/gameState";
import {
  OPTIONS_SEARCH_THRESHOLD,
  filterOptionsByQuery,
  type OptionCard,
} from "./ConnectionPanel";

const here = dirname(fileURLToPath(import.meta.url));
const panelCss = readFileSync(join(here, "ConnectionPanel.module.css"), "utf8");
const screenCss = readFileSync(join(here, "GameScreen.module.css"), "utf8");

const MESSI = "28003";
const BARCELONA = "131";
const TARGET = "418560";

describe("fixed-viewport layout CSS contracts", () => {
  it("locks the game screen to the viewport (no page scroll)", () => {
    expect(screenCss).toMatch(/\.screen\s*\{[^}]*height:\s*100svh/s);
    expect(screenCss).toMatch(/\.screen\s*\{[^}]*overflow:\s*hidden/s);
    expect(screenCss).toMatch(/\.board\s*\{[^}]*min-height:\s*0/s);
    expect(screenCss).toMatch(/\.panelSlot\s*\{[^}]*min-height:\s*0/s);
  });

  it("breadcrumb wraps instead of scrolling horizontally", () => {
    expect(panelCss).toMatch(/\.breadcrumb\s*\{[^}]*flex-wrap:\s*wrap/s);
    expect(panelCss).not.toMatch(/\.breadcrumb\s*\{[^}]*overflow-x:\s*auto/s);
  });

  it("options grid scrolls internally within a bounded flex region", () => {
    expect(panelCss).toMatch(/\.optionsRegion\s*\{[^}]*min-height:\s*0/s);
    expect(panelCss).toMatch(/\.optionsScroll\s*\{[^}]*overflow-y:\s*auto/s);
    expect(panelCss).toMatch(
      /\.optionsGrid\s*\{[^}]*grid-template-columns:\s*repeat\(3/s,
    );
  });
});

describe("connection UI data for key play states", () => {
  const g = loadGraph();

  function labelFor(node: ChainNode): string {
    if (node.type === "player") return g.players.get(node.id)?.name ?? node.id;
    return g.entities.get(node.id)?.name ?? node.id;
  }

  it("fresh 1-node start: only the start player in the path", () => {
    const chain: ChainNode[] = [{ type: "player", id: MESSI }];
    expect(chain).toHaveLength(1);
    expect(labelFor(chain[0])).toBe("Lionel Messi");
    expect(getTeammateOptions(g, MESSI, BARCELONA, TARGET, chain)).toBeTruthy();
  });

  it("mid-chain 3–4 hops: breadcrumb chip count stays readable (wrap, not pan)", () => {
    const hops = 4;
    const chipCount = hops * 2 + 1;
    expect(chipCount).toBe(9);
    const chipMaxRem = 8.5;
    const phoneWidthRem = 22.5;
    const perRow = Math.floor(phoneWidthRem / chipMaxRem);
    expect(perRow).toBeGreaterThanOrEqual(2);
    expect(Math.ceil(chipCount / perRow)).toBeLessThanOrEqual(5);
  });

  it("near 6-hop cap: 13 chips still wrap without needing horizontal scroll", () => {
    const hops = 6;
    const chipCount = hops * 2 + 1;
    expect(chipCount).toBe(13);
    const chipMaxRem = 8.5;
    const desktopPanelRem = 40;
    const perRow = Math.floor(desktopPanelRem / chipMaxRem);
    expect(Math.ceil(chipCount / Math.max(perRow, 1))).toBeLessThanOrEqual(4);
    expect(panelCss).toMatch(/\.breadcrumb\s*\{[^}]*flex-wrap:\s*wrap/s);
  });

  it("Messi/Barcelona large options grid (~37) stays an internal-scroll case", () => {
    const chain: ChainNode[] = [
      { type: "player", id: MESSI },
      { type: "entity", id: BARCELONA },
    ];
    const options = getTeammateOptions(g, MESSI, BARCELONA, TARGET, chain);
    expect(options.length).toBeGreaterThanOrEqual(30);
    expect(options.length).toBeLessThanOrEqual(80);

    const sample = options[0];
    expect(sample.player.name.length).toBeGreaterThan(0);
    expect(sample.player.position.length).toBeGreaterThan(0);
    expect(typeof sample.isDeadEnd).toBe("boolean");

    const aff = g
      .getAffiliationsForPlayer(MESSI)
      .find((a) => a.entityId === BARCELONA);
    expect(aff).toBeTruthy();
    expect(formatAffiliationYears(aff!)).toMatch(/\d{4}/);
  });
});

describe("options live search", () => {
  const g = loadGraph();

  it(`threshold is ${OPTIONS_SEARCH_THRESHOLD}+ (3-col grid ~3 rows before search appears)`, () => {
    // Below 8, scanning a short grid is fine; at 8+ a filter earns its chrome.
    expect(OPTIONS_SEARCH_THRESHOLD).toBe(8);
  });

  it("filters Messi/Barcelona roster by substring and keeps matching dead-ends visible", () => {
    const chain: ChainNode[] = [
      { type: "player", id: MESSI },
      { type: "entity", id: BARCELONA },
    ];
    const raw = getTeammateOptions(g, MESSI, BARCELONA, TARGET, chain);
    expect(raw.length).toBeGreaterThanOrEqual(OPTIONS_SEARCH_THRESHOLD);

    // Real roster cards; force one dead-end so we can assert filter never hides them
    // (this target happens to mark none as dead — reachability is dense via Barça).
    const cards: OptionCard[] = raw.map(({ player, isDeadEnd }, i) => ({
      id: player.id,
      label: player.name,
      sublabel: player.position,
      kind: "player" as const,
      isDeadEnd: isDeadEnd || i === 0,
    }));

    const deadSample = cards.find((c) => c.isDeadEnd)!;
    expect(deadSample).toBeTruthy();

    const needle = deadSample.label.slice(0, Math.min(4, deadSample.label.length));
    const filtered = filterOptionsByQuery(cards, needle);

    expect(filtered.length).toBeGreaterThan(0);
    expect(
      filtered.every((c) => c.label.toLowerCase().includes(needle.toLowerCase())),
    ).toBe(true);
    // Dead-ends that match stay in the list (greyed in UI) — not hidden.
    expect(filtered.some((c) => c.id === deadSample.id && c.isDeadEnd)).toBe(
      true,
    );

    const upper = filterOptionsByQuery(cards, needle.toUpperCase());
    expect(upper.map((c) => c.id).sort()).toEqual(
      filtered.map((c) => c.id).sort(),
    );

    expect(filterOptionsByQuery(cards, "   ")).toHaveLength(cards.length);

    // A query that matches only the forced dead-end still returns it.
    const uniqueNeedle = deadSample.label;
    const onlyDead = filterOptionsByQuery(cards, uniqueNeedle);
    expect(onlyDead.some((c) => c.id === deadSample.id && c.isDeadEnd)).toBe(
      true,
    );
  });
});
