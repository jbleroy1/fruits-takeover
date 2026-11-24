/* ============================================================================
   SONIC 4: SHATTERED HORIZON  -  a 2D side-scrolling platformer.
   Four playable heroes (Sonic, Tails, Knuckles, Amy), 102 main levels across
   17 zones, plus 50 optional branch levels. Everything is drawn in code:
   no images, no sounds files, no libraries, no build step.
   ========================================================================== */
(function () {
'use strict';

/* ------------------------------- constants ------------------------------- */
const LOGW = 960, LOGH = 540;          // logical render size (canvas is scaled by CSS)
const TILE = 32;
const T = { EMPTY:0, SOLID:1, PLAT:2, SLU:3, SLD:4, SPIKE:5, BREAK:6, LAVA:7, WATER:8, ICE:9, BUMP:10 };
const isSolidT = t => t === T.SOLID || t === T.BREAK || t === T.ICE || t === T.BUMP;
const isSlopeT = t => t === T.SLU || t === T.SLD;
const isHurtT  = t => t === T.SPIKE || t === T.LAVA;

const GRAV = 2300, MAXFALL = 1000;
const FRIC = 1250, BRAKE = 3400, AIR_ACC = 1300;
const ROLL_FRIC = 420, SLOPE_RUN = 420, SLOPE_ROLL = 1050;

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const sign = v => v < 0 ? -1 : v > 0 ? 1 : 0;
const lerp = (a, b, t) => a + (b - a) * t;

/* deterministic rng so every one of the 152 levels is the same every time */
function rng(seed) {
  let s = (seed | 0) || 1;
  return function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (R, arr) => arr[Math.floor(R() * arr.length) % arr.length];
const irnd = (R, a, b) => a + Math.floor(R() * (b - a + 1));

/* ------------------------------- characters ------------------------------ */
const CHARS = {
  sonic: {
    key:'sonic', name:'Sonic', title:'The Blue Blur', ability:'Spin Dash',
    blurb:'Fastest of the four. Hold DOWN and tap JUMP to charge a spin dash, then let go.',
    top:660, acc:1560, jump:800, col:'#2f6ff2', col2:'#1b3f9c', skin:'#f4c08a', shoe:'#e03a2f'
  },
  tails: {
    key:'tails', name:'Tails', title:'Twin-Tailed Genius', ability:'Flight',
    blurb:'Press JUMP again in mid-air to fly for a few seconds. Great for skipping pits.',
    top:540, acc:1340, jump:760, col:'#f59324', col2:'#b45c0c', skin:'#ffe0b2', shoe:'#e8482f'
  },
  knuckles: {
    key:'knuckles', name:'Knuckles', title:'Guardian of the Shards', ability:'Glide & Climb',
    blurb:'Press JUMP again in mid-air to glide. Hit a wall while gliding to cling and climb it.',
    top:560, acc:1420, jump:720, col:'#d8322f', col2:'#8d1a18', skin:'#f4c08a', shoe:'#1f8f4a'
  },
  amy: {
    key:'amy', name:'Amy', title:'Piko Hammer Champion', ability:'Hammer Swing',
    blurb:'Press ATTACK (X) to swing the Piko Hammer. It smashes badniks and cracked blocks.',
    top:580, acc:1450, jump:755, col:'#f368a8', col2:'#a8296c', skin:'#f4c08a', shoe:'#e6444f'
  }
};
const CHAR_ORDER = ['sonic','tails','knuckles','amy'];

/* ---------------------------------- zones -------------------------------- */
/* 17 zones x 6 acts = 102 main levels. Branch levels hang off the zones. */
const ZONES = [
  { n:'Verdant Hills',    th:'grass',    boss:'Egg Hornet',
    pal:{sky1:'#4fc3f7',sky2:'#d9f6ff',far:'#2e9e5b',hill:'#36b06a',g1:'#58c84e',g2:'#2f7a34',dirt:'#9a6230',dirt2:'#73441f',acc:'#ffd24a'},
    mix:['motobug','buzzer'], look:'water' },
  { n:'Sapphire Shore',   th:'beach',    boss:'Egg Clamshell',
    pal:{sky1:'#3bb7e6',sky2:'#ffe9b8',far:'#1b7fa8',hill:'#f2d79b',g1:'#f6e3ab',g2:'#c9a86a',dirt:'#b08a52',dirt2:'#8a6a3c',acc:'#38e1d8'},
    mix:['motobug','crab','chopper'], look:'water' },
  { n:'Neon Casino',      th:'casino',   boss:'Egg Jackpot',
    pal:{sky1:'#1b0f3a',sky2:'#5a1f7a',far:'#2a1457',hill:'#3c1f6e',g1:'#ff5ec0',g2:'#6a1f8a',dirt:'#3a1a5e',dirt2:'#26113f',acc:'#ffe14a'},
    mix:['motobug','orbinaut','bat'], look:'spike', night:true },
  { n:'Scrap Foundry',    th:'iron',     boss:'Egg Press',
    pal:{sky1:'#5a4634',sky2:'#c9a07a',far:'#4a3a2a',hill:'#5e4a36',g1:'#9aa3ab',g2:'#5a636b',dirt:'#4a5258',dirt2:'#343b40',acc:'#ff8a3d'},
    mix:['crab','buzzer','roller'], look:'lava' },
  { n:'Crystal Caverns',  th:'cave',     boss:'Egg Driller',
    pal:{sky1:'#140b2a',sky2:'#2a1a52',far:'#1d1140',hill:'#2b1b58',g1:'#7ad7ff',g2:'#2f6fa8',dirt:'#2c2a56',dirt2:'#1d1b3c',acc:'#9d7dff'},
    mix:['bat','orbinaut','spiker'], look:'water', roof:true, night:true },
  { n:'Mirage Dunes',     th:'desert',   boss:'Egg Scorpion',
    pal:{sky1:'#f7b24a',sky2:'#ffeec2',far:'#d08a3a',hill:'#e8b86a',g1:'#f3d08a',g2:'#bb8a46',dirt:'#a9743a',dirt2:'#845628',acc:'#4fd0ff'},
    mix:['motobug','crab','spiker'], look:'spike' },
  { n:'Frostbite Peaks',  th:'ice',      boss:'Egg Blizzard',
    pal:{sky1:'#9fd8f2',sky2:'#eefaff',far:'#7fb8d8',hill:'#cfe9f7',g1:'#d8f2ff',g2:'#88bdd8',dirt:'#8fa8bb',dirt2:'#6a8396',acc:'#2fa8ff'},
    mix:['buzzer','roller','orbinaut'], look:'water', ice:true },
  { n:'Thunder Skyway',   th:'sky',      boss:'Egg Tempest',
    pal:{sky1:'#2f5fa8',sky2:'#bcd8ff',far:'#4a79c0',hill:'#7fa4d8',g1:'#cfd8e6',g2:'#7f8ca0',dirt:'#6a7488',dirt2:'#4e5666',acc:'#ffe14a'},
    mix:['buzzer','bat','orbinaut'], look:'void' },
  { n:'Toxic Treatment',  th:'toxic',    boss:'Egg Syringe',
    pal:{sky1:'#1f3a2a',sky2:'#5ad88a',far:'#1a4a32',hill:'#246b44',g1:'#7ef0a8',g2:'#2f8a58',dirt:'#2a4a3a',dirt2:'#1c3326',acc:'#d8ff4a'},
    mix:['crab','buzzer','chopper'], look:'acid', night:true },
  { n:'Jungle Ruins',     th:'jungle',   boss:'Egg Mantis',
    pal:{sky1:'#2f8a6a',sky2:'#bff0d8',far:'#1f6a4a',hill:'#2a7a56',g1:'#4ec06a',g2:'#2a6a38',dirt:'#7a5a34',dirt2:'#5a4022',acc:'#ffd24a'},
    mix:['motobug','bat','spiker'], look:'water' },
  { n:'Carnival Lights',  th:'carnival', boss:'Egg Carousel',
    pal:{sky1:'#2a0f3a',sky2:'#7a2f8a',far:'#3a1556',hill:'#52207a',g1:'#ffa83d',g2:'#8a3a1f',dirt:'#45205e',dirt2:'#2d1340',acc:'#4ff0ff'},
    mix:['orbinaut','roller','bat'], look:'spike', night:true },
  { n:'Magma Core',       th:'lava',     boss:'Egg Volcano',
    pal:{sky1:'#3a0f0f',sky2:'#a8341f',far:'#5a1a10',hill:'#7a2a14',g1:'#8a4a2a',g2:'#5a2a16',dirt:'#4a241a',dirt2:'#31170f',acc:'#ff8a1f'},
    mix:['roller','buzzer','spiker'], look:'lava', night:true },
  { n:'Gigalopolis',      th:'city',     boss:'Egg Crane',
    pal:{sky1:'#1f2a4a',sky2:'#6a7fb8',far:'#2a3a62',hill:'#3a4a7a',g1:'#aab4c4',g2:'#6a7482',dirt:'#5a6270',dirt2:'#3e4452',acc:'#ffd24a'},
    mix:['crab','roller','buzzer'], look:'void', night:true },
  { n:'Starlight Orbit',  th:'space',    boss:'Egg Satellite',
    pal:{sky1:'#07071a',sky2:'#241f5a',far:'#120f3a',hill:'#1d1a4a',g1:'#8a9dff',g2:'#3a3f8a',dirt:'#2a2a5a',dirt2:'#1a1a3c',acc:'#ffe14a'},
    mix:['orbinaut','bat','buzzer'], look:'void', night:true, lowg:true },
  { n:'Chrono Rift',      th:'rift',     boss:'Egg Paradox',
    pal:{sky1:'#2a0f4a',sky2:'#c04fd8',far:'#4a1a7a',hill:'#6a2a9a',g1:'#d88aff',g2:'#6a2a9a',dirt:'#3a1a5a',dirt2:'#26113c',acc:'#4ff0ff'},
    mix:['bat','orbinaut','roller'], look:'spike', night:true },
  { n:'Mecha Citadel',    th:'mecha',    boss:'Egg Sentinel',
    pal:{sky1:'#101826',sky2:'#3a5a7a',far:'#18243a',hill:'#22344e',g1:'#8a94a8',g2:'#4a5464',dirt:'#39424e',dirt2:'#262c36',acc:'#ff3d5a'},
    mix:['roller','crab','orbinaut'], look:'lava', night:true, roof:true },
  { n:'Final Dominion',   th:'final',    boss:'Death Egg Mk IV',
    pal:{sky1:'#14060f',sky2:'#7a1030',far:'#2a0a1a',hill:'#45102a',g1:'#c0394a',g2:'#6a1420',dirt:'#3a1018',dirt2:'#240a10',acc:'#ffd24a'},
    mix:['roller','orbinaut','buzzer','bat'], look:'lava', night:true },
  /* The finale: two Super levels above the broken sky, and Eggman's giant robot. */
  { n:'The Doomsday',     th:'doomsday', boss:'Egg Colossus', finale:true,
    pal:{sky1:'#04030e',sky2:'#1d0b2e',far:'#2b0a1c',hill:'#3a1030',g1:'#ffd24a',g2:'#a8701f',dirt:'#2b2342',dirt2:'#191330',acc:'#ff3d5a'},
    mix:['orbinaut','buzzer','bat'], look:'void', night:true, lowg:true }
];

/* branch level flavours, cycled per zone */
const BRANCH_KINDS = [
  { type:'rush',     tag:'Speed Run',   sub:'Beat the target time to the goal.' },
  { type:'climb',    tag:'Sky Climb',   sub:'Climb all the way to the top.' },
  { type:'gauntlet', tag:'Gauntlet',    sub:'A short, nasty obstacle course.' },
  { type:'survive',  tag:'Last Stand',  sub:'Survive the badnik swarm.' },
  { type:'rings',    tag:'Ring Rush',   sub:'Collect the rings to open the goal.' }
];
const GREEK = ['Alpha','Beta','Gamma','Delta'];

/* --------------------------- the level catalogue ------------------------- */
/* 102 main levels (17 zones x 6 acts) + 50 branch levels = 152 total. */
const LEVELS = [];
const FINALE = [
  { n:'Super Dash', type:'doomsday', boss:false,
    sub:'Super power, endless flight, and the Egg Colossus to catch.' },
  { n:'Egg Colossus', type:'colossus', boss:true,
    sub:'Eggman\'s giant robot. Take it apart.' }
];
(function buildCatalogue() {
  for (let z = 0; z < ZONES.length; z++) {
    const Z = ZONES[z];
    if (Z.finale) {
      FINALE.forEach((F, i) => LEVELS.push({
        zone: z, act: i + 1, branch: 0, finale: 1, boss: F.boss,
        name: Z.n + ' - ' + F.n, short: F.n, sub: F.sub,
        zoneName: Z.n, theme: Z.th, type: F.type,
        seed: 31000 + i * 77
      }));
      continue;
    }
    for (let a = 1; a <= 6; a++) {
      const boss = a === 6;
      const type = boss ? 'boss' : (a === 3 ? 'time' : a === 4 ? 'rings' : a === 5 ? 'ringroad' : 'goal');
      LEVELS.push({
        zone: z, act: a, branch: 0, boss,
        name: Z.n + ' - Act ' + a,
        short: 'Act ' + a,
        zoneName: Z.n, theme: Z.th, type,
        seed: 1000 + z * 97 + a * 13
      });
    }
    /* zones 1-16 carry three branch levels, zone 17 carries two: 50 in all */
    const lastPlayable = ZONES.filter(zz => !zz.finale).length - 1;
    const nb = z === lastPlayable ? 2 : 3;
    for (let b = 0; b < nb; b++) {
      const k = BRANCH_KINDS[(z * 3 + b) % BRANCH_KINDS.length];
      LEVELS.push({
        zone: z, act: 0, branch: b + 1, boss: false,
        name: Z.n + ' - Branch ' + GREEK[b],
        short: 'Br ' + GREEK[b][0],
        zoneName: Z.n, theme: Z.th, type: k.type, tag: k.tag, sub: k.sub,
        emerald: (b === 2 && z < 7) ? z : -1,   // 7 Chaos Emeralds live in branch Gamma of zones 1-7
        parent: z * 9 + Math.min(5, b * 2 + 1), // the main act in this zone that opens it
        seed: 7000 + z * 131 + b * 29
      });
    }
  }
  LEVELS.forEach((L, i) => { L.id = i; });
})();
const MAIN_LEVELS = LEVELS.filter(l => !l.branch && !l.finale);
const BRANCH_LEVELS = LEVELS.filter(l => l.branch);
const FINALE_LEVELS = LEVELS.filter(l => l.finale);

const OBJECTIVE = {
  goal:  'Reach the goal post',
  time:  'Reach the goal - beat the target time for a big bonus',
  rings: 'Collect the rings, then reach the goal',
  ringroad: 'Reach the goal - and sweep up every ring on the way',
  boss:  'Defeat the boss',
  rush:  'Sprint to the goal - beat the target time for a big bonus',
  climb: 'Climb to the goal at the top',
  gauntlet: 'Survive the course and reach the goal',
  survive: 'Stay alive until the timer ends',
  doomsday: 'Chase down the Egg Colossus - your Super power never runs out',
  colossus: 'Destroy Eggman\'s giant robot'
};

/* --------------------------------- save ---------------------------------- */
const SAVE_KEY = 'sonic4.shatteredHorizon.v1';
const defaultSave = () => ({
  cleared: {}, best: {}, rings: {}, char: 'sonic', emeralds: [],
  medals: 0, mute: false, lives: 5, seen: false
});
let save = defaultSave();
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) save = Object.assign(defaultSave(), JSON.parse(raw));
  } catch (e) { save = defaultSave(); }
  if (!CHARS[save.char]) save.char = 'sonic';
  return save;
}
function writeSave() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {}
}
function isCleared(i) { return !!save.cleared[i]; }
function isUnlocked(i) {
  const L = LEVELS[i];
  if (!L) return false;
  if (L.branch) return isCleared(L.parent);
  /* The Super finale is open from the start - it is the big set piece, not a
     reward for grinding 102 acts - but the Colossus still waits for Super Dash. */
  if (L.finale && L.act === 1) return true;
  return i === 0 || isCleared(prevMain(i));
}
function prevMain(i) {
  for (let j = i - 1; j >= 0; j--) if (!LEVELS[j].branch) return j;
  return 0;
}
function nextMain(i) {
  for (let j = i + 1; j < LEVELS.length; j++) if (!LEVELS[j].branch) return j;
  return -1;
}

/* ======================== map helpers & generation ======================== */
function gt(L, tx, ty) {
  if (tx < 0 || tx >= L.w) return T.SOLID;          // the world is walled left/right
  if (ty < 0 || ty >= L.h) return T.EMPTY;
  return L.tiles[ty * L.w + tx];
}
function st(L, tx, ty, v) {
  if (tx < 0 || tx >= L.w || ty < 0 || ty >= L.h) return;
  L.tiles[ty * L.w + tx] = v;
}
function column(L, tx, top, topTile) {
  st(L, tx, top, topTile);
  for (let ty = top + 1; ty < L.h; ty++) st(L, tx, ty, T.SOLID);
}
function box(L, x0, y0, x1, y1, v) {
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) st(L, tx, ty, v);
}
function slopeSurf(t, tx, ty, x) {
  const f = clamp(x - tx * TILE, 0, TILE);
  return t === T.SLU ? (ty + 1) * TILE - f : ty * TILE + f;
}

const BAD = {
  motobug: { hw:15, hh:13, sp: 70,  ai:'walk'      },
  crab:    { hw:17, hh:14, sp: 46,  ai:'walkshoot' },
  buzzer:  { hw:16, hh:12, sp: 72,  ai:'hover'     },
  bat:     { hw:14, hh:12, sp:112,  ai:'chase'     },
  orbinaut:{ hw:13, hh:13, sp: 44,  ai:'orbit'     },
  spiker:  { hw:15, hh:15, sp:  0,  ai:'pop'       },
  roller:  { hw:16, hh:15, sp:235,  ai:'charge'    },
  chopper: { hw:14, hh:15, sp:  0,  ai:'leap'      }
};
const MONITORS = ['rings','rings','rings','rings','shield','shield','speed','invinc','life'];

