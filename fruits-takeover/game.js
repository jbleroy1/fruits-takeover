/* ============================================================
   FRUITS TAKEOVER  -  2D top-down orchard defence
   Plain canvas, no dependencies, no build step.
   Sections: 1 core  2 data  3 spawning  4 update  5 render  6 UI
   ============================================================ */
(function () {
'use strict';

/* ---------------- 1. CORE ---------------- */
var cv = document.getElementById('c');
var ctx = cv.getContext('2d');
var W = 960, H = 540, TAU = Math.PI * 2;

function rand(a, b) { return a + Math.random() * (b - a); }
function randi(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); }
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function hyp(x, y) { return Math.sqrt(x * x + y * y); }
function dist(a, b) { return hyp(a.x - b.x, a.y - b.y); }
function angTo(a, b) { return Math.atan2(b.y - a.y, b.x - a.x); }
function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = randi(0, i); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function el(id) { return document.getElementById(id); }

/* ---- persistent save ---- */
var SAVE_KEY = 'fruitsTakeover.v1';
function blankSave() { return { unlocked: 1, cleared: {}, best: {}, keys: 0, perks: {}, score: 0, mute: false, sawStory: false }; }
var save = blankSave();
function loadSave() {
  try {
    var raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      var s = JSON.parse(raw);
      if (s && typeof s === 'object') {
        var d = blankSave();
        for (var k in d) if (s[k] !== undefined && s[k] !== null) d[k] = s[k];
        save = d;
      }
    }
  } catch (e) { /* private window or blocked storage: play unsaved */ }
}
function writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }
loadSave();

/* ---- sound: tiny WebAudio synth, no files ---- */
var AC = null;
function actx() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; } }
  if (AC && AC.state === 'suspended' && AC.resume) AC.resume();
  return AC;
}
function tone(wave, f0, f1, dur, gain, delay) {
  var a = actx(); if (!a) return;
  var t = a.currentTime + (delay || 0);
  var o = a.createOscillator(), g = a.createGain();
  o.type = wave;
  o.frequency.setValueAtTime(Math.max(20, f0), t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(Math.max(0.0001, gain), t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.03);
}
function noise(dur, gain, freq, q) {
  var a = actx(); if (!a) return;
  var t = a.currentTime, n = Math.max(1, Math.floor(a.sampleRate * dur));
  var buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
  for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  var src = a.createBufferSource(); src.buffer = buf;
  var bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q || 1;
  var g = a.createGain(); g.gain.setValueAtTime(Math.max(0.0001, gain), t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp); bp.connect(g); g.connect(a.destination); src.start(t);
}
function sfx(name) {
  if (save.mute) return;
  switch (name) {
    case 'shoot':   tone('square', 660, 240, 0.06, 0.035); break;
    case 'shootbig':tone('sawtooth', 320, 110, 0.12, 0.05); break;
    case 'splat':   noise(0.14, 0.09, 900, 0.8); break;
    case 'pop':     tone('triangle', 820, 180, 0.09, 0.05); noise(0.09, 0.05, 1500, 1); break;
    case 'hurt':    tone('sawtooth', 220, 60, 0.22, 0.07); noise(0.2, 0.05, 300, 0.7); break;
    case 'rot':     tone('sine', 150, 90, 0.3, 0.05); break;
    case 'dash':    noise(0.16, 0.05, 2600, 2); tone('sine', 420, 900, 0.1, 0.03); break;
    case 'pickup':  tone('triangle', 700, 1300, 0.1, 0.05); break;
    case 'key':     tone('triangle', 700, 1050, 0.1, 0.06); tone('triangle', 1050, 1570, 0.16, 0.05, 0.1); break;
    case 'heal':    tone('sine', 500, 900, 0.18, 0.05); break;
    case 'upgrade': tone('square', 500, 760, 0.1, 0.045); tone('square', 760, 1140, 0.14, 0.04, 0.1); break;
    case 'boss':    tone('sawtooth', 120, 42, 0.9, 0.09); noise(0.7, 0.07, 160, 0.6); break;
    case 'bosshit': noise(0.1, 0.07, 420, 0.9); break;
    case 'win':     tone('square', 520, 520, 0.1, 0.05); tone('square', 660, 660, 0.1, 0.05, 0.1);
                    tone('square', 784, 784, 0.1, 0.05, 0.2); tone('square', 1046, 1046, 0.3, 0.05, 0.3); break;
    case 'lose':    tone('sawtooth', 300, 60, 0.8, 0.08); tone('sine', 180, 40, 1.1, 0.05, 0.1); break;
    case 'click':   tone('square', 900, 700, 0.03, 0.025); break;
  }
}

/* ---- input ---- */
var keys = {}, mouse = { x: W / 2, y: H / 2, down: false, inside: false, used: false };
var touchMove = null, touchFire = null;
var BLOCK = { ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, Space: 1 };

window.addEventListener('keydown', function (e) {
  if (BLOCK[e.code]) e.preventDefault();
  if (!keys[e.code]) onKeyPress(e.code);
  keys[e.code] = true;
});
window.addEventListener('keyup', function (e) { keys[e.code] = false; });
window.addEventListener('blur', function () {
  keys = {}; mouse.down = false;
  if (G.scene === 'play') pauseGame();
});

function canvasPos(clientX, clientY) {
  var r = cv.getBoundingClientRect();
  return { x: (clientX - r.left) / r.width * W, y: (clientY - r.top) / r.height * H };
}
cv.addEventListener('mousemove', function (e) {
  var p = canvasPos(e.clientX, e.clientY);
  mouse.x = p.x; mouse.y = p.y; mouse.inside = true; mouse.used = true;
});
cv.addEventListener('mouseleave', function () { mouse.inside = false; mouse.down = false; });
cv.addEventListener('mousedown', function (e) { e.preventDefault(); actx(); mouse.down = true; mouse.used = true; });
window.addEventListener('mouseup', function () { mouse.down = false; });
cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });

cv.addEventListener('touchstart', function (e) {
  e.preventDefault(); actx();
  for (var i = 0; i < e.changedTouches.length; i++) {
    var t = e.changedTouches[i], p = canvasPos(t.clientX, t.clientY);
    if (p.x < W * 0.5 && !touchMove) touchMove = { id: t.identifier, ox: p.x, oy: p.y, x: p.x, y: p.y };
    else if (!touchFire) touchFire = { id: t.identifier, x: p.x, y: p.y };
  }
}, { passive: false });
cv.addEventListener('touchmove', function (e) {
  e.preventDefault();
  for (var i = 0; i < e.changedTouches.length; i++) {
    var t = e.changedTouches[i], p = canvasPos(t.clientX, t.clientY);
    if (touchMove && t.identifier === touchMove.id) { touchMove.x = p.x; touchMove.y = p.y; }
    if (touchFire && t.identifier === touchFire.id) { touchFire.x = p.x; touchFire.y = p.y; }
  }
}, { passive: false });
function touchEnd(e) {
  for (var i = 0; i < e.changedTouches.length; i++) {
    var id = e.changedTouches[i].identifier;
    if (touchMove && id === touchMove.id) touchMove = null;
    if (touchFire && id === touchFire.id) touchFire = null;
  }
}
cv.addEventListener('touchend', touchEnd);
cv.addEventListener('touchcancel', touchEnd);

/* ---- game state ---- */
var G = {
  scene: 'title',          // title | story | map | brief | play | up | win | over | pause | vault | help
  prevScene: 'title',
  levelIndex: 0,
  level: null,
  t: 0, dt: 0,
  score: 0, combo: 0, comboT: 0, kills: 0, shots: 0, hitsTaken: 0,
  player: null,
  enemies: [], pb: [], eb: [], parts: [], pickups: [], hazards: [], keyItems: [], obstacles: [], decor: [],
  world: { w: W, h: H },
  cam: { x: 0, y: 0 },
  shake: 0, flash: 0, hitstop: 0,
  waves: [], waveIdx: 0, spawned: 0, total: 0,
  survive: 0, surviveMax: 0,
  boss: null, addTimer: 0,
  keysNeeded: 0, keysGot: 0,
  run: { up: {}, auto: [] },
  toastT: 0,
  elapsed: 0,
  ended: false,
  lastStandUsed: false
};

/* ---------------- 2. DATA ---------------- */

/* Every fruit is slow to finish you: low contact damage, heavy ROT, which eats
   life over time. Fruit wears you down; it does not snap you in half. */
var FRUIT = {
  cherry:    { art:'cherry',    hp: 16,  r:11, speed:120, dmg:4,  rot:1.0, ai:'seek',    score:10, col:'#e8335a' },
  apple:     { art:'apple',     hp: 48,  r:17, speed:72,  dmg:7,  rot:1.6, ai:'charger', score:20, col:'#d93a3a' },
  grape:     { art:'grape',     hp: 34,  r:16, speed:84,  dmg:6,  rot:1.4, ai:'seek',    score:22, col:'#8b5cf6', split:{ type:'grapelet', n:3 } },
  grapelet:  { art:'grape',     hp: 11,  r:9,  speed:150, dmg:3,  rot:0.8, ai:'seek',    score:6,  col:'#a78bfa', noDrop:true },
  orange:    { art:'orange',    hp: 36,  r:16, speed:185, dmg:6,  rot:1.3, ai:'roller',  score:18, col:'#fb923c' },
  banana:    { art:'banana',    hp: 30,  r:15, speed:106, dmg:5,  rot:1.5, ai:'dropper', score:20, col:'#facc15' },
  lemon:     { art:'lemon',     hp: 32,  r:14, speed:66,  dmg:5,  rot:2.0, ai:'spitter', score:26, col:'#fde047' },
  pineapple: { art:'pineapple', hp: 78,  r:21, speed:54,  dmg:8,  rot:2.0, ai:'shooter', score:35, col:'#eab308' },
  coconut:   { art:'coconut',   hp:120,  r:19, speed:62,  dmg:9,  rot:1.4, ai:'armored', score:42, col:'#8b5e3c', armor:0.5 },
  durian:    { art:'durian',    hp: 62,  r:19, speed:64,  dmg:7,  rot:2.4, ai:'exploder',score:38, col:'#84cc16' },
  strawberry:{ art:'strawberry',hp: 48,  r:16, speed:94,  dmg:6,  rot:1.6, ai:'seeder',  score:30, col:'#f43f5e' },
  kiwi:      { art:'kiwi',      hp: 40,  r:14, speed:118, dmg:6,  rot:1.5, ai:'dasher',  score:28, col:'#84a637' },
  slice:     { art:'slice',     hp: 30,  r:14, speed:140, dmg:5,  rot:1.2, ai:'seek',    score:14, col:'#fb7185', noDrop:true },
  seedling:  { art:'seed',      hp:  8,  r:7,  speed:165, dmg:3,  rot:0.7, ai:'seek',    score:4,  col:'#fda4af', noDrop:true },
  sergeant:  { art:'watermelon',hp:460,  r:30, speed:58,  dmg:11, rot:3.0, ai:'melon',   score:180,col:'#22c55e', elite:true, split:{ type:'slice', n:4 } }
};

var BOSS = {
  baron: { name:'BARON BANANA', art:'banana', hp:1900, r:40, speed:86, dmg:14, rot:3.5, col:'#facc15', score:1500,
    flavor:'He rules the slip. Watch the floor, not the fruit.',
    atkEvery:2.1, pattern:['peels','aimed','charge','summon'], add:'banana' },
  count: { name:'COUNT COCONUT', art:'coconut', hp:2400, r:42, speed:66, dmg:18, rot:3.0, col:'#8b5e3c', score:1800, armor:0.4,
    flavor:'Armoured until the shell cracks. Keep hitting the same place.',
    atkEvery:2.4, pattern:['charge','volley','drop','summon'], add:'coconut' },
  hydra: { name:'THE GRAPE HYDRA', art:'grape', hp:2200, r:38, speed:100, dmg:15, rot:3.2, col:'#8b5cf6', score:2000,
    flavor:'Cut it and it counts. Cut it again and it multiplies.',
    atkEvery:1.9, pattern:['spiral','summon','aimed','summon'], add:'grape', splitter:true },
  papa:  { name:'PAPA PINEAPPLE', art:'pineapple', hp:2900, r:44, speed:52, dmg:18, rot:3.4, col:'#eab308', score:2400,
    flavor:'Every spike he throws is one he grew for you.',
    atkEvery:1.9, pattern:['volley','aimed','spiral','summon'], add:'pineapple' },
  wyrm:  { name:'DRAGONFRUIT WYRM', art:'dragon', hp:3300, r:40, speed:150, dmg:20, rot:3.6, col:'#f472b6', score:3000,
    flavor:'Faster than you. Plan your dash before it starts.',
    atkEvery:1.7, pattern:['charge','beam','aimed','charge','summon'], add:'kiwi' },
  mother:{ name:'THE MOTHER MELON', art:'watermelon', hp:3200, r:56, speed:42, dmg:13, rot:2.2, col:'#22c55e', score:6000, armor:0,
    flavor:'Everything in the orchard came out of her. End it here.',
    atkEvery:2.3, pattern:['volley','aimed','spiral','charge','beam','aimed'], add:'slice', splitter:true, final:true }
};

/* in-run upgrades: pick 1 of 3 after every cleared level */
var UPGRADES = [
  { id:'double',   max:3, ic:'▲▲', name:'Double Barrel', ds:'One more pulp round per shot, a little wider.' },
  { id:'pierce',   max:3, ic:'➤',       name:'Pulp Piercer',  ds:'Rounds punch through one more fruit.' },
  { id:'rapid',    max:4, ic:'≡',       name:'Rapid Squeeze', ds:'15% faster fire rate.' },
  { id:'heavy',    max:3, ic:'◆',       name:'Heavy Pulp',    ds:'+35% damage, slightly slower rate.' },
  { id:'burn',     max:2, ic:'☀',       name:'Citrus Burn',   ds:'Hits set fruit smouldering for 3s.' },
  { id:'frost',    max:2, ic:'❄',       name:'Frost Pulp',    ds:'Hits chill fruit to half speed.' },
  { id:'ricochet', max:2, ic:'↻',       name:'Ricochet Seeds',ds:'Rounds bounce off walls once more.' },
  { id:'orbit',    max:3, ic:'●',       name:'Blender Orbit', ds:'A blade orbits you and shreds on contact.' },
  { id:'crit',     max:3, ic:'✦',       name:'Peeler Rounds', ds:'+9% critical chance for triple damage.' },
  { id:'vitamin',  max:4, ic:'♥',       name:'Vitamin Shot',  ds:'+20 max life, and heal that much now.' },
  { id:'sugar',    max:3, ic:'»',       name:'Sugar Rush',    ds:'+10% movement speed.' },
  { id:'thick',    max:3, ic:'■',       name:'Thick Skin',    ds:'Take 18% less damage.' },
  { id:'salt',     max:2, ic:'◌',       name:'Salt Coating',  ds:'Every hit you land scrubs off some rot.' },
  { id:'seed',     max:2, ic:'✳',       name:'Seed Spray',    ds:'Killed fruit bursts into 4 seed shards.' },
  { id:'dashblast',max:2, ic:'✶',       name:'Dash Blast',    ds:'Dashing detonates juice around you.' }
];
var UP_BY_ID = {}; for (var _i = 0; _i < UPGRADES.length; _i++) UP_BY_ID[UPGRADES[_i].id] = UPGRADES[_i];

