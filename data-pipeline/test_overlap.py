"""Sanity tests for overlap.py against the real dataset.

Run from the repo root:  python data-pipeline/test_overlap.py
"""

from __future__ import annotations

import datetime as dt
import sys

from overlap import TenureGraph, overlap_days, tenures_overlap

# Player ids in raw-tenures.json (verified against the current dataset).
MESSI = "28003"
SUAREZ = "44352"          # Luis Suárez (b. 1987)
SERGIO_RAMOS = "25557"
MBAPPE = "342229"
FALCAO = "39152"
FABINHO = "225693"
STERLING = "134425"
HAALAND = "418560"
MULLER = "58358"
NEUER = "17259"

BARCELONA = "131"
PSG = "583"
MONACO = "162"
MAN_CITY = "281"
LIVERPOOL = "31"
BAYERN = "27"

AS_OF = dt.date(2026, 7, 10)

_results: list[tuple[str, bool, str]] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    _results.append((name, condition, detail))


def t(start: str, end: str | None, club: str = "X") -> dict:
    return {"clubId": club, "startDate": start, "endDate": end}


def run_synthetic_checks() -> None:
    """Boundary behaviour of the 30-day rule on hand-made tenures."""
    a = t("2020-01-01", "2020-12-31")
    check("exactly 30 days counts",
          tenures_overlap(a, t("2020-06-01", "2020-07-01")),
          "intersection of exactly 30 days must pass")
    check("29 days does not count",
          not tenures_overlap(a, t("2020-06-01", "2020-06-30")),
          "intersection of 29 days must fail")
    check("different club never counts",
          not tenures_overlap(a, t("2020-01-01", "2020-12-31", club="Y")),
          "same dates, different club")
    check("open-ended tenure uses as_of date",
          tenures_overlap(t("2020-01-01", None), t("2025-01-01", None), as_of=AS_OF)
          and not tenures_overlap(t("2020-01-01", None), t("2025-01-01", None),
                                  as_of=dt.date(2025, 1, 15)),
          "two ongoing tenures overlap from the later start until as_of")
    check("disjoint ranges give non-positive overlap_days",
          overlap_days(t("2010-01-01", "2011-01-01"), t("2015-01-01", "2016-01-01")) <= 0)


def run_dataset_checks(g: TenureGraph) -> None:
    # --- known real-world teammate pairs ---
    barca_mates = g.get_teammates(MESSI, BARCELONA, as_of=AS_OF)
    check("Messi & Suárez were Barcelona teammates (2014-2020)",
          any(p["id"] == SUAREZ for p in barca_mates))

    bayern_mates = g.get_teammates(MULLER, BAYERN, as_of=AS_OF)
    check("Müller & Neuer were Bayern teammates (2011-2025)",
          any(p["id"] == NEUER for p in bayern_mates))

    psg_mates = g.get_teammates(MESSI, PSG, as_of=AS_OF)
    check("Messi & Sergio Ramos were PSG teammates (2021-2023)",
          any(p["id"] == SERGIO_RAMOS for p in psg_mates))

    # --- symmetry: teammate-of is mutual ---
    check("teammate relation is symmetric (Suárez side)",
          any(p["id"] == MESSI for p in g.get_teammates(SUAREZ, BARCELONA, as_of=AS_OF)))

    # --- Mbappé's 1-day Monaco return must not create links ---
    one_day = [x for x in g.tenures
               if x["playerId"] == MBAPPE and x["clubId"] == MONACO
               and x["startDate"] == "2018-06-30"]
    check("Mbappé's 1-day Monaco stint exists in data", len(one_day) == 1)
    falcao_monaco = [x for x in g.tenures
                     if x["playerId"] == FALCAO and x["clubId"] == MONACO]
    check("1-day stint fails the 30-day rule against every Falcao Monaco stint",
          one_day and all(not tenures_overlap(one_day[0], f, as_of=AS_OF)
                          for f in falcao_monaco))
    # Removing the 1-day stint must not change Mbappé's Monaco teammates:
    # every link must be attributable to his real 2016-2017 stint.
    real_only = TenureGraph({
        "players": list(g.players.values()),
        "clubs": list(g.clubs.values()),
        "tenures": [x for x in g.tenures if x is not (one_day[0] if one_day else None)],
    })
    check("1-day stint contributes no teammate links at all",
          {p["id"] for p in g.get_teammates(MBAPPE, MONACO, as_of=AS_OF)}
          == {p["id"] for p in real_only.get_teammates(MBAPPE, MONACO, as_of=AS_OF)})
    check("Falcao still linked to Mbappé via the real 2016-2017 Monaco stint",
          any(p["id"] == FALCAO for p in g.get_teammates(MBAPPE, MONACO, as_of=AS_OF)))

    # --- multi-stint handling ---
    # Fabinho's Monaco tenure is split into two stints (2013-2015, 2015-2018);
    # Mbappé's real stint (2016-2017) overlaps only the SECOND one.
    check("multi-stint: Mbappé links to Fabinho via Fabinho's second Monaco stint",
          any(p["id"] == FABINHO for p in g.get_teammates(MBAPPE, MONACO, as_of=AS_OF)))
    check("multi-stint: Falcao & Fabinho linked via first Monaco stints (2013-14)",
          any(p["id"] == FABINHO for p in g.get_teammates(FALCAO, MONACO, as_of=AS_OF)))

    # --- exclusions ---
    # Sterling left Man City on 2022-07-13; Haaland arrived 2022-07-01.
    # They co-existed for only 12 days, under the 30-day minimum.
    city_mates = g.get_teammates(HAALAND, MAN_CITY, as_of=AS_OF)
    check("Sterling & Haaland excluded: only 12 days together at Man City",
          all(p["id"] != STERLING for p in city_mates))
    # Sterling (Liverpool 2012-2015) and Fabinho (Liverpool 2018-2023): same
    # club, completely different eras.
    lfc_mates = g.get_teammates(STERLING, LIVERPOOL, as_of=AS_OF)
    check("Sterling & Fabinho excluded: different Liverpool eras",
          all(p["id"] != FABINHO for p in lfc_mates))
    check("player who never played at the club returns no teammates",
          g.get_teammates(HAALAND, BARCELONA, as_of=AS_OF) == [])


def main() -> int:
    print("Loading dataset...")
    g = TenureGraph.load()
    print(f"  {len(g.players)} players, {len(g.clubs)} clubs, {len(g.tenures)} tenures\n")

    run_synthetic_checks()
    run_dataset_checks(g)

    failed = 0
    for name, ok, detail in _results:
        mark = "PASS" if ok else "FAIL"
        if not ok:
            failed += 1
        line = f"[{mark}] {name}"
        if detail and not ok:
            line += f"  ({detail})"
        print(line)

    total = len(_results)
    print(f"\n{total - failed}/{total} checks passed" + (" -- ALL OK" if not failed else ""))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
