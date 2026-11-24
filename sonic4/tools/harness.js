/* Headless harness for Sonic 4: Shattered Horizon.
   Stubs just enough DOM + canvas to run game.js, then bot-plays levels.

   node tools/harness.js game.js main        all 102 main acts
   node tools/harness.js game.js branch      all 50 branch levels
   node tools/harness.js game.js all         all 152
   node tools/harness.js game.js flow        menus, saving, unlocking, characters
   node tools/harness.js game.js all 7 5     level 7 only, five times
   node tools/harness.js game.js main normal no safety net (a difficulty read)
*/
const fs = require('fs'), vm = require('vm');
const GAME = process.argv[2] || 'game.js';

/* ------------------------------ DOM stubs ------------------------------- */
function makeEl(id) {
  const e = {
    id, _ln: {}, children: [], style: {}, textContent: '', hidden: false, disabled: false,
    classList: { _s: new Set(),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      toggle(c, on) { if (on === undefined) on = !this._s.has(c); on ? this._s.add(c) : this._s.delete(c); return on; },
      contains(c) { return this._s.has(c); } },
    addEventListener(t, f) { (this._ln[t] = this._ln[t] || []).push(f); },
    removeEventListener() {},
    appendChild(c) { this.children.push(c); return c; },
    click() { if (this.disabled) return; (this._ln.click || []).forEach(f => f({ preventDefault() {} })); },
    getBoundingClientRect() { return { left: 0, top: 0, width: 960, height: 540 }; },
    getContext() { return CTX; }
  };
  Object.defineProperty(e, 'innerHTML', {
    get() { return e._html || ''; },
    set(v) { e._html = v; if (v === '') e.children.length = 0; }
  });
  Object.defineProperty(e, 'className', {
    get() { return [...e.classList._s].join(' '); },
    set(v) { e.classList._s = new Set(String(v).split(/\s+/).filter(Boolean)); }
  });
  return e;
}
const GRAD = { addColorStop() {} };
const CTX = new Proxy({}, {
  get(t, k) {
    if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => GRAD;
    if (k === 'canvas') return els['c'];
    if (k === 'measureText') return () => ({ width: 10 });
    return typeof t[k] === 'function' ? t[k] : (() => {});
  },
  set() { return true; }
});
const els = {};
const document = {
  getElementById(id) { return els[id] || (els[id] = makeEl(id)); },
  createElement(tag) { return makeEl('<' + tag + '>'); },
  body: makeEl('body')
};
let rafCb = null, rafId = 0;
const store = {};
const localStorage = {
  getItem: k => (store[k] === undefined ? null : store[k]),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};
const window = {
  document, localStorage, _ln: {},
  devicePixelRatio: 1,
  addEventListener(t, f) { (this._ln[t] = this._ln[t] || []).push(f); },
  requestAnimationFrame(f) { rafCb = f; return ++rafId; },
  performance: { now: () => Date.now() },
  AudioContext: undefined,
  setTimeout: (f, t) => setTimeout(f, t)
};
const sandbox = vm.createContext({ window, document, localStorage, console, requestAnimationFrame: window.requestAnimationFrame,
  performance: window.performance, setTimeout, clearTimeout });
sandbox.globalThis = sandbox; sandbox.self = sandbox;

let HOOK = null;
window.__S4_HOOK = h => { HOOK = h; };

vm.runInContext(fs.readFileSync(GAME, 'utf8'), sandbox, { filename: GAME });
if (!HOOK) { console.log('FAIL: game.js never called the harness hook'); process.exit(1); }
if (!rafCb) { console.log('FAIL: no animation frame requested'); process.exit(1); }

const { G, LEVELS, MAIN_LEVELS, BRANCH_LEVELS, FINALE_LEVELS, ZONES, CHARS, prepareLevel, beginPlay,
        T, TILE, gt, isSolidT, isSlopeT, setChar, saveRef, showScreen } = HOOK;

/* ------------------------------ input bus ------------------------------- */
function fire(node, type, ev) { (node._ln[type] || []).forEach(f => f(ev)); }
const held = new Set();
function keyDown(c) { fire(window, 'keydown', { code: c, preventDefault() {} }); }
function keyUp(c) { fire(window, 'keyup', { code: c, preventDefault() {} }); }
function hold(codes) {
  for (const c of [...held]) if (!codes.has(c)) { keyUp(c); held.delete(c); }
  for (const c of codes) if (!held.has(c)) { keyDown(c); held.add(c); }
}
if (process.env.CHAR) setChar(process.env.CHAR);
let clock = 0;
function tick() { clock += 1000 / 60; rafCb(clock); }