/* permanent perks bought with vault keys */
var PERKS = [
  { id:'hardened',  cost:2, name:'Hardened Rind',  ds:'+30 max life on every level.' },
  { id:'saltlined', cost:2, name:'Salt-Lined Coat',ds:'Rot fades twice as fast.' },
  { id:'quickdraw', cost:2, name:'Quick Draw',     ds:'+12% fire rate, always.' },
  { id:'magnet',    cost:2, name:'Juice Magnet',   ds:'Pickups fly to you from across the field.' },
  { id:'dashplus',  cost:2, name:'Spare Legs',     ds:'+1 dash charge.' },
  { id:'laststand', cost:2, name:'Last Stand',     ds:'Survive one killing blow per level at 35 life.' }
];

/* ---- the 30 levels ---- */
function w(at, spawn) { return { at: at, spawn: spawn }; }
var LEVELS = [
  /* ===== ACT I - BASE (1-10): teaches one fruit at a time ===== */
  { name:'FIRST LIGHT', type:'clear', theme:'orchard', layout:'open', world:[W,H],
    flavor:'Dawn in the Hale orchard. Something is moving in row four.',
    waves:[ w(0,{cherry:4}), w(7,{cherry:5}), w(15,{cherry:6}) ] },
  { name:'WINDFALL', type:'clear', theme:'orchard', layout:'pillars', world:[W,H],
    flavor:'Apples do not fall from trees any more. They climb down.',
    waves:[ w(0,{cherry:4}), w(6,{apple:3}), w(14,{cherry:5,apple:3}) ] },
  { name:'THE GRAPE PRESS', type:'clear', theme:'orchard', layout:'cross', world:[W,H],
    flavor:'Kill a grape and you have made three problems.',
    waves:[ w(0,{grape:3}), w(8,{grape:4,cherry:4}), w(18,{grape:5}) ] },
  { name:'ROLLING THUNDER', type:'clear', theme:'orchard', layout:'ring', world:[W,H],
    flavor:'Oranges do not steer. That is the whole trouble.',
    waves:[ w(0,{orange:4}), w(8,{orange:5,cherry:4}), w(17,{orange:6}) ] },
  { name:'SLIP STREET', type:'clear', theme:'orchard', layout:'scatter', world:[W,H],
    flavor:'Bananas lay peel. Peel is not damage. Peel is where you will be standing.',
    waves:[ w(0,{banana:4}), w(9,{banana:4,cherry:6}), w(19,{banana:5,apple:3}) ] },
  { name:'HOLD THE GATE', type:'survive', theme:'orchard', layout:'pillars', world:[W,H], dur:45,
    flavor:'Forty-five seconds. The evacuation needs every one of them.',
    spawn:{ cherry:3, apple:1 }, every:2.6 },
  { name:'SOUR PATCH', type:'clear', theme:'grove', layout:'cross', world:[W,H],
    flavor:'Lemons spit acid pools. The pools rot you while you stand in them.',
    waves:[ w(0,{lemon:3}), w(9,{lemon:3,grape:3}), w(19,{lemon:4,cherry:6}) ] },
  { name:'PINS AND NEEDLES', type:'clear', theme:'grove', layout:'scatter', world:[W,H],
    flavor:'Pineapples shoot. Use the stumps for cover.',
    waves:[ w(0,{pineapple:2}), w(10,{pineapple:2,apple:4}), w(21,{pineapple:3,cherry:6}) ] },
  { name:'NIGHT HARVEST', type:'survive', theme:'night', layout:'scatter', world:[W,H], dur:55, fog:true,
    flavor:'You cannot see past your own lamp. They can see fine.',
    spawn:{ cherry:3, apple:2, banana:1 }, every:2.4 },
  { name:'THE ORCHARD FALLS', type:'clear', theme:'orchard', layout:'ring', world:[W,H],
    flavor:'A Melon Sergeant leads them now. Fruit has officers.',
    waves:[ w(0,{cherry:6,apple:3}), w(8,{grape:4,orange:4}), w(18,{sergeant:1,banana:3}), w(30,{apple:4,lemon:3}) ] },

  /* ===== ACT II - NORMAL (11-20): the orchard fights back properly ===== */
  { name:'ROTTEN MILE', type:'clear', theme:'grove', layout:'pillars', world:[1200,680],
    flavor:'Durians burst into rot clouds. Do not be close, do not be downwind.',
    waves:[ w(0,{durian:3,apple:3}), w(10,{durian:4,cherry:8}), w(22,{durian:4,apple:5}) ] },
  { name:'SEEDED', type:'clear', theme:'grove', layout:'scatter', world:[1200,680],
    flavor:'Strawberries plant seedlings. Seedlings grow into a problem in nine seconds.',
    waves:[ w(0,{strawberry:3}), w(10,{strawberry:4,cherry:6}), w(22,{strawberry:5,kiwi:3}) ] },
  { name:'SHELL SHOCK', type:'clear', theme:'grove', layout:'cross', world:[1200,680],
    flavor:'Coconut armour halves your damage until the shell splits.',
    waves:[ w(0,{coconut:3}), w(11,{coconut:3,orange:5}), w(24,{coconut:4,apple:4}) ] },
  { name:'KIWI RUN', type:'clear', theme:'grove', layout:'ring', world:[1200,680],
    flavor:'Kiwis wind up, then cross the whole field in one dash.',
    waves:[ w(0,{kiwi:4}), w(10,{kiwi:5,banana:4}), w(22,{kiwi:6,grape:4}) ] },
  { name:'JUICE FLOOD', type:'survive', theme:'grove', layout:'pillars', world:[1200,680], dur:60,
    flavor:'The pressing shed burst. The floor is rising and it is sour.',
    spawn:{ lemon:2, cherry:4, kiwi:2 }, every:2.2, flood:true },
  { name:'THE LONG SQUEEZE', type:'clear', theme:'grove', layout:'scatter', world:[1200,680],
    flavor:'Everything they have left, in order, without a break.',
    waves:[ w(0,{apple:5,cherry:8}), w(10,{grape:5,orange:5}), w(21,{pineapple:3,durian:3}), w(33,{coconut:3,kiwi:5}) ] },
  { name:'THORN MARKET', type:'clear', theme:'night', layout:'cross', world:[1200,680],
    flavor:'The old market square. Spikes from the stalls, rot from the gutters.',
    waves:[ w(0,{pineapple:3,durian:3}), w(12,{pineapple:4,strawberry:4}), w(26,{pineapple:4,durian:5}) ] },
  { name:'BLACKOUT GROVE', type:'survive', theme:'night', layout:'scatter', world:[1200,680], dur:70, fog:true,
    flavor:'No moon. Seventy seconds. Listen for the rolling.',
    spawn:{ orange:3, kiwi:2, durian:2, cherry:4 }, every:2.1 },
  { name:'THE RIND WALL', type:'clear', theme:'night', layout:'ring', world:[1200,680],
    flavor:'Two sergeants and a wall of shells between you and the vaults.',
    waves:[ w(0,{coconut:4,slice:6}), w(12,{sergeant:1,coconut:3}), w(28,{sergeant:1,kiwi:5,durian:3}) ] },
  { name:'THE RIPENING', type:'clear', theme:'night', layout:'pillars', world:[1200,680],
    flavor:'Everything ripens at once. This is the last human line.',
    waves:[ w(0,{cherry:10,apple:5}), w(9,{grape:6,orange:6}), w(20,{pineapple:4,durian:4,lemon:4}),
            w(33,{sergeant:2,coconut:4}), w(48,{kiwi:6,strawberry:5}) ] },

  /* ===== ACT III - BONUS (21-30): mini-bosses and vault key hunts ===== */
  { name:'BARON BANANA', type:'boss', theme:'vault', layout:'pillars', world:[W,H], boss:'baron',
    flavor:'Bonus level. He has a title, a hat, and nine hundred peels.',
    add:{ type:'banana', n:2, every:9 } },
  { name:'VAULT OF SEEDS', type:'keys', theme:'vault', layout:'rooms', world:[1800,1120], keys:3,
    flavor:'Three keys hidden in the seed vault. The arrows point; the fruit follows.',
    spawn:{ cherry:3, kiwi:2, banana:2 }, every:2.6 },
  { name:'COUNT COCONUT', type:'boss', theme:'vault', layout:'ring', world:[W,H], boss:'count',
    flavor:'Bonus level. Armoured, titled, and very hard to annoy.',
    add:{ type:'coconut', n:1, every:11 } },
  { name:'THE SUNKEN GROVE', type:'keys', theme:'vault', layout:'maze', world:[1800,1120], keys:3,
    flavor:'Flooded rows, three keys, lemons in every puddle.',
    spawn:{ lemon:2, grape:3, orange:2 }, every:2.5 },
  { name:'THE GRAPE HYDRA', type:'boss', theme:'vault', layout:'cross', world:[W,H], boss:'hydra',
    flavor:'Bonus level. It splits at every quarter of its life. Count them.',
    add:{ type:'grapelet', n:3, every:8 } },
  { name:'COLD STORAGE', type:'keys', theme:'night', layout:'rooms', world:[1800,1120], keys:3, fog:true,
    flavor:'Freezer dark. Three keys. Your lamp reaches about four metres.',
    spawn:{ durian:2, coconut:1, cherry:4 }, every:2.6 },
  { name:'PAPA PINEAPPLE', type:'boss', theme:'vault', layout:'scatter', world:[W,H], boss:'papa',
    flavor:'Bonus level. He grew every spike himself, for you, specifically.',
    add:{ type:'pineapple', n:1, every:10 } },
  { name:'THE ROOT MAZE', type:'keys', theme:'vault', layout:'maze', world:[1800,1120], keys:3,
    flavor:'Last three keys. The roots moved since the map was drawn.',
    spawn:{ strawberry:2, kiwi:3, durian:2 }, every:2.3 },
  { name:'DRAGONFRUIT WYRM', type:'boss', theme:'night', layout:'open', world:[1100,620], boss:'wyrm',
    flavor:'Bonus level. It charges, it beams, and it is faster than you are.',
    add:{ type:'kiwi', n:2, every:9 } },
  { name:'THE MOTHER MELON', type:'boss', theme:'vault', layout:'ring', world:[1340,760], boss:'mother', enemyScale:0.5,
    flavor:'Every fruit in the world came out of her. Finish it.',
    add:{ type:'slice', n:1, every:15 } }
];

function tierOf(i) { return i < 10 ? 'BASE' : (i < 20 ? 'NORMAL' : 'BONUS'); }
function actOf(i) { return i < 10 ? 1 : (i < 20 ? 2 : 3); }
function objectiveText(lv) {
  if (lv.type === 'clear') return 'Clear every fruit';
  if (lv.type === 'survive') return 'Survive ' + lv.dur + ' seconds';
  if (lv.type === 'boss') return 'Defeat ' + BOSS[lv.boss].name;
  return 'Find ' + lv.keys + ' vault keys';
}

/* ---------------- 3. BUILDING A LEVEL ---------------- */

