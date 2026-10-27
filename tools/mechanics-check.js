/* 六系机制单元验证 + 全状态渲染冒烟：node tools/mechanics-check.js */
"use strict";
const path = require('path');
const BASE = process.env.BASE ? path.resolve(process.env.BASE) : path.resolve(__dirname, '..');
global.window = {};
function ctxStub() { const grad = { addColorStop: () => {} };
  return new Proxy({}, { get: (t, k) => (k in t ? t[k] : k === 'measureText' ? () => ({ width: 10 })
    : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => grad : () => {}),
    set: (t, k, v) => { t[k] = v; return true; } }); }
const canvas = { width: 480, height: 640, getContext: ctxStub, getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 640 }) };
global.document = { getElementById: () => canvas, addEventListener: () => {} };
global.performance = { now: () => Date.now() };
global.localStorage = { getItem: () => null, setItem: () => {} };
global.window.devicePixelRatio = 1; global.window.addEventListener = () => {};

require(path.join(BASE, 'src', 'config.js'));
require(path.join(BASE, 'src', 'platform.js'));
global.window.PixelMow.Platform.setupCanvas();
global.window.PixelMow.Audio = new Proxy({}, { get: () => () => {} });
require(path.join(BASE, 'src', 'gameplay.js'));
require(path.join(BASE, 'src', 'renderer.js'));
const PM = global.window.PixelMow, GP = PM.Gameplay, C = PM.Config, G = GP.state;
const card = id => C.cards.filter(c => c.id === id)[0];
let fails = 0;
function ok(label, cond, extra) { console.log((cond ? 'PASS ' : 'FAIL ') + label + (extra ? '  ' + extra : '')); if (!cond) fails++; }
function take(id) { const choice = G.choices.filter(c => c.card.id === id)[0]; if (!choice) throw new Error('卡池里没有 ' + id); GP.applyChoice(choice); }
function give(ids) { /* 直接写入卡等级并点亮对应武器，跳过三选一的随机 */
  ids.forEach(id => { const c = card(id);
    if (!G.cardLevels[id]) G.cardOrder.push(id);
    G.cardLevels[id] = (G.cardLevels[id] || 0) + 1;
    if (c.unlock) G.weapons[c.unlock].owned = true; });
  GP.recompute();
  G.enemies = []; G.bullets = []; G.zones = []; G.arcs = []; G.state = 'playing'; G.pendingLevelUps = 0;
  G.waveSpawned = 9999; /* 挡住正常刷怪，只留测试靶子 */
}
function frames(n) { for (let i = 0; i < n; i++) { if (G.state === 'levelup') { if (G.choices.length) GP.applyChoice(G.choices[0]); else G.state = 'playing'; } GP.update(1 / 60); } }
var targetId = 1e6;
function spawnAt(key, x, y) { G.enemies.push({ id: ++targetId, key: key, x: x, y: y,
  hp: 9999, maxhp: 9999, spd: 0, xp: 1, dmg: 1, r: C.enemyTypes[key].r, cell: 3, spr: C.enemyTypes[key].spr,
  color: '#fff', resist: C.enemyTypes[key].resist, sway: 0, phase: 0, flash: 0, freezeT: 0, poisonT: 0, poisonDps: 0,
  boss: !!C.enemyTypes[key].boss, dead: false }); return G.enemies[G.enemies.length - 1]; }

['menu', 'levelselect', 'playing', 'levelup', 'intermission', 'over', 'cleared'].forEach(s => {
  GP.resetRun(0); G.state = s;
  if (s === 'levelup') G.choices = [card('b_split'), card('f_unlock'), card('i_freeze')].map(c => ({ card: c, level: 0 }));
  if (s === 'cleared' || s === 'over') G.result = { stars: 2, flawless: false, ratio: 0.5 };
  let err = null; try { PM.Renderer.render(1 / 60); } catch (e) { err = e; }
  ok('状态 ' + s + ' 渲染', !err, err && err.message);
});