/* --------------------------------- bot ---------------------------------- */
/* The level generators record the intended path in L.route, so the bot walks
   that path and jumps at walls, gaps, spikes and hazards. */
const B = { ri: 0, stuck: 0, lastx: 0, lasty: 0, wiggle: 0, dirFlip: 1 };
function resetBot() { B.ri = 0; B.stuck = 0; B.lastx = -1; B.lasty = -1; B.wiggle = 0; B.dirFlip = 1; }

function floorAhead(L, p, dir, k, depth) {
  const feetRow = Math.floor((p.y + p.hh + 2) / TILE);
  const tx = Math.floor(p.x / TILE) + dir * k;
  for (let dy = 0; dy <= (depth === undefined ? 2 : depth); dy++) {
    const t = gt(L, tx, feetRow + dy);
    if (isSolidT(t) || isSlopeT(t) || t === T.PLAT) return true;
  }
  return false;
}
function dangerAhead(L, p, dir) {
  const feetRow = Math.floor((p.y + p.hh + 2) / TILE);
  const col = Math.floor(p.x / TILE);
  for (let k = 1; k <= 4; k++) {
    const tx = col + dir * k;
    for (let dy = -2; dy <= 1; dy++) {
      const t = gt(L, tx, feetRow + dy);
      if (t === T.SPIKE || t === T.LAVA) return true;
    }
    if (k <= 3 && isSolidT(gt(L, tx, feetRow - 1))) return true;     // wall
    if (k <= 2 && !floorAhead(L, p, dir, k)) return true;            // gap
  }
  return false;
}

function bot(god) {
  const L = G.level, p = G.player;
  if (!p || p.dead || G.scene !== 'play') { hold(new Set()); return; }
  /* god mode is a reachability test: rings topped up and no knockback */
  if (god) { if (G.rings < 12) G.rings = 25; if (p.invinc < 1) p.invinc = 2; }

  const codes = new Set();
  let wantJump = false;
  const rt = L.route;

  /* ---- siege arenas: pace around and keep hopping ---- */
  if (L.surviveFor) {
    const a = L.worldW * 0.25, b = L.worldW * 0.75;
    const t = (clock / 1000) % 8;
    const goal = t < 4 ? b : a;
    if (goal > p.x + 12) codes.add('KeyD'); else if (goal < p.x - 12) codes.add('KeyA');
    if (p.onGround && (Math.floor(clock / 500) % 3 === 0 || dangerAhead(L, p, goal > p.x ? 1 : -1))) wantJump = true;
    /* fresh press on the ground, hold in the air - never a new press mid-flight,
     or Tails would take off and Knuckles would glide away from the fight */
  if (wantJump && (p.onGround ? !held.has('Space') : held.has('Space'))) codes.add('Space');
    hold(codes);
    return;
  }

  /* ---- boss arenas: close in, jump on the hull, back off while it flashes ---- */
  const boss = L.bossEnt;
  if (boss && !boss.dead) {
    const dx = boss.x - p.x;
    if (boss.dying) { hold(new Set()); return; }
    if (boss.inv > 0.25) {
      if (dx > 0) codes.add('KeyA'); else codes.add('KeyD');
    } else {
      if (dx > 26) codes.add('KeyD'); else if (dx < -26) codes.add('KeyA');
      if (p.onGround && Math.abs(dx) < 86) wantJump = true;
      if (!p.onGround && p.vy < 0) wantJump = true;
    }
    /* fresh press on the ground, hold in the air - never a new press mid-flight,
     or Tails would take off and Knuckles would glide away from the fight */
  if (wantJump && (p.onGround ? !held.has('Space') : held.has('Space'))) codes.add('Space');
    hold(codes);
    return;
  }

  /* ---- route following ---- */
  if (L.vert) {
    /* only tick a waypoint off while actually standing on it, never in mid-flight */
    while (B.ri < rt.length - 1 && p.onGround && p.y <= rt[B.ri].y - 6 &&
           Math.abs(p.x - rt[B.ri].x) < (B.ri >= rt.length - 2 ? 480 : 124)) B.ri++;
    while (B.ri > 0 && p.y > rt[B.ri].y + 96) B.ri--;      // fell back down: re-aim lower
  }
  else { while (B.ri < rt.length - 1 && p.x > rt[B.ri].x - 10) B.ri++; }
  const tgt = rt[Math.min(B.ri, rt.length - 1)];

  /* stuck detection */
  if (Math.abs(p.x - B.lastx) < 1.2 && Math.abs(p.y - B.lasty) < 1.2) B.stuck++; else B.stuck = 0;
  B.lastx = p.x; B.lasty = p.y;
  if (B.stuck > 40 && B.wiggle <= 0) { B.wiggle = 34; B.dirFlip = -B.dirFlip; B.stuck = 0; }

  const dx = tgt.x - p.x, dy = tgt.y - p.y;
  let dir = dx > 10 ? 1 : dx < -10 ? -1 : 0;

  if (L.vert) {
    /* climbing: steer with a speed target so we settle under the next platform */
    const want = Math.max(-330, Math.min(330, dx * 3));
    dir = p.vx < want - 40 ? 1 : p.vx > want + 40 ? -1 : 0;
    const side = dx > 0 ? 1 : -1;
    /* on a climb, "edge" means this platform ends - never mind what is below it */
    const atEdge = !floorAhead(L, p, side, 1, 0) || !floorAhead(L, p, side, 2, 0);
    if (p.onGround && dy < -30 && (Math.abs(dx) < 80 || atEdge)) wantJump = true;
    if (!p.onGround && p.vy < -40) wantJump = true;
  } else {
    if (p.onGround) {
      if (dangerAhead(L, p, dir || 1)) wantJump = true;
      if (dy < -34) wantJump = true;                        // the path goes up
    } else if (p.vy < -40) {
      wantJump = true;                                      // hold for a full jump arc
    }
  }
  if (B.wiggle > 0) { B.wiggle--; dir = B.dirFlip; wantJump = true; }
  if (dir > 0) codes.add('KeyD'); else if (dir < 0) codes.add('KeyA');
  /* fresh press on the ground, hold in the air - never a new press mid-flight,
     or Tails would take off and Knuckles would glide away from the fight */
  if (wantJump && (p.onGround ? !held.has('Space') : held.has('Space'))) codes.add('Space');
  hold(codes);
}