/* deterministic PRNG so a level's walls look the same on every retry */
function seeded(seed) {
  var s = seed >>> 0;
  return function () {
    s += 0x6D2B79F5; var t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeObstacles(layout, ww, wh, rng) {
  var o = [], i, j;
  function box(x, y, w, h) { o.push({ x: x, y: y, w: w, h: h }); }
  if (layout === 'pillars') {
    box(ww * 0.22 - 30, wh * 0.26 - 30, 60, 60); box(ww * 0.78 - 30, wh * 0.26 - 30, 60, 60);
    box(ww * 0.22 - 30, wh * 0.74 - 30, 60, 60); box(ww * 0.78 - 30, wh * 0.74 - 30, 60, 60);
    box(ww * 0.5 - 90, wh * 0.5 - 22, 180, 44);
  } else if (layout === 'cross') {
    box(ww * 0.5 - 24, wh * 0.18, 48, wh * 0.26);
    box(ww * 0.5 - 24, wh * 0.56, 48, wh * 0.26);
    box(ww * 0.14, wh * 0.5 - 24, ww * 0.2, 48);
    box(ww * 0.66, wh * 0.5 - 24, ww * 0.2, 48);
  } else if (layout === 'ring') {
    var cx = ww / 2, cy = wh / 2, rr = Math.min(ww, wh) * 0.33;
    for (i = 0; i < 8; i++) {
      var a = i / 8 * TAU + 0.2;
      box(cx + Math.cos(a) * rr - 26, cy + Math.sin(a) * rr - 26, 52, 52);
    }
  } else if (layout === 'scatter') {
    var n = Math.round(ww * wh / 70000) + 3;
    for (i = 0; i < n; i++) {
      var bw = 40 + rng() * 70, bh = 40 + rng() * 70;
      var bx = 70 + rng() * (ww - 140 - bw), by = 70 + rng() * (wh - 140 - bh);
      if (Math.abs(bx + bw / 2 - ww / 2) < 110 && Math.abs(by + bh / 2 - wh / 2) < 110) continue;
      box(bx, by, bw, bh);
    }
  } else if (layout === 'rooms') {
    var cols = 3, rows = 2, mw = ww / cols, mh = wh / rows;
    for (i = 1; i < cols; i++) {
      var gx = i * mw, gap = 90 + rng() * (wh - 420);
      box(gx - 16, 40, 32, gap - 40);
      box(gx - 16, gap + 150, 32, wh - gap - 190);
    }
    for (j = 1; j < rows; j++) {
      var gy = j * mh, gapx = 120 + rng() * (ww - 500);
      box(60, gy - 16, gapx - 60, 32);
      box(gapx + 160, gy - 16, ww - gapx - 220, 32);
    }
  } else if (layout === 'maze') {
    var cell = 180;
    for (i = 1; i * cell < ww - 90; i++) {
      for (j = 1; j * cell < wh - 90; j++) {
        if (rng() < 0.55) continue;
        var vertical = rng() < 0.5;
        var L = 100 + rng() * 80;
        if (vertical) box(i * cell - 14, j * cell - L / 2, 28, L);
        else box(i * cell - L / 2, j * cell - 14, L, 28);
      }
    }
  }
  /* never wall the player into the spawn point */
  var keep = [];
  for (i = 0; i < o.length; i++) {
    var b = o[i];
    if (b.w < 10 || b.h < 10) continue;
    if (b.x < ww / 2 + 70 && b.x + b.w > ww / 2 - 70 && b.y < wh / 2 + 70 && b.y + b.h > wh / 2 - 70) continue;
    keep.push(b);
  }
  return keep;
}

function makeDecor(theme, ww, wh, rng) {
  var d = [], n = Math.round(ww * wh / 9000);
  for (var i = 0; i < n; i++) {
    d.push({ x: rng() * ww, y: rng() * wh, r: 2 + rng() * 10, a: rng() * TAU, k: rng() });
  }
  return d;
}

function freeSpot(rng, pad) {
  pad = pad || 40;
  for (var tries = 0; tries < 220; tries++) {
    var x = pad + (rng ? rng() : Math.random()) * (G.world.w - pad * 2);
    var y = pad + (rng ? rng() : Math.random()) * (G.world.h - pad * 2);
    if (!blocked(x, y, 26)) return { x: x, y: y };
  }
  return { x: G.world.w / 2, y: G.world.h / 2 };
}
function blocked(x, y, r) {
  for (var i = 0; i < G.obstacles.length; i++) {
    var b = G.obstacles[i];
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return true;
  }
  return false;
}

/* ---- player ---- */
function makePlayer() {
  return {
    x: G.world.w / 2, y: G.world.h / 2, vx: 0, vy: 0, r: 13,
    hp: 100, maxhp: 100, rot: 0, maxrot: 100,
    aim: -Math.PI / 2, fireCd: 0, inv: 0, hurtFlash: 0,
    dashN: 2, dashMax: 2, dashCd: 0, dashT: 0, dashAng: 0,
    slip: 0, walk: 0, orbA: 0, s: null
  };
}

function recalc() {
  var p = G.player, u = G.run.up, k = function (id) { return u[id] || 0; };
  var s = {
    dmg: 11, rate: 0.17, bspeed: 580, pierce: 0, shots: 1, spread: 0.07,
    crit: 0.05, speed: 206, dr: 0, burn: 0, frost: 0, bounce: 0, orbit: 0,
    magnet: 70, seed: 0, dashBlast: 0, salt: 0, knock: 140, rotDecay: 3.2
  };
  s.shots += k('double'); s.spread += 0.055 * k('double');
  s.pierce += k('pierce');
  s.rate *= Math.pow(0.85, k('rapid'));
  s.dmg *= Math.pow(1.35, k('heavy')); s.rate *= Math.pow(1.09, k('heavy'));
  s.burn = k('burn'); s.frost = k('frost'); s.bounce = k('ricochet'); s.orbit = k('orbit');
  s.crit += 0.09 * k('crit');
  s.speed *= Math.pow(1.1, k('sugar'));
  s.dr = 1 - Math.pow(0.82, k('thick'));
  s.salt = k('salt'); s.seed = k('seed'); s.dashBlast = k('dashblast');
  if (save.perks.quickdraw) s.rate *= 0.88;
  if (save.perks.saltlined) s.rotDecay *= 2;
  if (save.perks.magnet) s.magnet = 420;
  var mh = 100 + 20 * k('vitamin') + (save.perks.hardened ? 30 : 0);
  var gained = mh - p.maxhp;
  p.maxhp = mh; if (gained > 0) p.hp = Math.min(mh, p.hp + gained);
  p.dashMax = 2 + (save.perks.dashplus ? 1 : 0);
  p.dashN = Math.min(p.dashN, p.dashMax);
  p.s = s;
}

/* ---- entities ---- */
function spawnEnemy(type, x, y) {
  var d = FRUIT[type]; if (!d) return null;
  var ls = (G.level && G.level.enemyScale) || 1;
  var sc = (1 + G.levelIndex * 0.052) * ls, sd = (1 + G.levelIndex * 0.03) * ls;
  var e = {
    kind: 'fruit', type: type, art: d.art, col: d.col,
    x: x, y: y, vx: 0, vy: 0, r: d.r,
    hp: d.hp * sc, max: d.hp * sc, dmg: d.dmg * sd, rot: d.rot, speed: d.speed,
    ai: d.ai, armor: d.armor || 0, score: d.score, split: d.split || null,
    noDrop: !!d.noDrop, elite: !!d.elite,
    t: rand(0, 10), cd: rand(0.6, 2.2), state: 0, stateT: 0, flash: 0,
    burn: 0, chill: 0, wob: rand(0, TAU), ang: rand(0, TAU), hitT: 0, born: G.elapsed
  };
  G.enemies.push(e);
  return e;
}

function spawnBoss(id) {
  var d = BOSS[id];
  var b = {
    kind: 'boss', type: id, art: d.art, col: d.col,
    x: G.world.w / 2, y: 90, vx: 0, vy: 0, r: d.r,
    hp: d.hp, max: d.hp, dmg: d.dmg, rot: d.rot, speed: d.speed,
    armor: d.armor || 0, score: d.score, name: d.name,
    ai: 'boss', pattern: d.pattern, atkEvery: d.atkEvery, atkT: 1.6, step: 0,
    splitter: !!d.splitter, add: d.add, final: !!d.final,
    phase: 0, splitAt: 0.75, t: 0, flash: 0, charge: 0, chargeAng: 0,
    spiral: 0, spiralA: 0, beam: null, chill: 0, burn: 0, wob: 0, hitT: 0,
    noDrop: true
  };
  G.enemies.push(b);
  G.boss = b;
  sfx('boss');
  toast(d.name);
  return b;
}

function edgeSpawn() {
  /* ring around the player, outside the view, but inside the world */
  for (var i = 0; i < 60; i++) {
    var a = rand(0, TAU), d = rand(360, 560);
    var x = clamp(G.player.x + Math.cos(a) * d, 34, G.world.w - 34);
    var y = clamp(G.player.y + Math.sin(a) * d, 34, G.world.h - 34);
    if (!blocked(x, y, 24) && hyp(x - G.player.x, y - G.player.y) > 230) return { x: x, y: y };
  }
  var f = freeSpot(null, 40);
  return f;
}

function spawnGroup(spec) {
  for (var t in spec) {
    for (var i = 0; i < spec[t]; i++) {
      var p = edgeSpawn();
      var e = spawnEnemy(t, p.x, p.y);
      if (e) puff(e.x, e.y, e.col, 8, 90);
    }
  }
}
function countSpec(spec) { var n = 0; for (var t in spec) n += spec[t]; return n; }

function addBullet(arr, o) { arr.push(o); }
function pBullet(x, y, ang, extra) {
  var s = G.player.s;
  var b = {
    x: x, y: y, ang: ang, sp: s.bspeed, r: 5, life: 1.25,
    dmg: s.dmg, pierce: s.pierce, bounce: s.bounce, hit: [],
    burn: s.burn, frost: s.frost, crit: false, kind: 'p'
  };
  if (Math.random() < s.crit) { b.crit = true; b.dmg *= 3; b.r = 7; }
  if (extra) for (var k in extra) b[k] = extra[k];
  b.vx = Math.cos(ang) * b.sp; b.vy = Math.sin(ang) * b.sp;
  G.pb.push(b);
  return b;
}
function eBullet(x, y, ang, sp, dmg, style) {
  G.eb.push({ x: x, y: y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
    r: style === 'spike' ? 6 : 7, dmg: dmg, rot: style === 'acid' ? 2 : 1.2,
    life: 4.2, style: style || 'seed', ang: ang, t: 0 });
}
function hazard(x, y, type, r, life) {
  G.hazards.push({ x: x, y: y, type: type, r: r, life: life, max: life, t: rand(0, 6) });
}
function puff(x, y, col, n, spd) {
  for (var i = 0; i < n; i++) {
    var a = rand(0, TAU), s = rand(spd * 0.2, spd);
    G.parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      r: rand(1.6, 4.6), life: rand(0.25, 0.7), max: 0.7, col: col, g: rand(0, 40) });
  }
}
function splat(x, y, col, n) { puff(x, y, col, n || 14, 170); G.shake = Math.min(10, G.shake + 2.5); }

function dropFrom(e) {
  if (e.noDrop) return;
  var r = Math.random();
  if (r < 0.055) G.pickups.push({ x: e.x, y: e.y, type: 'heart', r: 10, t: 0, life: 22 });
  else if (r < 0.16) G.pickups.push({ x: e.x, y: e.y, type: 'salt', r: 9, t: 0, life: 22 });
  else if (r < 0.185 && !G.boss) G.pickups.push({ x: e.x, y: e.y, type: 'crate', r: 11, t: 0, life: 26 });
}

function toast(msg, dur) { el('toast').textContent = msg; el('toast').classList.add('on'); G.toastT = dur || 1.9; }

/* ---------------- 4. PLAY ---------------- */

function rollAutoKit(n) {
  var got = [], guard = 0;
  while (got.length < n && guard++ < 400) {
    var u = pick(UPGRADES);
    if ((G.run.up[u.id] || 0) >= u.max) continue;
    G.run.up[u.id] = (G.run.up[u.id] || 0) + 1;
    got.push(u.id);
  }
  return got;
}

/* called from the map (fresh kit) or from Next Level / Retry (keeps the run) */
function prepareLevel(idx, freshKit) {
  G.levelIndex = clamp(idx, 0, LEVELS.length - 1);
  if (freshKit) {
    G.run.up = {};
    G.run.auto = rollAutoKit(Math.min(12, G.levelIndex));
  }
  showBrief();
}

function beginPlay() {
  var idx = G.levelIndex, lv = LEVELS[idx];
  G.level = lv;
  G.world.w = lv.world[0]; G.world.h = lv.world[1];
  var rng = seeded(idx * 7919 + 13);
  G.obstacles = makeObstacles(lv.layout, G.world.w, G.world.h, rng);
  G.decor = makeDecor(lv.theme, G.world.w, G.world.h, seeded(idx * 131 + 7));
  G.enemies = []; G.pb = []; G.eb = []; G.parts = []; G.pickups = []; G.hazards = []; G.keyItems = [];
  G.boss = null; G.addTimer = lv.add ? lv.add.every : 0;
  G.score = 0; G.combo = 0; G.comboT = 0; G.kills = 0; G.shots = 0; G.hitsTaken = 0;
  G.waveIdx = 0; G.spawned = 0; G.elapsed = 0; G.survive = 0;
  G.surviveMax = lv.dur || 0; G.ended = false; G.endT = 0; G.won = false;
  G.lastStandUsed = false; G.shake = 0; G.flash = 0; G.hitstop = 0;
  G.keysGot = 0; G.keysNeeded = lv.keys || 0;
  G.floodT = 0; G.pull = 0; G.spawnT = 0.5;

  G.player = makePlayer();
  recalc();
  G.player.dashN = G.player.dashMax;

  G.total = 0;
  if (lv.type === 'clear') for (var i = 0; i < lv.waves.length; i++) G.total += countSpec(lv.waves[i].spawn);

  if (lv.type === 'keys') {
    var krng = seeded(idx * 5281 + 3);
    for (var k = 0; k < G.keysNeeded; k++) {
      var p = null, tries = 0;
      do { p = freeSpot(krng, 90); tries++; }
      while (tries < 40 && hyp(p.x - G.player.x, p.y - G.player.y) < Math.min(G.world.w, G.world.h) * 0.45);
      G.keyItems.push({ x: p.x, y: p.y, r: 13, t: rand(0, 6), got: false });
    }
  }
  if (lv.type === 'boss') spawnBoss(lv.boss);

  G.cam.x = clamp(G.player.x - W / 2, 0, Math.max(0, G.world.w - W));
  G.cam.y = clamp(G.player.y - H / 2, 0, Math.max(0, G.world.h - H));

  setScene('play');
  el('hud').hidden = false;
  el('bossbar').hidden = !G.boss;
  if (lv.type !== 'boss') toast(tierOf(idx) + ' LEVEL ' + (idx % 10 + 1) + '  —  ' + lv.name);
}

/* circle vs rect push-out */
function resolveRect(o, b) {
  var cx = clamp(o.x, b.x, b.x + b.w), cy = clamp(o.y, b.y, b.y + b.h);
  var dx = o.x - cx, dy = o.y - cy, d = hyp(dx, dy);
  if (d >= o.r) return false;
  if (d < 0.0001) {
    var left = o.x - b.x, right = b.x + b.w - o.x, top = o.y - b.y, bot = b.y + b.h - o.y;
    var m = Math.min(left, right, top, bot);
    if (m === left) o.x = b.x - o.r; else if (m === right) o.x = b.x + b.w + o.r;
    else if (m === top) o.y = b.y - o.r; else o.y = b.y + b.h + o.r;
    return true;
  }
  var push = (o.r - d) / d;
  o.x += dx * push; o.y += dy * push;
  if (o.bounceWalls) {
    var nx = dx / d, ny = dy / d, dot = o.vx * nx + o.vy * ny;
    o.vx -= 2 * dot * nx; o.vy -= 2 * dot * ny;
  }
  return true;
}
function keepInside(o) {
  var hit = false;
  if (o.x < o.r) { o.x = o.r; if (o.bounceWalls) o.vx = Math.abs(o.vx); hit = true; }
  if (o.x > G.world.w - o.r) { o.x = G.world.w - o.r; if (o.bounceWalls) o.vx = -Math.abs(o.vx); hit = true; }
  if (o.y < o.r) { o.y = o.r; if (o.bounceWalls) o.vy = Math.abs(o.vy); hit = true; }
  if (o.y > G.world.h - o.r) { o.y = G.world.h - o.r; if (o.bounceWalls) o.vy = -Math.abs(o.vy); hit = true; }
  return hit;
}
function collideWorld(o) {
  var hit = keepInside(o);
  for (var i = 0; i < G.obstacles.length; i++) if (resolveRect(o, G.obstacles[i])) hit = true;
  return hit;
}