function ent(L, kind, x, y, extra) {
  const e = Object.assign({ kind, x, y, vx:0, vy:0, hw:12, hh:12, dead:false, t:0, ox:x, oy:y }, extra || {});
  L.ents.push(e);
  return e;
}
function addRing(L, x, y) { ent(L, 'ring', x, y, { hw:10, hh:10 }); L.ringTotal++; }
function ringRow(L, tx, ty, n) { for (let i = 0; i < n; i++) addRing(L, (tx + i) * TILE + 16, ty * TILE + 16); }
function ringArc(L, tx, ty, n) {
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1 || 1);
    addRing(L, (tx + i) * TILE + 16, ty * TILE + 16 - Math.sin(t * Math.PI) * 64);
  }
}
function addBadnik(L, type, tx, gy, R) {
  const b = BAD[type];
  ent(L, 'badnik', tx * TILE + 16, gy * TILE - b.hh - 1, {
    type, hw:b.hw, hh:b.hh, sp:b.sp, ai:b.ai, dir: R() < .5 ? -1 : 1,
    home: tx * TILE + 16, homeY: gy * TILE - b.hh - 1, fire: 0.8 + R()
  });
}

/* --------------------------- horizontal levels --------------------------- */
function genHoriz(D, Z, R) {
  const z = D.zone, diff = z / (ZONES.length - 1);
  let len;
  if (D.type === 'rush') len = 150 + z * 4;
  else if (D.type === 'gauntlet') len = 136 + z * 3;
  else if (D.type === 'rings') len = 200 + z * 4;
  else if (D.type === 'ringroad') len = 205 + z * 4;
  else if (D.type === 'doomsday') len = 300;      // the longest run in the game
  else len = 170 + z * 5 + D.act * 7;
  const H = 32;
  const L = {
    D, Z, w: len, h: H, tiles: new Array(len * H).fill(0), ents: [], route: [],
    ringTotal: 0, vert: false
  };
  const topTile = Z.ice ? T.ICE : T.SOLID;
  const ground = tx => column(L, tx, gy, topTile);
  const addRoute = (tx, g) => L.route.push({ x: tx * TILE + 16, y: g * TILE });
  /* A gap is a ravine, not a death sentence: three tiles down there is always
     something to land on - a hazard pool, or in the sky zones a lower ledge. */
  const pit = tx => {
    const b = Math.min(gy + 2, H - 3);                 // floor three tiles down:
    st(L, tx, b, Z.look === 'void' ? T.EMPTY : T.LAVA); // every hero can jump back out
    for (let ty = b + 1; ty < H; ty++) st(L, tx, ty, T.SOLID);
  };
  const enemyTypes = Z.mix;
  let gy = H - 10, x = 0;

  /* ---- opening pad ---- */
  for (; x < 10; x++) ground(x);
  addRoute(4, gy);
  L.spawn = { x: 3 * TILE + 16, y: gy * TILE - 30 };

  const density = 0.20 + diff * 0.26 + (D.type === 'gauntlet' ? 0.18 : 0);
  const cpAt = [Math.floor(len * 0.34), Math.floor(len * 0.67)];
  let roofUntil = -1, lastFeat = '', launcher = false;

  const feats = [];
  const W = (name, w) => { if (w > 0) feats.push([name, w]); };
  W('flat', 3.6);
  W('slopeUp', 1.5); W('slopeDown', 1.5);
  W('gap', 1.0 + diff * .7); W('ledgeUp', 1.0); W('ledgeDown', 1.0);
  W('spikes', 0.35 + diff * 0.75); W('spring', 1.0); W('platRun', 1.2 + diff * .6);
  W('hazPit', 0.3 + diff * 0.85); W('nest', 0.6 + diff * .6);
  W('crates', 0.5); W('bumper', Z.th === 'casino' || Z.th === 'carnival' ? 1.6 : 0);
  W('pool', (Z.look === 'water' || Z.look === 'acid') ? 1.0 : 0);
  const totalW = feats.reduce((s, f) => s + f[1], 0);
  function roll() {
    let r = R() * totalW;
    for (const f of feats) { r -= f[1]; if (r <= 0) return f[0]; }
    return 'flat';
  }

  function decorate(x0, n) {
    /* rings, badniks and item boxes on a flat stretch */
    if (n >= 3 && R() < density) {
      const t = enemyTypes[Math.floor(R() * enemyTypes.length)];
      addBadnik(L, t, x0 + 1 + Math.floor(R() * (n - 2)), gy, R);
    }
    /* every open stretch gets a ring trail at running height, and often a second
       line of rings up above for whoever feels like jumping */
    const n2 = Math.min(n - 1, 5 + Math.floor(R() * 3));
    ringRow(L, x0 + 1, gy - 1, n2);
    if (R() < 0.4 && n >= 7) ringArc(L, x0 + Math.max(2, n - n2 - 1), gy - 1, Math.min(n - 2, 5));
    if (R() < 0.22) ent(L, 'monitor', (x0 + Math.floor(n / 2)) * TILE + 16, gy * TILE - 18,
      { hw:15, hh:17, item: MONITORS[Math.floor(R() * MONITORS.length)] });
    if (R() < 0.28 && n >= 6) {
      const px = x0 + 2;
      box(L, px, gy - 5, px + 3, gy - 5, T.PLAT);
      ringRow(L, px, gy - 6, 4);
    }
  }

  while (x < len - 18) {
    for (const c of cpAt) if (x === c || (x > c && x - 1 < c)) { /* placed below */ }
    let f = roll();
    if (f === lastFeat && R() < .6) f = 'flat';
    if (launcher && (f === 'gap' || f === 'hazPit')) f = 'flat';   // no pit right after a launch
    launcher = (f === 'spring' || f === 'bumper' || f === 'ledgeUp');
    lastFeat = f;
    const room = len - 18 - x;

    if (f === 'flat' || room < 8) {
      const n = Math.min(room, irnd(R, 7, 13));
      const x0 = x;
      for (let i = 0; i < n; i++, x++) ground(x);
      decorate(x0, n);
      addRoute(x - 1, gy);

    } else if (f === 'slopeUp') {
      const k = Math.min(irnd(R, 2, 4), gy - 8);
      for (let i = 0; i < k; i++) { column(L, x, gy - 1, T.SLU); gy--; x++; }
      for (let i = 0; i < 3; i++, x++) ground(x);
      if (R() < .5) ringRow(L, x - 3, gy - 1, 3);
      addRoute(x - 1, gy);

    } else if (f === 'slopeDown') {
      const k = Math.min(irnd(R, 2, 4), H - 6 - gy);
      for (let i = 0; i < k; i++) { column(L, x, gy, T.SLD); gy++; x++; }
      for (let i = 0; i < 3; i++, x++) ground(x);
      if (R() < .5) ringRow(L, x - 3, gy - 1, 3);
      addRoute(x - 1, gy);

    } else if (f === 'gap') {
      const g = Math.min(irnd(R, 2, 3 + Math.round(diff * 3)), room - 4);
      for (let i = 0; i < g; i++, x++) pit(x);
      if (g >= 4) {
        const mid = x - Math.ceil(g / 2);
        box(L, mid, gy - 2, mid + 1, gy - 2, T.PLAT);
        ringRow(L, mid, gy - 3, 2);
      }
      for (let i = 0; i < 4; i++, x++) ground(x);
      addRoute(x - 2, gy);

    } else if (f === 'hazPit') {
      const g = Math.min(irnd(R, 3, 5), room - 5);
      const base = gy;
      const start = x;
      for (let i = 0; i < g; i++, x++) pitHaz(L, x, base + 1, H, Z);
      for (let i = 0; i + 2 <= g; i += 2) {
        const px = start + i;
        const py = base - 2 - (i % 4 ? 1 : 0);
        box(L, px, py, px + 1, py, T.PLAT);
        ringRow(L, px, py - 1, 2);
      }
      for (let i = 0; i < 4; i++, x++) ground(x);
      addRoute(x - 2, gy);

    } else if (f === 'ledgeUp') {
      const k = Math.min(irnd(R, 1, 2), gy - 8);
      if (R() < .4) { ent(L, 'spring', (x) * TILE + 16, gy * TILE - 11, { hw:15, hh:11, power: 820, dir: 0 }); for (let i = 0; i < 2; i++, x++) ground(x); }
      gy -= k;
      const n = irnd(R, 4, 7);
      const x0 = x;
      for (let i = 0; i < n && x < len - 18; i++, x++) ground(x);
      decorate(x0, n);
      addRoute(x - 1, gy);

    } else if (f === 'ledgeDown') {
      const k = Math.min(irnd(R, 1, 3), H - 7 - gy);
      gy += k;
      const n = irnd(R, 4, 7);
      const x0 = x;
      for (let i = 0; i < n && x < len - 18; i++, x++) ground(x);
      decorate(x0, n);
      addRoute(x - 1, gy);

    } else if (f === 'pool') {
      const n = irnd(R, 4, 6);
      const x0 = x;
      for (let i = 0; i < n && x < len - 18; i++, x++) {
        column(L, x, gy + 1, topTile);
        st(L, x, gy, T.WATER);
      }
      ringRow(L, x0 + 1, gy - 1, Math.min(3, n - 1));
      if (R() < .4) addBadnik(L, 'chopper', x0 + 1, gy, R);
      addRoute(x - 1, gy);

    } else if (f === 'spikes') {
      for (let i = 0; i < 2; i++, x++) ground(x);
      const n = irnd(R, 2, 3);
      for (let i = 0; i < n; i++, x++) { ground(x); st(L, x, gy - 1, T.SPIKE); }
      for (let i = 0; i < 3; i++, x++) ground(x);
      if (R() < .6) ringArc(L, x - 6, gy - 1, 5);
      addRoute(x - 1, gy);

    } else if (f === 'spring') {
      for (let i = 0; i < 2; i++, x++) ground(x);
      ent(L, 'spring', x * TILE + 16, gy * TILE - 11, { hw:15, hh:11, power: 860, dir: R() < .5 ? 0 : 1, dirX: 1 });
      ground(x); x++;
      const hi = gy - irnd(R, 4, 6);
      box(L, x + 1, hi, x + 4, hi, T.PLAT);
      ringRow(L, x + 1, hi - 1, 4);
      if (R() < .35) ent(L, 'monitor', (x + 2) * TILE + 16, hi * TILE - 18,
        { hw:15, hh:17, item: MONITORS[Math.floor(R() * MONITORS.length)] });
      for (let i = 0; i < 6; i++, x++) ground(x);
      addRoute(x - 1, gy);

    } else if (f === 'platRun') {
      const n = irnd(R, 3, 5);
      let py = gy - 2, px = x + 2;
      for (let i = 0; i < n; i++) {
        box(L, px, py, px + 2, py, T.PLAT);
        ringRow(L, px, py - 1, 2);
        if (R() < density * .5) addBadnik(L, enemyTypes[Math.floor(R() * enemyTypes.length)], px + 1, py, R);
        px += 4; py += R() < .5 ? -1 : 1;
        py = clamp(py, 6, gy - 1);
      }
      const span = px - x + 2;
      for (let i = 0; i < span && x < len - 18; i++, x++) ground(x);
      addRoute(x - 1, gy);

    } else if (f === 'nest') {
      const n = irnd(R, 5, 8);
      const x0 = x;
      for (let i = 0; i < n && x < len - 18; i++, x++) ground(x);
      const cnt = 1 + (R() < .6 ? 1 : 0) + (diff > .5 && R() < .5 ? 1 : 0);
      for (let i = 0; i < cnt; i++)
        addBadnik(L, enemyTypes[Math.floor(R() * enemyTypes.length)], x0 + 1 + i * 2, gy, R);
      if (R() < .7) ringRow(L, x0 + 1, gy - 1, Math.min(n - 1, 5));
      addRoute(x - 1, gy);

    } else if (f === 'crates') {
      const n = irnd(R, 5, 7);
      const x0 = x;
      for (let i = 0; i < n && x < len - 18; i++, x++) ground(x);
      const bx = x0 + 2;
      box(L, bx, gy - 2, bx + 1, gy - 1, T.BREAK);
      addRing(L, bx * TILE + 16, (gy - 3) * TILE + 16);
      addRing(L, (bx + 1) * TILE + 16, (gy - 3) * TILE + 16);
      addRoute(x - 1, gy);

    } else { /* bumper */
      const n = irnd(R, 6, 9);
      const x0 = x;
      for (let i = 0; i < n && x < len - 18; i++, x++) ground(x);
      st(L, x0 + 2, gy - 3, T.BUMP);
      st(L, x0 + 4, gy - 5, T.BUMP);
      ent(L, 'bumper', (x0 + 3) * TILE + 16, (gy - 4) * TILE + 16, { hw:22, hh:22 });
      ringArc(L, x0 + 1, gy - 6, 5);
      addRoute(x - 1, gy);
    }

    /* checkpoints and the odd tunnel roof */
    for (const c of cpAt) if (x - 1 >= c && !L.ents.some(e => e.kind === 'checkpoint' && e.cp === c)) {
      ent(L, 'checkpoint', (x - 2) * TILE + 16, gy * TILE - 28, { hw:12, hh:28, cp: c, lit: false });
    }
    if (Z.roof && x > roofUntil && R() < .18) {
      roofUntil = x + irnd(R, 8, 16);
      for (let tx = x; tx < Math.min(roofUntil, len - 18); tx++) box(L, tx, 0, gy - 8, T.SOLID);
    }
  }

  /* ---- closing straight + goal ---- */
  for (; x < len; x++) ground(x);
  const gx = (len - 9) * TILE;
  L.goal = ent(L, 'goal', gx, gy * TILE - 40, { hw:20, hh:40, spin: 0 });
  ringRow(L, len - 16, gy - 1, 5);
  addRoute(len - 9, gy);
  addRoute(len - 7, gy);

  finishLevel(L, D, Z, R);
  return L;
}

/* A hazard pool: one row of hazard over solid rock, two tiles below the path.
   Falling in costs you your rings, not the run - you can always jump back out. */
/* The ring quota of a ring-quota level: knowable from the zone alone, so the
   zone map can promise the exact number, and gentle enough to sweep up on the run. */
function ringQuota(zone) { return 12 + Math.floor(zone / 2); }

function pitHaz(L, tx, from, H, Z) {
  st(L, tx, from, T.EMPTY);
  st(L, tx, from + 1, Z.look === 'void' ? T.EMPTY : T.LAVA);
  for (let ty = from + 2; ty < H; ty++) st(L, tx, ty, T.SOLID);
}

/* ------------------------------ climb levels ----------------------------- */
function genClimb(D, Z, R) {
  const W = 26, H = 56 + D.zone;
  const L = { D, Z, w: W, h: H, tiles: new Array(W * H).fill(0), ents: [], route: [], ringTotal: 0, vert: true };
  box(L, 0, 0, 1, H - 1, T.SOLID);
  box(L, W - 2, 0, W - 1, H - 1, T.SOLID);
  const floor = H - 4;
  box(L, 2, floor, W - 3, H - 1, T.SOLID);
  if (Z.look !== 'void') box(L, 2, floor, W - 3, floor, T.LAVA);
  box(L, 2, floor, 7, H - 1, T.SOLID);                   // a safe landing pad
  L.spawn = { x: 4 * TILE + 16, y: floor * TILE - 30 };
  L.route.push({ x: 4 * TILE + 16, y: floor * TILE });

  let py = floor - 3, px = 4, lastPy = floor;
  while (py > 6) {
    const wide = irnd(R, 5, 7);
    px = clamp(px + irnd(R, -4, 4), 3, Math.max(3, W - 3 - wide));
    box(L, px, py, px + wide - 1, py, T.PLAT);
    L.route.push({ x: (px + (wide >> 1)) * TILE + 16, y: py * TILE });
    if (R() < .55) ringRow(L, px + 1, py - 1, Math.min(3, wide - 1));
    if (wide >= 6 && R() < .20) addBadnik(L, Z.mix[Math.floor(R() * Z.mix.length)], px + wide - 2, py, R);
    if (R() < .10) ent(L, 'monitor', (px + 1) * TILE + 16, py * TILE - 18,
      { hw:15, hh:17, item: MONITORS[Math.floor(R() * MONITORS.length)] });
    if (R() < .22) ringRow(L, px + 1, py - 4, 2);
    lastPy = py;
    py -= R() < .35 ? 3 : 2;
  }
  /* The summit is a full-width platform you jump up THROUGH, so the last
     jump of a climb can never be missed sideways. */
  const topY = Math.max(1, lastPy - 3);
  box(L, 2, topY, W - 3, topY, T.PLAT);
  ringRow(L, 3, topY - 1, 4);
  ringRow(L, W - 8, topY - 1, 4);
  const gx = (W >> 1) * TILE;
  L.goal = ent(L, 'goal', gx, topY * TILE - 40, { hw:20, hh:40, spin: 0 });
  L.route.push({ x: gx, y: topY * TILE });
  finishLevel(L, D, Z, R);
  return L;
}

