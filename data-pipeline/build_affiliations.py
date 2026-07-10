"""Build unified player/entity/affiliation data for Overlap.

Reads the existing player pool from output/raw-tenures.json (produced by
build_tenures.py), adds national-team affiliations from the same
transfermarkt-datasets source, and writes output/raw-affiliations.json.

Clubs and national teams are unified as "entities". Club tenure dates are
kept as optional metadata; national-team affiliations have null dates
(the source only provides lifetime caps + current team id, not periods).

National-team assignment (option 2):
  1. Use players.current_national_team_id when present.
  2. Else if international_caps > 0, map country_of_citizenship to a
     national_teams row by country_name.
  Players with missing caps AND missing current_national_team_id (e.g.
  Ramos/Kroos in some dumps) get no NT affiliation -- documented limitation.

Stdlib only. See README.md for usage.
"""

from __future__ import annotations

import argparse
import csv
import gzip
import json
import sys
import urllib.request
from pathlib import Path

BASE_URL = "https://pub-e682421888d945d684bcae8890b0ec20.r2.dev/data"
SCRIPT_DIR = Path(__file__).resolve().parent
CACHE_DIR = SCRIPT_DIR / "cache"
RAW_TENURES_PATH = SCRIPT_DIR / "output" / "raw-tenures.json"
OUTPUT_PATH = SCRIPT_DIR / "output" / "raw-affiliations.json"


def download(asset: str, refresh: bool) -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    dest = CACHE_DIR / f"{asset}.csv.gz"
    if dest.exists() and not refresh:
        print(f"  using cached {dest.name}")
        return dest
    url = f"{BASE_URL}/{asset}.csv.gz"
    print(f"  downloading {url}")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as resp:
        dest.write_bytes(resp.read())
    return dest


def read_csv(path: Path) -> list[dict[str, str]]:
    with gzip.open(path, "rt", encoding="utf-8", errors="replace") as f:
        return list(csv.DictReader(f))


def resolve_national_team_id(
    player: dict[str, str],
    nt_by_id: dict[str, dict[str, str]],
    nt_by_country: dict[str, dict[str, str]],
) -> str | None:
    """Option 2: current NT id, else citizenship map when caps > 0."""
    current = player.get("current_national_team_id") or ""
    if current and current in nt_by_id:
        return current

    caps_raw = (player.get("international_caps") or "").strip()
    if not caps_raw:
        return None
    try:
        caps = float(caps_raw)
    except ValueError:
        return None
    if caps <= 0:
        return None

    citizenship = (player.get("country_of_citizenship") or "").strip()
    if not citizenship:
        return None
    match = nt_by_country.get(citizenship)
    return match["national_team_id"] if match else None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--refresh", action="store_true",
        help="re-download source CSVs even if cached copies exist",
    )
    args = parser.parse_args()

    if not RAW_TENURES_PATH.exists():
        print(
            f"ERROR: {RAW_TENURES_PATH} not found. Run build_tenures.py first.",
            file=sys.stderr,
        )
        return 1

    raw = json.loads(RAW_TENURES_PATH.read_text(encoding="utf-8"))
    pool_ids = {p["id"] for p in raw["players"]}
    print(f"Player pool from raw-tenures.json: {len(pool_ids)}")

    print("Fetching players + national_teams...")
    players_rows = {r["player_id"]: r for r in read_csv(download("players", args.refresh))}
    national_teams = read_csv(download("national_teams", args.refresh))
    nt_by_id = {r["national_team_id"]: r for r in national_teams}
    nt_by_country = {r["country_name"]: r for r in national_teams}

    # --- entities: clubs from raw-tenures + national teams we actually use ---
    entities: list[dict] = []
    for club in raw["clubs"]:
        entities.append(
            {
                "id": club["id"],
                "name": club["name"],
                "type": "club",
                "country": club.get("country") or "",
            }
        )

    # --- affiliations: club tenures rewritten as entity affiliations ---
    affiliations: list[dict] = []
    for t in raw["tenures"]:
        affiliations.append(
            {
                "playerId": t["playerId"],
                "entityId": t["clubId"],
                "startDate": t.get("startDate"),
                "endDate": t.get("endDate"),
            }
        )

    # --- national-team affiliations for the pool ---
    used_nt_ids: set[str] = set()
    via_current = 0
    via_citizenship = 0
    missing_nt = 0
    missing_country_in_table = 0

    for player_id in sorted(pool_ids, key=int):
        src = players_rows.get(player_id)
        if src is None:
            missing_nt += 1
            continue

        had_current = bool(src.get("current_national_team_id"))
        nt_id = resolve_national_team_id(src, nt_by_id, nt_by_country)
        if nt_id is None:
            missing_nt += 1
            caps = (src.get("international_caps") or "").strip()
            cit = (src.get("country_of_citizenship") or "").strip()
            if caps and cit and cit not in nt_by_country:
                missing_country_in_table += 1
            continue

        if had_current and src.get("current_national_team_id") == nt_id:
            via_current += 1
        else:
            via_citizenship += 1

        used_nt_ids.add(nt_id)
        affiliations.append(
            {
                "playerId": player_id,
                "entityId": nt_id,
                "startDate": None,
                "endDate": None,
            }
        )

    for nt_id in sorted(used_nt_ids, key=int):
        nt = nt_by_id[nt_id]
        entities.append(
            {
                "id": nt_id,
                "name": nt["name"],
                "type": "national_team",
                "country": nt.get("country_name") or "",
            }
        )

    # Enrich players with notability signals for in-game fame tiers.
    players: list[dict] = []
    for p in raw["players"]:
        src = players_rows.get(p["id"], {})
        mv_raw = (src.get("highest_market_value_in_eur") or "").strip()
        caps_raw = (src.get("international_caps") or "").strip()
        try:
            mv = int(float(mv_raw)) if mv_raw else 0
        except ValueError:
            mv = 0
        try:
            caps = int(float(caps_raw)) if caps_raw else 0
        except ValueError:
            caps = 0
        players.append(
            {
                **p,
                "highestMarketValue": mv,
                "internationalCaps": caps,
            }
        )

    output = {
        "players": players,
        "entities": entities,
        "affiliations": affiliations,
    }
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    club_entities = sum(1 for e in entities if e["type"] == "club")
    nt_entities = sum(1 for e in entities if e["type"] == "national_team")
    club_ids = {c["id"] for c in raw["clubs"]}
    club_aff_n = sum(1 for a in affiliations if a["entityId"] in club_ids)
    nt_aff_n = len(affiliations) - club_aff_n

    size_kb = OUTPUT_PATH.stat().st_size / 1024
    print(
        f"Wrote {OUTPUT_PATH} ({size_kb:.0f} KB):\n"
        f"  {len(output['players'])} players\n"
        f"  {len(entities)} entities ({club_entities} clubs, {nt_entities} national teams)\n"
        f"  {len(affiliations)} affiliations ({club_aff_n} club, {nt_aff_n} national team)\n"
        f"  NT via current_national_team_id: {via_current}\n"
        f"  NT via caps+citizenship: {via_citizenship}\n"
        f"  pool players with no NT affiliation: {missing_nt}\n"
        f"  of those, capped but country missing from national_teams table: {missing_country_in_table}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
