# LILA Journey Lab: Product & Gameplay Insights

This document translates raw spatial telemetry from Ambrose Valley, Grand Rift, and Lockdown into a product strategy. Our goal is to move beyond "showing data" and toward a roadmap that elevates LILA BLACK to the competitive polish of industry leaders like *Call of Duty (COD)* and *Battlegrounds Mobile India (BGMI)*.

---

## Insight 1: The "Ghost Town" Paradox (Bot Attrition)

### The Data
- **Combat Distribution:** 99.5% of recorded deaths are Bot-on-Bot or Bot-on-Player (`BotKill`: 2,415, `BotKilled`: 700).
- **Human Participation:** Only **3** Human-on-Human kills/deaths were recorded across 796 matches.

### Interpretation
The "Delta 4" experience of a Battle Royale or Extraction Shooter relies on high-stakes human encounters. In the current slice, bots are acting as a "global vacuum," cleaning out the map's population before human players ever cross paths. This creates a spatial experience where players move through empty zones without the threat of a thinking opponent.

### Current State of Play
LILA BLACK currently feels like a PVE-dominant experience. While bots provide "pacing," they are currently distorting it by causing premature match attrition. The tension curve is flat because the "predator" (the human player) rarely meets their "prey" or an equal rival.

### Strategic Roadmap: Reaching COD/BGMI Standards
- **Bot Behavior Partitioning:** Implement "Engagement Logic" similar to *COD: Warzone* bots. Bots should exist to guard high-tier loot or provide atmospheric resistance, but they must be programmed to *disengage* or *redeploy* if they are about to eliminate too many participants before the mid-game circle.
- **Dynamic Spawn Throttling:** If telemetry shows a high Bot Attrition Rate in the first 2 minutes, the system should dynamically adjust spawn density in subsequent matches to preserve "Human Encounter Density."
- **Goal:** Shift the 99.5% bot-death ratio toward a 60/40 split to ensure the "Victory" feels earned against humans, not just survivors of a bot-clearance.

---

## Insight 2: The Predictability Trap (Funnel Congestion)

### The Data
- **Traffic Concentration:** Movement is hyper-localized. Ambrose Valley cell `6,7` holds 1,718 movement samples, while neighboring sectors are nearly untouched.
- **Pathing:** 80% of routes follow the same 3 linear paths through the map center.

### Interpretation
Level Designers have inadvertently created "Super-Funnels." While *BGMI* uses "hot drops" (like Pochinki) to create early-game action, those are player-chosen risks. In LILA, the traffic density suggests players *must* take these routes to progress/extract, making the gameplay loop predictable and repetitive.

### Current State of Play
The maps are effectively "smaller" than their physical dimensions. If only 15% of the landmass is used for 80% of the movement, the production cost of the remaining 85% of the map is being wasted.

### Strategic Roadmap: Reaching COD/BGMI Standards
- **Variable Interest Points (VIPs):** Adopt the *COD* approach of rotating "High Tier Loot Zones" per match. This forces players to break their pathing habits and use the "ignored" areas of the map.
- **Micro-Environment Diversification:** Use the traffic heatmap to identify "Dead Zones" and inject unique landmarks (e.g., a downed satellite, a temporary smuggler camp) to pull players off the central funnels.
- **Goal:** Increase map utilization from the current estimated 15% to at least 45% by diversifying extraction and loot distribution.

---

## Insight 3: The "Chase Gap" and Retreat Mechanics

### The Data
- **Spatial Desync:** Kill events (initial contact) cluster in compounds (e.g., cell `8,8`), but Death events (finality) cluster 200+ meters away in open fields (e.g., cell `6,7`).

### Interpretation
There is a significant "Chase Gap." Players are engaging in cover-rich environments but dying in "No Man's Land" while trying to rotate or retreat. This indicates that the transitional spaces between map landmarks lack the defensive utility required for high-level play.

### Current State of Play
The "Time-to-Death" during a retreat is likely too low. In competitive titles like *BGMI*, players use vehicles, smoke grenades, or "soft cover" (terrain dips) to survive a rotation. LILA's data suggests that once a player leaves a compound under fire, they are effectively a "walking target" with no way to reset the fight.

### Strategic Roadmap: Reaching COD/BGMI Standards
- **Transitional Cover Pass:** Level Designers should use the "Chase Gap" data to place "Leap-frog Cover"—small rocks, bushes, or terrain ridges—every 30-50 meters in high-traffic corridors.
- **Tactical Utility Integration:** If spatial data shows deaths in open fields, it's a signal to the GTM team that "Utility Items" (Smoke, Port-a-cover) need to be higher in the loot table to compensate for map openness.
- **Goal:** Reduce the "Chase Gap" mortality rate by 20% to allow for more "clutch" escapes and mid-rotation turn-arounds, increasing overall player retention and match satisfaction.
