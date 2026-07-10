/**
 * Tests for the share-any-entity rule against the bundled dataset.
 */

import { describe, expect, it } from "vitest";
import { sharesEntity, formatAffiliationYears } from "./overlap";
import { loadGraph } from "./graph";
import type { Affiliation } from "./types";
import graphData from "../data/graph-data.json";

const RAMOS = "25557";
const BELLINGHAM = "581678";
const REAL_MADRID = "418";
const MBAPPE = "342229";
const FRANCE = "3377";

const g = loadGraph();

describe("sharesEntity", () => {
  it("is true for same entityId regardless of dates", () => {
    const a: Affiliation = {
      playerId: "1",
      entityId: "X",
      startDate: "2000-01-01",
      endDate: "2005-01-01",
    };
    const b: Affiliation = {
      playerId: "2",
      entityId: "X",
      startDate: "2020-01-01",
      endDate: null,
    };
    expect(sharesEntity(a, b)).toBe(true);
  });

  it("is false for different entities", () => {
    const a: Affiliation = {
      playerId: "1",
      entityId: "X",
      startDate: null,
      endDate: null,
    };
    const b: Affiliation = {
      playerId: "2",
      entityId: "Y",
      startDate: null,
      endDate: null,
    };
    expect(sharesEntity(a, b)).toBe(false);
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

describe("cross-era club links (impossible under old 30-day rule)", () => {
  it("links Ramos and Bellingham via Real Madrid despite no date overlap", () => {
    // Ramos left RM 2021-07-08; Bellingham arrived 2023-07-01.
    const mates = g.getTeammates(RAMOS, REAL_MADRID);
    expect(mates.some((p) => p.id === BELLINGHAM)).toBe(true);
    expect(g.getTeammates(BELLINGHAM, REAL_MADRID).some((p) => p.id === RAMOS)).toBe(
      true,
    );
  });
});

describe("national-team-only links", () => {
  it("links two France internationals who share no club in the pool", () => {
    // Resolve Griezmann id from the dataset in case it drifts.
    const griezmann =
      [...g.players.values()].find((p) => p.name.includes("Griezmann")) ?? null;
    expect(griezmann).not.toBeNull();
    const mates = g.getTeammates(MBAPPE, FRANCE);
    expect(mates.some((p) => p.id === griezmann!.id)).toBe(true);

    const mbappeEntities = new Set(g.getEntitiesForPlayer(MBAPPE).map((e) => e.id));
    const griezEntities = new Set(
      g.getEntitiesForPlayer(griezmann!.id).map((e) => e.id),
    );
    const shared = [...mbappeEntities].filter((id) => griezEntities.has(id));
    expect(shared).toEqual([FRANCE]);
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

  it("getEntitiesForPlayer returns [] for an unknown player", () => {
    expect(g.getEntitiesForPlayer("does-not-exist")).toEqual([]);
  });
});
