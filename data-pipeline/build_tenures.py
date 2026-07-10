"""Build raw player-tenure data for the Overlap game.

Downloads players / clubs / transfers / competitions CSVs from the
dcaribou/transfermarkt-datasets project, derives per-club tenure ranges
from the transfer event log, filters to the most notable players in the
major European leagues (2000-present), and writes output/raw-tenures.json.

Stdlib only -- no third-party dependencies. See README.md for usage.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import gzip
import json
import sys
import urllib.request
from collections import defaultdict
from pathlib import Path

BASE_URL = "https://pub-e682421888d945d684bcae8890b0ec20.r2.dev/data"
ASSETS = ["players", "clubs", "transfers", "competitions"]

SCRIPT_DIR = Path(__file__).resolve().parent
CACHE_DIR = SCRIPT_DIR / "cache"
OUTPUT_PATH = SCRIPT_DIR / "output" / "raw-tenures.json"

# Domestic league competition ids for the "top 7" European leagues.
DEFAULT_LEAGUES = ["GB1", "ES1", "IT1", "L1", "FR1", "PO1", "NL1"]

# Only include tenures that were still ongoing on/after this date.
MIN_TENURE_END = "2000-01-01"


def download(asset: str, refresh: bool) -> Path:
    """Download <asset>.csv.gz into the cache dir (skipped if cached)."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    dest = CACHE_DIR / f"{asset}.csv.gz"
    if dest.exists() and not refresh:
        print(f"  using cached {dest.name}")
        return dest
    url = f"{BASE_URL}/{asset}.csv.gz"
    print(f"  downloading {url}")
    # The public R2 bucket rejects urllib's default user agent with a 403.
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as resp:
        dest.write_bytes(resp.read())
    return dest


def read_csv(path: Path) -> list[dict[str, str]]:
    with gzip.open(path, "rt", encoding="utf-8", errors="replace") as f:
        return list(csv.DictReader(f))


def parse_date(value: str) -> str | None:
    """Normalize dataset dates ('YYYY-MM-DD' or 'YYYY-MM-DD HH:MM:SS') to YYYY-MM-DD."""
    if not value:
        return None
    return value.split(" ")[0]


def derive_spells(
    transfers: list[dict[str, str]], today: str
) -> dict[str, list[tuple[str, str, str | None]]]:
    """Turn the transfer event log into per-player club spells.

    Returns {player_id: [(club_id, start_date, end_date_or_None), ...]}.

    Each transfer ends the player's spell at from_club and starts a spell at
    to_club. The spell before a player's first recorded transfer is dropped
    (its start date is unknown; it is almost always a youth club anyway).
    The final spell is left open-ended here and closed later for retired
    players using players.last_season.
    """
    by_player: dict[str, list[tuple[str, str]]] = defaultdict(list)
    seen: set[tuple[str, str, str]] = set()
    for row in transfers:
        date = parse_date(row["transfer_date"])
        if date is None or date > today:
            # Future-dated rows are pre-announced moves that haven't happened.
            continue
        key = (row["player_id"], date, row["to_club_id"])
        if key in seen:
            continue
        seen.add(key)
        by_player[row["player_id"]].append((date, row["to_club_id"]))

    spells: dict[str, list[tuple[str, str, str | None]]] = {}
    for player_id, events in by_player.items():
        events.sort()
        player_spells: list[tuple[str, str, str | None]] = []
        for i, (date, club_id) in enumerate(events):
            end = events[i + 1][0] if i + 1 < len(events) else None
            player_spells.append((club_id, date, end))
        spells[player_id] = player_spells
    return spells


