# Fruits Takeover

A 2D top-down survival shooter. The orchard took the world; you are the last Juicer.
**30 levels**: 10 base, 10 normal, and 10 bonus levels that alternate mini-bosses with vault key hunts.

**[Play it here](https://jbleroy1.github.io/fruits-takeover/fruits-takeover/)** — no install, and it
works on a tablet: two thumb sticks and a DASH button appear by themselves, down in the corners
where your hands do not cover the fruit.

No build step, no runtime dependencies. Open `index.html` in a browser, or serve it locally:

```sh
npm start                 # http://localhost:8080  (picks the next free port if 8080 is taken)
node tools/serve.js 3000  # or choose your own port
```

The only requirement is **Node.js 18+** (installed here at `~/.local/bin/node`), and only for the
local server and the tests — the game itself is plain HTML, CSS and JavaScript with no packages
to install. There is no `node_modules`; `npm install` is not needed.

## On a phone or tablet

The game notices a touch screen and puts its controls in a **bar below the arena** — nothing is ever
drawn over the game, so your hands cannot cover the fruit: a **left stick to move**, a **right stick
that aims and fires while you hold it**, and a **DASH** button — dashing is the only way to shake rot off, and it used to be
reachable by keyboard only. `| |` pauses and `[ ]` goes fullscreen. The free-form touch controls
still work too: drag anywhere on the left half to move, hold the right half to aim and fire.

## The idea behind the fighting

Fruit does not kill you quickly, and that is the point. Contact does small damage and leaves
**rot** on you, and rot eats your life for as long as it is there. You shake rot off by dashing,
or scrub it with a salt packet. Standing still is what kills you; the fruit is just waiting.

## Controls

| | |
|---|---|
| Move | `W A S D` or arrow keys |
| Aim / fire | mouse, hold to keep firing |
| Fire forward | `Space` |
| Dash | `Shift` — brief invincibility, shakes off rot |
| Pause | `P` or `Esc` |
| Mute | `M` |
| Touch | drag the left half to move, hold the right half to aim and fire |
| Phone / tablet | two **thumb sticks** in the corners — left to move, right to aim and fire — plus **DASH**, `| |` pause, `[ ]` fullscreen |
| Back to the arcade | the **← ARCADE** link on the title screen and in the pause menu |

## The 30 levels

- **Act I — Base (1–10)**: one new fruit at a time, ending with the first Melon Sergeant.
- **Act II — Normal (11–20)**: bigger arenas, darkness, floods, and fruit that shoots back.
- **Act III — Bonus (21–30)**: five mini-bosses and a final boss, alternating with four vault
  levels where you hunt three hidden keys each. 12 keys exist; keys buy permanent perks in the Vault.

Level types: clear every fruit, survive a timer, beat a boss, or find the keys.

## Progression

- **In-run upgrades**: after each cleared level, pick 1 of 3 (double barrel, piercing, frost, orbit blade…).
  Golden crates drop them mid-level too. Starting a level from the map hands you a *field kit* of
  auto-rolled upgrades scaled to that level, so any unlocked level is playable on its own.
- **Vault perks**: bought with keys, these never wear off (extra life, faster rot decay, a spare dash…).
- Progress, keys and perks are saved in `localStorage`. Replaying a cleared vault level does not mint new keys.

## Files

| File | What it is |
|---|---|
| `index.html` | page, styling, HUD and all menu screens |
| `game.js` | the whole engine: data, spawning, AI, bosses, rendering, UI wiring |
| `tools/harness.js` | headless test harness (stubs the DOM and canvas, bot-plays every level) |
| `tools/serve.js` | zero-dependency local static server |
| `package.json` | `npm start` to serve, `npm test` to run the harness |

## Tests

Requires Node (installed at `~/.local/bin/node`):

```sh
npm test                              # the two pass/fail suites below, in order
node tools/harness.js game.js god     # bot-plays all 30 levels with topped-up health
node tools/harness.js game.js normal  # same, no safety net - a difficulty read
node tools/harness.js game.js flow    # menus, saving, upgrades, keys, the vault
```

```sh
node tools/harness.js game.js sloppy  # imprecise aim + intermittent fire: closest to a real player
node tools/harness.js game.js normal 30 8   # one level, eight times, with a win rate
```

`god` and `flow` should finish with no failures. `normal` and `sloppy` are balance checks, not
pass/fail: the bot never dashes, so losing the hardest levels there is expected. The last two
arguments are a level number and a repeat count, which is how the final boss was tuned.

## Adding a level

Levels are plain data in the `LEVELS` array in `game.js`. A level needs a `name`, a `type`
(`clear`, `survive`, `boss`, `keys`), a `theme`, a `layout`, a `world` size, and either
`waves`, a `dur`, a `boss` id, or a `keys` count. New fruit goes in the `FRUIT` table with one of
the existing `ai` behaviours, or a new `case` in `fruitThink`.