/* ---- player ---- */
function updatePlayer(dt) {
  var p = G.player, s = p.s;
  var ax = 0, ay = 0;
  if (keys.KeyA || keys.ArrowLeft) ax -= 1;
  if (keys.KeyD || keys.ArrowRight) ax += 1;
  if (keys.KeyW || keys.ArrowUp) ay -= 1;
  if (keys.KeyS || keys.ArrowDown) ay += 1;
  if (touchMove) {
    var tdx = touchMove.x - touchMove.ox, tdy = touchMove.y - touchMove.oy, td = hyp(tdx, tdy);
    if (td > 6) { var m = Math.min(1, td / 52); ax += tdx / td * m; ay += tdy / td * m; }
  }
  var al = hyp(ax, ay);
  if (al > 1) { ax /= al; ay /= al; }

  /* aim */
  if (touchFire) p.aim = Math.atan2(touchFire.y - (p.y - G.cam.y), touchFire.x - (p.x - G.cam.x));
  else if (mouse.used && mouse.inside) p.aim = Math.atan2(mouse.y - (p.y - G.cam.y), mouse.x - (p.x - G.cam.x));
  else if (al > 0.1) p.aim = Math.atan2(ay, ax);

  /* dash */
  p.dashCd -= dt;
  if (p.dashN < p.dashMax && p.dashCd <= 0) { p.dashN++; p.dashCd = 1.5; }
  var wantDash = keys.ShiftLeft || keys.ShiftRight;
  if (wantDash && p.dashT <= 0 && p.dashN > 0) {
    p.dashN--; p.dashT = 0.2; p.inv = Math.max(p.inv, 0.32);
    p.dashCd = Math.max(p.dashCd, 1.5);
    p.dashAng = (al > 0.1) ? Math.atan2(ay, ax) : p.aim;
    p.rot = Math.max(0, p.rot - 22);          /* shake the rot off */
    p.slip = 0;
    sfx('dash'); puff(p.x, p.y, '#bfe9ff', 10, 150);
    if (s.dashBlast) {
      for (var i = 0; i < G.enemies.length; i++) {
        var e = G.enemies[i];
        if (dist(e, p) < 86 + e.r) hurtEnemy(e, 26 * s.dashBlast, true);
      }
      puff(p.x, p.y, '#ffd24a', 18, 230);
    }
  }
  if (p.dashT > 0) {
    p.dashT -= dt;
    p.x += Math.cos(p.dashAng) * 760 * dt;
    p.y += Math.sin(p.dashAng) * 760 * dt;
    G.parts.push({ x: p.x, y: p.y, vx: 0, vy: 0, r: 9, life: 0.22, max: 0.22, col: '#9fd8ff', g: 0 });
  } else {
    var spd = s.speed * (p.slip > 0 ? 1.55 : 1);
    if (p.slip > 0) {
      p.slip -= dt;
      p.vx = lerp(p.vx, ax * spd, 0.02); p.vy = lerp(p.vy, ay * spd, 0.02);
    } else {
      p.vx = lerp(p.vx, ax * spd, 0.28); p.vy = lerp(p.vy, ay * spd, 0.28);
    }
    p.x += p.vx * dt; p.y += p.vy * dt;
  }
  if (al > 0.1 || p.dashT > 0) p.walk += dt * 9;
  collideWorld(p);

  /* firing */
  p.fireCd -= dt;
  var firing = mouse.down || keys.Space || !!touchFire;
  if (firing && p.fireCd <= 0) {
    p.fireCd = s.rate;
    var n = s.shots;
    for (var j = 0; j < n; j++) {
      var off = (n === 1) ? 0 : (j - (n - 1) / 2) * s.spread;
      pBullet(p.x + Math.cos(p.aim) * 16, p.y + Math.sin(p.aim) * 16, p.aim + off + rand(-0.018, 0.018));
    }
    G.shots++;
    sfx(s.dmg > 20 ? 'shootbig' : 'shoot');
    p.vx -= Math.cos(p.aim) * 22; p.vy -= Math.sin(p.aim) * 22;
  }

  /* rot eats you slowly - the orchard's whole strategy */
  if (p.rot > 0) {
    p.rot = Math.max(0, p.rot - s.rotDecay * dt);
    var bite = (0.55 + p.rot * 0.055) * dt;
    p.hp -= bite;
    if (Math.random() < p.rot * 0.012) G.parts.push({ x: p.x + rand(-9, 9), y: p.y + rand(-9, 9), vx: rand(-14, 14), vy: rand(-34, -8), r: rand(1.5, 3.4), life: 0.6, max: 0.6, col: '#c084fc', g: 0 });
  }
  if (p.inv > 0) p.inv -= dt;
  if (p.hurtFlash > 0) p.hurtFlash -= dt;
  if (s.orbit) {
    p.orbA += dt * 3.1;
    for (var o = 0; o < s.orbit; o++) {
      var oa = p.orbA + o / s.orbit * TAU, ox = p.x + Math.cos(oa) * 54, oy = p.y + Math.sin(oa) * 54;
      for (var m2 = 0; m2 < G.enemies.length; m2++) {
        var en = G.enemies[m2];
        if (hyp(en.x - ox, en.y - oy) < en.r + 9) hurtEnemy(en, 44 * dt, false, true);
      }
    }
  }
  if (p.hp <= 0) playerDown();
}

function hurtPlayer(amount, rotAmount, fromX, fromY) {
  var p = G.player;
  if (p.inv > 0 || G.ended) return;
  var dmg = amount * (1 - p.s.dr);
  p.hp -= dmg;
  p.rot = clamp(p.rot + rotAmount, 0, p.maxrot);
  p.inv = 0.6; p.hurtFlash = 0.35;
  G.hitsTaken++;
  G.combo = 0;
  G.shake = Math.min(14, G.shake + 5);
  G.flash = 0.22;
  if (fromX !== undefined) {
    var a = Math.atan2(p.y - fromY, p.x - fromX);
    p.vx += Math.cos(a) * 190; p.vy += Math.sin(a) * 190;
  }
  sfx(rotAmount > 2 ? 'rot' : 'hurt');
  if (p.hp <= 0) playerDown();
}

function playerDown() {
  var p = G.player;
  if (G.ended) return;
  if (save.perks.laststand && !G.lastStandUsed) {
    G.lastStandUsed = true; p.hp = 35; p.rot = 0; p.inv = 1.6;
    toast('LAST STAND', 1.4); sfx('upgrade'); puff(p.x, p.y, '#ffd24a', 26, 260);
    return;
  }
  p.hp = 0;
  endLevel(false);
}

/* ---- damage to fruit ---- */
function hurtEnemy(e, dmg, blast, silent) {
  if (e.dead || G.ended) return;
  var d = dmg * (1 - (e.armor || 0));
  e.hp -= d; e.flash = 0.11;
  if (!silent) sfx(e.kind === 'boss' ? 'bosshit' : 'splat');
  if (e.armor && e.kind !== 'boss' && e.hp / e.max < 0.5) {
    e.armor = 0; puff(e.x, e.y, '#e8dcc0', 14, 180);
  }
  if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e) {
  if (e.dead) return;
  e.dead = true;
  G.kills++;
  G.combo++; G.comboT = 2.4;
  G.score += Math.round(e.score * (1 + Math.min(2, G.combo * 0.06)));
  splat(e.x, e.y, e.col, e.kind === 'boss' ? 60 : (e.elite ? 30 : 14));
  sfx('pop');

  if (e.split) {
    for (var i = 0; i < e.split.n; i++) {
      var a = i / e.split.n * TAU + rand(0, 1);
      var c = spawnEnemy(e.split.type, e.x + Math.cos(a) * (e.r + 12), e.y + Math.sin(a) * (e.r + 12));
      if (c) { c.vx = Math.cos(a) * 140; c.vy = Math.sin(a) * 140; }
    }
  }
  if (e.ai === 'exploder') {
    hazard(e.x, e.y, 'rot', 58, 3.4);
    puff(e.x, e.y, '#a3e635', 26, 240);
    if (dist(e, G.player) < 72) hurtPlayer(e.dmg * 0.8, e.rot * 1.4, e.x, e.y);
  }
  if (G.player.s.seed && !e.noDrop) {
    for (var j = 0; j < 4; j++) {
      var sa = j / 4 * TAU + rand(0, 1);
      pBullet(e.x, e.y, sa, { dmg: G.player.s.dmg * 0.5, life: 0.5, pierce: 0, r: 4 });
    }
  }
  dropFrom(e);

  if (e.kind === 'boss') {
    G.boss = null;
    G.shake = 24; G.flash = 0.5; G.hitstop = 0.35;
    for (var k = 0; k < 7; k++) {
      (function (d) { setTimeout(function () { if (!save.mute) sfx('pop'); }, d); })(k * 110);
    }
    endLevel(true);
  }
}

function summonAdds(b, n) {
  for (var i = 0; i < n; i++) {
    if (G.enemies.length > 24) return;
    var a = rand(0, TAU), d = b.r + 40 + rand(0, 40);
    var e = spawnEnemy(b.add, clamp(b.x + Math.cos(a) * d, 30, G.world.w - 30), clamp(b.y + Math.sin(a) * d, 30, G.world.h - 30));
    if (e) puff(e.x, e.y, e.col, 10, 140);
  }
}

/* ---- boss brain ---- */
function bossAttack(b) {
  var p = G.player, act = b.pattern[b.step % b.pattern.length];
  b.step++;
  var ang = angTo(b, p), i;
  if (act === 'volley') {
    var n = 14;
    for (i = 0; i < n; i++) eBullet(b.x, b.y, i / n * TAU + ang, 215, b.dmg * 0.5, 'seed');
    sfx('shootbig');
  } else if (act === 'aimed') {
    for (i = 0; i < 5; i++) eBullet(b.x, b.y, ang + (i - 2) * 0.19, 320, b.dmg * 0.45, 'spike');
    sfx('shootbig');
  } else if (act === 'charge') {
    b.windup = 0.5; sfx('rot');
  } else if (act === 'summon') {
    summonAdds(b, 2); sfx('boss');
  } else if (act === 'peels') {
    for (i = 0; i < 7; i++) {
      var a2 = i / 7 * TAU + rand(0, 1), d2 = rand(70, 220);
      hazard(clamp(b.x + Math.cos(a2) * d2, 24, G.world.w - 24), clamp(b.y + Math.sin(a2) * d2, 24, G.world.h - 24), 'peel', 24, 13);
    }
  } else if (act === 'drop') {
    for (i = 0; i < 5; i++) hazard(clamp(p.x + rand(-170, 170), 24, G.world.w - 24), clamp(p.y + rand(-170, 170), 24, G.world.h - 24), 'rot', 46, 4.5);
  } else if (act === 'spiral') {
    b.spiral = 1.9; b.scd = 0; sfx('shootbig');
  } else if (act === 'beam') {
    b.beam = { t: 0, warn: 0.85, dur: 0.5, ang: ang, tick: 0 }; sfx('boss');
  }
}

function bossThink(b, dt, chill) {
  var p = G.player;
  b.t += dt;

  if (b.splitter && b.hp / b.max <= b.splitAt && b.splitAt > 0.2) {
    b.splitAt -= 0.25;
    summonAdds(b, 3);
    /* each phase break leaves something to pick up - the fight has to be survivable */
    var ra = rand(0, TAU);
    G.pickups.push({ x: clamp(p.x + Math.cos(ra) * 110, 30, G.world.w - 30), y: clamp(p.y + Math.sin(ra) * 110, 30, G.world.h - 30), type: 'heart', r: 10, t: 0, life: 26 });
    if (b.final) G.pickups.push({ x: clamp(p.x + Math.cos(ra + 1.6) * 120, 30, G.world.w - 30), y: clamp(p.y + Math.sin(ra + 1.6) * 120, 30, G.world.h - 30), type: 'heart', r: 10, t: 0, life: 26 });
    G.pickups.push({ x: clamp(p.x - Math.cos(ra) * 110, 30, G.world.w - 30), y: clamp(p.y - Math.sin(ra) * 110, 30, G.world.h - 30), type: 'salt', r: 9, t: 0, life: 26 });
    toast('IT SPLITS', 1.1); G.shake = 12;
  }

  if (b.beam) {
    var bm = b.beam; bm.t += dt;
    if (bm.t < bm.warn) {
      bm.ang = lerp(bm.ang, angTo(b, p), 0.045);
    } else if (bm.t < bm.warn + bm.dur) {
      bm.tick -= dt;
      var rx = p.x - b.x, ry = p.y - b.y;
      var proj = rx * Math.cos(bm.ang) + ry * Math.sin(bm.ang);
      var perp = Math.abs(-rx * Math.sin(bm.ang) + ry * Math.cos(bm.ang));
      if (proj > 0 && proj < 1600 && perp < 30 && bm.tick <= 0) {
        bm.tick = 0.3; hurtPlayer(b.dmg * 0.55, b.rot * 0.7, b.x, b.y);
      }
      for (var q = 0; q < 3; q++) {
        var dd2 = rand(0, 900);
        G.parts.push({ x: b.x + Math.cos(bm.ang) * dd2, y: b.y + Math.sin(bm.ang) * dd2,
          vx: rand(-30, 30), vy: rand(-30, 30), r: rand(2, 5), life: 0.3, max: 0.3, col: '#ff5e7a', g: 0 });
      }
    } else b.beam = null;
    b.vx = 0; b.vy = 0;
    return;
  }
  if (b.dashT > 0) {
    b.dashT -= dt;
    b.vx = Math.cos(b.dashAng) * b.speed * 4.0;
    b.vy = Math.sin(b.dashAng) * b.speed * 4.0;
    if (Math.random() < 0.6) puff(b.x, b.y, b.col, 2, 50);
    return;
  }
  if (b.windup > 0) {
    b.windup -= dt; b.vx = 0; b.vy = 0;
    b.dashAng = angTo(b, p);
    if (b.windup <= 0) { b.dashT = 0.62; sfx('dash'); }
    return;
  }
  if (b.spiral > 0) {
    b.spiral -= dt; b.spiralA += dt * 4.6; b.scd -= dt;
    if (b.scd <= 0) {
      b.scd = 0.075;
      eBullet(b.x, b.y, b.spiralA, 240, b.dmg * 0.4, 'seed');
      eBullet(b.x, b.y, b.spiralA + Math.PI, 240, b.dmg * 0.4, 'seed');
    }
    var sa2 = angTo(b, p);
    b.vx = Math.cos(sa2) * b.speed * 0.3 * chill;
    b.vy = Math.sin(sa2) * b.speed * 0.3 * chill;
    return;
  }

  var dd = dist(b, p), a = angTo(b, p);
  var want = dd > 250 ? 1 : (dd < 150 ? -0.65 : 0.22);
  b.vx = Math.cos(a) * b.speed * want * chill + Math.cos(b.t * 0.9) * 34;
  b.vy = Math.sin(a) * b.speed * want * chill + Math.sin(b.t * 0.9) * 34;
  b.atkT -= dt;
  if (b.atkT <= 0) { bossAttack(b); b.atkT = b.atkEvery * (0.65 + 0.55 * (b.hp / b.max)); }
}

/* ---- fruit brains ---- */
function fruitThink(e, dt, chill) {
  var p = G.player, dd = dist(e, p), a = angTo(e, p), sp = e.speed * chill;
  e.cd -= dt;
  var hunt = (G.level.type === 'clear' && G.enemies.length <= 3) || (G.elapsed - e.born > 22);
  if (hunt) sp *= 1.3;
  switch (e.ai) {
    case 'seek':
      e.wob += dt * 2.6;
      var wa = a + Math.sin(e.wob) * 0.25;
      e.vx = Math.cos(wa) * sp; e.vy = Math.sin(wa) * sp;
      break;
    case 'charger':
    case 'dasher':
      var fast = e.ai === 'dasher';
      if (e.state === 0) {
        e.vx = Math.cos(a) * sp * 0.5; e.vy = Math.sin(a) * sp * 0.5;
        if (dd < (fast ? 420 : 270) && e.cd <= 0) { e.state = 1; e.stateT = fast ? 0.34 : 0.46; }
      } else if (e.state === 1) {
        e.vx *= 0.8; e.vy *= 0.8; e.stateT -= dt;
        e.ang = a;
        if (e.stateT <= 0) { e.state = 2; e.stateT = fast ? 0.42 : 0.5; }
      } else {
        e.stateT -= dt;
        e.vx = Math.cos(e.ang) * sp * (fast ? 4.2 : 3.1);
        e.vy = Math.sin(e.ang) * sp * (fast ? 4.2 : 3.1);
        if (e.stateT <= 0) { e.state = 0; e.cd = rand(fast ? 1.0 : 1.5, fast ? 1.9 : 2.7); }
      }
      break;
    case 'roller':
      if (!e.rolling) { e.rolling = 1; e.bounceWalls = true; e.vx = Math.cos(a) * sp; e.vy = Math.sin(a) * sp; e.cd = rand(2.2, 3.4); }
      if (e.cd <= 0) { e.vx = Math.cos(a) * sp; e.vy = Math.sin(a) * sp; e.cd = rand(2.2, 3.6); }
      e.ang += dt * 7;
      break;
    case 'dropper':
      e.wob += dt * 3.1;
      var ba = a + Math.sin(e.wob) * 0.5;
      e.vx = Math.cos(ba) * sp; e.vy = Math.sin(ba) * sp;
      if (e.cd <= 0) { hazard(e.x, e.y, 'peel', 23, 13); e.cd = rand(1.7, 2.6); }
      break;
    case 'spitter':
      var keep = hunt ? 0.9 : (dd < 190 ? -0.9 : (dd > 300 ? 0.8 : 0.1));
      e.vx = Math.cos(a) * sp * keep; e.vy = Math.sin(a) * sp * keep;
      if (e.cd <= 0 && dd < 480) { eBullet(e.x, e.y, a, 215, e.dmg, 'acid'); e.cd = rand(1.9, 2.6); sfx('shoot'); }
      break;
    case 'shooter':
      var keep2 = hunt ? 0.85 : (dd < 230 ? -0.7 : (dd > 340 ? 0.7 : 0.15));
      e.vx = Math.cos(a) * sp * keep2 + Math.cos(a + Math.PI / 2) * sp * 0.35;
      e.vy = Math.sin(a) * sp * keep2 + Math.sin(a + Math.PI / 2) * sp * 0.35;
      if (e.cd <= 0 && dd < 520) {
        for (var i = 0; i < 3; i++) eBullet(e.x, e.y, a + (i - 1) * 0.26, 275, e.dmg * 0.8, 'spike');
        e.cd = rand(2.2, 3.1); sfx('shoot');
      }
      break;
    case 'armored':
      e.vx = Math.cos(a) * sp; e.vy = Math.sin(a) * sp;
      break;
    case 'exploder':
      var ex = dd < 150 ? 1.7 : 1;
      e.vx = Math.cos(a) * sp * ex; e.vy = Math.sin(a) * sp * ex;
      break;
    case 'seeder':
      var keep3 = hunt ? 0.9 : (dd < 210 ? -0.6 : 0.75);
      e.vx = Math.cos(a) * sp * keep3; e.vy = Math.sin(a) * sp * keep3;
      if (e.cd <= 0 && G.enemies.length < 60) {
        spawnEnemy('seedling', e.x + rand(-18, 18), e.y + rand(-18, 18));
        e.cd = rand(2.3, 3.4);
      }
      break;
    case 'melon':
      e.vx = Math.cos(a) * sp; e.vy = Math.sin(a) * sp;
      if (e.cd <= 0 && G.enemies.length < 60) {
        for (var m = 0; m < 2; m++) {
          var ma = rand(0, TAU);
          var c = spawnEnemy('slice', e.x + Math.cos(ma) * 34, e.y + Math.sin(ma) * 34);
          if (c) { c.vx = Math.cos(ma) * 160; c.vy = Math.sin(ma) * 160; }
        }
        e.cd = rand(3.0, 4.2); sfx('pop');
      }
      break;
  }
}