/* ------------------------------ run a level ----------------------------- */
function budget(L) {
  if (L.surviveFor) return L.surviveFor + 25;
  if (L.bossEnt) return 150;
  return Math.max(90, Math.round(L.w * 0.55) + 60);
}
function playLevel(i, god) {
  const L = prepareLevel(i, true);
  G.deathWhy = undefined; G.deathAt = undefined;
  resetBot();
  beginPlay();
  const frames = Math.round(budget(L) * 60);
  for (let f = 0; f < frames; f++) {
    bot(god);
    tick();
    if (G.scene === 'win' || G.scene === 'over') break;
  }
  hold(new Set());
  return {
    scene: G.scene, t: Math.round(G.elapsed), rings: G.rings, kills: G.kills,
    score: G.score, x: Math.round(G.player ? G.player.x / TILE : 0), w: L.w,
    why: G.deathWhy || '-', at: G.deathAt
  };
}

/* --------------------------------- flow --------------------------------- */
function shown() { return Object.keys(els).filter(k => k.startsWith('scr-') && els[k].classList.contains('show')); }
function click(id) { els[id].click(); }
let flowFails = 0;
function expect(what, cond, extra) {
  console.log((cond ? '  ok   ' : '  FAIL ') + what + (cond ? '' : '   -> ' + (extra === undefined ? shown().join(',') : extra)));
  if (!cond) flowFails++;
}
function runTo(maxSec, god) {
  const frames = Math.round(maxSec * 60);
  for (let f = 0; f < frames; f++) { bot(god); tick(); if (G.scene === 'win' || G.scene === 'over') break; }
  hold(new Set());
}
function flowTest() {
  const save = saveRef();
  console.log('flow: catalogue');
  expect('154 levels exist', LEVELS.length === 154, LEVELS.length + ' levels');
  expect('102 of them are main acts', MAIN_LEVELS.length === 102, MAIN_LEVELS.length);
  expect('50 of them are branch levels', BRANCH_LEVELS.length === 50, BRANCH_LEVELS.length);
  expect('2 of them are the Super finale', FINALE_LEVELS.length === 2, FINALE_LEVELS.length);
  expect('17 playable zones with 6 acts each, plus the Doomsday',
    ZONES.length === 18 && MAIN_LEVELS.filter(l => l.zone === 0).length === 6 &&
    MAIN_LEVELS.filter(l => l.zone === 17).length === 0);
  expect('every main zone ends on a boss',
    ZONES.filter(z => !z.finale).every((z, i) => MAIN_LEVELS.filter(l => l.zone === i && l.boss).length === 1));
  expect('both finale levels are always Super',
    FINALE_LEVELS.every(D => HOOK.buildLevel(D.id).alwaysSuper === true));
  expect('Super Dash is open from the start', HOOK.isUnlocked(FINALE_LEVELS[0].id));
  expect('the Egg Colossus waits for Super Dash', !HOOK.isUnlocked(FINALE_LEVELS[1].id));
  expect('all four heroes are selectable', Object.keys(CHARS).length === 4 &&
    ['sonic','tails','knuckles','amy'].every(k => !!CHARS[k]));
  expect('7 Chaos Emeralds are placed in branch levels', BRANCH_LEVELS.filter(l => l.emerald >= 0).length === 7);
  expect('no level can kill you for being slow', LEVELS.every(l => l.type !== 'chase'));
  let clocky = [];
  for (const D of LEVELS) {
    const L = HOOK.buildLevel(D.id);
    if (L.chase) clocky.push(D.name + ' still has an Egg Wall');
    if (L.target && L.target < 60) clocky.push(D.name + ' target time is only ' + L.target + 's');
  }
  expect('the Egg Wall is gone and target times are generous', !clocky.length, clocky.slice(0, 4).join(', '));

  /* ring-quota levels: the number must match what the map promises, the level must
     hold plenty more than the quota, and a hit must not undo quota progress */
  const ringLevels = LEVELS.filter(l => l.type === 'rings');
  let qBad = [], qThin = [];
  for (const D of ringLevels) {
    const L = HOOK.buildLevel(D.id);
    if (L.need !== HOOK.ringQuota(D.zone)) qBad.push(D.name + ' need=' + L.need);
    if (L.ringTotal < L.need * 3) qThin.push(D.name + ' has ' + L.ringTotal + ' rings for a quota of ' + L.need);
  }
  expect(ringLevels.length + ' ring-quota levels show the quota the map promises', !qBad.length, qBad.join(', '));
  expect('every ring-quota level holds at least three times its quota', !qThin.length, qThin.join(', '));
  const rl = ringLevels[0];
  prepareLevel(rl.id, true); beginPlay();
  G.ringsGot = 99; G.rings = 0;
  expect('the goal stays open after a hit empties your rings', HOOK.goalOpen(G.level));
  G.ringsGot = 0;
  expect('and is locked before the quota is paid', !HOOK.goalOpen(G.level));

  console.log('flow: menus');
  showScreen('scr-title');
  expect('the touch pad is off the title screen (it used to cover it on Android)',
    els['touch'].style.display === 'none', JSON.stringify(els['touch'].style.display));
  click('b-play');     expect('PLAY opens character select', shown().includes('scr-chars'));
  const card = els['charcards'].children[3];
  expect('four character cards', els['charcards'].children.length === 4, els['charcards'].children.length);
  card.click();        expect('picking Amy opens the zone map', shown().includes('scr-map') && save.char === 'amy', save.char);
  expect('map lists zone 1 levels', els['maplist'].children.length >= 9, els['maplist'].children.length);
  click('b-znext');    expect('the map pages to zone 2', G.mapZone === 1, 'zone ' + G.mapZone);
  click('b-zprev');    expect('and back to zone 1', G.mapZone === 0, 'zone ' + G.mapZone);
  for (let i = 0; i < ZONES.length - 1; i++) click('b-znext');
  expect('the map pages all the way to The Doomsday', G.mapZone === ZONES.length - 1, 'zone ' + G.mapZone);
  expect('the Doomsday page lists its two Super levels',
    els['maplist'].children.filter(c => c.classList.contains('lv')).length === 2,
    els['maplist'].children.filter(c => c.classList.contains('lv')).length + ' cards');
  expect('both are marked as Super levels',
    els['maplist'].children.filter(c => c.classList.contains('super')).length === 2);
  click('b-znext');
  expect('and wraps back to zone 1', G.mapZone === 0, 'zone ' + G.mapZone);
  click('b-mapchars'); expect('CHANGE HERO returns to the cards', shown().includes('scr-chars'));
  els['charcards'].children[0].click();
  expect('Sonic selected again', save.char === 'sonic', save.char);

  console.log('flow: playing act 1');
  expect('act 1 is unlocked at the start', HOOK.isUnlocked(0));
  expect('act 2 is locked at the start', !HOOK.isUnlocked(1));
  prepareLevel(0, true); resetBot(); beginPlay();
  expect('act 1 starts', G.scene === 'play' && G.idx === 0);
  for (let f = 0; f < 40; f++) { bot(true); tick(); }
  keyDown('Escape'); keyUp('Escape'); tick();
  expect('Escape pauses', G.scene === 'pause', G.scene);
  keyDown('KeyM'); keyUp('KeyM'); tick();
  expect('M mutes and saves it', JSON.parse(localStorage.getItem('sonic4.shatteredHorizon.v1')).mute === true);
  keyDown('KeyM'); keyUp('KeyM'); tick();
  click('b-resume');   expect('resume returns to play', G.scene === 'play', G.scene);
  runTo(150, true);    expect('act 1 is winnable', G.scene === 'win', 'scene=' + G.scene);
  expect('clearing act 1 unlocks act 2', HOOK.isUnlocked(1));
  expect('a best time was saved', !!JSON.parse(localStorage.getItem('sonic4.shatteredHorizon.v1')).best['0']);
  click('b-next');     expect('NEXT drops into the next act', G.scene === 'play' && G.idx === 1, 'idx=' + G.idx);

  console.log('flow: branch levels and emeralds');
  expect('every branch level hangs off a main act in its own zone',
    BRANCH_LEVELS.every(b => LEVELS[b.parent] && !LEVELS[b.parent].branch && LEVELS[b.parent].zone === b.zone),
    BRANCH_LEVELS.filter(b => !LEVELS[b.parent] || LEVELS[b.parent].zone !== b.zone).map(b => b.name).join(', '));
  const lockedBranch = BRANCH_LEVELS.find(b => !HOOK.isCleared(b.parent));
  expect('a branch level is locked until its parent act is cleared', !HOOK.isUnlocked(lockedBranch.id), lockedBranch.name);
  const gamma = BRANCH_LEVELS.find(l => l.emerald === 0);
  save.cleared[gamma.parent] = 1;
  expect('clearing the parent act opens the branch', HOOK.isUnlocked(gamma.id));
  prepareLevel(gamma.id, true); resetBot(); beginPlay();
  runTo(150, true);
  expect('the emerald branch level is winnable', G.scene === 'win', 'scene=' + G.scene);
  expect('clearing a branch level awards a medal', save.medals >= 1, 'medals=' + save.medals);

  console.log('flow: losing');
  prepareLevel(5, true); resetBot(); beginPlay();
  G.rings = 0; G.lives = 1;
  G.player.y = G.level.worldH + 400;
  runTo(6, false);
  expect('falling out of the world ends the run', G.scene === 'over', 'scene=' + G.scene);
  click('b-retry');    expect('retry restarts the same level', G.scene === 'play' && G.idx === 5, 'idx=' + G.idx);

  console.log('flow: the Super finale');
  for (const D of FINALE_LEVELS) {
    prepareLevel(D.id, true); resetBot(); beginPlay();
    expect(D.name + ' starts you Super', G.super === true);
    const before = G.rings;
    for (let f = 0; f < 150; f++) { bot(true); tick(); }
    expect('Super never runs out in ' + D.short, G.super === true);
    if (D.type === 'colossus') {
      const b = G.level.bossEnt;
      expect('the Egg Colossus is a giant (176 x 216)', b.hw === 88 && b.hh === 108, b.hw + 'x' + b.hh);
      expect('the Colossus takes damage from a Super hero', b.hp < b.maxhp || b.dying, 'hp=' + b.hp + '/' + b.maxhp);
    }
    runTo(170, true);
    expect(D.name + ' is winnable', G.scene === 'win', 'scene=' + G.scene);
  }

  console.log('flow: tablet controls');
  prepareLevel(0, true); resetBot(); beginPlay();
  const tap = (id, type, pid) => fire(els[id], type, { pointerId: pid, preventDefault() {} });
  tap('t-right', 'touchstart', 1);
  expect('the on-screen D-pad runs right', G.act.right === true, JSON.stringify(G.act));
  tap('t-jump', 'touchstart', 2);
  expect('two fingers at once: running and jumping together', G.act.right === true && G.act.jump === true);
  expect('the JUMP button registers as a fresh press', G.press.jump === true);
  tap('t-jump', 'touchend', 2);
  expect('lifting the jump finger keeps you running', G.act.right === true && !G.act.jump);
  tap('t-right', 'touchend', 1);
  expect('lifting the other finger stops you', !G.act.right);
  els['t-pause'].click();
  expect('the on-screen pause button pauses', G.scene === 'pause', G.scene);
  els['t-pause'].click();
  expect('and resumes', G.scene === 'play', G.scene);
  showScreen('scr-map');
  expect('the touch pad hides behind a menu', els['touch'].classList.contains('hide'));
  expect('and is taken off the screen inline, so no CSS rule can leave it over a menu',
    els['touch'].style.display === 'none', JSON.stringify(els['touch'].style.display));
  showScreen(null);
  expect('and comes back when you are playing', !els['touch'].classList.contains('hide'));
  expect('visibly', els['touch'].style.display === '', JSON.stringify(els['touch'].style.display));

  console.log('flow: every hero can clear an act');
  for (const k of ['sonic','tails','knuckles','amy']) {
    setChar(k);
    prepareLevel(9, true); resetBot(); beginPlay();
    runTo(150, true);
    expect(CHARS[k].name + ' clears ' + LEVELS[9].name, G.scene === 'win', 'scene=' + G.scene);
  }
  setChar('sonic');
  console.log(flowFails ? '\n' + flowFails + ' flow check(s) failed' : '\nflow: all checks passed');
}

