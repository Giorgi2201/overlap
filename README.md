# Overlap

Connect two footballers through genuine teammates — same club in the same window of time, or the same national team in any era.

## Play

1. You’re given a **start** player and a **target** player.
2. Open the active player, pick a club or national team, then pick a teammate who shared that side.
3. Repeat until you reach the target. Each club/NT hop counts toward your score.
4. Puzzles get harder as your **level** rises. Progress is saved in the browser.

**Club links** only count when tenures overlap for at least **30 days**.  
**National teams** are looser: any shared side works (UI labels them “any era”).  
Dead-end options stay visible but disabled, so you don’t walk into a wall blind.

Controls sit in a floating pill: **Home** (back to menu, keeps level), **Undo**, **Give up** (reset level to 1).

## Run

```bash
npm install
npm run dev       # Vite at http://localhost:5173
npm test          # Vitest
npm run build     # production build
npm run preview   # preview the build
npm run lint      # ESLint
```

Stack: **React 19**, **TypeScript**, **Vite 8**. No router or extra state libraries.

## What’s in the app

- Fixed single-viewport game shell (page doesn’t scroll; the options grid does)
- Portrait player cards (Transfermarkt images), path breadcrumb, searchable options when the list gets long
- Win screen with hop stats, optional shortest-path reveal, next level
- Session restore mid-puzzle; after a win, refresh starts the next puzzle
- Shared motion tokens (entrances, modal, staggered options) with `prefers-reduced-motion` support
- Works on mobile and desktop

## Layout

| Path | Role |
| --- | --- |
| `src/components/` | StartScreen, GameScreen, PlayerCard, ConnectionPanel, BottomNav |
| `src/state/` | Game reducer + localStorage hydrate/persist |
| `src/lib/` | Graph, overlap rules, pathfinding, dead ends, difficulty |
| `src/data/` | Bundled `graph-data.json` |
| `src/styles/` | Design + motion tokens |
| `data-pipeline/` | Python builders from Transfermarkt CSVs |
| `public/` | Hero videos, static assets |

## Data pipeline

Player/club/NT affiliations are built from [transfermarkt-datasets](https://github.com/dcaribou/transfermarkt-datasets) into `src/data/graph-data.json`. Details and refresh steps: [data-pipeline/README.md](data-pipeline/README.md).

```bash
python data-pipeline/build_tenures.py
python data-pipeline/build_affiliations.py
```