function updateEnemies(dt) {
  var p = G.player, i, e;
  for (i = 0; i < G.enemies.length; i++) {
    e = G.enemies[i];
    if (e.dead) continue;
    e.t += dt;
    if (e.flash > 0) e.flash -= dt;
    if (e.burn > 0) {
      e.burn -= dt;
      e.hp -= 11 * dt * (1 + G.levelIndex * 0.03);
      if (Math.random() < 0.3) G.parts.push({ x: e.x + rand(-8, 8), y: e.y + rand(-8, 8), vx: rand(-10, 10), vy: rand(-50, -15), r: rand(1.5, 3), life: 0.4, max: 0.4, col: '#ffb340', g: 0 });
      if (e.hp <= 0) { killEnemy(e); continue; }
    }
    var chill = 1;
    if (e.chill > 0) { e.chill -= dt; chill = 0.5; }

    if (e.kind === 'boss') bossThink(e, dt, chill); else fruitThink(e, dt, chill);

    e.x += e.vx * dt; e.y += e.vy * dt;
    collideWorld(e);

    /* contact: low damage, heavy rot */
    var dd = dist(e, p);
    if (dd < e.r + p.r) {
      if (p.inv <= 0) {
        hurtPlayer(e.dmg, e.rot, e.x, e.y);
        if (e.ai === 'exploder') { killEnemy(e); continue; }
      }
      var pa = angTo(p, e);
      e.x += Math.cos(pa) * 8; e.y += Math.sin(pa) * 8;
    }
  }

  /* light separation so fruit does not stack into one super-fruit */
  for (i = 0; i < G.enemies.length; i++) {
    var a1 = G.enemies[i];
    if (a1.dead || a1.kind === 'boss') continue;
    for (var j = i + 1; j < G.enemies.length; j++) {
      var b1 = G.enemies[j];
      if (b1.dead || b1.kind === 'boss') continue;
      var dx = b1.x - a1.x, dy = b1.y - a1.y, d = hyp(dx, dy), min = a1.r + b1.r;
      if (d > 0.001 && d < min) {
        var push = (min - d) / d * 0.34;
        a1.x -= dx * push; a1.y -= dy * push;
        b1.x += dx * push; b1.y += dy * push;
      }
    }
  }
  for (i = G.enemies.length - 1; i >= 0; i--) if (G.enemies[i].dead) G.enemies.splice(i, 1);
}

/* ---- projectiles ---- */
function hitsObstacle(o) {
  for (var i = 0; i < G.obstacles.length; i++) {
    var b = G.obstacles[i];
    if (o.x + o.r > b.x && o.x - o.r < b.x + b.w && o.y + o.r > b.y && o.y - o.r < b.y + b.h) return b;
  }
  return null;
}
function bounceOff(o, b) {
  var cx = clamp(o.x, b.x, b.x + b.w), cy = clamp(o.y, b.y, b.y + b.h);
  var dx = o.x - cx, dy = o.y - cy;
  if (Math.abs(dx) > Math.abs(dy)) { o.vx = -o.vx; o.x += (dx > 0 ? 1 : -1) * 3; }
  else { o.vy = -o.vy; o.y += (dy > 0 ? 1 : -1) * 3; }
}