def season_end_date(last_season: str) -> str:
    """A season labelled N (e.g. 2015 = 2015/16) effectively ends 30 June N+1."""
    return f"{int(last_season) + 1}-06-30"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--top", type=int, default=1000,
        help="number of players to keep, ranked by peak market value (default: 1000)",
    )
    parser.add_argument(
        "--leagues", nargs="+", default=DEFAULT_LEAGUES, metavar="COMP_ID",
        help=f"competition ids that define the player pool (default: {' '.join(DEFAULT_LEAGUES)})",
    )
    parser.add_argument(
        "--refresh", action="store_true",
        help="re-download source CSVs even if cached copies exist",
    )
    args = parser.parse_args()

    today = dt.date.today().isoformat()

    print("Fetching source CSVs...")
    tables = {asset: read_csv(download(asset, args.refresh)) for asset in ASSETS}

    players = {r["player_id"]: r for r in tables["players"]}
    clubs = {r["club_id"]: r for r in tables["clubs"]}
    competition_country = {
        r["competition_id"]: r["country_name"] for r in tables["competitions"]
    }

    # The dataset's "current" season = the max last_season across players.
    # Players whose last_season is older than that are treated as no longer
    # active, and their open-ended final spell gets closed.
    current_season = max(
        int(r["last_season"]) for r in tables["players"] if r["last_season"]
    )
    print(f"Dataset current season: {current_season}")

    print("Deriving club spells from transfer events...")
    spells = derive_spells(tables["transfers"], today)

    # A spell only counts as a tenure if the club is a senior club covered by
    # clubs.csv. Youth teams, B teams and pseudo-clubs ("Without Club",
    # "Retired", ...) are absent from clubs.csv, so this excludes them while
    # still letting their transfer events close the preceding spell.
    def tenures_for(player_id: str) -> list[dict]:
        player = players.get(player_id)
        if player is None:
            return []
        result = []
        for club_id, start, end in spells.get(player_id, []):
            if club_id not in clubs:
                continue
            if end is None and player["last_season"]:
                if int(player["last_season"]) < current_season:
                    season_end = season_end_date(player["last_season"])
                    # Guard against stale last_season values that predate the
                    # player's final recorded transfer.
                    if season_end > start:
                        end = season_end
            if end is not None and end < MIN_TENURE_END:
                continue
            result.append(
                {"playerId": player_id, "clubId": club_id, "startDate": start, "endDate": end}
            )
        return result

    print("Selecting player pool...")
    league_set = set(args.leagues)
    candidates = []
    for player_id, player in players.items():
        if not player["last_season"] or int(player["last_season"]) < 2000:
            continue
        peak_value = player["highest_market_value_in_eur"]
        if not peak_value:
            continue
        tenures = tenures_for(player_id)
        played_in_pool_league = any(
            clubs[t["clubId"]]["domestic_competition_id"] in league_set for t in tenures
        )
        if not played_in_pool_league:
            continue
        candidates.append((float(peak_value), player_id, tenures))

    candidates.sort(key=lambda c: -c[0])
    selected = candidates[: args.top]
    print(f"  {len(candidates)} eligible players, keeping top {len(selected)}")

    out_players = []
    out_tenures = []
    used_club_ids: set[str] = set()
    for _, player_id, tenures in selected:
        player = players[player_id]
        out_players.append(
            {
                "id": player_id,
                "name": player["name"],
                "position": player["position"],
                "dob": parse_date(player["date_of_birth"]),
            }
        )
        out_tenures.extend(tenures)
        used_club_ids.update(t["clubId"] for t in tenures)

    out_clubs = [
        {
            "id": club_id,
            "name": clubs[club_id]["name"],
            "country": competition_country.get(
                clubs[club_id]["domestic_competition_id"], ""
            ),
        }
        for club_id in sorted(used_club_ids, key=int)
    ]

    output = {"players": out_players, "clubs": out_clubs, "tenures": out_tenures}
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    size_kb = OUTPUT_PATH.stat().st_size / 1024
    print(
        f"Wrote {OUTPUT_PATH} ({size_kb:.0f} KB): "
        f"{len(out_players)} players, {len(out_clubs)} clubs, {len(out_tenures)} tenures"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