/* 冰系：命中上冻，首领抗性应显著缩短时长 */
GP.resetRun(4); give(['i_unlock']);
/* 冰锥只打离防线最近的靶子，所以两个靶子分开跑 */
function freezeOn(key) {
  GP.resetRun(0); give(['i_unlock']);
  const mob = spawnAt(key, 240, 400); let peak = 0;
  for (let i = 0; i < 300; i++) { GP.update(1 / 60); peak = Math.max(peak, mob.freezeT); }
  return peak;
}
const mobFreeze = freezeOn('grunt'), bossFreeze = freezeOn('boss');
ok('冰系可冻住普通怪', mobFreeze > 0, '最长冻住 ' + mobFreeze.toFixed(2) + 's');
ok('冰冻时长不超过 2s 上限', mobFreeze <= C.control.freezeCap + 1e-6, '峰值 ' + mobFreeze.toFixed(2) + 's');
ok('首领抗性缩短冰冻', bossFreeze > 0 && bossFreeze < mobFreeze, '首领 ' + bossFreeze.toFixed(2) + 's < 普通怪 ' + mobFreeze.toFixed(2) + 's');

/* 雷系：一次放电应串出多条传导弧（chain 基础 10 个目标） */
GP.resetRun(0); give(['t_unlock']);
for (let i = 0; i < 16; i++) spawnAt('grunt', 40 + i * 25, 200 + (i % 4) * 30);
let maxArcs = 0, hurt = {};
for (let i = 0; i < 600; i++) { GP.update(1 / 60);
  maxArcs = Math.max(maxArcs, G.arcs.length);
  G.enemies.forEach(e => { if (e.hp < e.maxhp) hurt[e.id] = 1; }); }
ok('雷系传导一次能串 ≥8 跳', maxArcs >= 8, '单帧最多 ' + maxArcs + ' 条弧');
ok('雷系能覆盖多个目标', Object.keys(hurt).length >= 8, '受伤目标 ' + Object.keys(hurt).length);

/* 风系：命中把怪往后吹 */
GP.resetRun(0); give(['w_unlock']);
const pushed = spawnAt('runner', 240, 420); const y0 = pushed.y;
frames(300);
ok('风系击退生效（向后推）', pushed.y < y0 || pushed.dead, 'y ' + y0 + ' → ' + pushed.y.toFixed(0));

/* 毒系：DoT 持续掉血 + 腐爆产生毒雾区 */
GP.resetRun(0); give(['p_unlock', 'p_burst']);
const poisoned = spawnAt('tank', 240, 300);
poisoned.hp = 6;
let sawPoisonZone = false, sawDoT = false;
for (let i = 0; i < 900; i++) { GP.update(1 / 60);
  if (poisoned.poisonT > 0) sawDoT = true;
  if (G.zones.some(z => z.kind === 'poison')) sawPoisonZone = true; }
ok('毒系 DoT 挂得上', sawDoT);
ok('毒系 DoT 能磨死怪', poisoned.dead, 'hp=' + poisoned.hp.toFixed(1));
ok('腐爆：中毒怪死亡炸出毒雾区', sawPoisonZone, 'zones 峰值=' + G.zones.length);

/* 数量/机制卡必须付伤害代价 */
GP.resetRun(0);
const d0 = G.weapons.basic.derived.dmg;
give(['b_split', 'b_split']);
ok('齐射分裂 +2 且掉伤害', G.weapons.basic.derived.count === 3 && G.weapons.basic.derived.dmg < d0,
  'count=' + G.weapons.basic.derived.count + ' dmg ' + d0.toFixed(2) + ' → ' + G.weapons.basic.derived.dmg.toFixed(2));
GP.resetRun(0); give(['b_power', 'b_power']);
ok('纯强度卡不掉伤害', G.weapons.basic.derived.dmg > d0, 'dmg=' + G.weapons.basic.derived.dmg.toFixed(2));

/* 六把武器独立冷却：解锁火系后，普攻与火球各自计时互不替换 */
GP.resetRun(0); give(['f_unlock']);
frames(120);
const cdBasic = G.weapons.basic.cd, cdFire = G.weapons.fire.cd;
ok('火系与普攻独立冷却', cdBasic > 0 && cdFire > 0, 'basic=' + Math.round(cdBasic) + 'ms fire=' + Math.round(cdFire) + 'ms');

console.log(fails ? '\n== ' + fails + ' 项未通过 ==' : '\n== 全部通过 ==');
process.exit(fails ? 1 : 0);
