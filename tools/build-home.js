#!/usr/bin/env node
/* Builds the arcade home page.

   Every top-level folder that contains an index.html counts as a game, so
   dropping a new game folder in is all it takes. Details come from that
   folder's game.json if it has one, otherwise from its package.json, the
   <title> of its index.html, or its README - and failing all that, from the
   folder name itself.

   Usage: node tools/build-home.js            rewrite games.json + index.html
          node tools/build-home.js --check    fail if either is out of date   */

const fs = require('fs'), path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP = new Set(['tools', 'node_modules', 'docs', 'assets', 'img', 'images']);
const CHECK = process.argv.includes('--check');
const START = '<!-- GAMES:START -->', END = '<!-- GAMES:END -->';

const readText = p => { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return ''; } };
const readJSON = p => { try { return JSON.parse(readText(p)); } catch (e) { return null; } };
const prettify = n => n.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
function hueOf(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

function describe(dir) {
  const abs = path.join(ROOT, dir);
  const man = readJSON(path.join(abs, 'game.json')) || {};
  const pkg = readJSON(path.join(abs, 'package.json')) || {};
  const html = readText(path.join(abs, 'index.html'));
  const titleTag = (html.match(/<title>([^<]*)<\/title>/i) || [])[1];
  const readme = readText(path.join(abs, 'README.md'));
  const para = readme.split('\n').map(l => l.trim())
    .filter(l => l && !/^[#>!|]/.test(l) && !l.startsWith('**[') && !l.startsWith('---'))[0] || '';
  const blurb = man.blurb || pkg.description || para.replace(/\*\*|\*|`|\[|\]\([^)]*\)/g, '');
  return {
    dir,
    title: (man.title || titleTag || pkg.description || prettify(dir)).trim(),
    blurb: blurb.length > 220 ? blurb.slice(0, 217).trimEnd() + '...' : blurb,
    tags: Array.isArray(man.tags) ? man.tags.slice(0, 5) : [],
    emoji: man.emoji || '\u{1F3AE}',
    color: man.color || 'hsl(' + hueOf(dir) + ' 78% 58%)'
  };
}

function findGames() {
  return fs.readdirSync(ROOT, { withFileTypes: true })
    .filter(e => e.isDirectory() && !e.name.startsWith('.') && !SKIP.has(e.name))
    .filter(e => fs.existsSync(path.join(ROOT, e.name, 'index.html')))
    .map(e => describe(e.name))
    .sort((a, b) => a.title.localeCompare(b.title));
}

const games = findGames();
const json = JSON.stringify(games, null, 2) + '\n';
const block = START + '\n<script>window.GAMES = ' + JSON.stringify(games) + ';</script>\n' + END;

const homePath = path.join(ROOT, 'index.html');
const home = readText(homePath);
const i = home.indexOf(START), j = home.indexOf(END);
if (i < 0 || j < 0) {
  console.error('index.html is missing the ' + START + ' / ' + END + ' markers');
  process.exit(1);
}
const newHome = home.slice(0, i) + block + home.slice(j + END.length);
const jsonPath = path.join(ROOT, 'games.json');
const staleJson = readText(jsonPath) !== json;
const staleHome = newHome !== home;

if (CHECK) {
  if (staleJson || staleHome) {
    console.error('the home page is out of date - run: npm run home');
    process.exit(1);
  }
  console.log('home page is in sync with ' + games.length + ' game folder(s)');
  process.exit(0);
}
if (staleJson) fs.writeFileSync(jsonPath, json);
if (staleHome) fs.writeFileSync(homePath, newHome);
console.log('home page lists ' + games.length + ' game(s): ' + games.map(g => g.dir).join(', '));
if (!staleJson && !staleHome) console.log('(nothing changed)');
