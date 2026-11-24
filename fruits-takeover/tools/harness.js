/* Headless harness: stubs just enough DOM + canvas to run game.js and bot-play every level. */
const fs = require('fs'), vm = require('vm'), path = require('path');
const GAME = process.argv[2];

function makeEl(id) {
  const e = {
    id, _ln: {}, children: [], style: {}, textContent: '', hidden: false, disabled: false,
    classList: { _s: new Set(),
      add(c){this._s.add(c);}, remove(c){this._s.delete(c);},
      toggle(c,on){ if(on===undefined) on=!this._s.has(c); on?this._s.add(c):this._s.delete(c); return on; },
      contains(c){return this._s.has(c);} },
    addEventListener(t,f){ (this._ln[t]=this._ln[t]||[]).push(f); },
    appendChild(c){ this.children.push(c); return c; },
    click(){ (this._ln.click||[]).forEach(f=>f({preventDefault(){}})); },
    getBoundingClientRect(){ return {left:0,top:0,width:960,height:540}; },
    getContext(){ return CTX; }
  };
  Object.defineProperty(e,'innerHTML',{ get(){return e._html||'';}, set(v){ e._html=v; if(v==='') e.children.length=0; } });
  Object.defineProperty(e,'className',{ get(){return [...e.classList._s].join(' ');},
    set(v){ e.classList._s = new Set(String(v).split(/\s+/).filter(Boolean)); } });
  return e;
}
const G2D = { addColorStop(){} };
const CTX = new Proxy({}, { get(t,k){
  if (k==='createLinearGradient'||k==='createRadialGradient') return ()=>G2D;
  if (k==='canvas') return els['c'];
  return typeof t[k]==='function'?t[k]:(()=>{});
}, set(){ return true; } });

const els = {};
const document = {
  getElementById(id){ return els[id] || (els[id]=makeEl(id)); },
  createElement(tag){ return makeEl('<'+tag+'>'); }
};
let rafCb = null, rafId = 0;
const store = {};
const window = {
  document,
  addEventListener(t,f){ (window._ln[t]=window._ln[t]||[]).push(f); },
  _ln: {},
  requestAnimationFrame(f){ rafCb = f; return ++rafId; },
  performance: { now: ()=>Date.now() },
  localStorage: { getItem:k=>store[k]===undefined?null:store[k], setItem:(k,v)=>{store[k]=String(v);}, removeItem:k=>{delete store[k];} },
  setTimeout: (f,t)=>setTimeout(f,t),
  claude: undefined
};
const sandbox = { window, document, console, Math, Date, JSON, Object, Array, String, Number, Boolean,
  parseInt, parseFloat, isNaN, Set, Map, Proxy, setTimeout, clearTimeout,
  requestAnimationFrame: window.requestAnimationFrame, performance: window.performance,
  localStorage: window.localStorage };
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
vm.createContext(sandbox);

let HOOK = null;
window.__FT_HOOK = h => { HOOK = h; };

vm.runInContext(fs.readFileSync(GAME,'utf8'), sandbox, { filename: 'game.js' });
if (!HOOK) { console.log('FAIL: hook never fired'); process.exit(1); }
if (!rafCb) { console.log('FAIL: no animation frame requested'); process.exit(1); }

const { G, LEVELS } = HOOK;
const cv = els['c'];
function fire(node, type, ev){ (node._ln[type]||[]).forEach(f=>f(ev)); }
function keyDown(code){ fire(window,'keydown',{code,preventDefault(){}}); }
function keyUp(code){ fire(window,'keyup',{code,preventDefault(){}}); }
const held = new Set();
function hold(codes){
  for (const c of [...held]) if (!codes.has(c)) { keyUp(c); held.delete(c); }
  for (const c of codes) if (!held.has(c)) { keyDown(c); held.add(c); }
}

let clock = 0;
function tick(){ clock += 1000/60; rafCb(clock); }

