"""Overlap detection between player tenures for the Overlap game.

A "teammate link" between two players exists when they hold tenures at the
same club whose date ranges intersect for at least MIN_OVERLAP_DAYS days.

Date ranges are treated as half-open intervals [startDate, endDate): a tenure
2020-01-01 -> 2020-01-31 lasts 30 days. A null endDate means the tenure is
ongoing and is compared against a configurable "as of" date (default: today).
"""

from __future__ import annotations

import datetime as dt
import json
from collections import defaultdict
from pathlib import Path

MIN_OVERLAP_DAYS = 30
DEFAULT_DATA_PATH = Path(__file__).resolve().parent / "output" / "raw-tenures.json"


def _date(value: str) -> dt.date:
    return dt.date.fromisoformat(value)


def overlap_days(a: dict, b: dict, as_of: dt.date | None = None) -> int:
    """Number of days the two tenures' date ranges intersect.

    Zero or negative means they do not intersect. Club is NOT considered
    here -- this is pure date-range intersection.
    """
    if as_of is None:
        as_of = dt.date.today()
    start = max(_date(a["startDate"]), _date(b["startDate"]))
    end = min(
        _date(a["endDate"]) if a["endDate"] else as_of,
        _date(b["endDate"]) if b["endDate"] else as_of,
    )
    return (end - start).days


def tenures_overlap(
    a: dict,
    b: dict,
    min_days: int = MIN_OVERLAP_DAYS,
    as_of: dt.date | None = None,
) -> bool:
    """Whether two tenures form a valid teammate link.

    True only if both tenures are at the same club and their date ranges
    intersect for at least `min_days` days.
    """
    return a["clubId"] == b["clubId"] and overlap_days(a, b, as_of) >= min_days


class TenureGraph:
    """In-memory index over the players/clubs/tenures dataset."""

    def __init__(self, data: dict):
        self.players: dict[str, dict] = {p["id"]: p for p in data["players"]}
        self.clubs: dict[str, dict] = {c["id"]: c for c in data["clubs"]}
        self.tenures: list[dict] = data["tenures"]
        self._by_club: dict[str, list[dict]] = defaultdict(list)
        self._by_player_club: dict[tuple[str, str], list[dict]] = defaultdict(list)
        for t in self.tenures:
            self._by_club[t["clubId"]].append(t)
            self._by_player_club[(t["playerId"], t["clubId"])].append(t)

    @classmethod
    def load(cls, path: Path | str = DEFAULT_DATA_PATH) -> "TenureGraph":
        with open(path, encoding="utf-8") as f:
            return cls(json.load(f))

    def get_teammates(
        self,
        player_id: str,
        club_id: str,
        min_days: int = MIN_OVERLAP_DAYS,
        as_of: dt.date | None = None,
    ) -> list[dict]:
        """Every OTHER player with a tenure at `club_id` overlapping any of
        `player_id`'s tenures there by at least `min_days` days.

        A player may have several non-overlapping stints at the same club
        (loan then permanent return); a link exists if ANY pairing of stints
        satisfies the rule. Returns player dicts sorted by name; empty list
        if `player_id` never played at `club_id`.
        """
        own = self._by_player_club.get((player_id, club_id), [])
        if not own:
            return []
        mate_ids: set[str] = set()
        for other in self._by_club.get(club_id, []):
            other_id = other["playerId"]
            if other_id == player_id or other_id in mate_ids:
                continue
            if any(tenures_overlap(mine, other, min_days, as_of) for mine in own):
                mate_ids.add(other_id)
        return sorted((self.players[pid] for pid in mate_ids), key=lambda p: p["name"])
