# Sonic 4: Shattered Horizon

**[Play it here](https://jbleroy1.github.io/fruits-takeover/)** (once GitHub Pages is switched on for
this repository) — or clone it and run `npm start`.

A 2D side-scrolling platformer. Dr. Eggman shattered the sky into **17 zones**; four heroes run,
fly, glide and hammer their way back across it.

- **102 main acts** — 17 zones × 6 acts, every zone ending in a boss fight
- **50 branch levels** — optional side stages hanging off the zones, where the Chaos Emeralds hide
- **2 Super finale levels** — *The Doomsday*, where your hero is Super and Eggman brings out a giant robot
- **154 levels in all**, every one of them playable by **Sonic, Tails, Knuckles or Amy**

No build step, no runtime dependencies, no images or sound files — the whole game is drawn and
synthesised in code. Open `index.html` in a browser, or serve it locally:

```sh
npm start                 # http://localhost:8080  (picks the next free port if 8080 is taken)
node tools/serve.js 3000  # or choose your own port
```

The only requirement is **Node.js 18+** (installed here at `~/.local/bin/node`), and only for the
local server and the tests — the game itself is plain HTML, CSS and JavaScript. There is no
`node_modules`; `npm install` is not needed.

## The four heroes

| Hero | Speed | Second ability |
|---|---|---|
| **Sonic** | fastest | **Spin Dash** — hold `↓`, tap jump to charge, release `↓` to fire. Jump again in mid-air for an air dash. |
| **Tails** | medium | **Flight** — press jump again in mid-air and hold to fly for about three seconds. |
| **Knuckles** | medium | **Glide & Climb** — press jump again in mid-air to glide; hit a wall to cling, then `↑`/`↓` to climb and jump off. |
| **Amy** | medium | **Piko Hammer** — `X` swings it; it smashes badniks and cracked blocks. Jumping again in mid-air is a hammer hop. |

Switch hero any time from the zone map. Progress is shared, so a level cleared with Tails stays
cleared for everyone.

## Controls

| | |
|---|---|
| Move | `A` `D` or `←` `→` |
| Jump | `Space`, `W`, `↑`, `Z` or `K` |
| Roll / crouch | `S` or `↓` (roll while running) |
| Attack | `X`, `J` or `Shift` |
| Second ability | jump again in mid-air |
| Pause | `P` or `Esc` |
| Restart level | `R` |
| Mute | `M` |
| Tablet / phone | on-screen buttons: D-pad, JUMP, X, `| |` pause, `[ ]` fullscreen |

## On a tablet or phone

The game detects a touch screen and lays its own controls over the stage: a D-pad bottom left,
**JUMP** and **X** bottom right, and small **pause** and **fullscreen** buttons in the middle. The
buttons are multi-touch, so running and jumping at the same time works the way it should, and the
pad hides itself whenever a menu is open. On a small screen the stage drops its frame and fills the
display; in portrait a line under the stage suggests turning the tablet sideways, which gives the
biggest picture. `[ ]` (or the FULLSCREEN button on the title and pause screens) goes properly
full-screen. Pinch-zoom, double-tap zoom, pull-to-refresh and long-press menus are all turned off
so they cannot interrupt a run.

## How the game plays

Rings are your health, the classic way: get hit with rings and you scatter them, get hit with none
and you lose a life. 100 rings is an extra life. Rings sit at running height along the path, so you
sweep them up as you go; the ones in arcs and on high ledges are the ones worth jumping for.

On a **ring-quota level** (Act 4 of every zone, and the Ring Rush branch levels) the goal post is
padlocked and shows how many rings are still missing. That quota counts every ring you **collect**
during the level, not the rings still in your hands — getting hit, or dying back to a checkpoint,
never undoes your progress toward opening the goal. Every such level holds at least three times its
quota, and the exact number is on the zone map before you start.

Item monitors hold rings, a shield, speed shoes, invincibility or a 1-up — break them by rolling,
jumping or attacking. Checkpoints restart you part-way through a level instead of at the start. In
the boss and siege arenas **rings grow back** every few seconds, so a long fight always leaves you
something to pick up and heal with.

Slopes build speed, rolling downhill builds more, and springs, bumpers and breakable crates are
scattered through every zone.

Two deliberate kindnesses to younger players (three, if you count the finale, where being Super
means nothing can touch you at all). **A ravine is never an instant death**: three tiles
down there is always something to land on — a hazard pool that costs you your rings, or a lower
ledge — and every hero's jump clears the climb back out. And **nothing in this game kills you for
being slow**: there is no chasing wall, and the clock on a target-time act is a bonus to chase, not
a countdown to death. You start with **five lives** and earn another every 100 rings. What actually
ends a run is running into a hazard or a badnik with no rings left to lose.

## The zones

| # | Zone | # | Zone | # | Zone |
|---|---|---|---|---|---|
| 1 | Verdant Hills | 7 | Frostbite Peaks | 13 | Gigalopolis |
| 2 | Sapphire Shore | 8 | Thunder Skyway | 14 | Starlight Orbit |
| 3 | Neon Casino | 9 | Toxic Treatment | 15 | Chrono Rift |
| 4 | Scrap Foundry | 10 | Jungle Ruins | 16 | Mecha Citadel |
| 5 | Crystal Caverns | 11 | Carnival Lights | 17 | Final Dominion |
| 6 | Mirage Dunes | 12 | Magma Core | 18 | The Doomsday (finale) |

Each zone runs Act 1 → Act 6:

