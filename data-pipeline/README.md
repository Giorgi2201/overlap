# Overlap data pipeline

Builds raw affiliation data for the Overlap game from the
[dcaribou/transfermarkt-datasets](https://github.com/dcaribou/transfermarkt-datasets)
project (Transfermarkt data, refreshed weekly upstream).

## Requirements

- Python 3.10+ (standard library only, no packages to install)

## Usage

From the repo root:

```bash
python data-pipeline/build_tenures.py          # player pool + club tenures
python data-pipeline/build_affiliations.py     # unify clubs + national teams
```

Optional (legacy overlap tooling — still present, not used by the new rule set):

```bash
python data-pipeline/build_graph.py
python data-pipeline/test_overlap.py
```

## Files

| File | Purpose |
| --- | --- |
| `build_tenures.py` | Downloads club/transfer CSVs and writes `output/raw-tenures.json` (player pool) |
| `build_affiliations.py` | Adds national teams and writes `output/raw-affiliations.json` (unified schema) |
| `overlap.py` / `test_overlap.py` / `build_graph.py` | Legacy 30-day club-overlap tooling (pre–rule-change) |

## Output: `raw-affiliations.json`

This is the canonical raw dataset going forward:

```json
{
  "players": [
    { "id": "...", "name": "...", "position": "...", "dob": "YYYY-MM-DD" }
  ],
  "entities": [
    { "id": "...", "name": "...", "type": "club" | "national_team", "country": "..." }
  ],
  "affiliations": [
    {
      "playerId": "...",
      "entityId": "...",
      "startDate": "YYYY-MM-DD" | null,
      "endDate": "YYYY-MM-DD" | null
    }
  ]
}
```

### Rule change (why this schema exists)

A valid in-game link between two players is now: **they share any entity
(club or national team) in their affiliations, at any time** — no date-range
overlap required. Dates on affiliations are **optional metadata only** and
must not be used for link validity.

- Club affiliations keep the derived tenure dates from `build_tenures.py`.
- National-team affiliations always have `startDate` / `endDate` = `null`
  (the source has no NT spell periods — only lifetime caps + current team id).

### National-team assignment

For each player in the pool:

1. Use `players.current_national_team_id` when it points at a row in
   `national_teams.csv`.
2. Else if `international_caps > 0`, map `country_of_citizenship` →
   `national_teams.country_name`.

Youth / U21 / U23 national teams are **not present** in
`national_teams.csv` (124 senior teams only), so no youth filter is needed.

### Refreshing the data

```bash
python data-pipeline/build_tenures.py --refresh
python data-pipeline/build_affiliations.py --refresh
```

| Flag | Default | Meaning |
| --- | --- | --- |
| `--top N` | `1000` | (`build_tenures.py`) players to keep by peak market value |
| `--leagues ID...` | top-7 European leagues | (`build_tenures.py`) pool filter |
| `--refresh` | off | Re-download source CSVs |

## How club tenures are derived (`build_tenures.py`)

Unchanged from before: transfers → chronological spells; youth/B/pseudo-clubs
dropped via absence from `clubs.csv`; top-N by peak market value in selected
leagues since 2000. See the script docstring for details.

## Known limitations (national teams)

- **No temporal NT data.** Caps are lifetime totals; there is no appearance
  log or debut/retirement date. NT affiliations cannot support date-based
  rules even if we wanted them.
- **Incomplete `national_teams` table.** Only ~124 senior sides. Capped
  players whose citizenship country is missing from that table (common for
  some African nations in this dump) get **no** NT affiliation.
- **Ramos / Kroos–style gaps.** Some well-known internationals have empty
  `international_caps` **and** empty `current_national_team_id` in the
  upstream dump. We do **not** special-case them: they simply receive no NT
  affiliation until the source fills those fields. Club affiliations are
  unaffected.
- **Citizenship fallback** can mis-attribute dual nationals who capped for a
  different country than `country_of_citizenship` when `current_national_team_id`
  is missing (retired players).
- Club id and national-team id namespaces do not collide in the current dump;
  entity `id` is the raw Transfermarkt id for both types.
