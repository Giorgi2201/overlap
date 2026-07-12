"""Patch imageUrl onto graph JSON from cached players.csv.gz."""
from __future__ import annotations

import csv
import gzip
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = Path(__file__).resolve().parent / "cache" / "players.csv.gz"
TARGETS = [
    ROOT / "src" / "data" / "graph-data.json",
    Path(__file__).resolve().parent / "output" / "raw-affiliations.json",
]


def main() -> None:
    with gzip.open(CACHE, "rt", encoding="utf-8", errors="replace") as f:
        src = {
            r["player_id"]: (r.get("image_url") or "").strip() or None
            for r in csv.DictReader(f)
        }

    for path in TARGETS:
        if not path.exists():
            print(f"skip {path}")
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        n = 0
        for p in data["players"]:
            url = src.get(p["id"])
            p["imageUrl"] = url
            if url:
                n += 1
        path.write_text(
            json.dumps(data, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print(f"{path}: {n}/{len(data['players'])} with imageUrl")


if __name__ == "__main__":
    main()