/* ------------------------------- debug view ------------------------------ */
function dbgLevel(i) {
  const L = prepareLevel(i, true);
  G.deathWhy = undefined;
  resetBot();
  beginPlay();
  const log = [];
  const frames = Math.round(budget(L) * 60);
  for (let f = 0; f < frames; f++) {
    bot(true);
    const p = G.player;
    if (p && G.scene === 'play') log.push({ f, x: p.x, y: p.y, vx: p.vx, vy: p.vy, g: p.onGround ? 1 : 0,
                      ri: B.ri, jmp: held.has('Space') ? 1 : 0, sc: G.scene,
                      bhp: L.bossEnt ? L.bossEnt.hp : undefined,
                      binv: L.bossEnt ? L.bossEnt.inv || 0 : 0,
                      by: L.bossEnt ? L.bossEnt.y : 0, bx: L.bossEnt ? L.bossEnt.x : 0 });
    if (process.env.SPARSE && f % 45) log.pop();
    if (log.length > 200) log.shift();
    tick();
    if (G.scene === 'win' || G.scene === 'over') break;
  }
  hold(new Set());
  console.log('level ' + (i + 1) + ' ' + LEVELS[i].name + '  type=' + LEVELS[i].type +
    '  w=' + L.w + ' h=' + L.h + ' route=' + L.route.length + ' need=' + L.need +
    ' ringTotal=' + L.ringTotal + ' ringsGot=' + G.ringsGot + ' open=' + HOOK.goalOpen(L) +
    '  -> ' + G.scene + ' ' + (G.deathWhy || ''));
  const tail = log.slice(-70);
  for (const r of tail) console.log('  f' + String(r.f).padStart(5) + ' x=' + (r.x / TILE).toFixed(1) +
    ' y=' + (r.y / TILE).toFixed(1) + ' vx=' + r.vx.toFixed(0) + ' vy=' + r.vy.toFixed(0) +
    ' grd=' + r.g + ' jump=' + r.jmp + (r.bhp !== undefined ? ' bhp=' + r.bhp + ' binv=' + r.binv.toFixed(1) + ' by=' + (r.by/TILE).toFixed(1) + ' bx=' + (r.bx/TILE).toFixed(1) : '') + ' wp=' + r.ri + '(' + (L.route[Math.min(r.ri, L.route.length - 1)].x / TILE).toFixed(1) +
    ',' + (L.route[Math.min(r.ri, L.route.length - 1)].y / TILE).toFixed(1) + ')');
  const cx = G.deathAt !== undefined ? G.deathAt : Math.round((G.player ? G.player.x : 0) / TILE);
  const CH = { 0:'.', 1:'#', 2:'=', 3:'/', 4:'\\', 5:'^', 6:'B', 7:'~', 8:'w', 9:'I', 10:'O' };
  console.log('  terrain columns ' + Math.max(0, cx - 14) + '..' + Math.min(L.w - 1, cx + 14) + ':');
  for (let ty = 0; ty < L.h; ty++) {
    let row = '';
    for (let tx = Math.max(0, cx - 14); tx <= Math.min(L.w - 1, cx + 14); tx++) row += CH[gt(L, tx, ty)] || '?';
    if (row.replace(/\./g, '').length) console.log('   ' + String(ty).padStart(2) + ' ' + row);
  }
}
if (process.argv[3] === 'dbg') { dbgLevel(parseInt(process.argv[4], 10) - 1); process.exit(0); }

