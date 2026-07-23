/**
 * Estimated career-span / NT era-proximity helpers — not wired into gameplay yet.
 */

import { describe, expect, it } from "vitest";
import { AffiliationGraph, loadGraph } from "./graph";
import {
  estimateCareerSpan,
  estimatedErasOverlap,
  shiftIsoYears,
} from "./careerSpan";
import type { GraphData } from "./types";

const MESSI = "28003";
const SUAREZ = "44352";
const HAALAND = "418560";
const ODEGAARD = "316264";
const KEITA = "302215"; // club career ends 2024-06-30
const NGUMOHA = "1108466"; // club career starts 2025-07-01 (~1y gap)

/** Fixed asOf so open-ended "present" is stable across runs. */
const AS_OF = new Date(Date.UTC(2026, 6, 10)); // 2026-07-10

const g = loadGraph();

describe("shiftIsoYears", () => {
  it("shifts calendar years on ISO dates", () => {
    expect(shiftIsoYears("2024-06-30", 1)).toBe("2025-06-30");
    expect(shiftIsoYears("2025-07-01", -1)).toBe("2024-07-01");
  });
});

describe("estimateCareerSpan (real pool)", () => {
  it("uses earliest club start and open-ended → asOf for Messi", () => {
    const span = estimateCareerSpan(MESSI, g, AS_OF);
    expect(span).not.toBeNull();
    expect(span!.start).toBe("2005-07-01");
    expect(span!.end).toBe("2026-07-10");
  });

  it("ignores national-team affiliations (null dates) when spanning", () => {
    const haaland = estimateCareerSpan(HAALAND, g, AS_OF);
    expect(haaland).not.toBeNull();
    // Club start is early Molde/Bryn, not NT
    expect(haaland!.start).toBe("2015-09-08");
    expect(haaland!.end).toBe("2026-07-10");
  });

  it("uses latest closed club endDate when no open-ended stint (Keïta)", () => {
    const span = estimateCareerSpan(KEITA, g, AS_OF);
    expect(span).toEqual({ start: "2014-07-01", end: "2024-06-30" });
  });
});

describe("estimatedErasOverlap — overlapping contemporaries", () => {
  it("returns true for Messi / Suárez (long shared club era)", () => {
    expect(estimatedErasOverlap(MESSI, SUAREZ, g, 1, AS_OF)).toBe(true);
    // Still true with zero tolerance — raw club spans already overlap
    expect(estimatedErasOverlap(MESSI, SUAREZ, g, 0, AS_OF)).toBe(true);
  });

  it("returns true for Haaland / Ødegaard (current Norway contemporaries)", () => {
    expect(estimatedErasOverlap(HAALAND, ODEGAARD, g, 1, AS_OF)).toBe(true);
    expect(estimatedErasOverlap(HAALAND, ODEGAARD, g, 0, AS_OF)).toBe(true);
  });
});

describe("estimatedErasOverlap — clearly different eras (synthetic)", () => {
  /**
   * The live 1000-player pool is all contemporary (largest natural closed→open
   * gaps are ~1 year), so decade-scale non-overlap needs a tiny fixture.
   */
  const eraGapGraph = new AffiliationGraph({
    players: [
      { id: "OLD", name: "Retired Vet", position: "Centre-Back", dob: null },
      { id: "NEW", name: "Teen Star", position: "Attacking Midfield", dob: null },
    ],
    entities: [
      { id: "C1", name: "Old Club", type: "club", country: "X" },
      { id: "C2", name: "New Club", type: "club", country: "X" },
      { id: "NT", name: "Same Nation", type: "national_team", country: "X" },
    ],
    affiliations: [
      {
        playerId: "OLD",
        entityId: "C1",
        startDate: "1995-07-01",
        endDate: "2005-06-30",
      },
      {
        playerId: "NEW",
        entityId: "C2",
        startDate: "2020-07-01",
        endDate: null,
      },
      // Shared NT would currently link them under the any-era rule — eras should not.
      { playerId: "OLD", entityId: "NT", startDate: null, endDate: null },
      { playerId: "NEW", entityId: "NT", startDate: null, endDate: null },
    ],
  } satisfies GraphData);

  it("returns false across a multi-decade club gap even with default tolerance", () => {
    expect(
      estimatedErasOverlap("OLD", "NEW", eraGapGraph, 1, AS_OF),
    ).toBe(false);
    expect(
      estimatedErasOverlap("OLD", "NEW", eraGapGraph, 0, AS_OF),
    ).toBe(false);
  });
});

describe("estimatedErasOverlap — tolerance is the deciding factor", () => {
  it("Keïta vs Ngumoha: raw spans miss by ~1y; toleranceYears=1 bridges them", () => {
    const keita = estimateCareerSpan(KEITA, g, AS_OF)!;
    const ngumoha = estimateCareerSpan(NGUMOHA, g, AS_OF)!;
    expect(keita.end).toBe("2024-06-30");
    expect(ngumoha.start).toBe("2025-07-01");
    // Raw (no pad): end before start → no overlap
    expect(keita.end < ngumoha.start).toBe(true);
    expect(estimatedErasOverlap(KEITA, NGUMOHA, g, 0, AS_OF)).toBe(false);

    // With 1y pad on each end, windows meet:
    // Keïta end+1y = 2025-06-30, Ngumoha start-1y = 2024-07-01 → overlap
    expect(shiftIsoYears(keita.end, 1)).toBe("2025-06-30");
    expect(shiftIsoYears(ngumoha.start, -1)).toBe("2024-07-01");
    expect(estimatedErasOverlap(KEITA, NGUMOHA, g, 1, AS_OF)).toBe(true);
  });
});

describe("estimatedErasOverlap — unverifiable span", () => {
  it("returns false (not crash) when a player has no dated club affiliations", () => {
    const noClubGraph = new AffiliationGraph({
      players: [
        { id: "A", name: "Club Player", position: "Forward", dob: null },
        { id: "B", name: "NT Only", position: "Midfield", dob: null },
      ],
      entities: [
        { id: "C", name: "Some Club", type: "club", country: "X" },
        { id: "NT", name: "Nation", type: "national_team", country: "X" },
      ],
      affiliations: [
        {
          playerId: "A",
          entityId: "C",
          startDate: "2018-07-01",
          endDate: null,
        },
        { playerId: "A", entityId: "NT", startDate: null, endDate: null },
        // B: national team only — cannot estimate a club-derived span
        { playerId: "B", entityId: "NT", startDate: null, endDate: null },
      ],
    } satisfies GraphData);

    expect(estimateCareerSpan("B", noClubGraph, AS_OF)).toBeNull();
    expect(estimateCareerSpan("A", noClubGraph, AS_OF)).not.toBeNull();
    expect(estimatedErasOverlap("A", "B", noClubGraph, 1, AS_OF)).toBe(false);
    expect(estimatedErasOverlap("B", "A", noClubGraph, 1, AS_OF)).toBe(false);
  });
});