/* ------------------------- arenas: bosses & sieges ----------------------- */
function genArena(D, Z, R, mode) {
  const W = mode === 'colossus' ? 62 : mode === 'boss' ? 46 : 40, H = 22;
  const L = { D, Z, w: W, h: H, tiles: new Array(W * H).fill(0), ents: [], route: [], ringTotal: 0, vert: false, arena: true };
  const floor = H - 5;
  L.floorRow = floor;
  box(L, 0, floor, W - 1, H - 1, T.SOLID);
  box(L, 0, floor, W - 1, floor, Z.ice ? T.ICE : T.SOLID);
  box(L, 0, 0, 0, H - 1, T.SOLID);
  box(L, W - 1, 0, W - 1, H - 1, T.SOLID);
  L.spawn = { x: 4 * TILE, y: floor * TILE - 30 };
  L.route.push({ x: 4 * TILE, y: floor * TILE });
  if (mode === 'boss') {
    box(L, 7, floor - 5, 10, floor - 5, T.PLAT);
    box(L, W - 11, floor - 5, W - 8, floor - 5, T.PLAT);
    ringRow(L, 8, floor - 6, 3);
    ringRow(L, W - 11, floor - 6, 3);
    ringRow(L, 6, floor - 1, 7);
    ringRow(L, 18, floor - 1, 7);
    ringRow(L, W - 13, floor - 1, 7);
    ent(L, 'monitor', 13 * TILE, floor * TILE - 18, { hw:15, hh:17, item: 'rings' });
    ent(L, 'monitor', (W - 16) * TILE, floor * TILE - 18, { hw:15, hh:17, item: 'shield' });
    L.route.push({ x: (W >> 1) * TILE, y: floor * TILE });
    L.bossEnt = ent(L, 'boss', (W - 12) * TILE, (floor - 7) * TILE, {
      hw:42, hh:30, pattern: D.zone % 5, zone: D.zone,
      hp: 8 + Math.floor(D.zone / 2) + (D.zone === 16 ? 6 : 0),
      maxhp: 8 + Math.floor(D.zone / 2) + (D.zone === 16 ? 6 : 0),
      phase: 0, inv: 0, dir: -1, name: Z.boss, floorY: floor * TILE, final: D.zone === 16
    });
  } else if (mode === 'colossus') {
    /* a long deck with four springboard ledges to leap at the cockpit from */
    for (const px of [8, 20, W - 24, W - 12]) {
      box(L, px, floor - 5, px + 3, floor - 5, T.PLAT);
      ringRow(L, px, floor - 6, 4);
    }
    ringRow(L, 5, floor - 1, 8);
    ringRow(L, (W >> 1) - 4, floor - 1, 8);
    ringRow(L, W - 14, floor - 1, 8);
    ent(L, 'monitor', 6 * TILE, floor * TILE - 18, { hw:15, hh:17, item: 'rings' });
    ent(L, 'monitor', (W - 7) * TILE, floor * TILE - 18, { hw:15, hh:17, item: 'rings' });
    L.route.push({ x: (W >> 1) * TILE, y: floor * TILE });
    L.bossEnt = ent(L, 'boss', (W - 16) * TILE, (floor - 7) * TILE, {
      colossus: true, hw:88, hh:108, zone: D.zone, pattern: -1,
      hp: 24, maxhp: 24, phase: 0, inv: 0, dir: -1, cool: 2,
      name: 'EGG COLOSSUS', floorY: floor * TILE
    });
  } else {
    box(L, 6, floor - 5, 10, floor - 5, T.PLAT);
    box(L, W - 11, floor - 5, W - 7, floor - 5, T.PLAT);
    box(L, (W >> 1) - 3, floor - 9, (W >> 1) + 2, floor - 9, T.PLAT);
    ringRow(L, 6, floor - 1, 8);
    ringRow(L, 20, floor - 1, 8);
    ringRow(L, (W >> 1) - 2, floor - 10, 4);
    ent(L, 'monitor', 8 * TILE, floor * TILE - 18, { hw:15, hh:17, item: 'shield' });
    ent(L, 'monitor', (W - 9) * TILE, floor * TILE - 18, { hw:15, hh:17, item: 'rings' });
    L.spawnerFloor = floor;
    L.route.push({ x: (W >> 1) * TILE, y: floor * TILE });
  }
  finishLevel(L, D, Z, R);
  return L;
}

/* ---------------------- shared level finishing touches ------------------- */
function finishLevel(L, D, Z, R) {
  L.type = D.type;
  L.need = 0;
  L.target = 0;
  L.surviveFor = 0;
  if (D.type === 'rings') L.need = Math.min(ringQuota(D.zone), Math.max(8, L.ringTotal - 6));
  /* 'time' and 'rush' levels have a TARGET time, not a death clock: beat it for a
     big bonus, miss it and nothing bad happens. Nothing in this game kills you
     for being slow. */
  if (D.type === 'time') L.target = Math.round(L.w * 0.5 + 40);
  if (D.type === 'rush') L.target = Math.round(L.w * 0.42 + 30);
  if (D.type === 'survive') L.surviveFor = 45 + D.zone * 2;
  if (D.finale) L.alwaysSuper = true;        // Super from the first frame, and it never runs out
  if (D.emerald >= 0) {
    const r = L.route[Math.max(1, Math.floor(L.route.length * 0.62))];
    ent(L, 'emerald', r.x, r.y - 70, { hw:22, hh:22, idx: D.emerald });
  }
  L.worldW = L.w * TILE;
  L.worldH = L.h * TILE;
}

function buildLevel(idx) {
  const D = LEVELS[idx], Z = ZONES[D.zone], R = rng(D.seed);
  let L;
  if (D.type === 'boss') L = genArena(D, Z, R, 'boss');
  else if (D.type === 'colossus') L = genArena(D, Z, R, 'colossus');
  else if (D.type === 'survive') L = genArena(D, Z, R, 'survive');
  else if (D.type === 'climb') L = genClimb(D, Z, R);
  else L = genHoriz(D, Z, R);
  L.idx = idx;
  return L;
}

/* ============================== game state ============================== */
const G = {
  scene: 'boot',            // boot|title|chars|map|play|pause|win|dead|over|help
  idx: 0, level: null, player: null, char: 'sonic',
  cam: { x:0, y:0 }, t: 0, elapsed: 0, frames: 0,
  rings: 0, score: 0, lives: 5, ringsGot: 0, kills: 0,
  won: false, parts: [], shots: [], toast: '', toastT: 0, shake: 0,
  super: false, mute: false, spawnT: 0, waveN: 0,
  act: {}, press: {}, lastTouch: null, mapZone: 0
};

/* ------------------------------- input ---------------------------------- */
const KEYMAP = {
  ArrowLeft:'left', KeyA:'left', ArrowRight:'right', KeyD:'right',
  ArrowDown:'down', KeyS:'down',
  ArrowUp:'jump', KeyW:'jump', Space:'jump', KeyZ:'jump', KeyK:'jump',
  KeyX:'attack', KeyJ:'attack', ShiftLeft:'attack', ShiftRight:'attack',
  KeyP:'pause', Escape:'pause', KeyM:'mute', KeyR:'restart'
};
function onKey(down) {
  return function (ev) {
    const a = KEYMAP[ev.code];
    if (!a) return;
    if (ev.preventDefault && (a === 'jump' || a === 'down' || a === 'left' || a === 'right')) ev.preventDefault();
    if (down) { if (!G.act[a]) G.press[a] = true; G.act[a] = true; }
    else G.act[a] = false;
  };
}

/* ------------------------------ movement -------------------------------- */
function moveX(L, e, dx) {
  if (!dx) return 0;
  e.x += dx;
  const top = e.y - e.hh + 5, bot = e.y + e.hh - 3;
  const ty0 = Math.floor(top / TILE), ty1 = Math.floor(bot / TILE);
  const edge = dx > 0 ? e.x + e.hw : e.x - e.hw;
  const tx = Math.floor(edge / TILE);
  const feet = e.y + e.hh;
  /* A low lip is a step, not a wall: walking off the top of a slope onto flat
     ground, or over a small ledge, lifts you instead of stopping you dead. */
  const stepUp = e.onGround ? (e.gslope ? 34 : 16) : 0;
  for (let ty = ty0; ty <= ty1; ty++) {
    const t = gt(L, tx, ty);
    if (!isSolidT(t)) continue;
    if (t === T.BREAK && e.breaker) { smashBlock(L, tx, ty); continue; }
    if (t === T.BUMP) { bumpOff(e, tx, ty); return 0; }
    if (stepUp && ty * TILE >= feet - stepUp && !isSolidT(gt(L, tx, ty - 1)) &&
        gt(L, tx, ty - 1) !== T.SPIKE) continue;
    e.x = dx > 0 ? tx * TILE - e.hw - 0.01 : (tx + 1) * TILE + e.hw + 0.01;
    e.vx = 0; e.wall = dx > 0 ? 1 : -1;
    return e.wall;
  }
  return 0;
}
function moveY(L, e, dy) {
  const prevBot = e.y + e.hh;
  e.y += dy;
  const bot = e.y + e.hh;
  const tx0 = Math.floor((e.x - e.hw + 4) / TILE), tx1 = Math.floor((e.x + e.hw - 4) / TILE);
  if (dy >= 0) {
    const stepDown = e.onGround ? 17 : 1;
    const stepUp = e.onGround ? (e.gslope ? 36 : 22) : 22;
    let best = null, bt = 0, btx = 0, bty = 0;
    const tyA = Math.floor((prevBot - stepUp) / TILE), tyB = Math.floor((bot + stepDown) / TILE);
    for (let tx = tx0; tx <= tx1; tx++) for (let ty = tyA; ty <= tyB; ty++) {
      const t = gt(L, tx, ty);
      let s = null;
      if (isSolidT(t)) s = ty * TILE;
      else if (isSlopeT(t)) s = slopeSurf(t, tx, ty, clamp(e.x, tx * TILE, tx * TILE + TILE));
      else if (t === T.PLAT) { s = ty * TILE; if (prevBot > s + 9) s = null; }
      if (s === null) continue;
      if (s < prevBot - stepUp) continue;
      if (s > bot + stepDown) continue;
      if (best === null || s < best) { best = s; bt = t; btx = tx; bty = ty; }
    }
    if (best !== null) {
      if (bt === T.BUMP) { bumpOff(e, btx, bty); return; }
      e.y = best - e.hh;
      e.landVy = e.vy; e.vy = 0;
      if (!e.onGround) e.landed = true;
      e.onGround = true;
      e.gtile = bt;
      e.gslope = bt === T.SLU ? -1 : bt === T.SLD ? 1 : 0;
    } else { e.onGround = false; e.gtile = 0; e.gslope = 0; }
  } else {
    const ty = Math.floor((e.y - e.hh) / TILE);
    for (let tx = tx0; tx <= tx1; tx++) {
      const t = gt(L, tx, ty);
      if (!isSolidT(t)) continue;
      if (t === T.BREAK && e.breaker) { smashBlock(L, tx, ty); continue; }
      if (t === T.BUMP) { bumpOff(e, tx, ty); return; }
      e.y = (ty + 1) * TILE + e.hh + 0.01; e.vy = 0; e.bonk = true;
      break;
    }
    e.onGround = false; e.gslope = 0;
  }
}
function moveEnt(L, e, dx, dy) {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 11));
  for (let i = 0; i < steps; i++) { moveX(L, e, dx / steps); moveY(L, e, dy / steps); }
}
function bumpOff(e, tx, ty) {
  const cx = tx * TILE + 16, cy = ty * TILE + 16;
  const ax = e.x - cx, ay = e.y - cy;
  if (Math.abs(ax) > Math.abs(ay)) { e.vx = sign(ax) * 540; e.x = cx + sign(ax) * (16 + e.hw + 1); }
  else { e.vy = sign(ay) * 640; e.y = cy + sign(ay) * (16 + e.hh + 1); e.onGround = false; }
  G.score += 10; sfx('bump'); puff(e.x, e.y, '#ffe14a', 8);
}
function smashBlock(L, tx, ty) {
  st(L, tx, ty, T.EMPTY);
  puff(tx * TILE + 16, ty * TILE + 16, L.Z.pal.dirt, 10);
  G.score += 20; sfx('smash');
}
function tileOverlap(L, e, pred) {
  const x0 = Math.floor((e.x - e.hw + 4) / TILE), x1 = Math.floor((e.x + e.hw - 4) / TILE);
  const y0 = Math.floor((e.y - e.hh + 4) / TILE), y1 = Math.floor((e.y + e.hh - 2) / TILE);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (pred(gt(L, tx, ty))) return true;
  return false;
}

/* ------------------------------- the hero -------------------------------- */
function makePlayer(key, L) {
  const C = CHARS[key];
  return {
    kind:'player', C, char:key,
    x: L.spawn.x, y: L.spawn.y, vx:0, vy:0, hw:11, hh:19,
    onGround:false, face:1, roll:false, jumping:false, airUsed:false,
    inv:0, invinc:0, speedUp:0, shield:false, flyT:C.key === 'tails' ? 3.4 : 0, flying:false,
    gliding:false, clinging:false, clingDir:0, attack:0, dash:0, dashing:0,
    anim:0, hurtT:0, dead:false, gtile:0, gslope:0, breaker:false, wall:0,
    spinT:0, airAbilityT:0
  };
}
function playerSpin(p) {
  return p.jumping || p.roll || p.dashing > 0 || p.attack > 0 || (p.gliding && p.char === 'knuckles');
}

function updatePlayer(dt) {
  const L = G.level, p = G.player, C = p.C, A = G.act, P = G.press;
  if (!p || p.dead) return;
  const lowg = L.Z.lowg ? 0.72 : 1;
  const inWater = tileOverlap(L, p, t => t === T.WATER);
  const grav = GRAV * lowg * (inWater ? 0.55 : 1) * (p.gliding ? 0.42 : 1);
  const topSp = C.top * (p.speedUp > 0 ? 1.35 : 1) * (G.super ? 1.28 : 1) * (inWater ? 0.72 : 1);
  const acc = C.acc * (p.speedUp > 0 ? 1.2 : 1) * (p.gtile === T.ICE ? 0.33 : 1);
  const fric = (p.roll ? ROLL_FRIC : FRIC) * (p.gtile === T.ICE ? 0.14 : 1);
  const jumpV = C.jump * (G.super ? 1.08 : 1) * (inWater ? 0.82 : 1);
  p.wall = 0; p.landed = false; p.bonk = false;

  /* ---- timers ---- */
  p.inv = Math.max(0, p.inv - dt);
  p.invinc = Math.max(0, p.invinc - dt);
  p.speedUp = Math.max(0, p.speedUp - dt);
  p.attack = Math.max(0, p.attack - dt);
  p.hurtT = Math.max(0, p.hurtT - dt);
  p.anim += dt;

  if (p.hurtT > 0) {                       // knocked back: no steering
    p.vy += grav * dt;
    moveEnt(L, p, p.vx * dt, clamp(p.vy, -2000, MAXFALL) * dt);
    afterMove(dt, inWater);
    return;
  }

  /* ---- clinging to a wall (Knuckles) ---- */
  if (p.clinging) {
    p.vx = 0; p.vy = 0;
    if (A.jump && P.jump) {
      p.clinging = false; p.jumping = true; p.airUsed = false;
      p.vy = -jumpV * 0.92; p.vx = -p.clingDir * 300; p.face = -p.clingDir; sfx('jump');
    } else {
      const climb = (A.jump ? -1 : 0) + (A.down ? 1 : 0);
      p.y += climb * 120 * dt;
      const tx = Math.floor((p.x + p.clingDir * (p.hw + 3)) / TILE);
      const stillWall = isSolidT(gt(L, tx, Math.floor(p.y / TILE)));
      if (!stillWall) { p.clinging = false; }
      else {
        const headFree = !isSolidT(gt(L, tx, Math.floor((p.y - p.hh - 6) / TILE)));
        if (climb < 0 && !headFree) { /* reached the top: hop over */
          p.clinging = false; p.vy = -jumpV * 0.6; p.vx = p.clingDir * 180; p.jumping = true;
        }
        afterMove(dt, inWater);
        return;
      }
    }
  }

  /* ---- spin dash charge (Sonic) ---- */
  if (p.char === 'sonic' && p.onGround && A.down && Math.abs(p.vx) < 70) {
    if (P.jump) { p.dash = Math.min(8, p.dash + 2); sfx('charge'); }
    p.dash = Math.max(0, p.dash - dt * 1.2);
    p.vx *= 0.8;
  } else if (p.dash > 0) {
    if (!A.down) {
      p.vx = p.face * (520 + p.dash * 62); p.roll = true; p.dashing = 0.35; p.dash = 0; sfx('dash');
    } else p.dash = Math.max(0, p.dash - dt * 1.2);
  }
  p.dashing = Math.max(0, p.dashing - dt);

  /* ---- walk / run ---- */
  const dir = (A.left ? -1 : 0) + (A.right ? 1 : 0);
  const superFly = G.super && L.alwaysSuper;
  if (p.onGround) {
    p.flyT = superFly ? 99 : (p.char === 'tails' ? 3.4 : 0);
    p.flying = false; p.gliding = false; p.airUsed = false;
    if (p.roll) {
      if (dir && sign(dir) !== sign(p.vx)) p.vx += dir * acc * 0.22 * dt;
      p.vx -= sign(p.vx) * fric * dt * (Math.abs(p.vx) < 6 ? 0 : 1);
      if (Math.abs(p.vx) < 52 && !A.down) p.roll = false;
      if (Math.abs(p.vx) < 18) { p.roll = false; p.vx = 0; }
    } else if (dir) {
      p.face = dir;
      if (sign(p.vx) && sign(p.vx) !== dir) p.vx += dir * BRAKE * dt;
      else p.vx += dir * acc * dt;
      p.vx = clamp(p.vx, -topSp, topSp);
      if (A.down && Math.abs(p.vx) > 150 && p.char !== 'sonic') p.roll = true;
    } else {
      if (A.down && Math.abs(p.vx) > 150) p.roll = true;
      else {
        const f = fric * dt;
        p.vx = Math.abs(p.vx) <= f ? 0 : p.vx - sign(p.vx) * f;
      }
    }
    if (p.gslope) p.vx += p.gslope * (p.roll ? SLOPE_ROLL : SLOPE_RUN) * dt;
    p.vx = clamp(p.vx, -topSp * 1.9, topSp * 1.9);
  } else {
    if (p.gliding) {
      if (dir) p.face = dir;
      p.vx = p.face * 430;
      if (!A.jump) { p.gliding = false; }
    } else {
      if (dir) { p.face = p.flying || Math.abs(p.vx) < 40 ? dir : p.face; p.vx += dir * AIR_ACC * dt; }
      p.vx = clamp(p.vx, -topSp * 1.1, topSp * 1.1);
      if (dir) p.face = dir;
    }
  }

  /* ---- jumping & air abilities ---- */
  if (P.jump && p.onGround && !(p.char === 'sonic' && A.down)) {
    p.vy = -jumpV; p.onGround = false; p.jumping = true; p.airUsed = false;
    if (p.roll) p.jumping = true;
    sfx('jump');
  } else if (P.jump && !p.onGround && !p.airUsed && !p.flying && !p.gliding) {
    p.airUsed = true;
    if ((p.char === 'tails' || superFly) && p.flyT > 0) { p.flying = true; p.airUsed = false; sfx('fly'); }
    else if (p.char === 'knuckles') { p.gliding = true; p.vy = Math.max(p.vy, 40); sfx('glide'); }
    else if (p.char === 'amy') { p.vy = -jumpV * 0.74; p.attack = 0.3; sfx('hammer'); }
    else { p.vx = p.face * 760; p.vy = Math.min(p.vy, 0) * 0.3 - 80; p.dashing = 0.3; p.jumping = true; sfx('dash'); }
  }
  if (p.flying) {
    if (!superFly) p.flyT -= dt;
    if (A.jump && p.flyT > 0) p.vy = Math.max(p.vy - 1500 * dt, -175);
    if (p.flyT <= 0) { p.flying = false; }
  }
  if (p.jumping && !A.jump && p.vy < -jumpV * 0.45 && !p.flying) p.vy = -jumpV * 0.45;

  /* ---- attack ---- */
  if (P.attack && p.attack <= 0) {
    p.attack = p.char === 'amy' ? 0.3 : 0.24;
    if (p.char === 'sonic' && p.onGround && Math.abs(p.vx) > 60) p.roll = true;
    sfx(p.char === 'amy' ? 'hammer' : 'swipe');
  }

  /* ---- gravity & integrate ---- */
  if (p.gliding) p.vy = Math.min(p.vy + grav * dt, 200);
  else p.vy += grav * dt;
  p.vy = clamp(p.vy, -2000, MAXFALL * (inWater ? 0.45 : 1));

  const rolling = p.roll || p.jumping || p.dashing > 0;
  const wantHh = rolling ? 14 : 19;
  if (wantHh !== p.hh) { p.y += p.hh - wantHh; p.hh = wantHh; }
  p.breaker = rolling || p.attack > 0 || G.super;

  moveEnt(L, p, p.vx * dt, p.vy * dt);

  if (p.onGround) { p.jumping = false; if (p.landed) { p.gliding = false; p.airUsed = false; sfx('land'); } }
  if (p.gliding && p.wall) {
    p.clinging = true; p.clingDir = p.wall; p.gliding = false; p.vy = 0; sfx('cling');
  }
  afterMove(dt, inWater);
}

