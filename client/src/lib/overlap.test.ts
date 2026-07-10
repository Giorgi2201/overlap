/**
 * Port of data-pipeline/test_overlap.py -- sanity tests for the overlap
 * logic against the real bundled dataset.
 */

import { describe, expect, it } from "vitest";
import { overlapDays, tenuresOverlap } from "./overlap";
import { TenureGraph, loadGraph } from "./graph";
import type { Tenure } from "./types";
import graphData from "../data/graph-data.json";

// Player ids in graph-data.json (verified against the current dataset).
const MESSI = "28003";
const SUAREZ = "44352"; // Luis Suárez (b. 1987)
const SERGIO_RAMOS = "25557";
const MBAPPE = "342229";
const FALCAO = "39152";
const FABINHO = "225693";
const STERLING = "134425";
const HAALAND = "418560";
const MULLER = "58358";
const NEUER = "17259";

const BARCELONA = "131";
const PSG = "583";
const MONACO = "162";
const MAN_CITY = "281";
const LIVERPOOL = "31";
const BAYERN = "27";

// Pin "today" so open-ended tenures behave deterministically.
const AS_OF = new Date(Date.UTC(2026, 6, 10)); // 2026-07-10

const g = loadGraph();

function t(start: string, end: string | null, club = "X"): Tenure {
  return { playerId: "p", clubId: club, startDate: start, endDate: end };
}

function teammateIds(playerId: string, clubId: string, graph = g): Set<string> {
  return new Set(
    graph.getTeammates(playerId, clubId, undefined, AS_OF).map((p) => p.id),
  );
}

describe("30-day rule boundaries (synthetic tenures)", () => {
  const year = t("2020-01-01", "2020-12-31");

  it("counts an intersection of exactly 30 days", () => {
    expect(tenuresOverlap(year, t("2020-06-01", "2020-07-01"))).toBe(true);
  });

  it("rejects an intersection of 29 days", () => {
    expect(tenuresOverlap(year, t("2020-06-01", "2020-06-30"))).toBe(false);
  });

  it("rejects identical dates at a different club", () => {
    expect(tenuresOverlap(year, t("2020-01-01", "2020-12-31", "Y"))).toBe(false);
  });

  it("compares open-ended tenures against the asOf date", () => {
    const a = t("2020-01-01", null);
    const b = t("2025-01-01", null);
    expect(tenuresOverlap(a, b, undefined, AS_OF)).toBe(true);
    expect(tenuresOverlap(a, b, undefined, new Date(Date.UTC(2025, 0, 15)))).toBe(false);
  });

  it("returns non-positive overlapDays for disjoint ranges", () => {
    expect(
      overlapDays(t("2010-01-01", "2011-01-01"), t("2015-01-01", "2016-01-01")),
    ).toBeLessThanOrEqual(0);
  });
});

describe("known real-world teammate pairs", () => {
  it("links Messi & Suárez at Barcelona (2014-2020)", () => {
    expect(teammateIds(MESSI, BARCELONA)).toContain(SUAREZ);
  });

  it("links Müller & Neuer at Bayern (2011-2025)", () => {
    expect(teammateIds(MULLER, BAYERN)).toContain(NEUER);
  });

  it("links Messi & Sergio Ramos at PSG (2021-2023)", () => {
    expect(teammateIds(MESSI, PSG)).toContain(SERGIO_RAMOS);
  });

  it("is symmetric (Suárez side)", () => {
    expect(teammateIds(SUAREZ, BARCELONA)).toContain(MESSI);
  });
});

describe("Mbappé's 1-day Monaco return stint", () => {
  const oneDay = g.tenures.filter(
    (x) =>
      x.playerId === MBAPPE &&
      x.clubId === MONACO &&
      x.startDate === "2018-06-30",
  );

  it("exists in the data", () => {
    expect(oneDay).toHaveLength(1);
  });

  it("fails the 30-day rule against every Falcao Monaco stint", () => {
    const falcaoMonaco = g.tenures.filter(
      (x) => x.playerId === FALCAO && x.clubId === MONACO,
    );
    expect(falcaoMonaco.length).toBeGreaterThan(0);
    for (const f of falcaoMonaco) {
      expect(tenuresOverlap(oneDay[0], f, undefined, AS_OF)).toBe(false);
    }
  });

  it("contributes no teammate links at all", () => {
    const withoutOneDay = new TenureGraph({
      players: [...g.players.values()],
      clubs: [...g.clubs.values()],
      tenures: g.tenures.filter((x) => x !== oneDay[0]),
    });
    expect(teammateIds(MBAPPE, MONACO)).toEqual(
      teammateIds(MBAPPE, MONACO, withoutOneDay),
    );
  });

  it("still links Falcao via the real 2016-2017 Monaco stint", () => {
    expect(teammateIds(MBAPPE, MONACO)).toContain(FALCAO);
  });
});

describe("multi-stint handling", () => {
  it("links Mbappé to Fabinho via Fabinho's second Monaco stint", () => {
    expect(teammateIds(MBAPPE, MONACO)).toContain(FABINHO);
  });

  it("links Falcao to Fabinho via their first Monaco stints (2013-14)", () => {
    expect(teammateIds(FALCAO, MONACO)).toContain(FABINHO);
  });
});

describe("exclusions", () => {
  it("rejects Sterling & Haaland: only 12 days together at Man City", () => {
    expect(teammateIds(HAALAND, MAN_CITY)).not.toContain(STERLING);
  });

  it("rejects Sterling & Fabinho: different Liverpool eras", () => {
    expect(teammateIds(STERLING, LIVERPOOL)).not.toContain(FABINHO);
  });

  it("returns no teammates for a player who never played at the club", () => {
    expect(g.getTeammates(HAALAND, BARCELONA, undefined, AS_OF)).toEqual([]);
  });
});

describe("graph indexing", () => {
  it("loadGraph memoizes and loads the full dataset", () => {
    expect(loadGraph()).toBe(g);
    expect(g.players.size).toBe(graphData.players.length);
    expect(g.clubs.size).toBe(graphData.clubs.length);
    expect(g.tenures.length).toBe(graphData.tenures.length);
  });

  it("getClubsForPlayer returns Mbappé's three senior clubs", () => {
    const names = g.getClubsForPlayer(MBAPPE).map((c) => c.name);
    expect(names).toHaveLength(3);
    expect(names.join(" ")).toMatch(/Monaco/);
    expect(names.join(" ")).toMatch(/Paris Saint-Germain/);
    expect(names.join(" ")).toMatch(/Real Madrid/);
  });

  it("getClubsForPlayer returns [] for an unknown player", () => {
    expect(g.getClubsForPlayer("does-not-exist")).toEqual([]);
  });
});
