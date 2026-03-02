# LILA BLACK — Player Journey Visualizer

> A web-based tool for Level Designers to explore player behavior across game maps using raw telemetry data.

## 🌐 Live Demo

**👉 [https://keerthan614.github.io/LILA/](https://keerthan614.github.io/LILA/)**

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🗺️ **3 Maps** | Ambrose Valley, Grand Rift, Lockdown — rendered on HTML5 Canvas |
| 🎯 **Player Trails** | Human players (cyan) vs bots (gray) with movement paths |
| ⚔️ **Event Markers** | Kill (red ✕), Death (orange ☠), Storm (purple ⚡), Loot (gold ◆) |
| 🔍 **Filtering** | Filter by map, date (Feb 10–14), and match |
| 👁️ **Visibility Toggles** | Show/hide humans, bots, trails, and events independently |
| ▶️ **Timeline Playback** | Play/pause with 1×, 2×, 4×, 8× speed controls |
| 🔥 **Heatmap Overlays** | Kill zones, death zones, and traffic density |
| 💬 **Tooltips** | Hover over events for details |

## 📸 Screenshots

<p align="center">
  <img src="https://github.com/keerthan614/LILA/raw/main/app/public/minimaps/AmbroseValley_Minimap.png" width="200" alt="Ambrose Valley">
  <img src="https://github.com/keerthan614/LILA/raw/main/app/public/minimaps/GrandRift_Minimap.png" width="200" alt="Grand Rift">
  <img src="https://github.com/keerthan614/LILA/raw/main/app/public/minimaps/Lockdown_Minimap.jpg" width="200" alt="Lockdown">
</p>

## 🏗️ Architecture

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Frontend | Vanilla HTML/JS/CSS | Zero build step, instant deployment |
| Rendering | HTML5 Canvas (3-layer) | Handles 1000+ animated points performantly |
| Data Pipeline | Python (pyarrow + pandas) | Converts 1,243 parquet files → 796 match JSONs |
| Hosting | GitHub Pages + Actions | Free, auto-deploys on push |

See [ARCHITECTURE.md](ARCHITECTURE.md) for full design document with trade-offs and future improvements.

## 🚀 Run Locally

```bash
cd app
python3 -m http.server 8080
# Open http://localhost:8080
```

## 📁 Project Structure

```
LILA/
├── app/
│   ├── index.html          # Main page
│   ├── styles.css           # Dark theme CSS
│   ├── app.js               # Core rendering & interaction
│   └── public/
│       ├── data/            # 796 preprocessed match JSONs
│       └── minimaps/        # 3 map images
├── scripts/
│   └── preprocess.py        # Parquet → JSON pipeline
├── ARCHITECTURE.md          # Design document
└── .github/workflows/
    └── deploy.yml           # GitHub Pages CI/CD
```

## 🛠️ Data Pipeline

```bash
# Only needed if re-processing from raw parquet data
python3 -m venv .venv && source .venv/bin/activate
pip install pyarrow pandas
python3 scripts/preprocess.py
```

---

**Built by Keerthan Reddy** | Associate Product Manager Candidate