function afterMove(dt, inWater) {
  const L = G.level, p = G.player;
  /* hazards */
  if (tileOverlap(L, p, isHurtT)) { hurtPlayer(true); }
  /* out of the world */
  if (p.y - p.hh > L.worldH + 40) killPlayer('pit');
  if (p.x < p.hw) { p.x = p.hw; p.vx = Math.max(0, p.vx); }
  if (p.x > L.worldW - p.hw) { p.x = L.worldW - p.hw; p.vx = Math.min(0, p.vx); }
  if (inWater && Math.abs(p.vx) > 30 && Math.random() < 0.2)
    puff(p.x, p.y + p.hh - 4, '#bfe9ff', 1);
}

function hurtPlayer(bounce) {
  const p = G.player;
  if (!p || p.dead || p.inv > 0 || p.invinc > 0 || G.super) return;
  if (p.shield) {
    p.shield = false; p.inv = 1.5; sfx('shield');
    puff(p.x, p.y, '#4fd0ff', 14);
    if (bounce) { p.vy = -340; p.onGround = false; }
    return;
  }
  if (G.rings > 0) {
    scatterRings(Math.min(G.rings, 24));
    G.rings = 0;
    p.inv = 2.0; p.hurtT = 0.45; p.vy = -330; p.vx = -p.face * 150; p.onGround = false;
    p.roll = false; p.jumping = false; p.flying = false; p.gliding = false; p.clinging = false;
    sfx('hurt'); G.shake = 10;
    return;
  }
  killPlayer('hit');
}
function killPlayer(why) {
  const p = G.player;
  if (!p || p.dead) return;
  p.dead = true; p.vy = -520; p.vx = 0; p.deadT = 0;
  G.deathWhy = why || 'hit'; G.deathAt = Math.round(p.x / TILE);
  G.shake = 14; sfx('die');
  G.scene = 'dying'; G.dyingT = 0;
}
function scatterRings(n) {
  const p = G.player;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random();
    G.level.ents.push({
      kind:'ring', x:p.x, y:p.y, hw:10, hh:10, dead:false, t:0, loose:1.1,
      vx: Math.cos(a) * (120 + Math.random() * 150), vy: Math.sin(a) * (120 + Math.random() * 150) - 160
    });
  }
}

/* ======================= particles, sound, feedback ====================== */
function puff(x, y, col, n) {
  for (let i = 0; i < n; i++) G.parts.push({
    x, y, col, life: 0.3 + Math.random() * 0.5, size: 2 + Math.random() * 4,
    vx: (Math.random() - .5) * 260, vy: (Math.random() - .5) * 260 - 40
  });
  if (G.parts.length > 420) G.parts.splice(0, G.parts.length - 420);
}
function toast(msg, secs) { G.toast = msg; G.toastT = secs || 2; }

let AC = null, acFailed = false;
function sfx(name) {
  if (G.mute || acFailed) return;
  try {
    const Ctor = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
    if (!Ctor) { acFailed = true; return; }
    if (!AC) AC = new Ctor();
    if (AC.state === 'suspended' && AC.resume) AC.resume();
    const S = {
      jump:[520,760,.09,'square',.05], land:[180,120,.05,'sine',.03],
      ring:[1180,1760,.09,'triangle',.05], hurt:[300,90,.25,'sawtooth',.07],
      die:[420,70,.6,'sawtooth',.08], dash:[300,920,.18,'square',.06],
      charge:[260,540,.07,'square',.04], fly:[620,700,.07,'sine',.03],
      glide:[400,330,.14,'sine',.04], cling:[220,260,.08,'square',.04],
      hammer:[180,420,.12,'square',.06], swipe:[700,380,.08,'triangle',.04],
      smash:[220,80,.16,'sawtooth',.06], bump:[880,1320,.1,'square',.05],
      spring:[420,1180,.16,'square',.06], box:[640,980,.12,'square',.05],
      shield:[700,1240,.2,'triangle',.05], hit:[900,300,.14,'square',.06],
      boss:[120,70,.4,'sawtooth',.08], win:[700,1400,.45,'triangle',.06],
      emerald:[900,1800,.5,'sine',.06], check:[860,1300,.18,'triangle',.05],
      shot:[520,220,.1,'sawtooth',.04], life:[700,1500,.4,'square',.05]
    }[name];
    if (!S) return;
    const t0 = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
    o.type = S[3]; o.frequency.setValueAtTime(S[0], t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(40, S[1]), t0 + S[2]);
    g.gain.setValueAtTime(S[4], t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + S[2]);
    o.connect(g); g.connect(AC.destination); o.start(t0); o.stop(t0 + S[2] + .02);
  } catch (e) { acFailed = true; }
}

const hits = (a, b) => Math.abs(a.x - b.x) < a.hw + b.hw && Math.abs(a.y - b.y) < a.hh + b.hh;
function attackBox(p) {
  if (p.attack <= 0) return null;
  const reach = p.char === 'amy' ? 26 : 20;
  return { x: p.x + p.face * reach, y: p.y, hw: p.char === 'amy' ? 24 : 18, hh: 20 };
}

/* ============================== entity logic ============================= */
function killBadnik(e) {
  e.dead = true; G.kills++; G.score += 100;
  puff(e.x, e.y, '#ffd24a', 12); puff(e.x, e.y, '#ff6a3d', 8);
  sfx('hit');
  G.level.ents.push({ kind:'animal', x:e.x, y:e.y - 4, hw:9, hh:9, dead:false, t:0,
    vx: (Math.random() < .5 ? -1 : 1) * (90 + Math.random() * 70), vy: -330,
    sort: Math.floor(Math.random() * 3) });
  if (Math.random() < 0.18) G.level.ents.push({ kind:'ring', x:e.x, y:e.y, hw:10, hh:10, dead:false, t:0, loose:1.2, vx:0, vy:-200 });
}
function shoot(x, y, vx, vy) {
  G.level.ents.push({ kind:'shot', x, y, vx, vy, hw:7, hh:7, dead:false, t:0 });
  sfx('shot');
}
function giveItem(item) {
  const p = G.player;
  if (item === 'rings') {
    G.rings += 10; G.ringsGot += 10; G.score += 100; sfx('ring'); toast('+10 RINGS', 1.1);
    const L = G.level;
    if (L.type === 'rings' && G.ringsGot >= L.need && G.ringsGot - 10 < L.need) {
      sfx('emerald'); toast('GOAL OPEN - RUN FOR IT!', 2);
    }
  }
  else if (item === 'shield') { p.shield = true; sfx('shield'); toast('SHIELD', 1.1); }
  else if (item === 'speed') { p.speedUp = 12; sfx('dash'); toast('SPEED UP', 1.1); }
  else if (item === 'invinc') { p.invinc = 11; sfx('shield'); toast('INVINCIBLE', 1.1); }
  else if (item === 'life') { G.lives++; save.lives = G.lives; writeSave(); sfx('life'); toast('EXTRA LIFE', 1.3); }
}

function updateEnts(dt) {
  const L = G.level, p = G.player, ents = L.ents;
  const ab = attackBox(p);
  const spin = playerSpin(p);
  for (let i = ents.length - 1; i >= 0; i--) {
    const e = ents[i];
    if (e.dead) { ents.splice(i, 1); continue; }
    e.t += dt;
    const near = Math.abs(e.x - p.x) < LOGW * 1.2 && Math.abs(e.y - p.y) < LOGH * 1.4;

    switch (e.kind) {

      case 'ring': {
        if (e.loose) {
          e.loose -= dt;
          e.vy += 1500 * dt;
          e.x += e.vx * dt; e.y += e.vy * dt;
          const ft = gt(L, Math.floor(e.x / TILE), Math.floor((e.y + 9) / TILE));
          if (e.vy > 0 && (isSolidT(ft) || isSlopeT(ft) || ft === T.PLAT)) {
            e.y = Math.floor((e.y + 9) / TILE) * TILE - 9; e.vy *= -0.45; e.vx *= 0.7;
          }
          if (e.loose <= 0 || e.y > L.worldH) { e.dead = true; continue; }
          if (e.loose > 0.78) break;        // a moment of grace before they can be re-grabbed
        }
        if (hits(e, p)) {
          e.dead = true; G.rings++; G.ringsGot++; G.score += 10; sfx('ring');
          if (L.type === 'rings' && G.ringsGot === L.need) {
            sfx('emerald'); toast('GOAL OPEN - RUN FOR IT!', 2);
          }
          if (G.rings >= G.nextLife) {
            G.nextLife += 100; G.lives++; save.lives = G.lives; writeSave();
            sfx('life'); toast(G.rings + ' RINGS - EXTRA LIFE!', 1.6);
          }
        }
        break;
      }

      case 'monitor': {
        if (hits(e, p) && (spin || (ab && hits(e, ab)))) {
          e.dead = true; sfx('box'); puff(e.x, e.y, '#dfe9f2', 12);
          if (p.vy > 0 && !p.onGround) p.vy = -300;
          giveItem(e.item);
        }
        break;
      }

      case 'spring': {
        if (hits(e, p)) {
          if (e.dir === 0) { p.vy = -e.power; p.y = e.y - e.hh - p.hh; }
          else { p.vy = -e.power * 0.72; p.vx = (e.dirX || 1) * 520; }
          p.onGround = false; p.jumping = true; p.airUsed = false; p.roll = false;
          e.squash = 0.18; sfx('spring'); G.score += 10;
        }
        if (e.squash) e.squash = Math.max(0, e.squash - dt);
        break;
      }

      case 'bumper': {
        if (hits(e, p)) {
          const a = Math.atan2(p.y - e.y, p.x - e.x);
          p.vx = Math.cos(a) * 560; p.vy = Math.sin(a) * 560 - 120;
          p.onGround = false; G.score += 10; e.flash = .2; sfx('bump');
        }
        if (e.flash) e.flash = Math.max(0, e.flash - dt);
        break;
      }

      case 'checkpoint': {
        if (!e.lit && hits(e, p)) {
          e.lit = true; sfx('check'); toast('CHECKPOINT', 1.1);
          L.respawn = { x: e.x, y: e.y - 10 };
          G.score += 50;
        }
        break;
      }

      case 'emerald': {
        e.y = e.oy + Math.sin(e.t * 2) * 10;
        if (hits(e, p)) {
          e.dead = true; sfx('emerald');
          if (save.emeralds.indexOf(e.idx) < 0) { save.emeralds.push(e.idx); writeSave(); }
          toast('CHAOS EMERALD ' + (save.emeralds.length) + '/7', 2.2);
          G.score += 1000;
          puff(e.x, e.y, EMCOL[e.idx], 30);
        }
        break;
      }

      case 'goal': {
        e.spin += dt * 3;
        if (hits(e, p) && G.scene === 'play') tryFinish();
        break;
      }

      case 'shot': {
        e.x += e.vx * dt; e.y += e.vy * dt;
        if (e.t > 4 || isSolidT(gt(L, Math.floor(e.x / TILE), Math.floor(e.y / TILE)))) { e.dead = true; break; }
        if (hits(e, p)) { e.dead = true; hurtPlayer(true); }
        break;
      }

      case 'animal': {
        e.vy += 1800 * dt;
        e.x += e.vx * dt; e.y += e.vy * dt;
        const ft = gt(L, Math.floor(e.x / TILE), Math.floor((e.y + 10) / TILE));
        if (e.vy > 0 && (isSolidT(ft) || isSlopeT(ft) || ft === T.PLAT)) {
          e.y = Math.floor((e.y + 10) / TILE) * TILE - 10;
          e.vy = -300; e.hop = (e.hop || 0) + 1;
        }
        if (e.t > 4.5 || e.y > L.worldH) e.dead = true;
        break;
      }

      case 'badnik': {
        if (!near) break;
        updateBadnik(e, dt, p);
        const body = { x:e.x, y:e.y, hw:e.hw, hh:e.hh };
        if (ab && hits(body, ab)) { killBadnik(e); break; }
        if (hits(body, p)) {
          if (spin || G.super) {                 /* a Super hero smashes badniks just by touching them */
            killBadnik(e);
            if (!p.onGround && p.vy > -50 && !G.super) { p.vy = -420; p.airUsed = false; }
          } else hurtPlayer(true);
        }
        break;
      }

      case 'boss': updateBoss(e, dt, p, ab, spin); break;
    }
  }
}

function groundUnder(L, e, dir) {
  const tx = Math.floor((e.x + dir * (e.hw + 6)) / TILE);
  const ty = Math.floor((e.y + e.hh + 6) / TILE);
  const t = gt(L, tx, ty);
  return isSolidT(t) || isSlopeT(t) || t === T.PLAT;
}
function wallAhead(L, e, dir) {
  const tx = Math.floor((e.x + dir * (e.hw + 4)) / TILE);
  return isSolidT(gt(L, tx, Math.floor(e.y / TILE)));
}

function updateBadnik(e, dt, p) {
  const L = G.level;
  const dx = p.x - e.x, dy = p.y - e.y, dist = Math.hypot(dx, dy);
  switch (e.ai) {
    case 'walk':
      if (!groundUnder(L, e, e.dir) || wallAhead(L, e, e.dir)) e.dir = -e.dir;
      e.x += e.dir * e.sp * dt;
      break;
    case 'walkshoot':
      if (e.t % 4 < 2.4) {
        if (!groundUnder(L, e, e.dir) || wallAhead(L, e, e.dir)) e.dir = -e.dir;
        e.x += e.dir * e.sp * dt;
      }
      e.fire -= dt;
      if (e.fire <= 0 && dist < 440) {
        e.fire = 2.0 + Math.random();
        shoot(e.x + sign(dx) * 18, e.y - 4, sign(dx) * 230, -90);
      }
      break;
    case 'hover':
      e.y = e.homeY - 70 + Math.sin(e.t * 2) * 22;
      e.x = e.home + Math.sin(e.t * 0.9) * 96;
      e.dir = Math.cos(e.t * 0.9) > 0 ? 1 : -1;
      e.fire -= dt;
      if (e.fire <= 0 && Math.abs(dx) < 120 && dy > 0 && dy < 300) { e.fire = 2.2; shoot(e.x, e.y + 14, 0, 300); }
      break;
    case 'chase':
      if (dist < 360) { e.x += (dx / dist) * e.sp * dt; e.y += (dy / dist) * e.sp * dt * .8; e.dir = sign(dx) || 1; }
      else { e.x = e.home + Math.sin(e.t) * 40; e.y = e.homeY - 52 + Math.cos(e.t * 1.6) * 16; }
      break;
    case 'orbit':
      e.x = e.home + Math.sin(e.t * 0.7) * 60;
      e.y = e.homeY - 58 + Math.cos(e.t * 0.9) * 20;
      break;
    case 'pop':
      e.ph = (e.ph || 0) + dt;
      if (e.ph > 2.0) { e.ph = 0; e.vy = -620; }
      e.vy = (e.vy || 0) + 1700 * dt;
      e.y = Math.min(e.homeY, e.y + e.vy * dt);
      if (e.y >= e.homeY) { e.y = e.homeY; e.vy = 0; }
      break;
    case 'charge':
      if (dist < 420 && Math.abs(dy) < 70) {
        e.dir = sign(dx) || e.dir;
        if (groundUnder(L, e, e.dir) && !wallAhead(L, e, e.dir)) e.x += e.dir * e.sp * dt;
        e.spin = (e.spin || 0) + dt * 14;
      } else {
        if (!groundUnder(L, e, e.dir) || wallAhead(L, e, e.dir)) e.dir = -e.dir;
        e.x += e.dir * e.sp * 0.25 * dt;
        e.spin = (e.spin || 0) + dt * 3;
      }
      break;
    case 'leap':
      e.ph = (e.ph || 0) + dt;
      if (e.ph > 1.9) { e.ph = 0; e.vy = -720; }
      e.vy = (e.vy || 0) + 1800 * dt;
      e.y = Math.min(e.homeY, e.y + e.vy * dt);
      if (e.y >= e.homeY) { e.y = e.homeY; e.vy = 0; }
      break;
  }
}

