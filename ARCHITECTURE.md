# Architecture Document — LILA BLACK Player Journey Visualizer

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Frontend | Vanilla HTML/JS/CSS | Zero build step, instant deployment to any static host, no framework bloat |
| Rendering | HTML5 Canvas (3-layer) | Handles thousands of animated points + trails performantly; far better than DOM/SVG at this scale |
| Data Pipeline | Python (pyarrow + pandas) | Converts 1,243 parquet files → lightweight JSON; runs once as preprocessing |
| Hosting | Static (GitHub Pages / Vercel) | Free, fast CDN, shareable URL — no server needed |

## Data Flow

```
┌─────────────────┐     preprocess.py      ┌───────────────────┐
│ 1,243 Parquet   │ ────────────────────▶  │ 796 match JSONs   │
│ files (8 MB)    │   coord mapping,       │ + index.json      │
│ 5 days × 3 maps │   byte decoding,       │ (~5 MB total)     │
└─────────────────┘   timestamp norm       └──────┬────────────┘
                                                   │
                              Browser loads index  │
                              ◀────────────────────┘
                                                   │
                              User picks match     │
                              ◀────────────────────┘
                                                   │
                              Renders on Canvas    ▼
                         ┌──────────────────────────────┐
                         │  3 Canvas Layers:             │
                         │  1. map-canvas (minimap img)  │
                         │  2. overlay-canvas (trails)   │
                         │  3. heatmap-canvas (overlays) │
                         └──────────────────────────────┘
```

**Coordinate Mapping:** World coords `(x, z)` → UV space `(u, v)` using per-map scale/origin → pixel coords on 1024×1024 minimap. Y-axis flipped (image origin = top-left).

## Key Design Decisions

1. **3-layer Canvas stack** — Separates static minimap from dynamic player data and heatmaps. This means we only redraw what changes (trails during playback, heatmap when toggled) instead of everything.

2. **Client-side JSON, no backend** — All data is preprocessed into static JSON files. The browser fetches `index.json` for the match list and individual `{match_id}.json` files on demand. This means zero server infrastructure.

3. **Normalized playback speed** — Match data spans ~300-800ms of game time. Instead of playing back in real-time (which would be imperceptible), playback is normalized to ~10 seconds at 1× speed.

4. **Offscreen canvas heatmap** — Heatmap is rendered to a 256×256 offscreen canvas first, then colorized and scaled up to the display canvas. This avoids rendering hundreds of gradient circles at full resolution.

## Trade-offs

| Decision | Trade-off |
|----------|-----------|
| Vanilla JS over React | Faster to ship, zero build; but harder to maintain if the tool grows significantly |
| All data in JSON | Fast to serve statically; but JSON is ~5× larger than parquet. At 5 MB total this is fine |
| Match-level loading | Only loads one match at a time — keeps memory low; but can't do cross-match analysis |
| Canvas over WebGL | Simpler code, good enough for ~1K events per match; WebGL would be needed for 10K+ simultaneous points |

## What I'd Do Differently With More Time

1. **Aggregate heatmap across all matches** — Currently heatmaps are per-match. An aggregate view showing kill/death hotspots across all 796 matches on a given map would be far more useful for level design decisions.

2. **Player search & tracking** — Let designers search for a specific player UUID and see all their matches, with the ability to follow that player across sessions.

3. **WebSocket live mode** — Stream live match data in real-time instead of static historical data.

4. **DuckDB in-browser (via WASM)** — Load parquet files directly in the browser without preprocessing, enabling SQL queries and dynamic aggregation.

5. **Zoom/pan controls** — Map zoom and pan for detailed inspection of specific areas (e.g., a particular building or chokepoint).
