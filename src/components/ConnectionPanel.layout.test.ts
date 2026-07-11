/**
 * ConnectionPanel layout contracts — fixed viewport shell, horizontal
 * breadcrumb scroll, internally-scrollable options grid.
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
  NT_ANY_ERA_LABEL,
  OPTIONS_SEARCH_THRESHOLD,
  filterOptionsByQuery,
  type BreadcrumbChip,
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

  it("breadcrumb is a single horizontal scrolling row (no wrap)", () => {
    expect(panelCss).toMatch(/\.breadcrumb\s*\{[^}]*flex-wrap:\s*nowrap/s);
    expect(panelCss).toMatch(/\.breadcrumb\s*\{[^}]*overflow-x:\s*auto/s);
    expect(panelCss).not.toMatch(/\.breadcrumb\s*\{[^}]*flex-wrap:\s*wrap/s);
    expect(panelCss).toMatch(/\.crumbItem\s*\{[^}]*flex-shrink:\s*0/s);
    expect(panelCss).toMatch(/\.breadcrumbFade\s*\{/s);
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

  it("9-hop chain stays a single-row breadcrumb (19 chips) that must scroll, not wrap", () => {
    // Matches the Adam Webster → João Neves overflow case in the screenshot.
    const hops = 9;
    const chipCount = hops * 2 + 1;
    expect(chipCount).toBe(19);
    const chipApproxPx = 120;
    const phonePanelPx = 360;
    expect(chipCount * chipApproxPx).toBeGreaterThan(phonePanelPx);
    expect(panelCss).toMatch(/\.breadcrumb\s*\{[^}]*overflow-x:\s*auto/s);
    expect(panelCss).toMatch(/\.breadcrumb\s*\{[^}]*flex-wrap:\s*nowrap/s);
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

describe("national-team any-era cue", () => {
  it("exports a short in-system label (not a full sentence)", () => {
    expect(NT_ANY_ERA_LABEL).toBe("any era");
    expect(NT_ANY_ERA_LABEL.split(/\s+/).length).toBeLessThanOrEqual(3);
  });

  it("renders any-era on NT chips and year ranges on club chips (side by side)", () => {
    const panelSrc = readFileSync(join(here, "ConnectionPanel.tsx"), "utf8");
    expect(panelSrc).toMatch(/NT_ANY_ERA_LABEL/);
    expect(panelSrc).toMatch(/chip\.kind === "national_team"/);
    expect(panelSrc).toMatch(/chip\.years/);
    expect(panelSrc).toMatch(/styles\.chipMeta/);
    expect(panelSrc).toMatch(/styles\.chipYears/);
    expect(panelSrc).toMatch(/styles\.optionKind/);
    // Club years stay the timeline signal; NT uses the quiet any-era label.
    expect(panelCss).toMatch(/\.chipMeta\s*\{[^}]*font-family:\s*var\(--font-mono\)/s);
    expect(panelCss).toMatch(/\.chipYears\s*\{[^}]*font-family:\s*var\(--font-mono\)/s);
    expect(panelCss).toMatch(
      /\.chipMeta\s*\{[^}]*color:\s*color-mix\(in srgb,\s*var\(--beacon\)/s,
    );
  });

  it("keeps chip meta compact so any-era does not inflate locked chip sizing", () => {
    expect(panelCss).toMatch(/\.chip\s*\{[^}]*max-width:\s*8\.5rem/s);
    expect(panelCss).toMatch(/\.chipMeta\s*\{[^}]*font-size:\s*0\.5rem/s);
    expect(panelCss).toMatch(/\.optionKind\s*\{[^}]*font-size:\s*0\.55rem/s);

    const clubChip: BreadcrumbChip = {
      key: "club",
      label: "Atlético de Madrid",
      kind: "club",
      years: "2018–2021",
    };
    const ntChip: BreadcrumbChip = {
      key: "nt",
      label: "France",
      kind: "national_team",
    };
    // Parallel meta lines: club years vs NT any-era — both short mono cues.
    expect(clubChip.years).toMatch(/^\d{4}/);
    expect(ntChip.kind === "national_team" ? NT_ANY_ERA_LABEL : "").toBe(
      "any era",
    );
    expect(NT_ANY_ERA_LABEL.length).toBeLessThanOrEqual((clubChip.years ?? "").length + 2);
  });
});

describe("options live search", () => {
  const g = loadGraph();

  it(`threshold is ${OPTIONS_SEARCH_THRESHOLD}+ (3-col grid ~3 rows before search appears)`, () => {
    expect(OPTIONS_SEARCH_THRESHOLD).toBe(8);
  });

  it("filters Messi/Barcelona roster by substring and keeps matching dead-ends visible", () => {
    const chain: ChainNode[] = [
      { type: "player", id: MESSI },
      { type: "entity", id: BARCELONA },
    ];
    const raw = getTeammateOptions(g, MESSI, BARCELONA, TARGET, chain);
    expect(raw.length).toBeGreaterThanOrEqual(OPTIONS_SEARCH_THRESHOLD);

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
    expect(filtered.some((c) => c.id === deadSample.id && c.isDeadEnd)).toBe(
      true,
    );

    const upper = filterOptionsByQuery(cards, needle.toUpperCase());
    expect(upper.map((c) => c.id).sort()).toEqual(
      filtered.map((c) => c.id).sort(),
    );

    expect(filterOptionsByQuery(cards, "   ")).toHaveLength(cards.length);

    const uniqueNeedle = deadSample.label;
    const onlyDead = filterOptionsByQuery(cards, uniqueNeedle);
    expect(onlyDead.some((c) => c.id === deadSample.id && c.isDeadEnd)).toBe(
      true,
    );
  });
});