function updateBullets(dt) {
  var p = G.player, i, j, b, e;
  for (i = G.pb.length - 1; i >= 0; i--) {
    b = G.pb[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    var dead = b.life <= 0;
    if (!dead) {
      if (b.x < 0 || b.x > G.world.w || b.y < 0 || b.y > G.world.h) {
        if (b.bounce > 0) {
          b.bounce--;
          if (b.x < 0 || b.x > G.world.w) { b.vx = -b.vx; b.x = clamp(b.x, 2, G.world.w - 2); }
          if (b.y < 0 || b.y > G.world.h) { b.vy = -b.vy; b.y = clamp(b.y, 2, G.world.h - 2); }
          b.hit.length = 0;
        } else dead = true;
      }
      var ob = hitsObstacle(b);
      if (ob) {
        if (b.bounce > 0) { b.bounce--; bounceOff(b, ob); b.hit.length = 0; }
        else { dead = true; puff(b.x, b.y, '#9aa7a0', 3, 60); }
      }
    }
    if (!dead) {
      for (j = 0; j < G.enemies.length; j++) {
        e = G.enemies[j];
        if (e.dead || b.hit.indexOf(e) >= 0) continue;
        if (dist(b, e) < e.r + b.r) {
          b.hit.push(e);
          hurtEnemy(e, b.dmg);
          if (b.burn) e.burn = Math.max(e.burn, 3);
          if (b.frost) e.chill = Math.max(e.chill, 1.6);
          if (!e.dead && e.kind !== 'boss') {
            e.x += Math.cos(b.ang) * 4; e.y += Math.sin(b.ang) * 4;
          }
          if (p.s.salt) p.rot = Math.max(0, p.rot - 0.9 * p.s.salt);
          puff(b.x, b.y, b.crit ? '#ffd24a' : e.col, b.crit ? 8 : 4, 90);
          if (b.pierce <= 0) { dead = true; break; }
          b.pierce--;
        }
      }
    }
    if (dead) G.pb.splice(i, 1);
  }

  for (i = G.eb.length - 1; i >= 0; i--) {
    b = G.eb[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; b.t += dt;
    var gone = b.life <= 0;
    if (b.x < 0 || b.x > G.world.w || b.y < 0 || b.y > G.world.h) gone = true;
    if (!gone && hitsObstacle(b)) gone = true;
    if (!gone && dist(b, p) < p.r + b.r) {
      if (p.inv <= 0) hurtPlayer(b.dmg, b.rot, b.x, b.y);
      gone = true;
    }
    if (gone) {
      if (b.style === 'acid') { hazard(b.x, b.y, 'acid', 34, 5.5); puff(b.x, b.y, '#fde047', 8, 80); }
      G.eb.splice(i, 1);
    }
  }
}

function updateHazards(dt) {
  var p = G.player;
  for (var i = G.hazards.length - 1; i >= 0; i--) {
    var h = G.hazards[i];
    h.life -= dt; h.t += dt;
    if (dist(h, p) < h.r + p.r - 5 && !G.ended) {
      if (h.type === 'peel') {
        if (p.dashT <= 0 && p.slip <= 0) { p.slip = 0.95; sfx('click'); }
      } else {
        var rotRate = h.type === 'acid' ? 9 : (h.type === 'juice' ? 5 : 7);
        var dps = h.type === 'acid' ? 3.4 : 2.4;
        p.rot = clamp(p.rot + rotRate * dt, 0, p.maxrot);
        p.hp -= dps * dt * (1 - p.s.dr);
        if (p.hp <= 0) playerDown();
      }
    }
    if (h.life <= 0) G.hazards.splice(i, 1);
  }
}

function grantUpgrade(id) {
  var u = UP_BY_ID[id];
  G.run.up[id] = (G.run.up[id] || 0) + 1;
  recalc();
  toast(u.name.toUpperCase(), 1.4);
  sfx('upgrade');
}
function randomGrantable() {
  var pool = [];
  for (var i = 0; i < UPGRADES.length; i++) if ((G.run.up[UPGRADES[i].id] || 0) < UPGRADES[i].max) pool.push(UPGRADES[i].id);
  return pool.length ? pick(pool) : null;
}

function updatePickups(dt) {
  var p = G.player;
  for (var i = G.pickups.length - 1; i >= 0; i--) {
    var k = G.pickups[i];
    k.t += dt; k.life -= dt;
    var d = dist(k, p);
    if (d < p.s.magnet) {
      var a = angTo(k, p), pull = k.type === 'crate' ? 150 : 230;
      k.x += Math.cos(a) * pull * dt; k.y += Math.sin(a) * pull * dt;
    }
    if (d < p.r + k.r + 4) {
      if (k.type === 'heart') { p.hp = Math.min(p.maxhp, p.hp + 26); sfx('heal'); toast('+26 LIFE', 0.8); }
      else if (k.type === 'salt') { p.rot = Math.max(0, p.rot - 48); sfx('pickup'); toast('ROT SCRUBBED', 0.8); }
      else {
        var g = randomGrantable();
        if (g) grantUpgrade(g); else { p.hp = Math.min(p.maxhp, p.hp + 30); sfx('heal'); }
      }
      puff(k.x, k.y, k.type === 'heart' ? '#ff6b81' : '#ffd24a', 12, 130);
      G.pickups.splice(i, 1); continue;
    }
    if (k.life <= 0) G.pickups.splice(i, 1);
  }
  for (var j = G.keyItems.length - 1; j >= 0; j--) {
    var key = G.keyItems[j];
    key.t += dt;
    if (dist(key, p) < p.r + key.r + 6) {
      G.keysGot++;
      sfx('key'); puff(key.x, key.y, '#ffd24a', 24, 200);
      toast('VAULT KEY ' + G.keysGot + ' / ' + G.keysNeeded, 1.5);
      G.keyItems.splice(j, 1);
    }
  }
}

function updateParticles(dt) {
  for (var i = G.parts.length - 1; i >= 0; i--) {
    var q = G.parts[i];
    q.life -= dt;
    q.x += q.vx * dt; q.y += q.vy * dt;
    q.vy += (q.g || 0) * dt;
    q.vx *= 0.97; q.vy *= 0.97;
    if (q.life <= 0) G.parts.splice(i, 1);
  }
  if (G.parts.length > 700) G.parts.splice(0, G.parts.length - 700);
}

/* ---- the director: waves, timers, objectives ---- */
function updateDirector(dt) {
  var lv = G.level;
  if (G.ended) return;

  if (lv.type === 'clear') {
    while (G.waveIdx < lv.waves.length && G.elapsed + G.pull >= lv.waves[G.waveIdx].at) {
      spawnGroup(lv.waves[G.waveIdx].spawn);
      G.spawned += countSpec(lv.waves[G.waveIdx].spawn);
      G.waveIdx++;
      if (G.waveIdx > 1 && G.waveIdx <= lv.waves.length) toast('WAVE ' + G.waveIdx + ' / ' + lv.waves.length, 1.1);
    }
    if (G.waveIdx < lv.waves.length && G.enemies.length === 0) {
      var need = lv.waves[G.waveIdx].at - (G.elapsed + G.pull) - 0.8;
      if (need > 0) G.pull += need;
    }
    if (G.waveIdx >= lv.waves.length && G.enemies.length === 0) { endLevel(true); return; }
  } else if (lv.type === 'survive') {
    G.survive += dt;
    G.spawnT -= dt;
    if (G.spawnT <= 0 && G.enemies.length < 40) {
      spawnGroup(lv.spawn);
      G.spawnT = Math.max(1.1, lv.every * (1 - G.survive / Math.max(1, lv.dur) * 0.45));
    }
    if (lv.flood) {
      G.floodT -= dt;
      if (G.floodT <= 0) {
        G.floodT = 4.5;
        var f = freeSpot(null, 60);
        hazard(f.x, f.y, 'juice', rand(40, 70), 14);
      }
    }
    if (G.survive >= lv.dur) { endLevel(true); return; }
  } else if (lv.type === 'keys') {
    G.spawnT -= dt;
    if (G.spawnT <= 0 && G.enemies.length < 32) { spawnGroup(lv.spawn); G.spawnT = lv.every; }
    if (G.keysGot >= G.keysNeeded) { endLevel(true); return; }
  }

  if (lv.add && G.boss) {
    G.addTimer -= dt;
    if (G.addTimer <= 0 && G.enemies.length < 30) { summonAdds(G.boss, lv.add.n); G.addTimer = lv.add.every; }
  }
}

function endLevel(won) {
  if (G.ended) return;
  G.ended = true; G.won = won; G.endT = won ? 1.15 : 1.5;
  mouse.down = false;
  sfx(won ? 'win' : 'lose');
  if (won) {
    var i = G.levelIndex, firstTime = !save.cleared[i];
    save.cleared[i] = true;
    save.unlocked = Math.max(save.unlocked || 1, Math.min(LEVELS.length, i + 2));
    save.best[i] = Math.max(save.best[i] || 0, G.score);
    save.score = (save.score || 0) + G.score;
    if (G.keysNeeded && firstTime) save.keys = (save.keys || 0) + G.keysGot;
    writeSave();
    toast('CLEARED', 1.2);
  } else {
    splat(G.player.x, G.player.y, '#d9e6dd', 34);
    G.flash = 0.6;
    toast('ROTTED THROUGH', 1.4);
  }
}

/* ---------------- 5. RENDER ---------------- */
var THEME = {
  orchard: { g1:'#16241a', g2:'#1b2d1f', grid:'#223a27', dec:'#2e4a33', fogcol:'#030705' },
  grove:   { g1:'#13211f', g2:'#182a26', grid:'#1f352f', dec:'#2a483f', fogcol:'#02060a' },
  night:   { g1:'#0c1320', g2:'#101a2a', grid:'#182440', dec:'#1d2c4a', fogcol:'#01030a' },
  vault:   { g1:'#1a1510', g2:'#211a13', grid:'#2e2419', dec:'#3b2e20', fogcol:'#080502' }
};
function shade(hex, f) {
  var n = parseInt(hex.slice(1), 16);
  var r = clamp(Math.round(((n >> 16) & 255) * f), 0, 255);
  var g = clamp(Math.round(((n >> 8) & 255) * f), 0, 255);
  var b = clamp(Math.round((n & 255) * f), 0, 255);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}
function ball(x, y, rad, c) {
  ctx.fillStyle = c;
  ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.17)';
  ctx.beginPath(); ctx.arc(x - rad * 0.33, y - rad * 0.36, rad * 0.36, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.33)'; ctx.lineWidth = Math.max(1, rad * 0.11);
  ctx.beginPath(); ctx.arc(x, y, rad - rad * 0.05, 0, TAU); ctx.stroke();
}
function leaf(x, y, s, a) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  ctx.fillStyle = '#4ea33c';
  ctx.beginPath(); ctx.ellipse(s * 0.5, 0, s * 0.55, s * 0.26, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#2f6b26'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s, 0); ctx.stroke();
  ctx.restore();
}
function stem(x, y, s) {
  ctx.strokeStyle = '#6b4a22'; ctx.lineWidth = Math.max(1.6, s * 0.17); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + s * 0.25, y - s * 0.8, x + s * 0.05, y - s * 1.15); ctx.stroke();
}
function face(x, y, s, mood) {
  var ew = s * 0.3;
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.ellipse(x - s * 0.36, y, ew, ew * 1.15, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + s * 0.36, y, ew, ew * 1.15, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#10151a';
  ctx.beginPath(); ctx.arc(x - s * 0.33, y + s * 0.05, ew * 0.52, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(x + s * 0.39, y + s * 0.05, ew * 0.52, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#10151a'; ctx.lineWidth = Math.max(1.4, s * 0.13); ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - s * 0.66, y - s * 0.46); ctx.lineTo(x - s * 0.12, y - s * 0.2);
  ctx.moveTo(x + s * 0.66, y - s * 0.46); ctx.lineTo(x + s * 0.12, y - s * 0.2);
  ctx.stroke();
  ctx.beginPath();
  if (mood === 'big') { ctx.arc(x, y + s * 0.55, s * 0.42, 0.15 * Math.PI, 0.85 * Math.PI); }
  else { ctx.moveTo(x - s * 0.34, y + s * 0.62); ctx.quadraticCurveTo(x, y + s * 0.32, x + s * 0.34, y + s * 0.62); }
  ctx.stroke();
}

function drawArt(art, r, c, e) {
  var t = e.t || 0, i;
  switch (art) {
    case 'cherry':
      ctx.strokeStyle = '#4d7c2a'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-r * 0.3, -r * 0.5); ctx.quadraticCurveTo(r * 0.1, -r * 1.7, r * 0.6, -r * 1.1); ctx.stroke();
      ball(-r * 0.42, r * 0.12, r * 0.62, shade(c, 0.85));
      ball(r * 0.34, r * 0.05, r * 0.68, c);
      face(r * 0.34, r * 0.05, r * 0.52);
      break;
    case 'apple':
      ball(0, 0, r, c);
      stem(0, -r * 0.82, r * 0.5); leaf(r * 0.12, -r * 1.1, r * 0.55, -0.5);
      face(0, 0, r * 0.62);
      break;
    case 'grape':
      for (i = 0; i < 6; i++) {
        var ga = i / 6 * TAU + t * 0.4;
        ball(Math.cos(ga) * r * 0.52, Math.sin(ga) * r * 0.52, r * 0.46, shade(c, 0.85));
      }
      ball(0, 0, r * 0.6, c);
      face(0, 0, r * 0.46);
      break;
    case 'orange':
      ball(0, 0, r, c);
      ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1.5;
      for (i = 0; i < 6; i++) {
        var oa = i / 6 * TAU + (e.ang || 0);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(oa) * r * 0.9, Math.sin(oa) * r * 0.9); ctx.stroke();
      }
      leaf(0, -r * 0.95, r * 0.5, -0.9);
      face(0, 0, r * 0.6);
      break;
    case 'banana':
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(-r, -r * 0.35);
      ctx.quadraticCurveTo(0, r * 1.25, r, -r * 0.35);
      ctx.quadraticCurveTo(0, r * 0.55, -r, -r * 0.35);
      ctx.fill();
      ctx.strokeStyle = shade(c, 0.6); ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#6b5a12';
      ctx.fillRect(-r - 1, -r * 0.5, r * 0.3, r * 0.3);
      face(0, r * 0.18, r * 0.46);
      break;
    case 'lemon':
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.ellipse(0, 0, r * 1.08, r * 0.82, Math.sin(t) * 0.1, 0, TAU); ctx.fill();
      ctx.fillStyle = shade(c, 0.78);
      ctx.beginPath(); ctx.arc(-r * 1.0, 0, r * 0.2, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(r * 1.0, 0, r * 0.2, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.2)';
      ctx.beginPath(); ctx.ellipse(-r * 0.3, -r * 0.3, r * 0.34, r * 0.18, -0.5, 0, TAU); ctx.fill();
      face(0, 0, r * 0.56);
      break;
    case 'pineapple':
      ctx.fillStyle = '#3f8f31';
      for (i = -2; i <= 2; i++) {
        ctx.save(); ctx.translate(0, -r * 0.85); ctx.rotate(i * 0.33);
        ctx.beginPath(); ctx.moveTo(-r * 0.16, 0); ctx.lineTo(0, -r * 0.95); ctx.lineTo(r * 0.16, 0); ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.ellipse(0, r * 0.08, r * 0.82, r * 0.98, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.22)'; ctx.lineWidth = 1.3;
      for (i = -2; i <= 2; i++) {
        ctx.beginPath(); ctx.moveTo(-r * 0.8, i * r * 0.3 + r * 0.1); ctx.lineTo(r * 0.8, i * r * 0.3 - r * 0.25); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-r * 0.8, i * r * 0.3 - r * 0.25); ctx.lineTo(r * 0.8, i * r * 0.3 + r * 0.1); ctx.stroke();
      }
      face(0, r * 0.1, r * 0.55);
      break;
    case 'coconut':
      ball(0, 0, r, c);
      ctx.fillStyle = shade(c, 0.6);
      for (i = 0; i < 3; i++) {
        var ca = i / 3 * TAU - 1.2;
        ctx.beginPath(); ctx.arc(Math.cos(ca) * r * 0.45, Math.sin(ca) * r * 0.45 - r * 0.1, r * 0.13, 0, TAU); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 1.2;
      for (i = 0; i < 5; i++) {
        var ha = i / 5 * TAU;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ha) * r * 0.3, Math.sin(ha) * r * 0.3);
        ctx.lineTo(Math.cos(ha) * r * 0.92, Math.sin(ha) * r * 0.92); ctx.stroke();
      }
      if (e.armor) {
        ctx.strokeStyle = 'rgba(220,230,255,.55)'; ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.arc(0, 0, r + 3, 0, TAU); ctx.stroke();
      }
      face(0, r * 0.1, r * 0.5);
      break;
    case 'durian':
      ctx.fillStyle = shade(c, 0.8);
      for (i = 0; i < 12; i++) {
        var da = i / 12 * TAU + t * 0.5;
        ctx.beginPath();
        ctx.moveTo(Math.cos(da) * r * 0.75, Math.sin(da) * r * 0.75);
        ctx.lineTo(Math.cos(da + 0.26) * r * 0.75, Math.sin(da + 0.26) * r * 0.75);
        ctx.lineTo(Math.cos(da + 0.13) * r * 1.35, Math.sin(da + 0.13) * r * 1.35);
        ctx.closePath(); ctx.fill();
      }
      ball(0, 0, r * 0.85, c);
      face(0, 0, r * 0.5);
      break;
    case 'strawberry':
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(0, r * 1.15);
      ctx.quadraticCurveTo(-r * 1.1, r * 0.2, -r * 0.8, -r * 0.6);
      ctx.quadraticCurveTo(0, -r * 1.0, r * 0.8, -r * 0.6);
      ctx.quadraticCurveTo(r * 1.1, r * 0.2, 0, r * 1.15);
      ctx.fill();
      ctx.fillStyle = '#ffe9a8';
      for (i = 0; i < 7; i++) {
        var sa2 = i / 7 * TAU;
        ctx.beginPath(); ctx.ellipse(Math.cos(sa2) * r * 0.45, Math.sin(sa2) * r * 0.45, 1.6, 2.6, sa2, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = '#3f8f31';
      for (i = -2; i <= 2; i++) {
        ctx.save(); ctx.translate(0, -r * 0.7); ctx.rotate(i * 0.5);
        ctx.beginPath(); ctx.ellipse(0, -r * 0.2, r * 0.18, r * 0.42, 0, 0, TAU); ctx.fill();
        ctx.restore();
      }
      face(0, 0, r * 0.5);
      break;
    case 'kiwi':
      ball(0, 0, r, c);
      ctx.fillStyle = '#d9f0a0';
      ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(0, 0, r * 0.2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#20301a';
      for (i = 0; i < 9; i++) {
        var ka = i / 9 * TAU;
        ctx.beginPath(); ctx.ellipse(Math.cos(ka) * r * 0.4, Math.sin(ka) * r * 0.4, 1.5, 2.4, ka, 0, TAU); ctx.fill();
      }
      face(0, 0, r * 0.44);
      break;
    case 'watermelon':
      ball(0, 0, r, c);
      ctx.strokeStyle = shade(c, 0.55); ctx.lineWidth = Math.max(2, r * 0.13);
      for (i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * r * 0.38, -r * 0.95);
        ctx.quadraticCurveTo(i * r * 0.52, 0, i * r * 0.38, r * 0.95);
        ctx.stroke();
      }
      face(0, 0, r * 0.52, 'big');
      break;
    case 'slice':
      ctx.fillStyle = '#2f7d32';
      ctx.beginPath(); ctx.arc(0, r * 0.4, r * 1.1, Math.PI, 0); ctx.fill();
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(0, r * 0.4, r * 0.86, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#2b1a1a';
      for (i = -1; i <= 1; i++) { ctx.beginPath(); ctx.ellipse(i * r * 0.4, r * 0.02, 1.7, 2.7, 0, 0, TAU); ctx.fill(); }
      face(0, -r * 0.1, r * 0.4);
      break;
    case 'seed':
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.ellipse(0, 0, r * 0.8, r, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#20301a';
      ctx.beginPath(); ctx.arc(-r * 0.25, -r * 0.1, 1.3, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(r * 0.25, -r * 0.1, 1.3, 0, TAU); ctx.fill();
      break;
    case 'dragon':
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.ellipse(0, 0, r * 0.95, r * 1.1, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#58d26a';
      for (i = 0; i < 9; i++) {
        var fa = i / 9 * TAU + t * 0.6;
        ctx.save(); ctx.translate(Math.cos(fa) * r * 0.75, Math.sin(fa) * r * 0.85); ctx.rotate(fa);
        ctx.beginPath(); ctx.moveTo(-r * 0.2, 0); ctx.lineTo(r * 0.45, -r * 0.16); ctx.lineTo(r * 0.45, r * 0.16); ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.beginPath(); ctx.ellipse(0, 0, r * 0.5, r * 0.62, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2b1a1a';
      for (i = 0; i < 8; i++) {
        var pa2 = i / 8 * TAU;
        ctx.beginPath(); ctx.ellipse(Math.cos(pa2) * r * 0.26, Math.sin(pa2) * r * 0.3, 1.4, 2, pa2, 0, TAU); ctx.fill();
      }
      face(0, 0, r * 0.4, 'big');
      break;
    default:
      ball(0, 0, r, c); face(0, 0, r * 0.5);
  }
}

function drawCrown(r) {
  ctx.fillStyle = '#ffd24a'; ctx.strokeStyle = '#8a6a14'; ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-r * 0.5, -r * 1.02); ctx.lineTo(-r * 0.5, -r * 1.42); ctx.lineTo(-r * 0.22, -r * 1.2);
  ctx.lineTo(0, -r * 1.55); ctx.lineTo(r * 0.22, -r * 1.2); ctx.lineTo(r * 0.5, -r * 1.42);
  ctx.lineTo(r * 0.5, -r * 1.02); ctx.closePath(); ctx.fill(); ctx.stroke();
}

function drawEnemy(e) {
  ctx.save();
  ctx.translate(e.x, e.y);
  var sq = 1;
  if (e.state === 1 || e.windup > 0) sq = 1 + Math.sin(G.t * 40) * 0.09;
  ctx.scale(sq, 2 - sq);
  var c = e.flash > 0 ? '#ffffff' : e.col;
  ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 4;
  drawArt(e.art, e.r, c, e);
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  if (e.kind === 'boss' || e.elite) drawCrown(e.r);
  if (e.chill > 0) {
    ctx.strokeStyle = 'rgba(150,220,255,.75)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, e.r + 4, 0, TAU); ctx.stroke();
  }
  ctx.restore();
  if (e.kind !== 'boss' && e.hp < e.max) {
    var w2 = e.r * 1.9, hp = clamp(e.hp / e.max, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(e.x - w2 / 2, e.y - e.r - 11, w2, 4);
    ctx.fillStyle = e.armor ? '#cfd8ff' : '#7ee36a';
    ctx.fillRect(e.x - w2 / 2, e.y - e.r - 11, w2 * hp, 4);
  }
}

function drawPlayer() {
  var p = G.player;
  ctx.save();
  ctx.translate(p.x, p.y);
  if (p.inv > 0 && Math.floor(G.t * 22) % 2 === 0) ctx.globalAlpha = 0.45;
  if (p.rot > 4) {
    ctx.strokeStyle = 'rgba(192,132,252,' + (0.18 + p.rot / 260) + ')';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, p.r + 7 + Math.sin(G.t * 6) * 2, 0, TAU); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(0,0,0,.4)';
  ctx.beginPath(); ctx.ellipse(0, p.r * 0.8, p.r * 0.95, p.r * 0.4, 0, 0, TAU); ctx.fill();
  var bob = Math.sin(p.walk) * 1.6;
  /* boots */
  ctx.fillStyle = '#2b3a44';
  ctx.fillRect(-p.r * 0.7, p.r * 0.3 + bob, p.r * 0.5, p.r * 0.6);
  ctx.fillRect(p.r * 0.2, p.r * 0.3 - bob, p.r * 0.5, p.r * 0.6);
  /* coat */
  ctx.fillStyle = p.hurtFlash > 0 ? '#ffffff' : '#d9e6dd';
  ctx.beginPath(); ctx.ellipse(0, bob * 0.3, p.r * 0.86, p.r, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.12)';
  ctx.fillRect(-1.2, -p.r * 0.6, 2.4, p.r * 1.5);
  /* head + visor */
  ctx.fillStyle = '#f2e9d8';
  ctx.beginPath(); ctx.arc(0, -p.r * 0.75 + bob * 0.4, p.r * 0.52, 0, TAU); ctx.fill();
  ctx.fillStyle = '#39d353';
  ctx.beginPath(); ctx.arc(0, -p.r * 0.8 + bob * 0.4, p.r * 0.34, Math.PI * 0.1, Math.PI * 0.9, true); ctx.fill();
  /* juicer gun */
  ctx.rotate(p.aim);
  ctx.fillStyle = '#4b5a63';
  ctx.fillRect(p.r * 0.2, -p.r * 0.26, p.r * 1.25, p.r * 0.52);
  ctx.fillStyle = '#7ee36a';
  ctx.fillRect(p.r * 1.0, -p.r * 0.2, p.r * 0.45, p.r * 0.4);
  ctx.fillStyle = '#2b3a44';
  ctx.fillRect(p.r * 0.1, -p.r * 0.1, p.r * 0.5, p.r * 0.55);
  ctx.restore();
  if (G.player.s.orbit) {
    for (var o = 0; o < G.player.s.orbit; o++) {
      var oa = p.orbA + o / G.player.s.orbit * TAU;
      var ox = p.x + Math.cos(oa) * 54, oy = p.y + Math.sin(oa) * 54;
      ctx.save(); ctx.translate(ox, oy); ctx.rotate(G.t * 12);
      ctx.fillStyle = '#cfe9ff';
      ctx.beginPath();
      ctx.moveTo(-9, 0); ctx.lineTo(0, -3); ctx.lineTo(9, 0); ctx.lineTo(0, 3); ctx.fill();
      ctx.restore();
    }
  }
}

function drawGround() {
  var th = THEME[G.level ? G.level.theme : 'orchard'] || THEME.orchard;
  var gw = G.world.w, gh = G.world.h;
  var grd = ctx.createLinearGradient(0, 0, 0, gh);
  grd.addColorStop(0, th.g1); grd.addColorStop(1, th.g2);
  ctx.fillStyle = grd; ctx.fillRect(0, 0, gw, gh);
  ctx.strokeStyle = th.grid; ctx.lineWidth = 1;
  ctx.beginPath();
  for (var x = 0; x <= gw; x += 60) { ctx.moveTo(x, 0); ctx.lineTo(x, gh); }
  for (var y = 0; y <= gh; y += 60) { ctx.moveTo(0, y); ctx.lineTo(gw, y); }
  ctx.stroke();
  for (var i = 0; i < G.decor.length; i++) {
    var d = G.decor[i];
    if (d.x < G.cam.x - 40 || d.x > G.cam.x + W + 40 || d.y < G.cam.y - 40 || d.y > G.cam.y + H + 40) continue;
    ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.a);
    ctx.fillStyle = th.dec;
    if (d.k < 0.6) { ctx.beginPath(); ctx.ellipse(0, 0, d.r, d.r * 0.42, 0, 0, TAU); ctx.fill(); }
    else { ctx.fillRect(-d.r * 0.4, -d.r * 0.4, d.r * 0.8, d.r * 0.8); }
    ctx.restore();
  }
  ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, gw - 3, gh - 3);
}

function drawObstacles() {
  for (var i = 0; i < G.obstacles.length; i++) {
    var b = G.obstacles[i];
    if (b.x > G.cam.x + W || b.x + b.w < G.cam.x || b.y > G.cam.y + H || b.y + b.h < G.cam.y) continue;
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(b.x + 4, b.y + 6, b.w, b.h);
    ctx.fillStyle = '#4a3a28';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = '#5d4a33';
    ctx.fillRect(b.x + 3, b.y + 3, b.w - 6, b.h - 6);
    ctx.strokeStyle = '#2e2419'; ctx.lineWidth = 2;
    ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(b.x + 3, b.y + b.h * 0.5); ctx.lineTo(b.x + b.w - 3, b.y + b.h * 0.5);
    ctx.stroke();
  }
}

function drawHazards() {
  for (var i = 0; i < G.hazards.length; i++) {
    var h = G.hazards[i];
    var fade = clamp(h.life / 1.2, 0, 1);
    ctx.save(); ctx.translate(h.x, h.y); ctx.globalAlpha = fade;
    if (h.type === 'peel') {
      ctx.fillStyle = '#facc15';
      for (var k = 0; k < 3; k++) {
        ctx.save(); ctx.rotate(k * 2.1 + h.t * 0.2);
        ctx.beginPath(); ctx.ellipse(h.r * 0.4, 0, h.r * 0.55, h.r * 0.2, 0.3, 0, TAU); ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = '#b68f0e';
      ctx.beginPath(); ctx.arc(0, 0, h.r * 0.2, 0, TAU); ctx.fill();
    } else {
      var col = h.type === 'acid' ? '250,220,70' : (h.type === 'juice' ? '255,140,90' : '168,85,247');
      ctx.fillStyle = 'rgba(' + col + ',.26)';
      ctx.beginPath(); ctx.arc(0, 0, h.r, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(' + col + ',.6)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, h.r * (0.9 + Math.sin(h.t * 3) * 0.05), 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(' + col + ',.4)';
      for (var q = 0; q < 4; q++) {
        var qa = q * 1.9 + h.t;
        ctx.beginPath(); ctx.arc(Math.cos(qa) * h.r * 0.5, Math.sin(qa) * h.r * 0.5, h.r * 0.2, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawBullets() {
  var i, b;
  for (i = 0; i < G.pb.length; i++) {
    b = G.pb[i];
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.ang);
    ctx.fillStyle = b.crit ? '#ffd24a' : '#bdf5a8';
    ctx.beginPath(); ctx.ellipse(0, 0, b.r * 2.1, b.r * 0.85, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.beginPath(); ctx.ellipse(b.r * 0.6, 0, b.r * 0.7, b.r * 0.38, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  for (i = 0; i < G.eb.length; i++) {
    b = G.eb[i];
    ctx.save(); ctx.translate(b.x, b.y);
    if (b.style === 'spike') {
      ctx.rotate(Math.atan2(b.vy, b.vx));
      ctx.fillStyle = '#ffe17a';
      ctx.beginPath(); ctx.moveTo(b.r * 1.6, 0); ctx.lineTo(-b.r, -b.r * 0.75); ctx.lineTo(-b.r, b.r * 0.75); ctx.fill();
    } else if (b.style === 'acid') {
      ctx.fillStyle = '#fde047';
      ctx.beginPath(); ctx.arc(0, 0, b.r, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.5)';
      ctx.beginPath(); ctx.arc(-b.r * 0.3, -b.r * 0.3, b.r * 0.35, 0, TAU); ctx.fill();
    } else {
      ctx.rotate(b.t * 9);
      ctx.fillStyle = '#ff8fa3';
      ctx.beginPath(); ctx.ellipse(0, 0, b.r * 0.8, b.r * 1.15, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.beginPath(); ctx.ellipse(0, 0, b.r * 0.3, b.r * 0.55, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
}

function drawPickups() {
  var i;
  for (i = 0; i < G.pickups.length; i++) {
    var k = G.pickups[i];
    var bob = Math.sin(k.t * 3) * 3;
    var blink = k.life < 4 && Math.floor(k.life * 6) % 2 === 0;
    if (blink) continue;
    ctx.save(); ctx.translate(k.x, k.y + bob);
    if (k.type === 'heart') {
      ctx.fillStyle = '#ff5f78';
      ctx.beginPath();
      ctx.moveTo(0, 7); ctx.bezierCurveTo(-11, -2, -5, -10, 0, -4);
      ctx.bezierCurveTo(5, -10, 11, -2, 0, 7); ctx.fill();
    } else if (k.type === 'salt') {
      ctx.fillStyle = '#e9f2f7'; ctx.fillRect(-6, -7, 12, 14);
      ctx.fillStyle = '#9fb3c0'; ctx.fillRect(-6, -7, 12, 4);
      ctx.fillStyle = '#5b7080';
      for (var s = 0; s < 3; s++) ctx.fillRect(-3 + s * 3, -5.5, 1.4, 1.4);
    } else {
      ctx.fillStyle = '#ffd24a'; ctx.fillRect(-9, -9, 18, 18);
      ctx.strokeStyle = '#8a6a14'; ctx.lineWidth = 2; ctx.strokeRect(-9, -9, 18, 18);
      ctx.fillStyle = '#8a6a14'; ctx.fillRect(-9, -2, 18, 4); ctx.fillRect(-2, -9, 4, 18);
    }
    ctx.restore();
  }
  for (i = 0; i < G.keyItems.length; i++) {
    var key = G.keyItems[i];
    ctx.save(); ctx.translate(key.x, key.y + Math.sin(key.t * 2.4) * 4); ctx.rotate(Math.sin(key.t) * 0.3);
    ctx.shadowColor = 'rgba(255,210,74,.85)'; ctx.shadowBlur = 18;
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath(); ctx.arc(-5, 0, 6.5, 0, TAU); ctx.fill();
    ctx.fillRect(-1, -2.4, 14, 4.8);
    ctx.fillRect(9, 0, 3.4, 6);
    ctx.fillRect(4, 0, 3.4, 5);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#1a1510';
    ctx.beginPath(); ctx.arc(-5, 0, 2.3, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

function drawBeam(b) {
  var bm = b.beam; if (!bm) return;
  ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(bm.ang);
  if (bm.t < bm.warn) {
    ctx.strokeStyle = 'rgba(255,70,110,' + (0.3 + 0.4 * Math.sin(G.t * 30)) + ')';
    ctx.lineWidth = 3; ctx.setLineDash([14, 10]);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(1600, 0); ctx.stroke();
    ctx.setLineDash([]);
  } else {
    var a = clamp((bm.warn + bm.dur - bm.t) / bm.dur, 0, 1);
    ctx.fillStyle = 'rgba(255,60,110,' + (0.75 * a) + ')';
    ctx.fillRect(0, -30 * a, 1600, 60 * a);
    ctx.fillStyle = 'rgba(255,230,240,' + (0.9 * a) + ')';
    ctx.fillRect(0, -11 * a, 1600, 22 * a);
  }
  ctx.restore();
}

function drawFog() {
  var p = G.player;
  var sx = p.x - G.cam.x, sy = p.y - G.cam.y;
  var th = THEME[G.level.theme] || THEME.night;
  var g = ctx.createRadialGradient(sx, sy, 60, sx, sy, 330);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.55, 'rgba(2,4,8,.55)');
  g.addColorStop(1, th.fogcol);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

function drawCompass() {
  var p = G.player, i;
  for (i = 0; i < G.keyItems.length; i++) {
    var k = G.keyItems[i];
    var sx = k.x - G.cam.x, sy = k.y - G.cam.y;
    if (sx > 30 && sx < W - 30 && sy > 30 && sy < H - 30) continue;
    var a = Math.atan2(k.y - p.y, k.x - p.x);
    var px = p.x - G.cam.x + Math.cos(a) * 120, py = p.y - G.cam.y + Math.sin(a) * 120;
    px = clamp(px, 26, W - 26); py = clamp(py, 26, H - 26);
    ctx.save(); ctx.translate(px, py); ctx.rotate(a);
    ctx.fillStyle = 'rgba(255,210,74,' + (0.55 + 0.35 * Math.sin(G.t * 5)) + ')';
    ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -8); ctx.lineTo(-8, 8); ctx.fill();
    ctx.restore();
  }
}

function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (G.scene !== 'play' && G.scene !== 'pause' && G.scene !== 'up' && G.scene !== 'win' && G.scene !== 'over') {
    drawAttract();
    return;
  }
  var sx = 0, sy = 0;
  if (G.shake > 0.2) { sx = rand(-G.shake, G.shake); sy = rand(-G.shake, G.shake); }
  ctx.save();
  ctx.translate(-G.cam.x + sx, -G.cam.y + sy);

  drawGround();
  drawHazards();
  drawObstacles();
  drawPickups();

  var i;
  for (i = 0; i < G.parts.length; i++) {
    var q = G.parts[i];
    ctx.globalAlpha = clamp(q.life / q.max, 0, 1);
    ctx.fillStyle = q.col;
    ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;

  for (i = 0; i < G.enemies.length; i++) if (G.enemies[i].kind !== 'boss') drawEnemy(G.enemies[i]);
  if (G.boss) { drawBeam(G.boss); drawEnemy(G.boss); }
  if (!G.ended || G.won) drawPlayer();
  drawBullets();
  ctx.restore();

  if (G.level && G.level.fog) drawFog();
  drawCompass();

  if (G.flash > 0) {
    ctx.fillStyle = 'rgba(255,60,90,' + (G.flash * 0.5) + ')';
    ctx.fillRect(0, 0, W, H);
  }
  /* vignette */
  var vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 1.0);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

  if (touchMove) {
    ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(touchMove.ox, touchMove.oy, 46, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.3)';
    ctx.beginPath(); ctx.arc(touchMove.x, touchMove.y, 18, 0, TAU); ctx.fill();
  }
}

/* attract screen behind the menus */
var attract = [];
function initAttract() {
  var types = ['cherry', 'apple', 'orange', 'banana', 'grape', 'lemon', 'sergeant', 'pineapple', 'strawberry', 'kiwi', 'durian', 'coconut'];
  attract = [];
  for (var i = 0; i < 16; i++) {
    var ty = types[i % types.length];
    attract.push({ art: FRUIT[ty].art, col: FRUIT[ty].col, r: rand(14, 30),
      x: rand(0, W), y: rand(0, H), vx: rand(-34, 34), vy: rand(-26, 26), t: rand(0, 9), ang: rand(0, TAU) });
  }
}
function drawAttract() {
  var g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#101a22'); g.addColorStop(1, '#070c11');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(126,227,106,.06)'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (var x = 0; x <= W; x += 48) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (var y = 0; y <= H; y += 48) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();
  for (var i = 0; i < attract.length; i++) {
    var a = attract[i];
    a.x += a.vx * G.dt; a.y += a.vy * G.dt; a.t += G.dt;
    if (a.x < -40) a.x = W + 40; if (a.x > W + 40) a.x = -40;
    if (a.y < -40) a.y = H + 40; if (a.y > H + 40) a.y = -40;
    ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(Math.sin(a.t * 0.6) * 0.25);
    ctx.globalAlpha = 0.5;
    drawArt(a.art, a.r, a.col, a);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

/* ---------------- 6. SCREENS & LOOP ---------------- */
var SCREENS = {
  title: 'scr-title', story: 'scr-story', map: 'scr-map', brief: 'scr-brief', up: 'scr-up',
  win: 'scr-win', over: 'scr-over', pause: 'scr-pause', vault: 'scr-vaultscr', help: 'scr-help'
};
function setScene(name) {
  G.scene = name;
  for (var k in SCREENS) {
    var node = el(SCREENS[k]);
    if (node) node.classList.toggle('show', k === name);
  }
  el('hud').hidden = !(name === 'play' || name === 'pause');
  if (name !== 'play') { mouse.down = false; touchFire = null; touchMove = null; }
  if (name !== 'play' && name !== 'pause') { el('toast').classList.remove('on'); G.toastT = 0; }
  updateProgLine();
}

function updateProgLine() {
  var done = 0;
  for (var i = 0; i < LEVELS.length; i++) if (save.cleared[i]) done++;
  el('progline').textContent = done + ' / ' + LEVELS.length + ' levels cleared · ' + (save.keys || 0) + ' keys in hand';
  el('tophint').textContent = done >= LEVELS.length ? 'the orchard is yours' : (30 - done) + ' levels left · the orchard is winning';
}

function kitChips(target) {
  var node = el(target); node.innerHTML = '';
  var ids = Object.keys(G.run.up);
  if (!ids.length) {
    var c0 = document.createElement('span');
    c0.className = 'chip'; c0.textContent = 'standard issue juicer only';
    node.appendChild(c0); return;
  }
  for (var i = 0; i < ids.length; i++) {
    var u = UP_BY_ID[ids[i]], n = G.run.up[ids[i]];
    var c = document.createElement('span');
    c.className = 'chip';
    c.innerHTML = u.ic + ' ' + u.name + (n > 1 ? ' <b>x' + n + '</b>' : '');
    node.appendChild(c);
  }
}

function showTitle() {
  setScene('title');
  var done = 0, i;
  for (i = 0; i < LEVELS.length; i++) if (save.cleared[i]) done++;
  var best = 0;
  for (var k in save.best) best = Math.max(best, save.best[k]);
  el('titlestats').innerHTML =
    '<div><b>' + done + '</b>levels cleared</div>' +
    '<div><b>' + (save.keys || 0) + '</b>vault keys</div>' +
    '<div><b>' + best.toLocaleString() + '</b>best level score</div>';
  el('b-play').textContent = done > 0 ? 'CONTINUE — LEVEL ' + Math.min(LEVELS.length, save.unlocked) : 'PLAY';
}

function buildMap() {
  var wrap = el('acts'); wrap.innerHTML = '';
  var acts = [
    { t: 'ACT I · BASE', s: 'the orchard turns', cls: 'a1', from: 0 },
    { t: 'ACT II · NORMAL', s: 'the ripening', cls: 'a2', from: 10 },
    { t: 'ACT III · BONUS', s: 'bosses & vault keys', cls: 'a3', from: 20 }
  ];
  for (var a = 0; a < acts.length; a++) {
    var box = document.createElement('div');
    box.className = 'act ' + acts[a].cls;
    box.innerHTML = '<h3>' + acts[a].t + '</h3><div class="sb">' + acts[a].s + '</div>';
    for (var i = acts[a].from; i < acts[a].from + 10; i++) {
      var lv = LEVELS[i];
      var unlocked = i < (save.unlocked || 1);
      var b = document.createElement('button');
      b.className = 'lv' + (save.cleared[i] ? ' done' : '') + (unlocked ? '' : ' locked') +
        (lv.type === 'boss' ? ' boss' : '') + (lv.type === 'keys' ? ' keyed' : '');
      var flag = lv.type === 'boss' ? '☠' : (lv.type === 'keys' ? '⚷' : (lv.type === 'survive' ? '⏱' : ''));
      b.innerHTML = '<span class="no">' + (i + 1) + '</span><span class="nm">' +
        (unlocked ? lv.name : 'LOCKED') + '</span><span class="fl">' + (save.cleared[i] ? '✓' : flag) + '</span>';
      if (!unlocked) b.disabled = true;
      else (function (idx) { b.addEventListener('click', function () { sfx('click'); prepareLevel(idx, true); }); })(i);
      box.appendChild(b);
    }
    wrap.appendChild(box);
  }
  el('mapkeys').textContent = '(' + (save.keys || 0) + ')';
}
function showMap() { buildMap(); setScene('map'); }

function showBrief() {
  var i = G.levelIndex, lv = LEVELS[i];
  el('brief-tier').textContent = 'ACT ' + ['I', 'II', 'III'][actOf(i) - 1] + ' · ' + tierOf(i) + ' LEVEL ' + (i % 10 + 1) + ' · #' + (i + 1) + ' of 30';
  el('brief-name').textContent = lv.name;
  el('brief-obj').innerHTML = '<em>' + objectiveText(lv) + '</em>' +
    (lv.type === 'boss' ? '<br>' + BOSS[lv.boss].flavor : '');
  el('brief-flavor').textContent = lv.flavor;
  kitChips('brief-kit');
  setScene('brief');
}

function showUpgrade() {
  var pool = [];
  for (var i = 0; i < UPGRADES.length; i++) if ((G.run.up[UPGRADES[i].id] || 0) < UPGRADES[i].max) pool.push(UPGRADES[i]);
  shuffle(pool);
  var three = pool.slice(0, 3);
  var box = el('upcards'); box.innerHTML = '';
  if (!three.length) { afterUpgrade(); return; }
  for (var j = 0; j < three.length; j++) {
    var u = three[j], have = G.run.up[u.id] || 0;
    var card = document.createElement('button');
    card.className = 'card';
    card.innerHTML = '<span class="ic">' + u.ic + '</span><span class="hd">' + u.name + '</span>' +
      '<span class="ds">' + u.ds + '</span><span class="st">' + (have ? 'owned x' + have + ' · max ' + u.max : 'new') + '</span>';
    (function (id) { card.addEventListener('click', function () { grantUpgrade(id); afterUpgrade(); }); })(u.id);
    box.appendChild(card);
  }
  setScene('up');
}
function afterUpgrade() {
  if (G.levelIndex + 1 < LEVELS.length) prepareLevel(G.levelIndex + 1, false);
  else showTitle();
}

function showWin() {
  var last = G.levelIndex >= LEVELS.length - 1;
  el('win-title').textContent = last ? 'THE ORCHARD IS OURS' : 'LEVEL CLEARED';
  var acc = G.shots ? Math.round(G.kills / G.shots * 1000) / 10 : 0;
  el('win-stats').innerHTML =
    '<div><b>' + G.score.toLocaleString() + '</b>score</div>' +
    '<div><b>' + G.kills + '</b>fruit juiced</div>' +
    '<div><b>' + Math.round(G.elapsed) + 's</b>time</div>' +
    '<div><b>' + Math.round(G.player.hp) + '</b>life left</div>' +
    (G.keysNeeded ? '<div><b>' + G.keysGot + '/' + G.keysNeeded + '</b>keys taken</div>' : '');
  el('win-note').textContent = last
    ? 'The Mother Melon is juice. The groves go quiet. Somewhere, a seed is already thinking about it.'
    : (G.hitsTaken === 0 ? 'Untouched. Nothing even got close enough to rot you.'
      : (G.keysNeeded ? 'Keys banked. Spend them in the vault.' : 'Salvage something from the wreck before you move on.'));
  el('b-next').textContent = last ? 'BACK TO TITLE' : 'NEXT LEVEL';
  setScene('win');
}

function showOver() {
  var lv = G.level;
  el('over-note').textContent = lv.type === 'boss'
    ? 'It outlasted you. Dash more, stand still less.'
    : 'The rot got through. Dash to shake it off, and pick up every salt packet you see.';
  el('over-stats').innerHTML =
    '<div><b>' + G.score.toLocaleString() + '</b>score</div>' +
    '<div><b>' + G.kills + '</b>fruit juiced</div>' +
    '<div><b>' + Math.round(G.elapsed) + 's</b>survived</div>';
  setScene('over');
}

function buildVault() {
  var box = el('perklist'); box.innerHTML = '';
  for (var i = 0; i < PERKS.length; i++) {
    var p = PERKS[i], owned = !!save.perks[p.id];
    var b = document.createElement('button');
    b.className = 'perk' + (owned ? ' own' : '');
    b.innerHTML = '<span><span class="pn">' + p.name + '</span><br><span class="pd">' + p.ds + '</span></span>' +
      '<span class="pc">' + (owned ? 'OWNED' : p.cost + ' ⚷') + '</span>';
    if (owned || (save.keys || 0) < p.cost) b.disabled = owned ? false : true;
    if (!owned) (function (perk) {
      b.addEventListener('click', function () {
        if ((save.keys || 0) < perk.cost || save.perks[perk.id]) return;
        save.keys -= perk.cost; save.perks[perk.id] = true; writeSave();
        sfx('upgrade'); buildVault(); updateProgLine();
      });
    })(p);
    box.appendChild(b);
  }
  var note = document.createElement('div');
  note.className = 'footnote';
  note.textContent = (save.keys || 0) + ' keys in hand · 12 keys exist, across the four vault levels';
  box.appendChild(note);
}
function showVault() { buildVault(); setScene('vault'); }

function pauseGame() {
  if (G.scene !== 'play') return;
  kitChips('pause-kit');
  el('mutestate').textContent = 'Sound: ' + (save.mute ? 'OFF' : 'ON') + ' (press M)';
  setScene('pause');
}

function onKeyPress(code) {
  if (code === 'KeyM') {
    save.mute = !save.mute; writeSave();
    toast(save.mute ? 'SOUND OFF' : 'SOUND ON', 0.9);
    if (G.scene === 'pause') el('mutestate').textContent = 'Sound: ' + (save.mute ? 'OFF' : 'ON') + ' (press M)';
    return;
  }
  if (code === 'Escape' || code === 'KeyP') {
    if (G.scene === 'play') pauseGame();
    else if (G.scene === 'pause') setScene('play');
    else if (G.scene === 'map' || G.scene === 'vault' || G.scene === 'help' || G.scene === 'brief') showTitle();
    return;
  }
  if ((code === 'Enter' || code === 'Space') && G.scene === 'brief') beginPlay();
}

/* ---- HUD ---- */
function updateHUD(dt) {
  var p = G.player;
  if (!p) return;
  el('hpf').style.transform = 'scaleX(' + clamp(p.hp / p.maxhp, 0, 1) + ')';
  el('rotf').style.transform = 'scaleX(' + clamp(p.rot / p.maxrot, 0, 1) + ')';
  var pips = el('pips');
  if (pips.children.length !== p.dashMax) {
    pips.innerHTML = '';
    for (var i = 0; i < p.dashMax; i++) { var s = document.createElement('span'); s.className = 'pip'; pips.appendChild(s); }
  }
  for (var j = 0; j < pips.children.length; j++) pips.children[j].className = 'pip' + (j < p.dashN ? ' on' : '');

  var lv = G.level;
  el('hudname').textContent = (G.levelIndex + 1) + '. ' + lv.name;
  var o = '';
  if (lv.type === 'clear') {
    var left = G.enemies.length;
    o = 'Wave ' + Math.min(G.waveIdx, lv.waves.length) + '/' + lv.waves.length + ' · ' + left + ' fruit left';
  } else if (lv.type === 'survive') {
    o = 'Hold on: ' + Math.max(0, Math.ceil(lv.dur - G.survive)) + 's';
  } else if (lv.type === 'keys') {
    o = 'Keys ' + G.keysGot + ' / ' + G.keysNeeded;
  } else {
    o = G.boss ? BOSS[lv.boss].name : 'DOWN IT GOES';
  }
  el('hudobj').textContent = o;
  el('hudscore').textContent = G.score.toLocaleString();
  el('hudcombo').textContent = G.combo > 2 ? 'x' + G.combo + ' chain' : ' ';

  var kh = el('hudkeys');
  if (G.keysNeeded && kh.children.length !== G.keysNeeded) {
    kh.innerHTML = '';
    for (var k = 0; k < G.keysNeeded; k++) { var d = document.createElement('span'); d.className = 'kk'; kh.appendChild(d); }
  } else if (!G.keysNeeded && kh.children.length) kh.innerHTML = '';
  for (var m = 0; m < kh.children.length; m++) kh.children[m].className = 'kk' + (m < G.keysGot ? ' on' : '');

  var bb = el('bossbar');
  if (G.boss) {
    bb.hidden = false;
    el('bossname').textContent = G.boss.name;
    el('bossf').style.transform = 'scaleX(' + clamp(G.boss.hp / G.boss.max, 0, 1) + ')';
  } else bb.hidden = true;

  if (G.toastT > 0) {
    G.toastT -= dt;
    if (G.toastT <= 0) el('toast').classList.remove('on');
  }
}

/* ---- step & loop ---- */
function step(dt) {
  G.elapsed += dt;
  if (G.comboT > 0) { G.comboT -= dt; if (G.comboT <= 0) G.combo = 0; }
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 26);
  if (G.flash > 0) G.flash -= dt * 2.2;

  if (!G.ended) {
    updatePlayer(dt);
    updateDirector(dt);
  }
  updateEnemies(dt);
  updateBullets(dt);
  updateHazards(dt);
  updatePickups(dt);
  updateParticles(dt);

  var tx = clamp(G.player.x - W / 2, 0, Math.max(0, G.world.w - W));
  var ty = clamp(G.player.y - H / 2, 0, Math.max(0, G.world.h - H));
  G.cam.x = lerp(G.cam.x, tx, 0.14);
  G.cam.y = lerp(G.cam.y, ty, 0.14);

  if (G.ended) {
    G.endT -= dt;
    if (G.endT <= 0 && G.scene === 'play') {
      if (G.won) showWin(); else showOver();
    }
  }
}

var last = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  var t = ts / 1000;
  if (!last) last = t;
  var dt = Math.min(0.05, t - last);
  last = t;
  G.dt = dt; G.t = t;
  if (G.scene === 'play') {
    if (G.hitstop > 0) { G.hitstop -= dt; dt *= 0.25; }
    step(dt);
    updateHUD(dt);
  } else if (G.scene === 'pause' || G.scene === 'up' || G.scene === 'win' || G.scene === 'over') {
    updateParticles(dt);
  }
  render();
}

/* ---- wiring ---- */
function on(id, fn) { var n = el(id); if (n) n.addEventListener('click', function (e) { e.preventDefault(); sfx('click'); fn(); }); }
on('b-play', function () {
  if (!save.sawStory) { save.sawStory = true; writeSave(); setScene('story'); }
  else if (save.unlocked > 1) prepareLevel(Math.min(LEVELS.length, save.unlocked) - 1, true);
  else prepareLevel(0, true);
});
on('b-levels', showMap);
on('b-vault', showVault);
on('b-help', function () { setScene('help'); });
on('b-begin', function () { prepareLevel(Math.max(0, Math.min(LEVELS.length, save.unlocked) - 1), true); });
on('b-storyskip', function () { prepareLevel(Math.max(0, Math.min(LEVELS.length, save.unlocked) - 1), true); });
on('b-maptitle', showTitle);
on('b-mapvault', showVault);
on('b-start', beginPlay);
on('b-briefback', showMap);
on('b-next', function () {
  if (G.levelIndex >= LEVELS.length - 1) { showTitle(); return; }
  showUpgrade();
});
on('b-winmap', showMap);
on('b-retry', function () { prepareLevel(G.levelIndex, false); });
on('b-overmap', showMap);
on('b-resume', function () { setScene('play'); });
on('b-restart', function () { prepareLevel(G.levelIndex, false); });
on('b-quit', showMap);
on('b-vaultback', function () { showTitle(); });
on('b-helpback', showTitle);

/* ---- test hook: used by the offline harness, inert in a browser ---- */
try {
  if (window.__FT_HOOK) window.__FT_HOOK({ G: G, LEVELS: LEVELS, BOSS: BOSS, FRUIT: FRUIT,
    prepareLevel: prepareLevel, beginPlay: beginPlay, recalc: recalc });
} catch (e) {}

/* ---- boot ---- */
function start() {
  initAttract();
  G.player = makePlayer();
  G.run.up = {};
  recalc();
  showTitle();
  updateProgLine();
  requestAnimationFrame(frame);
}
try {
  if (window.claude && window.claude.hot && window.claude.hot.ready) window.claude.hot.ready(start);
  else start();
} catch (e) { start(); }
try {
  if (window.claude && window.claude.hot && window.claude.hot.snapshot) {
    window.claude.hot.snapshot(function () { return { scene: G.scene, level: G.levelIndex }; });
  }
} catch (e) {}

})();