/* --------------------------- the Egg Colossus ---------------------------- */
function updateColossus(b, dt, p, ab, spin) {
  const L = G.level;
  b.inv = Math.max(0, (b.inv || 0) - dt);
  if (b.dying) {
    b.dying += dt;
    G.shake = Math.max(G.shake, 7);
    if (Math.random() < .8) puff(b.x + (Math.random() - .5) * 180, b.y + (Math.random() - .5) * 210,
      Math.random() < .5 ? '#ffd24a' : '#ff5a2a', 9);
    if (b.dying > 2.6 && G.scene === 'play') tryFinish(true);
    return;
  }
  const arenaL = 3 * TILE, arenaR = L.worldW - 3 * TILE;
  b.y = b.floorY - b.hh;                       // it never leaves the deck
  b.step = (b.step || 0) + dt;
  const ph = b.hp > b.maxhp * 0.66 ? 0 : b.hp > b.maxhp * 0.33 ? 1 : 2;
  if (ph !== b.phase) {
    b.phase = ph; b.cool = 1.2; G.shake = 20; sfx('boss');
    toast(ph === 1 ? 'ARMOUR CRACKING!' : 'CORE EXPOSED - FINISH IT!', 2);
  }
  b.cool -= dt;

  if (ph === 0) {                              /* tracks you and stomps */
    b.x += sign(p.x - b.x) * 80 * dt;
    if (b.cool <= 0) {
      b.cool = 2.3; G.shake = 16; sfx('boss');
      puff(b.x, b.floorY - 8, '#cfd8e6', 18);
      for (let i = -1; i <= 1; i += 2) shoot(b.x + i * 74, b.floorY - 22, i * 250, -150);
    }
  } else if (ph === 1) {                       /* arm cannons: a spread of bolts */
    b.x += sign(p.x - b.x) * 125 * dt;
    if (b.cool <= 0) {
      b.cool = 1.6; sfx('shot');
      for (let i = -2; i <= 2; i++) shoot(b.x, b.y - 6, i * 95, 235);
    }
  } else {                                     /* desperate charge across the deck */
    b.x += b.dir * 285 * dt;
    if (b.x <= arenaL + 115) { b.dir = 1; G.shake = 14; sfx('boss'); }
    if (b.x >= arenaR - 115) { b.dir = -1; G.shake = 14; sfx('boss'); }
    if (b.cool <= 0) {
      b.cool = 1.1; sfx('shot');
      const a = Math.atan2(p.y - b.y, p.x - b.x);
      shoot(b.x, b.y, Math.cos(a) * 310, Math.sin(a) * 310);
    }
  }
  b.x = clamp(b.x, arenaL + 115, arenaR - 115);

  /* the cockpit is the weak spot, and it sits one Super jump above the deck */
  const weak = { x: b.x, y: b.floorY - 168, hw: 52, hh: 40 };
  b.weak = weak;
  if (b.inv <= 0 && ((ab && hits(weak, ab)) || (spin && hits(weak, p)))) {
    b.hp--; b.inv = 0.75; G.score += 400; G.shake = 16; sfx('boss');
    puff(weak.x, weak.y, '#ffd24a', 24);
    if (!p.onGround) { p.vy = -470; p.airUsed = false; }
    if (b.hp <= 0) { b.dying = 0.001; G.shake = 26; sfx('win'); toast('THE COLOSSUS IS FALLING!', 2.4); }
    return;
  }
  const body = { x:b.x, y:b.y, hw:b.hw * 0.78, hh:b.hh };
  if (b.inv <= 0 && hits(body, p) && !G.super) hurtPlayer(true);
}

/* -------------------------------- bosses --------------------------------- */
function updateBoss(b, dt, p, ab, spin) {
  if (b.colossus) { updateColossus(b, dt, p, ab, spin); return; }
  const L = G.level;
  b.inv = Math.max(0, (b.inv || 0) - dt);
  if (b.dying) {
    b.dying += dt;
    b.x += Math.sin(b.dying * 20) * 2;
    if (Math.random() < .4) puff(b.x + (Math.random() - .5) * 80, b.y + (Math.random() - .5) * 50, Math.random() < .5 ? '#ffd24a' : '#ff5a2a', 6);
    if (b.dying > 1.7 && G.scene === 'play') tryFinish(true);
    return;
  }
  const arenaL = 3 * TILE, arenaR = L.worldW - 3 * TILE;
  const pat = b.final ? (b.hp > b.maxhp * 0.6 ? 1 : b.hp > b.maxhp * 0.3 ? 3 : 0) : b.pattern;
  b.cool = (b.cool || 0) - dt;

  if (pat === 0) {                                   /* hover & bomb */
    b.x += b.dir * 150 * dt;
    if (b.x < arenaL + 60) { b.x = arenaL + 60; b.dir = 1; }
    if (b.x > arenaR - 60) { b.x = arenaR - 60; b.dir = -1; }
    const dip = (b.t % 6 > 4.4) ? 1 : 0;
    b.y = lerp(b.y, b.floorY - (dip ? 86 : 152) + Math.sin(b.t * 2) * 9, 1 - Math.pow(0.001, dt));
    if (b.cool <= 0) { b.cool = 1.7; shoot(b.x, b.y + 30, (Math.random() - .5) * 60, 240); }
  } else if (pat === 1) {                            /* ground charger */
    b.y = b.floorY - 34;
    const sp = 230 + b.zone * 5;
    b.x += b.dir * sp * dt;
    if (b.x < arenaL + 50) { b.x = arenaL + 50; b.dir = 1; sfx('boss'); G.shake = 6; }
    if (b.x > arenaR - 50) { b.x = arenaR - 50; b.dir = -1; sfx('boss'); G.shake = 6; }
    if (b.cool <= 0 && Math.abs(p.x - b.x) < 300) { b.cool = 2.4; shoot(b.x + b.dir * 40, b.y - 10, b.dir * 300, -60); }
  } else if (pat === 2) {                            /* driller: burrow & pop */
    b.ph = (b.ph || 0) + dt;
    if (!b.state) { b.state = 'up'; b.ph = 0; }
    if (b.state === 'up') {
      b.y = lerp(b.y, b.floorY - 120, 1 - Math.pow(0.004, dt));
      if (b.ph > 3) { b.state = 'down'; b.ph = 0; }
    } else {
      b.y = lerp(b.y, b.floorY + 60, 1 - Math.pow(0.004, dt));
      if (b.ph > 1.6) {
        b.state = 'up'; b.ph = 0;
        b.x = clamp(p.x + (Math.random() - .5) * 240, arenaL + 60, arenaR - 60);
        G.shake = 8; sfx('boss');
      }
    }
    if (b.state === 'up' && b.cool <= 0) { b.cool = 1.5; shoot(b.x, b.y, sign(p.x - b.x) * 260, 0); }
  } else if (pat === 3) {                            /* flyer with missiles */
    const cx = (arenaL + arenaR) / 2, rad = (arenaR - arenaL) / 2 - 70;
    b.x = cx + Math.sin(b.t * 0.8) * rad;
    b.y = b.floorY - 150 + Math.sin(b.t * 1.6) * 54;
    b.dir = Math.cos(b.t * 0.8) > 0 ? 1 : -1;
    if (b.cool <= 0) {
      b.cool = 1.5;
      const a = Math.atan2(p.y - b.y, p.x - b.x);
      shoot(b.x, b.y + 20, Math.cos(a) * 280, Math.sin(a) * 280);
    }
  } else {                                           /* stomper: hover, then slam */
    b.st = b.st || 'hover'; b.ph = (b.ph || 0) + dt;
    if (b.st === 'hover') {
      b.x = lerp(b.x, clamp(p.x, arenaL + 80, arenaR - 80), 1 - Math.pow(0.3, dt));
      b.y = lerp(b.y, b.floorY - 150 + Math.sin(b.t * 1.6) * 12, 1 - Math.pow(0.002, dt));
      if (b.ph > 3.4) { b.st = 'drop'; b.ph = 0; sfx('boss'); }
    } else if (b.st === 'drop') {
      b.vy = (b.vy || 0) + 2600 * dt;
      b.y += b.vy * dt;
      if (b.y > b.floorY - b.hh - 2) {
        b.y = b.floorY - b.hh - 2; b.vy = 0; b.st = 'rest'; b.ph = 0;
        G.shake = 20; sfx('boss');
        for (let i = -1; i <= 1; i += 2) {
          puff(b.x + i * 60, b.floorY - 10, '#cfd8e6', 12);
          shoot(b.x + i * 50, b.floorY - 18, i * 300, -120);
        }
      }
    } else {
      if (b.ph > 1.3) { b.st = 'hover'; b.ph = 0; b.vy = 0; }
    }
  }

  /* Damage exchange. The box that lets YOU hit the boss is deliberately bigger
     than the box that lets the boss hit you. */
  const body = { x:b.x, y:b.y, hw:b.hw, hh:b.hh };
  const weak = { x:b.x, y:b.y, hw:b.hw + 6, hh:b.hh + 15 };
  const hitByAttack = ab && hits(weak, ab);
  const touching = hits(body, p);
  if (b.inv <= 0 && (hitByAttack || (spin && hits(weak, p)))) {
    b.hp--; b.inv = 1.0; G.score += 200; G.shake = 12; sfx('boss');
    puff(b.x, b.y, '#ffd24a', 20);
    if (!p.onGround) { p.vy = -430; p.airUsed = false; }
    if (b.hp <= 0) { b.dying = 0.001; G.shake = 20; }
  } else if (b.inv <= 0 && touching) hurtPlayer(true);
}

/* ------------------------------ siege logic ------------------------------ */
/* Boss and siege arenas regrow rings: in a long fight there is always something
   on the floor to pick up and heal with. */
function arenaRings(dt) {
  const L = G.level;
  if (!L.arena) return;
  G.ringT = (G.ringT || 0) - dt;
  if (G.ringT > 0) return;
  G.ringT = 7;
  let live = 0;
  for (const e of L.ents) if (e.kind === 'ring' && !e.dead) live++;
  if (live >= 6) return;
  const row = (L.floorRow || L.h - 5) - 1;
  const tx = 4 + Math.floor(Math.random() * Math.max(1, L.w - 12));
  ringRow(L, tx, row, 6);
  puff(tx * TILE + 96, row * TILE + 16, '#ffd24a', 8);
}
function updateSiege(dt) {
  const L = G.level;
  arenaRings(dt);
  if (L.surviveFor) {
    G.spawnT -= dt;
    const live = L.ents.filter(e => e.kind === 'badnik').length;
    if (G.spawnT <= 0 && live < 9) {
      G.spawnT = Math.max(0.8, 2.2 - L.D.zone * 0.06);
      const Z = L.Z, type = Z.mix[Math.floor(Math.random() * Z.mix.length)];
      const left = Math.random() < .5;
      addBadnik(L, type, left ? 3 : L.w - 4, L.spawnerFloor, Math.random);
      G.waveN++;
    }
  }
}

/* --------------------------- level flow / scoring ------------------------ */
const EMCOL = ['#3ddc84','#4fa8ff','#ff5a7a','#ffd24a','#9d7dff','#ff8a3d','#4ff0ff'];

function goalOpen(L) {
  /* The quota counts rings COLLECTED during the level, not rings still in hand -
     losing your rings to a badnik must never lock you out of the goal. */
  return L.type !== 'rings' || G.ringsGot >= L.need;
}
function tryFinish(fromBoss) {
  const L = G.level;
  if (!goalOpen(L) && !fromBoss) {
    if (!G.needWarn || G.t - G.needWarn > 1.4) {
      G.needWarn = G.t;
      toast('GOAL LOCKED - FIND ' + (L.need - G.ringsGot) + ' MORE RINGS!', 1.6);
      sfx('box');
    }
    return;
  }
  if (L.type === 'boss' && !fromBoss) return;
  winLevel();
}

function winLevel() {
  if (G.scene !== 'play') return;
  const L = G.level, D = L.D;
  G.scene = 'win'; G.won = true; sfx('win');
  let timeBonus = Math.max(0, 5000 - Math.round(G.elapsed * 40));
  if (L.target && G.elapsed <= L.target) timeBonus += 5000;
  G.timeBonus = timeBonus;
  G.ringBonus = G.rings * 100;
  G.score += timeBonus + G.ringBonus;
  const first = !save.cleared[D.id];
  save.cleared[D.id] = 1;
  const b = save.best[D.id];
  if (!b || G.elapsed < b) save.best[D.id] = Math.round(G.elapsed * 10) / 10;
  if (!save.rings[D.id] || G.rings > save.rings[D.id]) save.rings[D.id] = G.rings;
  if (first && D.branch) save.medals = (save.medals || 0) + 1;
  save.lives = G.lives;
  writeSave();
  G.firstClear = first;
  renderSaveBar();
  if (save.emeralds.length >= 7 && !save.superSeen) { save.superSeen = 1; writeSave(); }
  renderWin();
}

function prepareLevel(idx, silent) {
  G.idx = idx;
  const L = buildLevel(idx);
  G.level = L;
  G.char = save.char;
  G.player = makePlayer(G.char, L);
  G.rings = 0; G.ringsGot = 0; G.kills = 0; G.score = 0;
  G.elapsed = 0; G.won = false; G.parts = []; G.toast = ''; G.toastT = 0;
  G.shake = 0; G.frames = 0; G.needWarn = 0;
  G.super = !!L.alwaysSuper; G.spawnT = 1.2; G.waveN = 0; G.targetGone = false; G.ringT = 7;
  G.lives = save.lives || 5;
  G.nextLife = 100;
  L.respawn = null;
  G.cam.x = clamp(G.player.x - LOGW / 2, 0, Math.max(0, L.worldW - LOGW));
  G.cam.y = clamp(G.player.y - LOGH * 0.55, 0, Math.max(0, L.worldH - LOGH));
  if (!silent) renderHUDStatic();
  return L;
}
function beginPlay() { G.scene = 'play'; G.t = 0; showScreen(null); }

function respawnOrOver() {
  const L = G.level;
  G.lives--;
  save.lives = Math.max(0, G.lives); writeSave();
  if (G.lives > 0 && L.respawn) {
    const p = G.player = makePlayer(G.char, L);
    p.x = L.respawn.x; p.y = L.respawn.y;
    G.rings = 0; G.scene = 'play';
    for (const e of L.ents) if (e.kind === 'shot') e.dead = true;
    toast('TRY AGAIN!', 1.2);
  } else {
    G.scene = 'over';
    if (G.lives <= 0) { G.lives = 5; save.lives = 5; writeSave(); }
    renderOver();
  }
}

/* ============================== rendering =============================== */
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
let DPR = 1;
function sizeCanvas() {
  DPR = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  cv.width = Math.round(LOGW * DPR); cv.height = Math.round(LOGH * DPR);
}
sizeCanvas();

function rr(x, y, w, h, r) {
  ctx.beginPath();
  const rad = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y); ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad); ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad); ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}
function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.closePath(); }
function fillC(c) { ctx.fillStyle = c; ctx.fill(); }

/* ------------------------------ background ------------------------------- */
function drawBackground(L) {
  const Z = L.Z, P = Z.pal, cam = G.cam;
  const g = ctx.createLinearGradient(0, 0, 0, LOGH);
  g.addColorStop(0, P.sky1); g.addColorStop(1, P.sky2);
  ctx.fillStyle = g; ctx.fillRect(0, 0, LOGW, LOGH);

  if (Z.night) {
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    for (let i = 0; i < 70; i++) {
      const sx = (i * 137.5 % LOGW + LOGW - (cam.x * 0.06 % LOGW)) % LOGW;
      const sy = (i * 83.3) % (LOGH * 0.7);
      ctx.fillRect(sx, sy, i % 7 === 0 ? 2 : 1, i % 7 === 0 ? 2 : 1);
    }
  } else {
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    circle(LOGW - 140 - (cam.x * 0.02 % 60), 90, 38); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.4)';
    for (let i = 0; i < 5; i++) {
      const cx = ((i * 420 - cam.x * 0.12) % (LOGW + 400) + LOGW + 400) % (LOGW + 400) - 200;
      const cy = 60 + (i % 3) * 46;
      circle(cx, cy, 26); ctx.fill(); circle(cx + 26, cy + 6, 20); ctx.fill(); circle(cx - 24, cy + 8, 17); ctx.fill();
    }
  }

  /* theme-specific middle layer */
  const th = Z.th;
  if (th === 'city' || th === 'mecha' || th === 'final') {
    for (let i = 0; i < 26; i++) {
      const bw = 60 + (i % 4) * 26;
      const bx = ((i * 150 - cam.x * 0.3) % 3900 + 3900) % 3900 - 300;
      const bh = 120 + ((i * 73) % 220);
      ctx.fillStyle = i % 2 ? P.far : P.hill;
      ctx.fillRect(bx, LOGH - bh, bw, bh);
      ctx.fillStyle = 'rgba(255,225,120,.35)';
      for (let wy = LOGH - bh + 14; wy < LOGH - 20; wy += 22)
        for (let wx = bx + 8; wx < bx + bw - 10; wx += 18)
          if ((wx * wy) % 7 < 3) ctx.fillRect(wx, wy, 7, 9);
    }
  } else if (th === 'doomsday') {
    const ex = LOGW * 0.68 - ((cam.x * 0.04) % 160), ey = 140;
    ctx.fillStyle = '#5a6270'; circle(ex, ey, 118); ctx.fill();
    ctx.fillStyle = '#434b58'; circle(ex - 26, ey + 20, 96); ctx.fill();
    ctx.fillStyle = '#d8dde6'; circle(ex, ey, 48); ctx.fill();
    ctx.fillStyle = '#f0c8a0'; circle(ex, ey + 5, 31); ctx.fill();
    ctx.fillStyle = '#d8322f'; rr(ex - 35, ey - 17, 70, 15, 6); ctx.fill();
    ctx.fillStyle = '#2f3a4a'; ctx.fillRect(ex - 23, ey + 9, 46, 9);
    ctx.fillStyle = 'rgba(255,61,90,.5)';
    for (let i = 0; i < 9; i++) {
      const dx = ((i * 230 - cam.x * 0.22) % 2300 + 2300) % 2300 - 300;
      ctx.fillRect(dx, 70 + (i % 5) * 74, 26 + (i % 3) * 14, 7);
    }
  } else if (th === 'space' || th === 'rift') {
    for (let i = 0; i < 4; i++) {
      const px = ((i * 520 - cam.x * 0.08) % 2400 + 2400) % 2400 - 300;
      const py = 90 + (i % 3) * 70, pr = 34 + (i % 3) * 22;
      ctx.globalAlpha = .55; circle(px, py, pr); fillC(i % 2 ? P.hill : P.acc);
      ctx.globalAlpha = 1;
    }
  } else {
    for (let layer = 0; layer < 2; layer++) {
      const par = layer ? 0.42 : 0.2, amp = layer ? 70 : 48, base = LOGH - (layer ? 60 : 150);
      ctx.fillStyle = layer ? P.hill : P.far;
      ctx.beginPath(); ctx.moveTo(0, LOGH);
      for (let sx = 0; sx <= LOGW; sx += 16) {
        const wx = sx + cam.x * par;
        ctx.lineTo(sx, base - Math.sin(wx / (layer ? 260 : 420)) * amp - Math.sin(wx / 97) * 12);
      }
      ctx.lineTo(LOGW, LOGH); ctx.closePath(); ctx.fill();
    }
    if (th === 'jungle') {
      for (let i = 0; i < 14; i++) {
        const tx = ((i * 230 - cam.x * 0.42) % 3200 + 3200) % 3200 - 200;
        ctx.fillStyle = 'rgba(0,0,0,.18)';
        ctx.fillRect(tx, LOGH - 210, 14, 210);
        circle(tx + 7, LOGH - 215, 42); ctx.fill();
      }
    }
    if (th === 'casino' || th === 'carnival') {
      for (let i = 0; i < 18; i++) {
        const nx = ((i * 180 - cam.x * 0.35) % 3400 + 3400) % 3400 - 200;
        const on = (Math.floor(G.t * 3) + i) % 3;
        ctx.globalAlpha = on ? .8 : .25;
        circle(nx, 120 + (i % 4) * 54, 9); fillC(i % 2 ? P.acc : P.g1);
        ctx.globalAlpha = 1;
      }
    }
  }
}

