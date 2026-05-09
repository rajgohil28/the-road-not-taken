# LILA Journey Lab: The Road Not Taken

**LILA Journey Lab** is a high-fidelity map-intelligence workbench designed to transform raw LILA BLACK telemetry into dominant level-design and product strategies.

<video src="Trailer.mp4" controls="controls" muted="muted" width="100%"></video>

---

## 1. Problem Statement: The "Black Box" of Player Behavior

LILA BLACK produces massive volumes of spatial telemetry (Parquet/`.nakama-0`), but for Level Designers and Product Managers, this data is currently a "Black Box." 

*   **Spatial Blindness:** We know *that* players die, but we don't see *where* they were trapped before the final shot.
*   **Bot Noise:** Raw logs make it impossible to distinguish between meaningful human encounters and bot-on-bot attrition.
*   **Predictability Risk:** Without visual heatmaps, we cannot see if 80% of our map is "dead space," wasting production resources and boring our players.

## 2. Ideal Solution: The Intelligence Workbench

The ideal solution isn't a static dashboard; it's a **Tactical Workbench**. 

*   **Dynamic Playback:** Designers can scrub through matches in real-time, observing the "Chase Gap" and rotation failures.
*   **AI-Augmented Analysis:** A built-in Tactical Analyst (Gemini-powered) that can reason across map screenshots and telemetry to identify chokepoints and "ghost town" anomalies.
*   **Hybrid Ingestion:** A pipeline that supports both ultra-fast precomputed insights for global review and raw file uploads for immediate "post-match" debriefs.

## 3. Architecture: Built for Scale and Speed

The system is designed as a **Static-First Intelligence Tool** to ensure zero-latency for designers in the field.

*   **Data Pipeline:** A Python/PyArrow preprocessing engine that normalizes coordinate systems, decodes event bytes, and generates compact, match-grouped JSON payloads.
*   **Frontend Engine:** A React/Vite/TypeScript application utilizing a high-performance Canvas rendering layer for simultaneous path, event, and heatmap visualization.
*   **AI Integration:** A tool-calling architecture that allows an LLM to "see" the map viewport and query the spatial database, bridging the gap between raw data and human-readable advice.
*   **Coordinate Mapping:** Precise world-to-pixel translation ($u = (x - origin\_x) / scale$; $pixel\_y = (1 - v) * 1024$) ensuring sub-meter accuracy on minimap overlays.

## 4. Strategic Insights (Condensed)

*   **The Bot Vacuum:** 99.5% of deaths are bot-driven, leading to a "Ghost Town" experience for humans. *Recommendation: Implement COD-style engagement partitioning.*
*   **Super-Funnels:** 80% of traffic is concentrated in <15% of the map landmass. *Recommendation: Use BGMI-style rotating High-Tier Loot Zones to force map utilization.*
*   **The Chase Gap:** Fatalities cluster in open fields far from initial contact points. *Recommendation: Add transitional "Leap-frog Cover" every 30-50m in high-traffic corridors.*

---

## 5. Founder’s Note: The Path to $100M ARR in 4 Years

To reach a $100M ARR milestone by 2030, LILA BLACK must evolve from an extraction shooter into a **High-Retention Ecosystem**. The data from this tool suggests a clear three-phase roadmap:

### Phase 1: Polish & Pacing (Year 1)
Fix the **Bot Vacuum**. By tuning bot aggression and spawn pacing using spatial heatmaps, we increase Human Encounter Density. If players meet rivals more often than bots, Day 30 retention (D30) will climb by 15-20%.

### Phase 2: The Content Treadmill Efficiency (Year 2)
Optimize **Map Utilization**. Stop building 100% of a map if only 15% is used. Use the Journey Lab to identify "Dead Zones" and dynamically inject event-driven landmarks (VIPs). This reduces production costs while making every match feel unique—essential for the competitive GTM strategy against *COD Mobile*.

### Phase 3: Live-Ops as a Service (Year 3-4)
Scale to **$100M ARR** by monetizing the "Meta." Use spatial intelligence to drive limited-time "Map Takeovers" and "Faction Wars" in underutilized sectors. By providing a "Delta 4" experience—where the map itself feels alive and responsive to player behavior—we command the same premium ARPU as *BGMI* and *Genshin Impact*.

---

## Setup & Validation

### Technical Requirements
- Node.js 18+
- Python 3.9+ (with `pyarrow`)

### Installation
```bash
npm install
python3 -m pip install pyarrow
python3 scripts/preprocess_data.py --input /path/to/player_data --output public/data
npm run dev
```

### Validation
```bash
npm run test  # Validates coordinate mapping, bot detection, and event decoding
```
