/**
 * Tests for the mixed connection rule: clubs need dated overlap;
 * national teams link by shared affiliation only.
 */

import { describe, expect, it } from "vitest";
import {
  MIN_OVERLAP_DAYS,
  affiliationsLink,
  clubAffiliationsOverlap,
  formatAffiliationYears,
  overlapDays,
  tenuresOverlap,
} from "./overlap";
import { loadGraph } from "./graph";
import type { Affiliation } from "./types";
import graphData from "../data/graph-data.json";

const RAMOS = "25557";
const BELLINGHAM = "581678";
const REAL_MADRID = "418";
const GRIEZMANN = "125781";
const LEMAR = "205562";
const ATLETICO = "13";
const HAALAND = "418560";
const ODEGAARD = "316264";
const NORWAY = "3440";
const MBAPPE = "342229";
const MESSI = "28003";
const SUAREZ = "44352";
const BARCELONA = "131";
const FABINHO = "225693";
const FALCAO = "39152";
const MONACO = "162";

const AS_OF = new Date(Date.UTC(2026, 6, 10)); // 2026-07-10

const g = loadGraph();

function aff(
  start: string | null,
  end: string | null,
  entityId = "X",
): Affiliation {
  return { playerId: "p", entityId, startDate: start, endDate: end };
}

describe("30-day club overlap boundaries (synthetic)", () => {
  const year = aff("2020-01-01", "2020-12-31");

  it("counts an intersection of exactly 30 days", () => {
    expect(clubAffiliationsOverlap(year, aff("2020-06-01", "2020-07-01"))).toBe(
      true,
    );
  });

  it("rejects an intersection of 29 days", () => {
    expect(clubAffiliationsOverlap(year, aff("2020-06-01", "2020-06-30"))).toBe(
      false,
    );
  });

  it("rejects identical dates at a different club", () => {
    expect(
      clubAffiliationsOverlap(year, aff("2020-01-01", "2020-12-31", "Y")),
    ).toBe(false);
  });

  it("compares open-ended tenures against the asOf date", () => {
    const a = aff("2020-01-01", null);
    const b = aff("2025-01-01", null);
    expect(tenuresOverlap(a, b, undefined, AS_OF)).toBe(true);
    expect(
      tenuresOverlap(a, b, undefined, new Date(Date.UTC(2025, 0, 15))),
    ).toBe(false);
  });

  it("returns non-positive overlapDays for disjoint ranges", () => {
    expect(
      overlapDays(aff("2010-01-01", "2011-01-01"), aff("2015-01-01", "2016-01-01")),
    ).toBeLessThanOrEqual(0);
  });
});

describe("affiliationsLink split by entity type", () => {
  it("requires dated overlap for clubs", () => {
    const a = aff("2010-01-01", "2015-01-01");
    const b = aff("2020-01-01", "2025-01-01");
    expect(affiliationsLink(a, b, "club")).toBe(false);
    expect(
      affiliationsLink(
        aff("2018-01-01", "2021-01-01"),
        aff("2019-01-01", "2022-01-01"),
        "club",
      ),
    ).toBe(true);
  });

  it("ignores dates for national teams (even when both undated)", () => {
    const a = aff(null, null);
    const b = aff(null, null);
    expect(affiliationsLink(a, b, "national_team")).toBe(true);
    // Disjoint "dates" would still pass for NT — we never look at them for NT.
    expect(
      affiliationsLink(
        aff("2000-01-01", "2001-01-01"),
        aff("2020-01-01", "2021-01-01"),
        "national_team",
      ),
    ).toBe(true);
  });

  it("still requires the same entityId for national teams", () => {
    expect(
      affiliationsLink(aff(null, null, "NT1"), aff(null, null, "NT2"), "national_team"),
    ).toBe(false);
  });
});

describe("formatAffiliationYears", () => {
  it("formats club ranges and returns null for undated NT rows", () => {
    expect(
      formatAffiliationYears({ startDate: "2018-07-01", endDate: "2021-06-30" }),
    ).toBe("2018–2021");
    expect(formatAffiliationYears({ startDate: "2023-07-01", endDate: null })).toBe(
      "2023–present",
    );
    expect(formatAffiliationYears({ startDate: null, endDate: null })).toBeNull();
  });
});

