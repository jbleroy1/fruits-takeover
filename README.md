# Arcade

Home-made browser games, and a home page that lists them.

**[Open the arcade](https://jbleroy1.github.io/fruits-takeover/)** — no install, no download, works on a
tablet. Or clone this repository and run `npm start`.

| Game | What it is |
|---|---|
| [**Sonic 4: Shattered Horizon**](sonic4/) 🦔 | A 2D platformer in **154 levels**: 17 zones × 6 acts, 50 branch levels and 2 Super finale levels, with Sonic, Tails, Knuckles and Amy |
| [**Fruits Takeover**](fruits-takeover/) 🍉 | A top-down survival shooter in **30 levels**: the orchard took the world and you are the last Juicer |

Neither game has dependencies, a build step or a single asset file: all art is drawn on a canvas and
all sound is synthesised in the browser. The only requirement is **Node.js 18+**, and only for the
local server and the tests.

```sh
npm start          # http://localhost:8080  - the home page, with both games one click away
npm test           # the home page check, then every game's own test suite
npm run home       # rebuild the home page's game list
npm run new-game -- my-game "A one line blurb"    # scaffold a new game in the right folder
```

## Adding a game

```sh
npm run new-game -- space-racer "Dodge the asteroids."
```

That creates `space-racer/` in this repository — the only place a game belongs — with a working page,
`game.js`, `game.json`, `package.json` and its own server, then rebuilds the home page so the card is
already there. `npm start` and the game is at `http://localhost:8080/space-racer/`.

By hand it is just as simple: drop the folder in with an `index.html` inside and run `npm run home`.
Either way, **every top-level folder holding an `index.html` becomes a card on the home page.**
Nothing lists games by hand.

Two house rules, enforced by `npm test` (`tools/check-links.js`): a game links back to the arcade
with `href="../"`, and if it draws on-screen touch controls it hides them while a menu is open.

To choose how the card looks, add a `game.json` to the folder:

```json
{
  "title": "Fruits Takeover",
  "blurb": "A top-down survival shooter in 30 levels.",
  "tags": ["shooter", "30 levels"],
  "emoji": "🍉",
  "color": "#7ee36a"
}
```

Without it, `tools/build-home.js` falls back to the folder's `package.json` description, the
`<title>` of its `index.html`, the first line of its `README.md`, and finally a prettified version
of the folder name, with a colour derived from that name.

And if a folder is pushed without rebuilding, the home page still finds it: on GitHub Pages it makes
**one** call to the repository's tree API (cached for half an hour) and adds any folder with an
`index.html` that is missing from its list, as a card with a dashed underline. The committed list is
what renders instantly; that call is only the safety net.

## Publishing

GitHub Pages serves the repository root as-is — no build step and no deploy workflow. Set it up once
under **Settings → Pages → Build and deployment**:

- **Source**: *Deploy from a branch*
- **Branch**: `main`, folder `/ (root)` → **Save**

Every push to `main` republishes the site a minute later. `.nojekyll` keeps Pages from running the
files through Jekyll, and free Pages needs the repository to be **public**.

`.github/workflows/test.yml` is separate from publishing: on every push it checks that the home page
is in sync with the folders on disk, then bot-plays **all 154 Sonic 4 levels** and **all 30 Fruits
Takeover levels** headlessly.

## Layout

| Path | What it is |
|---|---|
| `index.html` | the home page; its game list sits between the `GAMES:START` / `GAMES:END` markers |
| `games.json` | the same list as data, rebuilt by `npm run home` |
| `tools/build-home.js` | scans the folders and writes both of the above (`--check` fails if they are stale) |
| `tools/serve.js` | zero-dependency static server for the whole repository |
| `tools/new-game.js` | scaffolds a new game folder here and rebuilds the home page |
| `tools/check-links.js` | checks every game links back to the arcade and hides its touch pad on menus |
| `sonic4/`, `fruits-takeover/` | the games, each self-contained with its own README and tests |

## About these projects

Fan games, made for fun and not for sale. Sonic, Tails, Knuckles, Amy and Dr. Eggman are trademarks
of SEGA; these projects are not affiliated with or endorsed by SEGA and use none of their assets.
