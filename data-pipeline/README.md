# Overlap data pipeline

Builds the raw player-tenure dataset for the Overlap game from the
[dcaribou/transfermarkt-datasets](https://github.com/dcaribou/transfermarkt-datasets)
project (Transfermarkt data, refreshed weekly upstream).

## Requirements

- Python 3.10+ (standard library only, no packages to install)

## Usage

From the repo root:

```bash
python data-pipeline/build_tenures.py
```

then

```bash
python data-pipeline/build_graph.py    # validates + writes output/graph-data.json
python data-pipeline/test_overlap.py   # runs overlap-detection sanity tests
```

## Files

| File | Purpose |
| --- | --- |
| `build_tenures.py` | Downloads source CSVs and writes `output/raw-tenures.json` |
| `overlap.py` | Overlap-detection module: 30-day rule + `TenureGraph.get_teammates` |
| `test_overlap.py` | Sanity tests for `overlap.py` using real players from the dataset |
| `build_graph.py` | Validates `raw-tenures.json` and writes `output/graph-data.json` (the file the .NET backend loads; same shape, deterministically sorted) |

`build_tenures.py` produces `data-pipeline/output/raw-tenures.json`:

```json
{
  "players": [ { "id": "...", "name": "...", "position": "...", "dob": "YYYY-MM-DD" } ],
  "clubs":   [ { "id": "...", "name": "...", "country": "..." } ],
  "tenures": [ { "playerId": "...", "clubId": "...", "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD or null" } ]
}
```

An `endDate` of `null` means the tenure is ongoing (the player's current club).

`output/graph-data.json` has the identical shape; it is the validated,
deterministically-sorted copy intended for the backend. The teammate graph is
NOT precomputed into it -- the backend builds that in memory.

### Overlap rule

Two tenures form a teammate link only if they are at the same club and their
date ranges intersect for at least **30 days** (`MIN_OVERLAP_DAYS` in
`overlap.py`). Ranges are half-open `[startDate, endDate)`; a `null` endDate
is compared against a configurable `as_of` date (default: today). This rule
deliberately excludes artifacts like Mbappé's 1-day Monaco "return" tenure.

### Refreshing the data

Source CSVs are cached in `data-pipeline/cache/` (git-ignored) after the first
run. To pull the latest upstream data:

```bash
python data-pipeline/build_tenures.py --refresh
```

### Options

| Flag | Default | Meaning |
| --- | --- | --- |
| `--top N` | `1000` | How many players to keep, ranked by career-peak market value |
| `--leagues ID...` | `GB1 ES1 IT1 L1 FR1 PO1 NL1` | Domestic leagues that define the player pool (Transfermarkt competition ids; top-7 European leagues by default) |
| `--refresh` | off | Re-download source CSVs instead of using the cache |

## How it works

1. **Download** `players`, `clubs`, `transfers` and `competitions` CSVs from the
   dataset's public bucket (`competitions` is needed to map each club's
   `domestic_competition_id` to a country name).
2. **Derive tenures** from the transfer event log: each player's transfers are
   sorted chronologically; every transfer ends the spell at `from_club` and
   starts a spell at `to_club`, giving `[startDate, endDate]` per club. The
   final spell stays open (`endDate: null`) unless the player is no longer
   active in the dataset, in which case it's closed at the end of their last
   recorded season (June 30).
3. **Clean up**:
   - Spells at clubs missing from `clubs.csv` are dropped. This removes youth
     teams, B/reserve teams and pseudo-clubs ("Without Club", "Retired",
     "Career break", "Unknown"), which appear as ordinary clubs in
     `transfers.csv`. Their transfer events still correctly *end* the
     preceding real-club spell.
   - Future-dated transfers (pre-announced moves) are ignored.
   - Tenures that ended before 2000-01-01 are dropped.
   - Loan spells need no special handling: the upstream data records loans as
     ordinary transfer pairs (out and back), so they become regular tenures.
4. **Filter** to the top N players by `highest_market_value_in_eur` (career
   peak, so retired legends rank properly) among players active since 2000 with
   at least one tenure at a club in the selected leagues. Only clubs referenced
   by a kept tenure are included in the output.

## Caveats

- A player's spell *before their first recorded transfer* is dropped, because
  its start date is unknown. In practice this is almost always a youth club.
- Tenure boundaries come from transfer dates, so a player who transferred on
  the same day appears at both clubs on that one day.
- Loan-to-permanent conversions can produce very short "return" tenures (e.g.
  Mbappé shows a 1-day Monaco tenure between his loan at PSG ending and his
  permanent PSG move). These are kept as-is; downstream overlap logic may want
  a minimum-overlap-duration rule.
