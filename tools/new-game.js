#!/usr/bin/env node
/* Starts a new game in the right place.

   Usage: npm run new-game -- my-game ["A one line blurb"]

   Creates <repo>/my-game/ with a working page, a game.json and a package.json,
   then rebuilds the home page so the card is there straight away.            */

const fs = require('fs'), path = require('path');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2).filter(a => a !== '--');
const name = (args[0] || '').trim();
const blurb = (args[1] || '').trim() || 'A new game. Edit game.js to build it.';

if (!name) {
  console.error('usage: npm run new-game -- <folder-name> ["blurb"]');
  process.exit(1);
}
if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
  console.error('the folder name should be lower case letters, digits and dashes, e.g. space-racer');
  process.exit(1);
}
const dir = path.join(ROOT, name);
if (fs.existsSync(dir)) {
  console.error(name + '/ already exists - pick another name, or just edit it');
  process.exit(1);
}
const title = name.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

fs.mkdirSync(path.join(dir, 'tools'), { recursive: true });
fs.writeFileSync(path.join(dir, 'game.json'), JSON.stringify({
  title, blurb, tags: ['work in progress'], emoji: '\u{1F3AE}', color: '#2f8ff5'
}, null, 2) + '\n');
fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
  name, version: '1.0.0', description: blurb, private: true,
  scripts: { start: 'node tools/serve.js' }, engines: { node: '>=18' }
}, null, 2) + '\n');
fs.copyFileSync(path.join(ROOT, 'sonic4', 'tools', 'serve.js'), path.join(dir, 'tools', 'serve.js'));
fs.writeFileSync(path.join(dir, 'README.md'),
  '# ' + title + '\n\n' + blurb + '\n\n```sh\nnpm start   # from this folder, or npm start from the' +
  ' repository root for the whole arcade\n```\n\nNo dependencies, no build step: `index.html` is the' +
  ' page and `game.js` is the game.\n');
fs.writeFileSync(path.join(dir, 'index.html'),
`<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
<style>
  body{margin:0;background:#05080f;color:#eef4ff;font-family:system-ui,sans-serif;
    display:grid;place-items:center;min-height:100dvh}
  canvas{border:1px solid #27374f;border-radius:12px;max-width:96vw;height:auto;touch-action:none}
  a{color:#ffd24a}
</style>
<canvas id="c" width="960" height="540"></canvas>
<script src="game.js"></script>
`);
fs.writeFileSync(path.join(dir, 'game.js'),
`/* ${title} - ${blurb} */
(function () {
  'use strict';
  const cv = document.getElementById('c'), ctx = cv.getContext('2d');
  let t = 0;
  function frame() {
    requestAnimationFrame(frame);
    t += 1 / 60;
    ctx.fillStyle = '#05080f';
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = '#2f8ff5';
    ctx.beginPath();
    ctx.arc(cv.width / 2 + Math.cos(t) * 180, cv.height / 2 + Math.sin(t * 1.3) * 110, 34, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#eef4ff';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('${title}', cv.width / 2, 70);
    ctx.fillStyle = '#8fa3c0';
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillText('edit game.js to build the game', cv.width / 2, 104);
  }
  requestAnimationFrame(frame);
})();
`);

console.log('created ' + path.relative(ROOT, dir) + '/  (index.html, game.js, game.json, package.json, tools/serve.js)');
require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'build-home.js')], { stdio: 'inherit' });
console.log('\nnext: npm start  ->  http://localhost:8080/' + name + '/');