- **Acts 1 & 2** — reach the goal post
- **Act 3** — the same, with a **target time** for a big bonus (missing it costs you nothing)
- **Act 4** — collect the ring quota (12 to 20, shown on the map), then the goal opens
- **Act 5** — **Ring Road**: the longest, most open act of the zone, paved with rings
- **Act 6** — the zone boss, six different machines plus the Death Egg Mk IV finale

## The Super finale

Page 18 of the zone map is **The Doomsday**: two levels long, and the only place where your hero
starts **Super** — golden, invincible, faster, able to **fly for as long as you like**, and able to
smash badniks just by touching them. Super never runs out here and no emeralds are required.
**Super Dash is open from the very first time you play** (it is the set piece, not a reward for
grinding), and clearing it opens the Colossus; finishing Final Dominion Act 6 also walks you
straight into it.

1. **Super Dash** — the longest run in the game, straight through the broken sky after Eggman.
2. **Egg Colossus** — his giant robot, 176 × 216 pixels of it, stomping around a long deck. The
   **cockpit** is the weak point and a ring marks it; one Super jump from the deck reaches it, and
   the four ledges make it easier. It takes **24 hits** and changes its attack twice on the way
   down: stomps, then arm cannons, then a desperate charge. Beating it is the end of the game.

## The 50 branch levels

Three per zone (two in Final Dominion), each unlocked by clearing a main act in the same zone, each
one a short self-contained challenge: **Speed Run**, **Sky Climb**, **Gauntlet**, **Last Stand** and
**Ring Rush**. Clearing one earns a medal.

Branch **Gamma** of zones 1 through 7 holds a **Chaos Emerald**. Collect all seven, then press
`Attack` in mid-air while holding 50 rings to turn **Super** — invincible and faster, burning one
ring a second.

## Files

| File | What it is |
|---|---|
| `index.html` | page, styling, HUD, touch controls and every menu screen |
| `game.js` | the whole engine: levels, physics, badniks, bosses, rendering, UI wiring |
| `tools/harness.js` | headless test harness (stubs the DOM and canvas, bot-plays levels) |
| `tools/serve.js` | zero-dependency local static server |
| `package.json` | `npm start` to serve, `npm test` to run the suites |

Levels are generated from a fixed seed per level, so level 57 is the same level every time, for
everyone — but the 152 layouts are built from zone themes, feature tables and hand-written rules
rather than 152 hand-placed maps. Each generator also records the intended path through the level
in `L.route`, which is what lets the test bot play all of them.

## Tests

Requires Node (installed at `~/.local/bin/node`):

```sh
npm test                                  # UI/save/unlock flow, then every hero across the zones
node tools/harness.js game.js flow        # menus, saving, unlocking, emeralds, losing a life
node tools/harness.js game.js heroes      # all four heroes, one act per zone
node tools/harness.js game.js all         # bot-plays all 154 levels
node tools/harness.js game.js main        # the 102 main acts
node tools/harness.js game.js branch      # the 50 branch levels
```

```sh
node tools/harness.js game.js all 57 5    # level 57 only, five times
CHAR=knuckles node tools/harness.js game.js all      # the whole game as one hero
node tools/harness.js game.js dbg 57      # frame-by-frame trace + an ASCII map of the terrain
```

`flow` also checks the Super finale — that both levels start you Super, that Super never runs out
there, that the Colossus is the right size, takes damage and goes down — and the tablet controls: that the on-screen D-pad and JUMP button work, that two
fingers at once run and jump together, that the pause button pauses, and that the pad hides itself
behind a menu.

The bot follows each level's recorded route and jumps at walls, gaps, spikes and hazards; against
bosses it closes in, jumps on the hull and backs off while they flash. It plays with rings topped up
and no knockback, so these runs test that every level is **completable**, not that it is easy —
`flow`, `heroes`, `main`, `branch` and `all` should all finish with everything cleared.

## Publishing

The game is plain static files, so GitHub Pages serves it as-is — no build step, nothing to
configure. `.github/workflows/pages.yml` runs the test suites on every push and then publishes the
repository root to Pages, enabling Pages itself the first time it runs. That deploy job is skipped
while the repository is private (free Pages needs a public repository), so if the play link above is
dead: make the repository public under **Settings → General → Change repository visibility**, then
re-run the workflow from the **Actions** tab. The link becomes live a minute later.

## Adding to the game

- **A zone**: add an entry to `ZONES` in `game.js` (name, theme, palette, badnik mix, hazard look).
  Six acts and three branch levels are generated for it automatically, and it gets its own page on
  the zone map. The last entry carries `finale: true`, which gives it the two Super levels from the
  `FINALE` table instead of acts.
- **A badnik**: add it to the `BAD` table with one of the existing `ai` behaviours — or a new `case`
  in `updateBadnik` — then list it in a zone's `mix`, and draw it in `drawBadnik`.
- **A boss**: bosses are patterns `0`–`4` in `updateBoss`, picked by `zone % 5`, with the Death Egg
  Mk IV in Final Dominion switching pattern as its health drops. The Egg Colossus is its own pair of
  functions, `updateColossus` and `drawColossus`.
- **A level feature**: add a weight in the `feats` table in `genHoriz` and a branch that builds it.
  Push a waypoint with `addRoute` so the test bot knows the way through.

## About this project

A fan game, made for fun and not for sale. Sonic, Tails, Knuckles, Amy and Dr. Eggman are
trademarks of SEGA; this project is not affiliated with or endorsed by SEGA, and it uses none of
their assets — every sprite here is drawn with canvas shapes in `game.js` and every sound is
synthesised with the Web Audio API.