function bot(godmode){
  const p = G.player; if (!p) return;
  if (godmode) { p.hp = p.maxhp; p.rot = 0; }
  // aim at the nearest fruit
  let best = null, bd = 1e9;
  for (const e of G.enemies){ const d=(e.x-p.x)**2+(e.y-p.y)**2; if(d<bd){bd=d;best=e;} }
  let tx = best ? best.x : G.world.w/2, ty = best ? best.y : G.world.h/2;
  if (SLOPPY) { tx += (Math.random()-0.5)*130; ty += (Math.random()-0.5)*130; }
  fire(cv,'mousemove',{clientX: tx-G.cam.x, clientY: ty-G.cam.y});
  if (!SLOPPY || Math.random() < 0.7) fire(cv,'mousedown',{preventDefault(){}});
  else fire(window,'mouseup',{});
  // move: toward keys if any, else kite away from the nearest fruit
  const codes = new Set();
  let gx, gy;
  if (G.keyItems && G.keyItems.length){ gx=G.keyItems[0].x; gy=G.keyItems[0].y; }
  else if (best && Math.sqrt(bd) < 170){ gx = p.x-(best.x-p.x); gy = p.y-(best.y-p.y); }
  else { gx = G.world.w/2 + Math.sin(clock/900)*120; gy = G.world.h/2 + Math.cos(clock/700)*90; }
  // crude unstick: if the bot has barely moved for a second, wander instead
  bot.hist = bot.hist || [];
  bot.hist.push([p.x,p.y]); if (bot.hist.length>60) bot.hist.shift();
  if (bot.hist.length===60){
    const [ox,oy]=bot.hist[0];
    if (Math.hypot(p.x-ox,p.y-oy) < 40) { bot.wander = 90; bot.wdir = Math.random()*Math.PI*2; bot.hist.length=0; }
  }
  if (bot.wander>0){ bot.wander--; gx = p.x+Math.cos(bot.wdir)*200; gy = p.y+Math.sin(bot.wdir)*200; }
  if (gx < p.x-12) codes.add('KeyA'); if (gx > p.x+12) codes.add('KeyD');
  if (gy < p.y-12) codes.add('KeyW'); if (gy > p.y+12) codes.add('KeyS');
  hold(codes);
}

function playLevel(i, godmode, maxSeconds){
  G.run.up = {}; HOOK.prepareLevel(i, true); HOOK.beginPlay();
  const frames = Math.round(maxSeconds*60);
  for (let f=0; f<frames; f++){
    if (G.scene === 'play') bot(godmode);
    tick();
    if (G.scene === 'win' || G.scene === 'over') break;
  }
  hold(new Set());
  return { scene: G.scene, won: !!G.won, kills: G.kills, score: G.score, t: Math.round(G.elapsed),
           hp: G.player ? Math.round(G.player.hp) : 0, left: G.enemies.length,
           keys: G.keysGot + '/' + G.keysNeeded };
}

const mode = process.argv[3] || 'god';
const SLOPPY = mode === 'sloppy';   // imprecise aim + intermittent fire: closer to a real player

