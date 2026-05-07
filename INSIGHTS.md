# Gameplay Insights

These findings come from the generated dataset summary in `public/data/insights.json`: 796 matches, 89,104 rows, 73,059 movement rows, and 16,045 discrete event rows.

## 1. Traffic concentrates into a small number of map cells

**Pattern:** The highest-traffic 16x16 minimap cells are measurable per map: Ambrose Valley cell `6,7` has 1,718 movement samples, Grand Rift cell `7,9` has 288, and Lockdown cell `3,6` has 842.

**Why a level designer should care:** If a few cells dominate movement, those areas may be acting as mandatory funnels. That can be good for tension, but it can also make rotations predictable.

**Action:** Review those cells in the traffic heatmap and compare them against intended objective/extract routing. Track path diversity and average encounter distance after any layout changes.

## 2. Combat and death zones are not always the same zones

**Pattern:** Ambrose Valley's top kill cell is `8,8`, while its top death cell is `6,7`. Lockdown shows a similar split: top kill cell `9,8`, top death cell `8,4`. Grand Rift is tighter, with traffic, kills, and deaths all peaking in `7,9`.

**Why a level designer should care:** A gap between kill hotspots and death hotspots can reveal chase routes, exposed exits, or storm pressure points.

**Action:** Inspect kill and death overlays per map. Adjust cover, sightlines, loot placement, or storm pacing depending on whether deaths cluster in unfair or uninteresting spaces. Metrics to watch: death location concentration, repeat deaths per zone, and time-to-death after entering hotspot cells.

## 3. Bot movement can be compared directly against human movement

**Pattern:** Bot interactions dominate recorded combat: `BotKill` appears 2,415 times, `BotKilled` 700 times, while human-vs-human `Kill`/`Killed` events appear only 3 times each in this slice.

**Why a level designer should care:** Bots should support pacing and pressure without making the map feel artificial. If bot paths miss human routes entirely, they may not be contributing enough; if they overlap too heavily, they may feel oppressive.

**Action:** Use the human/bot toggles with the traffic heatmap to tune spawn routes and patrol logic. Track bot encounter rate, player deaths to bots, and early-match attrition.
