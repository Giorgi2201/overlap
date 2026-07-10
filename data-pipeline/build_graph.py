"""Produce output/graph-data.json -- the file the .NET backend will load.

Currently a validated copy of raw-tenures.json: same shape, with referential
integrity checked and tenures sorted deterministically (playerId, startDate).
The teammate graph itself is NOT precomputed here; the backend builds it
in memory at startup.

Run from the repo root:  python data-pipeline/build_graph.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

OUTPUT_DIR = Path(__file__).resolve().parent / "output"
RAW_PATH = OUTPUT_DIR / "raw-tenures.json"
GRAPH_PATH = OUTPUT_DIR / "graph-data.json"


def main() -> int:
    data = json.loads(RAW_PATH.read_text(encoding="utf-8"))

    player_ids = {p["id"] for p in data["players"]}
    club_ids = {c["id"] for c in data["clubs"]}
    bad = [t for t in data["tenures"]
           if t["playerId"] not in player_ids or t["clubId"] not in club_ids
           or (t["endDate"] is not None and t["endDate"] < t["startDate"])]
    if bad:
        print(f"ERROR: {len(bad)} invalid tenures in {RAW_PATH.name}; "
              "re-run build_tenures.py", file=sys.stderr)
        return 1

    graph = {
        "players": sorted(data["players"], key=lambda p: int(p["id"])),
        "clubs": sorted(data["clubs"], key=lambda c: int(c["id"])),
        "tenures": sorted(data["tenures"],
                          key=lambda t: (int(t["playerId"]), t["startDate"])),
    }
    GRAPH_PATH.write_text(json.dumps(graph, ensure_ascii=False, indent=2),
                          encoding="utf-8")
    size_kb = GRAPH_PATH.stat().st_size / 1024
    print(f"Wrote {GRAPH_PATH} ({size_kb:.0f} KB): "
          f"{len(graph['players'])} players, {len(graph['clubs'])} clubs, "
          f"{len(graph['tenures'])} tenures")
    return 0


if __name__ == "__main__":
    sys.exit(main())