/* --------------------------------- main --------------------------------- */
const mode = process.argv[3] || 'main';
if (mode === 'flow') { flowTest(); process.exit(flowFails ? 1 : 0); }

/* every hero through one act of every zone */
if (mode === 'heroes') {
  let bad = 0, n = 0;
  for (const k of ['sonic','tails','knuckles','amy']) {
    setChar(k);
    const picks = [];
    for (let z = 0; z < ZONES.length; z++) {
      const acts = MAIN_LEVELS.filter(l => l.zone === z);
      if (acts.length) picks.push(acts[z % acts.length]);
    }
    FINALE_LEVELS.forEach(D => picks.push(D));      // the two Super levels every time
    for (const D of picks) {
      const r = playLevel(D.id, true);
      n++;
      const ok = r.scene === 'win';
      if (!ok) bad++;
      console.log((ok ? '  ok   ' : '  FAIL ') + CHARS[k].name.padEnd(9) + D.name.padEnd(30) +
        (D.type + '').padEnd(9) + ' t=' + String(r.t).padStart(3) + 's' + (ok ? '' : '  -> ' + r.scene + ' ' + r.why));
    }
  }
  console.log('\nheroes: ' + (n - bad) + '/' + n + ' runs cleared');
  process.exit(bad ? 1 : 0);
}

