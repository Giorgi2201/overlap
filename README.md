# Overlap

Connect two footballers through teammates who actually overlapped at the same club for at least 30 days.

## App

```bash
npm install
npm run dev      # local Vite server
npm test         # Vitest suite
npm run build    # production build
```

## Data pipeline

Python scripts that refresh `src/data/graph-data.json` from Transfermarkt CSVs live in `data-pipeline/`. See [data-pipeline/README.md](data-pipeline/README.md).

```bash
python data-pipeline/build_tenures.py
python data-pipeline/build_graph.py
# then copy data-pipeline/output/graph-data.json → src/data/graph-data.json
```