/* -------------------------------- tiles ---------------------------------- */
function hazColour(look, phase) {
  if (look === 'lava') return phase ? '#ff8a1f' : '#d83a0a';
  if (look === 'acid') return phase ? '#b4ff4a' : '#49a832';
  if (look === 'water') return phase ? '#49b8ff' : '#1f5aa8';
  return phase ? '#cfd8e6' : '#8a94a8';
}
function drawTiles(L) {
  const P = L.Z.pal, cam = G.cam;
  const x0 = Math.max(0, Math.floor(cam.x / TILE) - 1), x1 = Math.min(L.w - 1, Math.ceil((cam.x + LOGW) / TILE));
  const y0 = Math.max(0, Math.floor(cam.y / TILE) - 1), y1 = Math.min(L.h - 1, Math.ceil((cam.y + LOGH) / TILE));
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const t = L.tiles[ty * L.w + tx];
    if (!t) continue;
    const X = tx * TILE - cam.x, Y = ty * TILE - cam.y;
    const openAbove = !L.tiles[(ty - 1) * L.w + tx] || ty === 0;
    switch (t) {
      case T.SOLID: case T.ICE: {
        ctx.fillStyle = t === T.ICE ? '#bfe9ff' : P.dirt;
        ctx.fillRect(X, Y, TILE, TILE);
        ctx.fillStyle = t === T.ICE ? 'rgba(255,255,255,.35)' : P.dirt2;
        if ((tx + ty) % 2) ctx.fillRect(X, Y, TILE, TILE);
        if (openAbove && ty > 0) {
          ctx.fillStyle = t === T.ICE ? '#eaffff' : P.g1;
          ctx.fillRect(X, Y, TILE, 9);
          ctx.fillStyle = t === T.ICE ? '#9fd8f2' : P.g2;
          ctx.fillRect(X, Y + 9, TILE, 4);
        }
        break;
      }
      case T.PLAT:
        ctx.fillStyle = P.g2; rr(X, Y, TILE, 12, 4); ctx.fill();
        ctx.fillStyle = P.g1; ctx.fillRect(X + 1, Y + 1, TILE - 2, 4);
        break;
      case T.SLU: case T.SLD: {
        ctx.beginPath();
        if (t === T.SLU) { ctx.moveTo(X, Y + TILE); ctx.lineTo(X + TILE, Y); ctx.lineTo(X + TILE, Y + TILE); }
        else { ctx.moveTo(X, Y); ctx.lineTo(X + TILE, Y + TILE); ctx.lineTo(X, Y + TILE); }
        ctx.closePath(); fillC(P.dirt);
        ctx.lineWidth = 7; ctx.strokeStyle = P.g1;
        ctx.beginPath();
        if (t === T.SLU) { ctx.moveTo(X, Y + TILE); ctx.lineTo(X + TILE, Y); }
        else { ctx.moveTo(X, Y); ctx.lineTo(X + TILE, Y + TILE); }
        ctx.stroke(); ctx.lineWidth = 1;
        break;
      }
      case T.SPIKE: {
        ctx.fillStyle = '#c8d2dc';
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(X + i * 11 + 1, Y + TILE); ctx.lineTo(X + i * 11 + 6, Y + 6); ctx.lineTo(X + i * 11 + 11, Y + TILE);
          ctx.closePath(); ctx.fill();
        }
        ctx.fillStyle = '#6a737c'; ctx.fillRect(X, Y + TILE - 5, TILE, 5);
        break;
      }
      case T.BREAK:
        ctx.fillStyle = '#b07a3a'; ctx.fillRect(X, Y, TILE, TILE);
        ctx.strokeStyle = '#6d4518'; ctx.lineWidth = 3;
        ctx.strokeRect(X + 2, Y + 2, TILE - 4, TILE - 4);
        ctx.beginPath(); ctx.moveTo(X + 3, Y + 3); ctx.lineTo(X + TILE - 3, Y + TILE - 3); ctx.stroke();
        ctx.lineWidth = 1;
        break;
      case T.LAVA: {
        const ph = Math.sin(G.t * 3 + tx * 0.7) > 0 ? 1 : 0;
        ctx.fillStyle = hazColour(L.Z.look, ph);
        ctx.fillRect(X, Y, TILE, TILE);
        if (openAbove) {
          ctx.fillStyle = hazColour(L.Z.look, 1 - ph);
          ctx.fillRect(X, Y + Math.sin(G.t * 4 + tx) * 2, TILE, 7);
        }
        break;
      }
      case T.WATER:
        ctx.fillStyle = 'rgba(70,180,255,.34)'; ctx.fillRect(X, Y, TILE, TILE);
        if (openAbove) { ctx.fillStyle = 'rgba(200,240,255,.5)'; ctx.fillRect(X, Y + Math.sin(G.t * 3 + tx) * 2, TILE, 4); }
        break;
      case T.BUMP:
        circle(X + 16, Y + 16, 15); fillC(P.acc);
        circle(X + 16, Y + 16, 8); fillC('#fff');
        break;
    }
  }
}