/* ---- UI flow test ---- */
function shown(){ return Object.keys(els).filter(k=>k.startsWith('scr-')&&els[k].classList.contains('show')); }
function click(id){ els[id].click(); }
let flowFails = 0;
function expect(what, cond, extra){ console.log((cond?'  ok   ':'  FAIL ')+what+(cond?'':'   -> '+(extra||shown().join(','))) ); if(!cond) flowFails++; }
function runTo(maxSec, god){
  const frames = Math.round(maxSec*60);
  for (let f=0; f<frames; f++){ if (G.scene==='play') bot(god); tick(); if (G.scene==='win'||G.scene==='over') break; }
  hold(new Set());
}
function flowTest(){
  console.log('flow: first run');
  click('b-play');            expect('PLAY opens the story', shown().includes('scr-story'));
  click('b-begin');           expect('story leads to the briefing', shown().includes('scr-brief'));
  click('b-start');           expect('briefing drops into level 1', G.scene==='play' && G.levelIndex===0);
  for (let i=0;i<30;i++) { bot(true); tick(); }
  keyDown('Escape');          expect('Escape pauses', G.scene==='pause');
  keyDown('KeyM');            expect('M toggles mute while paused', sandbox.window.localStorage.getItem('fruitsTakeover.v1').includes('"mute":true'));
  keyDown('KeyM');
  click('b-resume');          expect('resume returns to play', G.scene==='play');
  runTo(120, true);           expect('level 1 is winnable', G.scene==='win', 'scene='+G.scene);
  const savedAfter = JSON.parse(sandbox.window.localStorage.getItem('fruitsTakeover.v1'));
  expect('clearing level 1 unlocks level 2', savedAfter.unlocked>=2, 'unlocked='+savedAfter.unlocked);
  click('b-next');            expect('win screen offers upgrades', shown().includes('scr-up'));
  const card = els['upcards'].children[0];
  expect('three upgrades offered', els['upcards'].children.length===3, els['upcards'].children.length+' cards');
  card.click();               expect('picking an upgrade briefs level 2', shown().includes('scr-brief') && G.levelIndex===1);
  expect('the picked upgrade carries into the next level', Object.keys(G.run.up).length>=1, JSON.stringify(G.run.up));
  click('b-briefback');       expect('back goes to the level map', shown().includes('scr-map'));
  expect('map lists all 30 levels', els['acts'].children.reduce((n,a)=>n+a.children.filter(c=>c.classList.contains('lv')).length,0)===30);

  console.log('flow: dying');
  G.run.up={}; HOOK.prepareLevel(29,true); HOOK.beginPlay();
  G.player.hp = 1; G.player.rot = 90;
  runTo(30,false);            expect('death ends the level', G.scene==='over', 'scene='+G.scene);
  click('b-retry');           expect('retry re-briefs the same level', shown().includes('scr-brief') && G.levelIndex===29);

  console.log('flow: on-screen controls (phone and tablet)');
  G.run.up={}; HOOK.prepareLevel(0,true); HOOK.beginPlay();
  const padEl = els['touch'];
  expect('the control pad is shown while playing', padEl.style.display === '', JSON.stringify(padEl.style.display));
  const tap = (id,type,pid) => fire(els[id], type, { pointerId: pid, preventDefault(){}, });
  let p0 = G.player.x;
  tap('t-right','touchstart',1);
  for (let f=0; f<30; f++) tick();
  expect('the on-screen D-pad moves the Juicer right', G.player.x > p0 + 8, 'moved ' + Math.round(G.player.x-p0) + 'px');
  const shots0 = G.shots;
  tap('t-fire','touchstart',2);
  for (let f=0; f<20; f++) tick();
  expect('two fingers at once: moving and firing together', G.shots > shots0 && G.player.x > p0, 'shots +' + (G.shots-shots0));
  tap('t-fire','touchend',2); tap('t-right','touchend',1);
  const dashN0 = G.player.dashN;
  G.player.dashCd = 0; G.player.dashT = 0; G.player.dashN = Math.max(1, dashN0);
  tap('t-dash','touchstart',3);
  tick();
  expect('the DASH button dashes (the only way to shake rot off)', G.player.dashT > 0, 'dashT=' + G.player.dashT.toFixed(2));
  tap('t-dash','touchend',3);
  els['t-pause'].click();
  expect('the on-screen pause button pauses', G.scene === 'pause', G.scene);
  expect('and the pad is taken off the screen with a menu open', padEl.style.display === 'none', JSON.stringify(padEl.style.display));
  els['t-pause'].click();
  expect('tapping it again resumes', G.scene === 'play', G.scene);
  hold(new Set());

  console.log('flow: keys and the vault');
  HOOK.prepareLevel(21,true); HOOK.beginPlay();
  runTo(200,true);            expect('vault level banks 3 keys', G.scene==='win' && G.keysGot===3, 'keys='+G.keysGot);
  const afterKeys = JSON.parse(sandbox.window.localStorage.getItem('fruitsTakeover.v1'));
  expect('keys are saved', afterKeys.keys===3, 'keys='+afterKeys.keys);
  click('b-winmap'); click('b-mapvault');
  expect('vault screen opens', shown().includes('scr-vaultscr'));
  const perkBtn = els['perklist'].children[0];
  perkBtn.click();
  const afterBuy = JSON.parse(sandbox.window.localStorage.getItem('fruitsTakeover.v1'));
  expect('a 2-key perk can be bought', afterBuy.keys===1 && Object.keys(afterBuy.perks).length===1, JSON.stringify(afterBuy.perks)+' keys='+afterBuy.keys);
  // replaying a cleared key level must not mint more keys
  HOOK.prepareLevel(21,true); HOOK.beginPlay(); runTo(200,true);
  const afterReplay = JSON.parse(sandbox.window.localStorage.getItem('fruitsTakeover.v1'));
  expect('replaying a cleared vault level grants no extra keys', afterReplay.keys===1, 'keys='+afterReplay.keys);
  console.log(flowFails? '\n'+flowFails+' flow check(s) failed' : '\nflow: all checks passed');
}
if (mode === 'flow') { flowTest(); process.exit(flowFails?1:0); }
const only = process.argv[4] ? parseInt(process.argv[4],10) : null;
const repeats = process.argv[5] ? parseInt(process.argv[5],10) : 1;
let fails = 0, wins = 0, runs = 0;
for (let pass=0; pass<repeats; pass++)
for (let i=0;i<LEVELS.length;i++){
  if (only !== null && i !== only-1) continue;
  let r;
  try { r = playLevel(i, mode==='god', LEVELS[i].type==='survive' ? LEVELS[i].dur+30 : 180); }
  catch (err){ console.log(String(i+1).padStart(2)+' '+LEVELS[i].name+'  CRASH: '+err.message+'\n'+(err.stack||'').split('\n')[1]); fails++; continue; }
  const tag = r.scene==='win' ? 'WIN ' : (r.scene==='over' ? 'LOSS' : 'STUCK');
  runs++; if (r.scene === 'win') wins++; else fails++;
  console.log(String(i+1).padStart(2)+' '+tag+' '+LEVELS[i].name.padEnd(20)+
    ' t='+String(r.t).padStart(3)+'s kills='+String(r.kills).padStart(3)+
    ' hp='+String(r.hp).padStart(3)+' left='+String(r.left).padStart(2)+' keys='+r.keys+' score='+r.score);
}
console.log('\nwin rate: '+wins+'/'+runs+(repeats>1?'  ('+Math.round(wins/runs*100)+'%)':''));
console.log(fails ? fails+' run(s) did not reach a win in '+mode+' mode' : 'all levels completed cleanly');
