# Fog of War pixel assets

Original art for this game. Nothing here is copied from Into the Breach, Wargroove, or the reference screenshots.

`scripts/build-pixel-assets.mjs` paints the PNGs and the short synthesized WAV cues. Run it with `npm run assets`. The script is the source: limited midnight, cyan, violet, stone, moss, and gold ramps, drawn as pixels rather than scaled photos.

| Path | What it is |
| --- | --- |
| `characters/warden.png` | Cyan hooded Warden, 4 frames by 10 rows. Rows: idle, walk south, walk north, walk east, walk west, attack, guard, hit, victory, defeat. Each frame is 32×40. |
| `characters/wraith.png` | Violet and crimson Wraith, same sheet. |
| `tiles/floor.png` | Four 32×32 floors: plain, cracked, damaged, moss. Each frame is one tactical square. The dark edge is the grid line, not a second board. |
| `tiles/wall.png` | Stone course. It is not the page background. |
| `tiles/pillar.png` | The four blocking pillars. |
| `environment/torch.png` | Four flame frames, 16×24. |
| `environment/layer-stars.png`, `layer-ridges.png`, `layer-mist.png` | Repeating transparent layers. They meet at the edges, so the page has no boxed sky. |
| `environment/ruined-city.jpg` | Original generated scenery for the page background: a moonlit ruined city, 1280×720, shown at its own pixel size (no stretch). It is not a tile and it is not an obstacle. |
| `environment/layer-castle.png` | Earlier one-building stand-in. The page no longer uses it. |
| `environment/sky.png` | Earlier full-frame night picture. The page no longer uses it as a rectangle. |
| `environment/ruins.png` | A smaller ruin strip kept with the generator. It is not a tile and it is not an obstacle. |
| `environment/crystal-cyan.png`, `crystal-violet.png` | Corner crystals. |
| `ui/advance.png`, `strike.png`, `guard.png`, `lock.png` | Order icons. |
| `effects/legal.png`, `selected.png`, `attack.png`, `slash.png`, `shadow.png` | Cell highlights, the strike flash, and the ground shadow. |
| `audio/*.wav` | Original square-ish tones. Playback stays muted until the player turns sound on. |

The board is still the public 5×5. These pictures do not add squares, heights, or units.