describe("Example 3 — club rejects non-overlapping eras (Ramos / Bellingham)", () => {
  it("does not link Ramos and Bellingham via Real Madrid (no date overlap)", () => {
    // Ramos left RM 2021-07-08; Bellingham arrived 2023-07-01.
    const mates = g.getTeammates(RAMOS, REAL_MADRID, undefined, AS_OF);
    expect(mates.some((p) => p.id === BELLINGHAM)).toBe(false);
    expect(
      g.getTeammates(BELLINGHAM, REAL_MADRID, undefined, AS_OF).some(
        (p) => p.id === RAMOS,
      ),
    ).toBe(false);
  });
});

describe("Example 1 — club accepts real overlapping teammates (Griezmann / Lemar)", () => {
  it("links Griezmann and Lemar via Atlético (overlapping stints)", () => {
    const mates = g.getTeammates(GRIEZMANN, ATLETICO, undefined, AS_OF);
    expect(mates.some((p) => p.id === LEMAR)).toBe(true);
    expect(
      g.getTeammates(LEMAR, ATLETICO, undefined, AS_OF).some((p) => p.id === GRIEZMANN),
    ).toBe(true);
  });
});

describe("Example 4 — national team links without dates (Haaland / Ødegaard)", () => {
  it("links Haaland and Ødegaard via Norway with null dates on both sides", () => {
    const haalandNorway = g
      .getAffiliationsForPlayer(HAALAND)
      .filter((a) => a.entityId === NORWAY);
    const odeNorway = g
      .getAffiliationsForPlayer(ODEGAARD)
      .filter((a) => a.entityId === NORWAY);
    expect(haalandNorway.length).toBeGreaterThan(0);
    expect(odeNorway.length).toBeGreaterThan(0);
    for (const a of [...haalandNorway, ...odeNorway]) {
      expect(a.startDate).toBeNull();
      expect(a.endDate).toBeNull();
    }

    const mates = g.getTeammates(HAALAND, NORWAY);
    expect(mates.some((p) => p.id === ODEGAARD)).toBe(true);
    expect(g.getTeammates(ODEGAARD, NORWAY).some((p) => p.id === HAALAND)).toBe(
      true,
    );
  });
});

describe("multi-stint club handling", () => {
  it("links Mbappé to Fabinho via overlapping Monaco stints", () => {
    expect(
      g.getTeammates(MBAPPE, MONACO, undefined, AS_OF).some((p) => p.id === FABINHO),
    ).toBe(true);
  });

  it("links Falcao to Fabinho via their first Monaco stints", () => {
    expect(
      g.getTeammates(FALCAO, MONACO, undefined, AS_OF).some((p) => p.id === FABINHO),
    ).toBe(true);
  });

  it("still links Messi & Suárez at Barcelona", () => {
    expect(
      g.getTeammates(MESSI, BARCELONA, undefined, AS_OF).some((p) => p.id === SUAREZ),
    ).toBe(true);
  });
});

describe("graph indexing", () => {
  it("loadGraph memoizes and loads affiliations", () => {
    expect(loadGraph()).toBe(g);
    expect(g.players.size).toBe(graphData.players.length);
    expect(g.entities.size).toBe(graphData.entities.length);
    expect(g.affiliations.length).toBe(graphData.affiliations.length);
  });

  it("getEntitiesForPlayer returns clubs and national teams for Mbappé", () => {
    const ents = g.getEntitiesForPlayer(MBAPPE);
    const names = ents.map((e) => e.name);
    expect(names.some((n) => n.includes("Monaco"))).toBe(true);
    expect(names.some((n) => n.includes("Paris Saint-Germain"))).toBe(true);
    expect(names.some((n) => n.includes("Real Madrid"))).toBe(true);
    expect(ents.some((e) => e.type === "national_team" && e.name === "France")).toBe(
      true,
    );
  });

  it("exports MIN_OVERLAP_DAYS as 30", () => {
    expect(MIN_OVERLAP_DAYS).toBe(30);
  });
});