const god = process.argv[4] !== 'normal' && process.argv[6] !== 'normal';
const only = /^\d+$/.test(process.argv[4] || '') ? parseInt(process.argv[4], 10) : null;
const repeats = only && process.argv[5] ? parseInt(process.argv[5], 10) : 1;
let set = LEVELS;
if (mode === 'main') set = MAIN_LEVELS;
else if (mode === 'branch') set = BRANCH_LEVELS;

let wins = 0, runs = 0, fails = [];
for (let pass = 0; pass < repeats; pass++)
for (const D of set) {
  if (only !== null && D.id !== only - 1) continue;
  let r;
  try { r = playLevel(D.id, god); }
  catch (err) {
    console.log(String(D.id + 1).padStart(3) + '  CRASH ' + D.name + ': ' + err.message + '\n      ' + (err.stack || '').split('\n')[1]);
    fails.push(D.name + ' (crash)'); runs++;
    continue;
  }
  runs++;
  const tag = r.scene === 'win' ? 'WIN  ' : r.scene === 'over' ? 'LOSS ' : 'STUCK';
  if (r.scene === 'win') wins++; else fails.push(D.name + ' [' + D.type + '] ' + r.scene + ' ' + r.why + ' at ' + (r.at === undefined ? r.x : r.at) + '/' + r.w);
  console.log(String(D.id + 1).padStart(3) + ' ' + tag + ' ' + D.name.padEnd(30) +
    (D.type + '').padEnd(9) + ' t=' + String(r.t).padStart(3) + 's' +
    ' rings=' + String(r.rings).padStart(3) + ' kills=' + String(r.kills).padStart(2) +
    ' x=' + r.x + '/' + r.w + ' score=' + r.score);
}
console.log('\n' + mode + ': ' + wins + '/' + runs + ' cleared' + (runs ? '  (' + Math.round(wins / runs * 100) + '%)' : ''));
if (fails.length) {
  console.log(fails.length + ' level(s) not cleared:');
  fails.slice(0, 40).forEach(f => console.log('  - ' + f));
}
process.exit(fails.length ? 1 : 0);