/* ------------------------------- entities -------------------------------- */
function drawEnts(L) {
  const cam = G.cam;
  for (const e of L.ents) {
    const X = e.x - cam.x, Y = e.y - cam.y;
    const mx = (e.hw || 20) + 140, my = (e.hh || 20) + 200;
    if (X < -mx || X > LOGW + mx || Y < -my || Y > LOGH + my) continue;
    switch (e.kind) {
      case 'ring': {
        const w = Math.abs(Math.cos(G.t * 4 + e.x * 0.02)) * 9 + 2;
        ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 3.4;
        ctx.beginPath(); ctx.ellipse(X, Y, w, 10, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.ellipse(X - 1, Y - 2, w * .6, 6, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 1;
        break;
      }
      case 'monitor': {
        ctx.fillStyle = '#cfd8e6'; rr(X - 15, Y - 17, 30, 30, 5); ctx.fill();
        ctx.fillStyle = '#17202a'; rr(X - 12, Y - 14, 24, 22, 3); ctx.fill();
        const col = { rings:'#ffd24a', shield:'#4fd0ff', speed:'#ff8a3d', invinc:'#ffe14a', life:'#3ddc84' }[e.item];
        ctx.fillStyle = col;
        if (e.item === 'rings') { ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(X, Y - 3, 7, 0, 7); ctx.stroke(); ctx.lineWidth = 1; }
        else if (e.item === 'shield') { ctx.beginPath(); ctx.moveTo(X, Y - 12); ctx.lineTo(X + 9, Y - 6); ctx.lineTo(X, Y + 7); ctx.lineTo(X - 9, Y - 6); ctx.closePath(); ctx.fill(); }
        else if (e.item === 'speed') { ctx.beginPath(); ctx.moveTo(X - 8, Y + 6); ctx.lineTo(X + 2, Y - 11); ctx.lineTo(X - 1, Y - 2); ctx.lineTo(X + 8, Y - 4); ctx.lineTo(X - 3, Y + 8); ctx.closePath(); ctx.fill(); }
        else if (e.item === 'life') { circle(X, Y - 3, 7); ctx.fill(); }
        else { circle(X, Y - 3, 7); ctx.fill(); ctx.fillStyle = '#fff'; circle(X - 2, Y - 5, 2.4); ctx.fill(); }
        ctx.fillStyle = '#8a94a8'; ctx.fillRect(X - 15, Y + 11, 30, 4);
        break;
      }
      case 'spring': {
        const sq = e.squash ? 6 : 0;
        ctx.fillStyle = '#dfe9f2';
        for (let i = 0; i < 3; i++) ctx.fillRect(X - 13, Y - 2 + i * 4 + sq / 2, 26, 2.5);
        ctx.fillStyle = '#e03a2f';
        rr(X - 15, Y - 11 + sq, 30, 9, 3); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.fillRect(X - 11, Y - 10 + sq, 22, 2);
        if (e.dir) { ctx.fillStyle = '#ffd24a'; ctx.beginPath(); ctx.moveTo(X - 4, Y - 18 + sq); ctx.lineTo(X + 10, Y - 11 + sq); ctx.lineTo(X - 4, Y - 4 + sq); ctx.closePath(); ctx.fill(); }
        break;
      }
      case 'bumper':
        circle(X, Y, 22 + (e.flash ? 3 : 0)); fillC(e.flash ? '#fff' : L.Z.pal.acc);
        circle(X, Y, 12); fillC('#fff');
        circle(X, Y, 5); fillC(L.Z.pal.g1);
        break;
      case 'checkpoint': {
        ctx.fillStyle = '#9aa3ab'; ctx.fillRect(X - 3, Y - 26, 6, 54);
        ctx.fillStyle = e.lit ? '#ffd24a' : '#4a5660';
        const sw = e.lit ? Math.cos(G.t * 6) * 10 : 10;
        ctx.save(); ctx.translate(X, Y - 22); ctx.scale(sw / 10 || .1, 1);
        ctx.fillRect(0, 0, 22, 14); ctx.restore();
        break;
      }
      case 'emerald': {
        const c = EMCOL[e.idx] || '#fff';
        ctx.save(); ctx.translate(X, Y); ctx.rotate(Math.sin(G.t) * .3);
        ctx.globalAlpha = .35; circle(0, 0, 26); fillC(c); ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(14, -4); ctx.lineTo(9, 14); ctx.lineTo(-9, 14); ctx.lineTo(-14, -4);
        ctx.closePath(); fillC(c);
        ctx.fillStyle = 'rgba(255,255,255,.6)';
        ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(8, -4); ctx.lineTo(0, 2); ctx.lineTo(-8, -4); ctx.closePath(); ctx.fill();
        ctx.restore();
        break;
      }
      case 'goal': {
        const open = goalOpen(L);
        ctx.fillStyle = '#8a94a8'; ctx.fillRect(X - 4, Y - 40, 8, 80);
        ctx.fillStyle = '#cfd8e6'; ctx.fillRect(X - 16, Y + 34, 32, 8);
        if (!open) {
          /* a padlocked sign until the ring quota is paid */
          ctx.fillStyle = '#3a4350'; rr(X - 22, Y - 42, 44, 44, 7); ctx.fill();
          ctx.fillStyle = '#ffd24a';
          rr(X - 11, Y - 28, 22, 17, 4); ctx.fill();
          ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.arc(X, Y - 28, 8, Math.PI, 0); ctx.stroke(); ctx.lineWidth = 1;
          ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
          ctx.fillText(Math.max(0, L.need - G.ringsGot) + ' RINGS', X, Y + 12);
        } else {
          const s = Math.cos(e.spin);
          ctx.save(); ctx.translate(X, Y - 20); ctx.scale(Math.max(.12, Math.abs(s)), 1);
          ctx.fillStyle = s > 0 ? '#2f6ff2' : '#e03a2f';
          rr(-20, -20, 40, 40, 6); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center';
          ctx.fillText(s > 0 ? 'GO' : '!', 0, 8);
          ctx.restore();
        }
        break;
      }
      case 'shot':
        circle(X, Y, 7); fillC('#ff5a2a');
        circle(X, Y, 3.4); fillC('#ffe14a');
        break;
      case 'animal': {
        const skin = ['#f4e3c8','#8ad8ff','#f3a8c8'][e.sort];
        ctx.save(); ctx.translate(X, Y);
        ctx.scale(e.vx < 0 ? -1 : 1, 1);
        if (e.sort === 1) {                                  /* a little bird */
          ctx.fillStyle = skin; circle(0, 0, 8); ctx.fill();
          ctx.fillStyle = '#4a9fd8';
          const w = Math.sin(e.t * 26) * 6;
          ctx.beginPath(); ctx.moveTo(-2, -2); ctx.lineTo(-12, -6 + w); ctx.lineTo(-2, 3); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#ffb63d'; ctx.beginPath();
          ctx.moveTo(7, -1); ctx.lineTo(12, 1); ctx.lineTo(7, 3); ctx.closePath(); ctx.fill();
        } else {                                             /* a rabbit / squirrel */
          ctx.fillStyle = skin; circle(0, 1, 8); ctx.fill();
          ctx.fillStyle = skin;
          rr(-1, -14, 4, 9, 2); ctx.fill();
          rr(4, -13, 4, 8, 2); ctx.fill();
          ctx.fillStyle = '#fff'; circle(-7, 4, 4); ctx.fill();
        }
        ctx.fillStyle = '#1b2430'; circle(3, -1, 1.8); ctx.fill();
        ctx.restore();
        break;
      }

      case 'badnik': drawBadnik(e, X, Y); break;
      case 'boss': drawBoss(e, X, Y); break;
    }
  }
}

function drawBadnik(e, X, Y) {
  const d = e.dir || 1;
  ctx.save(); ctx.translate(X, Y);
  switch (e.type) {
    case 'motobug':
      ctx.fillStyle = '#3a3f4a'; ctx.fillRect(-13, 6, 26, 6);
      ctx.fillStyle = '#2f9e57'; rr(-14, -10, 28, 18, 6); ctx.fill();
      ctx.fillStyle = '#ffd24a'; circle(d * 9, -4, 4); ctx.fill();
      ctx.fillStyle = '#1b1f26'; circle(-9, 10, 4); ctx.fill(); circle(9, 10, 4); ctx.fill();
      break;
    case 'crab':
      ctx.fillStyle = '#e0523a'; rr(-16, -8, 32, 16, 7); ctx.fill();
      ctx.fillStyle = '#ffd24a'; circle(-6, -3, 3); ctx.fill(); circle(6, -3, 3); ctx.fill();
      ctx.fillStyle = '#b53a24';
      rr(-24, -2, 10, 7, 3); ctx.fill(); rr(14, -2, 10, 7, 3); ctx.fill();
      ctx.fillRect(-11, 7, 4, 7); ctx.fillRect(7, 7, 4, 7);
      break;
    case 'buzzer':
      ctx.fillStyle = '#ffd24a'; rr(-15, -8, 30, 15, 7); ctx.fill();
      ctx.fillStyle = '#2f3a4a'; rr(-6, -7, 12, 13, 4); ctx.fill();
      ctx.globalAlpha = .55; ctx.fillStyle = '#cfe9ff';
      const fw = Math.abs(Math.cos(G.t * 22)) * 16 + 5;
      ctx.beginPath(); ctx.ellipse(0, -10, fw, 5, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
      ctx.fillStyle = '#ff4a2a'; circle(d * 11, -1, 3); ctx.fill();
      break;
    case 'bat':
      ctx.fillStyle = '#6a4aa8'; circle(0, 0, 11); ctx.fill();
      ctx.fillStyle = '#4a2f7a';
      const wf = Math.sin(G.t * 14) * 7;
      ctx.beginPath(); ctx.moveTo(-9, -2); ctx.lineTo(-26, -8 + wf); ctx.lineTo(-10, 6); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(9, -2); ctx.lineTo(26, -8 - wf); ctx.lineTo(10, 6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff4a2a'; circle(-4, -2, 2.4); ctx.fill(); circle(4, -2, 2.4); ctx.fill();
      break;
    case 'orbinaut': {
      ctx.fillStyle = '#2f6fa8'; circle(0, 0, 12); ctx.fill();
      ctx.fillStyle = '#ffd24a'; circle(0, 0, 5); ctx.fill();
      ctx.fillStyle = '#cfd8e6';
      for (let i = 0; i < 4; i++) {
        const a = G.t * 2 + i * Math.PI / 2;
        const ox = Math.cos(a) * 26, oy = Math.sin(a) * 26;
        circle(ox, oy, 6); ctx.fill();
      }
      break;
    }
    case 'spiker':
      ctx.fillStyle = '#8a94a8'; rr(-14, -6, 28, 18, 5); ctx.fill();
      ctx.fillStyle = '#cfd8e6';
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * 10 - 5, -6); ctx.lineTo(i * 10, -20); ctx.lineTo(i * 10 + 5, -6); ctx.closePath(); ctx.fill(); }
      ctx.fillStyle = '#ff4a2a'; circle(0, 2, 3); ctx.fill();
      break;
    case 'roller':
      ctx.save(); ctx.rotate(e.spin || 0);
      ctx.fillStyle = '#d8322f'; circle(0, 0, 15); ctx.fill();
      ctx.fillStyle = '#2f3a4a'; ctx.fillRect(-15, -3, 30, 6); ctx.fillRect(-3, -15, 6, 30);
      ctx.restore();
      ctx.fillStyle = '#ffd24a'; circle(d * 8, -5, 3); ctx.fill();
      break;
    case 'chopper':
      ctx.fillStyle = '#2f8ad8'; ctx.beginPath();
      ctx.moveTo(-14, 0); ctx.lineTo(4, -12); ctx.lineTo(14, 0); ctx.lineTo(4, 12); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff'; circle(6, -3, 3); ctx.fill();
      ctx.fillStyle = '#1f5aa8'; ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(-22, -8); ctx.lineTo(-20, 6); ctx.closePath(); ctx.fill();
      break;
  }
  ctx.restore();
}

function drawColossus(b, X, Y) {
  const flash = b.inv > 0 && Math.floor(b.inv * 16) % 2;
  const sw = Math.sin(b.step * (b.phase === 2 ? 9 : 3.2));
  ctx.save(); ctx.translate(X, Y);
  /* legs */
  ctx.fillStyle = '#3c4654';
  for (const sx of [-48, 48]) {
    const kick = sx < 0 ? sw * 10 : -sw * 10;
    rr(sx - 20 + kick, 18, 40, 62, 9); ctx.fill();
    ctx.fillStyle = '#2a323c'; rr(sx - 26 + kick, 74, 52, 20, 7); ctx.fill();
    ctx.fillStyle = '#3c4654';
  }
  /* arms with cannons */
  ctx.fillStyle = flash ? '#fff' : '#4a5664';
  rr(-112, -44, 38, 92, 11); ctx.fill();
  rr(74, -44, 38, 92, 11); ctx.fill();
  ctx.fillStyle = '#d8322f';
  rr(-110, 44, 34, 20, 7); ctx.fill();
  rr(76, 44, 34, 20, 7); ctx.fill();
  /* torso */
  ctx.fillStyle = flash ? '#fff' : '#cfd8e6';
  rr(-74, -76, 148, 104, 18); ctx.fill();
  ctx.fillStyle = flash ? '#fff' : '#8a94a8';
  rr(-62, -4, 124, 26, 9); ctx.fill();
  /* chest vents that glow brighter as it breaks */
  for (let i = -1; i <= 1; i++) {
    ctx.fillStyle = ['#2f3a4a','#ff8a3d','#ff3d2a'][b.phase];
    rr(i * 34 - 11, 4, 22, 16, 4); ctx.fill();
  }
  /* cockpit: the weak spot */
  ctx.fillStyle = 'rgba(159,228,255,.35)'; circle(0, -60, 44); ctx.fill();
  ctx.fillStyle = flash ? '#fff' : '#9fe4ff'; circle(0, -60, 36); ctx.fill();
  ctx.fillStyle = '#f0c8a0'; circle(0, -57, 20); ctx.fill();
  ctx.fillStyle = '#d8322f'; rr(-23, -76, 46, 13, 5); ctx.fill();
  ctx.fillStyle = '#2f3a4a'; ctx.fillRect(-16, -50, 32, 8);
  ctx.fillStyle = '#1b2430'; circle(-8, -62, 3.4); ctx.fill(); circle(8, -62, 3.4); ctx.fill();
  /* shoulder beacons */
  for (const sx of [-58, 58]) {
    ctx.fillStyle = (Math.floor(G.t * 4) % 2) ? '#ffd24a' : '#7a5a10';
    circle(sx, -84, 9); ctx.fill();
  }
  ctx.restore();
  /* a target ring around the cockpit so you know where to hit */
  if (b.weak && !b.dying) {
    ctx.strokeStyle = b.inv > 0 ? 'rgba(255,255,255,.35)' : 'rgba(255,210,74,.85)';
    ctx.lineWidth = 3;
    const r = 46 + Math.sin(G.t * 5) * 4;
    circle(b.weak.x - G.cam.x, b.weak.y - G.cam.y, r); ctx.stroke();
    ctx.lineWidth = 1;
  }
}

function drawBoss(b, X, Y) {
  if (b.colossus) { drawColossus(b, X, Y); return; }
  const flash = b.inv > 0 && Math.floor(b.inv * 14) % 2;
  ctx.save(); ctx.translate(X, Y);
  if (b.st === 'rest') {
    ctx.fillStyle = 'rgba(200,210,225,.35)';
    ctx.beginPath(); ctx.ellipse(0, b.hh, 70 + Math.sin(G.t * 20) * 6, 10, 0, 0, 7); ctx.fill();
  }
  /* hull */
  ctx.fillStyle = flash ? '#fff' : '#cfd8e6';
  rr(-b.hw, -b.hh, b.hw * 2, b.hh * 2, 14); ctx.fill();
  ctx.fillStyle = flash ? '#fff' : '#8a94a8';
  rr(-b.hw + 6, -b.hh + 6, b.hw * 2 - 12, 14, 6); ctx.fill();
  /* cockpit with the doctor */
  ctx.fillStyle = '#9fe4ff'; circle(0, -b.hh * 0.25, 20); ctx.fill();
  ctx.fillStyle = '#f0c8a0'; circle(0, -b.hh * 0.25 + 2, 11); ctx.fill();
  ctx.fillStyle = '#d8322f'; rr(-13, -b.hh * 0.25 - 12, 26, 8, 3); ctx.fill();
  ctx.fillStyle = '#2f3a4a'; ctx.fillRect(-9, -b.hh * 0.25 + 6, 18, 5);
  /* thrusters / legs */
  ctx.fillStyle = '#e0523a';
  if (b.pattern === 1 || (b.final && b.hp <= b.maxhp * 0.3)) {
    circle(-b.hw * .6, b.hh, 12); ctx.fill(); circle(b.hw * .6, b.hh, 12); ctx.fill();
  } else {
    ctx.fillStyle = '#ffd24a';
    const fl = 10 + Math.abs(Math.sin(G.t * 20)) * 10;
    ctx.beginPath(); ctx.moveTo(-14, b.hh - 2); ctx.lineTo(0, b.hh + fl); ctx.lineTo(14, b.hh - 2); ctx.closePath(); ctx.fill();
  }
  if (b.pattern === 2) { ctx.fillStyle = '#8a94a8'; ctx.beginPath(); ctx.moveTo(-14, b.hh); ctx.lineTo(0, b.hh + 30); ctx.lineTo(14, b.hh); ctx.closePath(); ctx.fill(); }
  ctx.restore();
}

/* -------------------------------- the hero ------------------------------- */
function drawHero(p) {
  const C = p.C, X = p.x - G.cam.x, Y = p.y - G.cam.y;
  if (p.inv > 0 && Math.floor(p.inv * 16) % 2) return;
  ctx.save(); ctx.translate(X, Y);
  if (G.super) { ctx.globalAlpha = .5; circle(0, 0, 30); fillC('#ffe14a'); ctx.globalAlpha = 1; }
  if (p.invinc > 0) {
    ctx.strokeStyle = 'rgba(180,230,255,.9)'; ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) { circle(0, 0, 24 + Math.sin(G.t * 9 + i * 2) * 5); ctx.stroke(); }
    ctx.lineWidth = 1;
  }
  if (p.shield) { ctx.globalAlpha = .4; circle(0, 0, 27); fillC('#4fd0ff'); ctx.globalAlpha = 1; }
  const body = G.super ? '#ffe14a' : C.col, dark = G.super ? '#e0a81f' : C.col2;
  /* flying, gliding and clinging show the hero's body - only a real spin is a ball */
  const ball = (p.roll || p.jumping || p.dashing > 0) && !p.flying && !p.gliding && !p.clinging;
  ctx.scale(p.face, 1);

  if (ball) {
    const a = p.anim * (6 + Math.abs(p.vx) / 60);
    ctx.rotate(a * p.face);
    circle(0, 0, 15); fillC(body);
    ctx.fillStyle = dark;
    for (let i = 0; i < 3; i++) {
      const ang = i * 2.1;
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.arc(0, 0, 15, ang, ang + .7); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = C.shoe; circle(7, 7, 5); ctx.fill(); circle(-7, -7, 5); ctx.fill();
    ctx.restore();
    return;
  }

  const run = Math.abs(p.vx) > 40;
  const step = Math.sin(p.anim * (run ? 18 : 6));
  /* tails / dreadlocks / quills behind the body */
  if (p.char === 'tails') {
    ctx.fillStyle = dark;
    if (p.flying) {
      ctx.save(); ctx.translate(-4, -4);
      const w = Math.abs(Math.cos(G.t * 26)) * 22 + 6;
      ctx.beginPath(); ctx.ellipse(0, 0, w, 7, 0, 0, 7); ctx.fill(); ctx.restore();
    } else {
      for (let i = -1; i <= 1; i += 2) {
        ctx.save(); ctx.translate(-10, 2); ctx.rotate(i * .5 + step * .2);
        rr(-18, -4, 20, 8, 4); ctx.fill(); ctx.restore();
      }
    }
  } else if (p.char === 'knuckles') {
    ctx.fillStyle = body;
    rr(-20, -12, 16, 9, 4); ctx.fill();
    rr(-20, 0, 16, 9, 4); ctx.fill();
  } else if (p.char === 'sonic') {
    ctx.fillStyle = body;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.moveTo(-6, -10 + i * 7);
      ctx.lineTo(-26 - i * 2, -16 + i * 9); ctx.lineTo(-6, -2 + i * 7); ctx.closePath(); ctx.fill();
    }
  } else {
    ctx.fillStyle = body;             /* Amy's quills curve down */
    rr(-20, -12, 14, 22, 7); ctx.fill();
  }
  /* legs */
  ctx.fillStyle = C.shoe;
  rr(-10 + step * 5, 8, 11, 11, 4); ctx.fill();
  rr(1 - step * 5, 8, 11, 11, 4); ctx.fill();
  /* body */
  ctx.fillStyle = body;
  rr(-10, -8, 20, 18, 8); ctx.fill();
  if (p.char === 'amy') {
    ctx.fillStyle = '#e6444f';
    ctx.beginPath(); ctx.moveTo(-11, -2); ctx.lineTo(11, -2); ctx.lineTo(14, 12); ctx.lineTo(-14, 12); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = '#f6f1e6'; rr(-7, -2, 14, 11, 5); ctx.fill();
  /* head */
  ctx.fillStyle = body; circle(2, -16, 11); ctx.fill();
  ctx.fillStyle = C.skin; circle(8, -13, 7); ctx.fill();
  ctx.fillStyle = '#fff'; circle(5, -19, 5); ctx.fill(); circle(11, -19, 4); ctx.fill();
  ctx.fillStyle = '#1b2430'; circle(6, -19, 2.2); ctx.fill(); circle(11.5, -19, 2); ctx.fill();
  ctx.fillStyle = '#1b2430'; circle(12, -11, 1.8); ctx.fill();
  if (p.char === 'amy') { ctx.fillStyle = '#e6444f'; rr(-7, -27, 16, 5, 2); ctx.fill(); }
  if (p.char === 'knuckles') {
    ctx.fillStyle = '#f6f1e6';
    ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(9, -10); ctx.lineTo(0, -6); ctx.closePath(); ctx.fill();
  }
  /* gloves + attack */
  ctx.fillStyle = '#f6f1e6';
  if (p.attack > 0) {
    if (p.char === 'amy') {
      ctx.save(); ctx.rotate(-1.1 + (0.3 - p.attack) * 7);
      ctx.fillStyle = '#c4c9d4'; ctx.fillRect(8, -4, 9, 30);
      ctx.fillStyle = '#e8496a'; rr(2, 18, 24, 16, 5); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(6, 22, 16, 4);
      ctx.restore();
    } else {
      circle(20, 0, 8); ctx.fill();
      ctx.globalAlpha = .4; circle(26, 0, 12); fillC('#fff'); ctx.globalAlpha = 1;
    }
  } else {
    circle(9 + step * 3, 2, 6); ctx.fill();
  }
  if (p.gliding) {
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    ctx.beginPath(); ctx.moveTo(-4, -6); ctx.lineTo(-30, 10); ctx.lineTo(-4, 10); ctx.closePath(); ctx.fill();
  }
  if (p.flying && p.char !== 'tails') {          /* a Super hero flying under their own power */
    ctx.fillStyle = G.super ? 'rgba(255,225,74,.75)' : 'rgba(180,230,255,.7)';
    for (let i = 0; i < 3; i++) {
      const t = G.t * 18 + i * 2.1;
      circle(-16 - i * 7, 6 + Math.sin(t) * 5, 5 - i * 1.2); ctx.fill();
    }
  }
  ctx.restore();
  if (p.char === 'sonic' && p.dash > 0) {
    ctx.save(); ctx.translate(X, Y);
    ctx.globalAlpha = .6; ctx.fillStyle = '#dfe9f2';
    for (let i = 0; i < 4; i++) {
      const a = G.t * 20 + i * 1.6;
      circle(Math.cos(a) * (18 + p.dash), Math.sin(a) * 8, 3); ctx.fill();
    }
    ctx.restore(); ctx.globalAlpha = 1;
  }
}

/* ------------------------------ frame paint ------------------------------ */
function drawFrame() {
  const L = G.level;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (!L) { ctx.fillStyle = '#0a1016'; ctx.fillRect(0, 0, LOGW, LOGH); return; }
  if (G.shake > 0) {
    ctx.translate((Math.random() - .5) * G.shake, (Math.random() - .5) * G.shake);
    G.shake *= 0.86; if (G.shake < .4) G.shake = 0;
  }
  drawBackground(L);
  drawTiles(L);
  drawEnts(L);
  if (G.player && !G.player.dead) drawHero(G.player);
  else if (G.player) {
    const p = G.player;
    ctx.save(); ctx.translate(p.x - G.cam.x, p.y - G.cam.y);
    ctx.rotate(G.dyingT * 6); circle(0, 0, 15); fillC(p.C.col); ctx.restore();
  }
  /* particles */
  for (const q of G.parts) {
    ctx.globalAlpha = Math.max(0, Math.min(1, q.life * 2));
    ctx.fillStyle = q.col;
    ctx.fillRect(q.x - G.cam.x - q.size / 2, q.y - G.cam.y - q.size / 2, q.size, q.size);
  }
  ctx.globalAlpha = 1;
  if (L.Z.look === 'water' && L.Z.th === 'beach') { /* shoreline haze */
    ctx.fillStyle = 'rgba(120,200,255,.05)'; ctx.fillRect(0, 0, LOGW, LOGH);
  }
  if (L.Z.night) {
    const v = ctx.createRadialGradient(LOGW / 2, LOGH / 2, 120, LOGW / 2, LOGH / 2, LOGW * .62);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.45)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, LOGW, LOGH);
  }
}

/* ================================= HUD ================================== */
const $ = id => document.getElementById(id);
const EL = {};
['hud','hud-rings','hud-score','hud-time','hud-lives','hud-char','hud-obj','hud-zone',
 'hud-em','hud-meter','hud-meterfill','hud-need','bossbar','bossname','bosshp','toast',
 'scr-title','scr-chars','scr-map','scr-win','scr-over','scr-pause','scr-help',
 'charcards','maplist','zonetitle','zonebadge','winstats','wintitle','wintext','overtext','mapstats',
 'touch','savebar'].forEach(id => { EL[id] = $(id); });

function showScreen(id) {
  ['scr-title','scr-chars','scr-map','scr-win','scr-over','scr-pause','scr-help'].forEach(s => {
    if (EL[s]) EL[s].classList.toggle('show', s === id);
  });
  if (EL['touch']) EL['touch'].classList.toggle('hide', !!id);
}
function renderHUDStatic() {
  const L = G.level, D = L.D;
  if (EL['hud-zone']) EL['hud-zone'].textContent = D.name;
  if (EL['hud-obj']) EL['hud-obj'].textContent = L.type === 'rings'
    ? 'Collect ' + L.need + ' rings, then reach the goal'
    : (OBJECTIVE[L.type] || '');
  if (EL['hud-char']) EL['hud-char'].textContent = CHARS[G.char].name;
  if (EL['hud-obj'] && L.alwaysSuper) EL['hud-obj'].textContent = OBJECTIVE[L.type] || '';
  if (EL['bossbar']) EL['bossbar'].classList.toggle('show', !!L.bossEnt);
  if (L.bossEnt && EL['bossname']) EL['bossname'].textContent = L.bossEnt.name;
}
function fmtTime(s) {
  const m = Math.floor(s / 60), ss = Math.floor(s % 60);
  return m + ':' + (ss < 10 ? '0' : '') + ss;
}
function updateHUD() {
  const L = G.level, p = G.player;
  if (!L || !EL['hud-rings']) return;
  EL['hud-rings'].textContent = G.rings;
  if (EL['hud-char']) {
    EL['hud-char'].textContent = (G.super ? 'SUPER ' : '') + CHARS[G.char].name;
    EL['hud-char'].classList.toggle('sup', !!G.super);
  }
  EL['hud-score'].textContent = G.score;
  EL['hud-lives'].textContent = G.lives;
  let tTxt = fmtTime(G.elapsed);
  if (L.target) tTxt = fmtTime(G.elapsed) + ' / ' + fmtTime(L.target);
  if (L.surviveFor) tTxt = fmtTime(Math.max(0, L.surviveFor - G.elapsed));
  EL['hud-time'].textContent = tTxt;
  EL['hud-time'].classList.toggle('low', !!(L.target && G.elapsed > L.target));
  EL['hud-time'].classList.toggle('good', !!(L.target && G.elapsed <= L.target));
  if (EL['hud-need']) {
    const show = L.type === 'rings';
    EL['hud-need'].classList.toggle('show', show);
    if (show) {
      const open = G.ringsGot >= L.need;
      EL['hud-need'].classList.toggle('open', open);
      EL['hud-need'].textContent = open
        ? 'GOAL OPEN - RINGS ' + L.need + '/' + L.need
        : 'RINGS FOR THE GOAL  ' + G.ringsGot + '/' + L.need;
    }
  }
  if (EL['hud-meter'] && p) {
    const fly = p.char === 'tails';
    EL['hud-meter'].classList.toggle('show', fly || p.char === 'sonic');
    const v = fly ? p.flyT / 3.4 : p.dash / 8;
    if (EL['hud-meterfill']) EL['hud-meterfill'].style.width = Math.round(clamp(v, 0, 1) * 100) + '%';
  }
  if (EL['hud-em']) {
    let s = '';
    for (let i = 0; i < 7; i++) s += '<i class="em' + (save.emeralds.indexOf(i) >= 0 ? ' on' : '') + '" style="--c:' + EMCOL[i] + '"></i>';
    if (EL['hud-em']._s !== s) { EL['hud-em'].innerHTML = s; EL['hud-em']._s = s; }
  }
  if (L.bossEnt && EL['bosshp']) {
    const b = L.bossEnt;
    EL['bosshp'].style.width = Math.max(0, Math.round(b.hp / b.maxhp * 100)) + '%';
  }
  if (EL['toast']) {
    EL['toast'].textContent = G.toast;
    EL['toast'].classList.toggle('on', G.toastT > 0);
  }
}

