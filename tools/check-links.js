#!/usr/bin/env node
/* Every game must offer a way back to the arcade, and must not hold a touch
   overlay that a CSS mishap could leave on top of its menus. This checks both
   on each game folder, so a new game cannot quietly skip them. */

const fs = require('fs'), path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP = new Set(['tools', 'node_modules', 'docs', 'assets', 'img', 'images']);
const games = fs.readdirSync(ROOT, { withFileTypes: true })
  .filter(e => e.isDirectory() && !e.name.startsWith('.') && !SKIP.has(e.name))
  .filter(e => fs.existsSync(path.join(ROOT, e.name, 'index.html')))
  .map(e => e.name);

let bad = 0;
for (const g of games) {
  const html = fs.readFileSync(path.join(ROOT, g, 'index.html'), 'utf8');
  const back = /href\s*=\s*["']\.\.\/?["']/.test(html);
  const pad = /id\s*=\s*["']touch["']/.test(html);
  const guarded = !pad || /#touch\.hide|#touch\.on/.test(html);
  console.log('  ' + (back && guarded ? 'ok   ' : 'FAIL ') + g +
    ' | back to the arcade: ' + (back ? 'yes' : 'MISSING') +
    ' | touch pad: ' + (pad ? (guarded ? 'hidden on menus' : 'NOT HIDDEN ON MENUS') : 'none'));
  if (!back || !guarded) bad++;
}
if (!games.length) console.log('  (no game folders yet)');
if (bad) {
  console.error('\n' + bad + ' game(s) need a link back to the arcade (href="../"), ' +
    'and a touch overlay that hides itself when a menu is open');
  process.exit(1);
}
console.log(games.length + ' game(s) link back to the arcade and keep their controls off the menus');