/* ============================== screens ================================= */
function renderChars() {
  if (!EL['charcards']) return;
  EL['charcards'].innerHTML = '';
  for (const k of CHAR_ORDER) {
    const C = CHARS[k];
    const b = document.createElement('button');
    b.className = 'card' + (save.char === k ? ' sel' : '');
    b.innerHTML =
      '<span class="dot" style="background:' + C.col + ';box-shadow:0 0 0 4px ' + C.col2 + '"></span>' +
      '<b>' + C.name + '</b><i>' + C.title + '</i>' +
      '<u>' + C.ability + '</u><p>' + C.blurb + '</p>';
    b.addEventListener('click', () => { setChar(k); renderChars(); showScreen('scr-map'); renderMap(); });
    EL['charcards'].appendChild(b);
  }
}
function setChar(k) { if (CHARS[k]) { save.char = k; G.char = k; writeSave(); } }

function zoneProgress(z) {
  let done = 0, tot = 0;
  for (const L of LEVELS) if (L.zone === z) { tot++; if (isCleared(L.id)) done++; }
  return done + '/' + tot;
}
function renderMap() {
  if (!EL['maplist']) return;
  const z = clamp(G.mapZone, 0, ZONES.length - 1);
  G.mapZone = z;
  const Z = ZONES[z];
  if (EL['zonetitle']) EL['zonetitle'].textContent = 'Zone ' + (z + 1) + ' - ' + Z.n;
  if (EL['zonebadge']) EL['zonebadge'].textContent = zoneProgress(z) + ' cleared';
  if (EL['mapstats']) {
    const total = LEVELS.length, done = LEVELS.filter(l => isCleared(l.id)).length;
    EL['mapstats'].innerHTML =
      '<span><b>' + done + '</b>/' + total + ' levels</span>' +
      '<span><b>' + MAIN_LEVELS.filter(l => isCleared(l.id)).length + '</b>/102 main acts</span>' +
      '<span><b>' + BRANCH_LEVELS.filter(l => isCleared(l.id)).length + '</b>/50 branch levels</span>' +
      '<span><b>' + FINALE_LEVELS.filter(l => isCleared(l.id)).length + '</b>/2 Super finale</span>' +
      '<span><b>' + save.emeralds.length + '</b>/7 emeralds</span>' +
      '<span><b>' + (save.medals || 0) + '</b> medals</span>' +
      '<span><b>' + CHARS[save.char].name + '</b> selected</span>';
  }
  EL['maplist'].innerHTML = '';
  const mk = (D, cls) => {
    const b = document.createElement('button');
    const un = isUnlocked(D.id), cl = isCleared(D.id);
    b.className = 'lv ' + cls + (cl ? ' done' : '') + (un ? '' : ' lock');
    b.disabled = !un;
    const best = save.best[D.id] ? fmtTime(save.best[D.id]) : '--';
    b.innerHTML = '<b>' + (D.finale ? D.short : D.branch ? 'Branch ' + GREEK[D.branch - 1] : 'Act ' + D.act) + '</b>' +
      '<i>' + (D.finale ? D.sub
                      : D.boss ? ZONES[D.zone].boss
                      : D.type === 'rings' ? 'Collect ' + ringQuota(D.zone) + ' rings, then the goal'
                      : D.type === 'ringroad' ? 'Ring Road - long, open, paved with rings'
                      : D.type === 'time' ? 'Beat the target time for a big bonus'
                      : (D.tag || OBJECTIVE[D.type])) + '</i>' +
      '<u>' + (un ? (cl ? 'best ' + best : 'open') : 'locked') + '</u>';
    b.addEventListener('click', () => { if (!isUnlocked(D.id)) return; startLevel(D.id); });
    EL['maplist'].appendChild(b);
    return b;
  };
  const head = t => { const h = document.createElement('div'); h.className = 'lvhead'; h.textContent = t; EL['maplist'].appendChild(h); };
  if (Z.finale) {
    head('Super finale - every hero goes Super, and Super never runs out');
    LEVELS.filter(l => l.zone === z).forEach(D => mk(D, 'super'));
  } else {
    head('Main acts');
    LEVELS.filter(l => l.zone === z && !l.branch).forEach(D => mk(D, D.boss ? 'boss' : 'main'));
    head('Branch levels - optional, and where the Chaos Emeralds hide');
    LEVELS.filter(l => l.zone === z && l.branch).forEach(D => mk(D, 'branch'));
  }
}
function renderSaveBar() {
  if (!EL['savebar']) return;
  const done = LEVELS.filter(l => isCleared(l.id)).length;
  EL['savebar'].innerHTML =
    '<span>Cleared<b>' + done + '/152</b></span>' +
    '<span>Emeralds<b>' + save.emeralds.length + '/7</b></span>' +
    '<span>Medals<b>' + (save.medals || 0) + '</b></span>' +
    '<span>Hero<b>' + CHARS[save.char].name + '</b></span>';
}
function renderWin() {
  const L = G.level, D = L.D;
  const finale = D.finale && D.boss;
  if (EL['wintitle']) EL['wintitle'].textContent =
    finale ? 'THE HORIZON IS WHOLE AGAIN!' : D.boss ? ZONES[D.zone].boss + ' DOWN!' : 'LEVEL CLEAR!';
  if (EL['wintext']) {
    const cleared = LEVELS.filter(l => isCleared(l.id)).length;
    EL['wintext'].textContent = finale
      ? 'The Egg Colossus is scrap, the Death Egg is falling and the sky is one piece again. ' +
        'Super ' + CHARS[G.char].name + ' saved the world! ' + cleared + ' of ' + LEVELS.length +
        ' levels cleared, ' + save.emeralds.length + ' of 7 Chaos Emeralds found.'
      : (G.firstClear && D.branch ? 'Branch level cleared - medal earned.' : '');
  }
  if (EL['winstats']) EL['winstats'].innerHTML =
    '<span>Time<b>' + fmtTime(G.elapsed) + '</b></span>' +
    '<span>Rings<b>' + G.rings + '</b></span>' +
    '<span>Badniks<b>' + G.kills + '</b></span>' +
    '<span>' + (L.target ? (G.elapsed <= L.target ? 'Target beaten!' : 'Time bonus') : 'Time bonus') +
      '<b>' + G.timeBonus + '</b></span>' +
    '<span>Ring bonus<b>' + G.ringBonus + '</b></span>' +
    '<span>Score<b>' + G.score + '</b></span>';
  showScreen('scr-win');
}
function renderOver() {
  if (EL['overtext']) EL['overtext'].textContent =
    G.level.D.name + ' got the better of you. ' + (G.lives > 0 ? G.lives + ' lives left.' : 'Lives reset to 3.');
  showScreen('scr-over');
}
function startLevel(idx) {
  prepareLevel(idx);
  beginPlay();
}

/* =============================== main loop =============================== */
let lastTs = 0, acc = 0;
function step(dt) {
  const L = G.level, p = G.player;
  G.t += dt;
  if (G.scene === 'play') {
    G.elapsed += dt;
    updatePlayer(dt);
    updateEnts(dt);
    updateSiege(dt);
    if (G.super && L.alwaysSuper) {
      /* the finale: Super never fades */
    } else if (G.super) {
      G.superT = (G.superT || 0) + dt;
      if (G.superT > 1) { G.superT = 0; G.rings--; if (G.rings <= 0) { G.rings = 0; G.super = false; toast('SUPER OVER', 1.2); } }
    } else if (G.press.attack && save.emeralds.length >= 7 && G.rings >= 50 && !p.onGround) {
      G.super = true; G.superT = 0; sfx('emerald'); toast('SUPER ' + CHARS[G.char].name.toUpperCase() + '!', 2);
      puff(p.x, p.y, '#ffe14a', 30);
    }
    if (L.target && !G.targetGone && G.elapsed >= L.target) {
      G.targetGone = true; toast('TARGET TIME GONE - KEEP GOING!', 1.6);
    }
    if (L.surviveFor && G.elapsed >= L.surviveFor) winLevel();
    cameraFollow(dt);
  } else if (G.scene === 'dying') {
    G.dyingT += dt;
    p.vy += GRAV * dt; p.y += p.vy * dt;
    if (G.dyingT > 1.5) respawnOrOver();
  }
  for (let i = G.parts.length - 1; i >= 0; i--) {
    const q = G.parts[i];
    q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 900 * dt;
    if (q.life <= 0) G.parts.splice(i, 1);
  }
  if (G.toastT > 0) { G.toastT -= dt; if (G.toastT <= 0) G.toast = ''; }
}
function cameraFollow(dt) {
  const L = G.level, p = G.player;
  const tx = clamp(p.x - LOGW / 2, 0, Math.max(0, L.worldW - LOGW));
  const ty = clamp(p.y - LOGH * 0.56, 0, Math.max(0, L.worldH - LOGH));
  const k = Math.min(1, 1 - Math.pow(0.0002, dt));
  G.cam.x = lerp(G.cam.x, tx, k);
  G.cam.y = lerp(G.cam.y, ty, k * 0.8);
}

function frame(ts) {
  requestAnimationFrame(frame);
  const now = ts || 0;
  let dt = (now - lastTs) / 1000;
  lastTs = now;
  if (!(dt > 0) || dt > 0.25) dt = 1 / 60;
  acc += dt;
  let guard = 0;
  while (acc >= 1 / 60 && guard++ < 5) { stepScene(1 / 60); acc -= 1 / 60; }
  drawFrame();
  updateHUD();
  G.press = {};
}
function stepScene(dt) {
  if (G.press.pause && (G.scene === 'play' || G.scene === 'pause')) togglePause();
  if (G.press.mute) { G.mute = !G.mute; save.mute = G.mute; writeSave(); toast(G.mute ? 'SOUND OFF' : 'SOUND ON', 1); updateMuteBtn(); }
  if (G.press.restart && (G.scene === 'play' || G.scene === 'pause')) startLevel(G.idx);
  if (G.scene === 'play' || G.scene === 'dying') step(dt);
  else if (G.toastT > 0) { G.toastT -= dt; if (G.toastT <= 0) G.toast = ''; }
  else G.t += dt;
}
function updateMuteBtn() { const b = $('b-mute'); if (b) b.textContent = G.mute ? 'Sound: off' : 'Sound: on'; }

/* ====================== touch controls & fullscreen ====================== */
const TOUCH_BTNS = [['t-left','left'],['t-right','right'],['t-down','down'],
                    ['t-jump','jump'],['t-attack','attack']];
function isTouchDevice() {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator;
  return ('ontouchstart' in window) || !!(nav && (nav.maxTouchPoints > 0 || nav.msMaxTouchPoints > 0));
}
function setupTouch() {
  if (isTouchDevice() && document.body && document.body.classList) document.body.classList.add('istouch');
  const active = new Map();                     // pointer id -> action, so multi-touch works
  const held = a => { let any = false; active.forEach(v => { if (v === a) any = true; }); return any; };
  const usePointer = typeof window !== 'undefined' && !!window.PointerEvent;

  for (const [id, a] of TOUCH_BTNS) {
    const el = $(id);
    if (!el) continue;
    const down = ev => {
      if (ev && ev.preventDefault) ev.preventDefault();
      const pid = (ev && ev.pointerId !== undefined) ? ev.pointerId : 'm';
      active.set(pid, a);
      if (!G.act[a]) G.press[a] = true;
      G.act[a] = true;
      if (el.classList) el.classList.add('on');
      if (el.setPointerCapture && ev && ev.pointerId !== undefined) {
        try { el.setPointerCapture(ev.pointerId); } catch (e) {}
      }
    };
    const up = ev => {
      if (ev && ev.preventDefault) ev.preventDefault();
      const pid = (ev && ev.pointerId !== undefined) ? ev.pointerId : 'm';
      active.delete(pid);
      if (!held(a)) G.act[a] = false;
      if (el.classList) el.classList.remove('on');
    };
    if (usePointer) {
      el.addEventListener('pointerdown', down);
      ['pointerup','pointercancel','lostpointercapture'].forEach(t => el.addEventListener(t, up));
    } else {
      ['touchstart','mousedown'].forEach(t => el.addEventListener(t, down));
      ['touchend','touchcancel','mouseup','mouseleave'].forEach(t => el.addEventListener(t, up));
    }
  }
  /* a long press must not pop up a context menu over the controls */
  if (typeof document !== 'undefined' && document.addEventListener)
    document.addEventListener('contextmenu', ev => { if (ev && ev.preventDefault) ev.preventDefault(); });
}
function toggleFullscreen() {
  try {
    const stage = (cv && cv.parentNode) || cv;
    const d = document;
    const on = d.fullscreenElement || d.webkitFullscreenElement;
    if (on) { const ex = d.exitFullscreen || d.webkitExitFullscreen; if (ex) ex.call(d); }
    else {
      const req = stage.requestFullscreen || stage.webkitRequestFullscreen;
      if (req) req.call(stage);
    }
  } catch (e) {}
  if (typeof setTimeout === 'function') setTimeout(sizeCanvas, 220);
}
function togglePause() {
  if (G.scene === 'play') { G.scene = 'pause'; showScreen('scr-pause'); }
  else if (G.scene === 'pause') { G.scene = 'play'; showScreen(null); }
}

/* ============================== wiring up =============================== */
function bind(id, fn) { const b = $(id); if (b) b.addEventListener('click', fn); }
function init() {
  loadSave();
  G.char = save.char; G.mute = !!save.mute; G.lives = save.lives || 5;
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('keydown', onKey(true));
    window.addEventListener('keyup', onKey(false));
    window.addEventListener('resize', sizeCanvas);
    window.addEventListener('blur', () => { G.act = {}; });
  }
  setupTouch();

  bind('b-full', toggleFullscreen);
  bind('b-pausefull', toggleFullscreen);
  bind('t-full', toggleFullscreen);
  bind('t-pause', togglePause);
  bind('b-play', () => { save.seen = 1; writeSave(); renderChars(); showScreen('scr-chars'); });
  bind('b-help', () => showScreen('scr-help'));
  bind('b-helpback', () => showScreen('scr-title'));
  bind('b-charback', () => showScreen('scr-title'));
  bind('b-mapchars', () => { renderChars(); showScreen('scr-chars'); });
  bind('b-maptitle', () => { renderSaveBar(); showScreen('scr-title'); });
  bind('b-zprev', () => { G.mapZone = (G.mapZone + ZONES.length - 1) % ZONES.length; renderMap(); });
  bind('b-znext', () => { G.mapZone = (G.mapZone + 1) % ZONES.length; renderMap(); });
  bind('b-next', () => {
    const n = G.level.D.branch ? -1 : nextMain(G.idx);
    if (n >= 0 && isUnlocked(n)) startLevel(n);
    else { G.mapZone = G.level.D.zone; renderMap(); showScreen('scr-map'); }
  });
  bind('b-winmap', () => { G.mapZone = G.level.D.zone; renderMap(); showScreen('scr-map'); });
  bind('b-retry', () => startLevel(G.idx));
  bind('b-overmap', () => { G.mapZone = G.level.D.zone; renderMap(); showScreen('scr-map'); });
  bind('b-resume', () => { G.scene = 'play'; showScreen(null); });
  bind('b-pauserestart', () => startLevel(G.idx));
  bind('b-pausemap', () => { G.mapZone = G.level.D.zone; renderMap(); showScreen('scr-map'); });
  bind('b-mute', () => { G.mute = !G.mute; save.mute = G.mute; writeSave(); updateMuteBtn(); });
  bind('b-wipe', () => {
    save = defaultSave(); writeSave();
    renderMap(); renderChars(); toast('SAVE CLEARED', 1.5);
  });
  updateMuteBtn();
  renderSaveBar();
  G.mapZone = 0;
  /* park a level in memory so the canvas has something to show behind the menus */
  prepareLevel(0, true);
  G.scene = 'title';
  showScreen('scr-title');
  renderChars();
  renderMap();
}

init();

if (typeof window !== 'undefined' && window.__S4_HOOK) {
  window.__S4_HOOK({
    G, LEVELS, ZONES, CHARS, MAIN_LEVELS, BRANCH_LEVELS, FINALE_LEVELS, OBJECTIVE,
    prepareLevel, beginPlay, startLevel, buildLevel, setChar, winLevel, goalOpen,
    saveRef: () => save, writeSave, showScreen, renderMap,
    T, TILE, gt, st, isSolidT, isSlopeT, isHurtT, slopeSurf, playerSpin, isUnlocked, isCleared, ringQuota
  });
}
requestAnimationFrame(frame);

})();
