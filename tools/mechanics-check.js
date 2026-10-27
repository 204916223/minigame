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

['menu', 'levelselect', 'playing', 'levelup', 'over', 'cleared'].forEach(s => {
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
ok('传导链没有把血量算成 NaN', G.enemies.every(e => isFinite(e.hp)),
  '非有限血量 ' + G.enemies.filter(e => !isFinite(e.hp)).length + ' 个');

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

/* 波次地板数量 */
ok('每波数量 200~501', C.levels.every(l => l.waves.every(w => w.kills >= 200 && w.kills <= 501)),
  '第 1 波 ' + C.levels[0].waves[0].kills + ' 只 · 末波 ' + C.levels[0].waves[9].kills + ' 只');
ok('末波是 501 只并包含首领', C.levels.every(l => l.waves[9].kills === 501 && l.waves[9].boss),
  C.levels.map(l => l.waves[9].kills).join(' / '));
ok('每波刷怪数量递增到 501', C.levels[0].waves.every((w, i, a) => i === 0 || w.kills >= a[i - 1].kills),
  C.levels[0].waves.map(w => w.kills).join(' / '));

/* 成组刷怪：一次 13~18 只 */
GP.resetRun(0); G.spawnTimer = 0; GP.update(1 / 60);
ok('一次刷新 13~18 只', G.enemies.length >= 13 && G.enemies.length <= 18, 'count=' + G.enemies.length);

/* 隐藏机制：主角升级后，场上怪物防御/血量/速度线性 +5% */
GP.resetRun(0);
const lvTarget = spawnAt('grunt', 240, 300);
lvTarget.hp = 100; lvTarget.maxhp = 100; lvTarget.spd = 10; lvTarget.def = 1;
G.player.xp = G.player.xpv;
GP.grantExperience(0);
ok('升级后场上怪物血量/防御/速度 +5%',
  Math.abs(lvTarget.hp - 105) < 1e-6 && Math.abs(lvTarget.maxhp - 105) < 1e-6 &&
  Math.abs(lvTarget.spd - 10.5) < 1e-6 && Math.abs(lvTarget.def - 1.05) < 1e-6,
  'hp=' + lvTarget.hp + ' spd=' + lvTarget.spd + ' def=' + lvTarget.def);
GP.resetRun(0);

/* 满槽后卡池不再出解锁卡 */
GP.resetRun(0);
const unlockIds = C.cards.filter(c => c.unlock).map(c => c.id);
/* buildChoices 未导出，用一次真实 openLevelUp 观察卡池 */
function poolHasUnlock() {
  let found = false;
  for (let i = 0; i < 40; i++) {
    G.pendingLevelUps = 1; G.choices = []; G.state = 'playing'; GP.update(1 / 60);
    if (G.choices.some(ch => ch.card.unlock)) found = true;
  }
  return found;
}
ok('4 把武器时卡池仍会出解锁卡', poolHasUnlock() === true);
give(unlockIds.slice(0, 4)); /* 普攻自带 1 槽 + 4 把解锁 = 满 5 槽 */
ok('满 ' + C.weaponSlots + ' 槽（普攻 + 4 把解锁）', GP.ownedWeapons() === C.weaponSlots, 'owned=' + GP.ownedWeapons());
ok('满槽后不再发解锁卡', poolHasUnlock() === false);
G.pendingLevelUps = 1; G.state = 'playing'; GP.update(1 / 60);
ok('满槽时三选一全是强化卡', G.choices.length > 0 && !G.choices.some(ch => ch.card.unlock),
  G.choices.map(ch => ch.card.name).join(' / '));

/* 混合卡池：没选过技能时只出新技能；选过之后随机混出；刷新重抽 */
function choiceNames(list) { return list.map(ch => ch.card.name).join(' / '); }
GP.resetRun(0); G.pendingLevelUps = 1; G.state = 'playing'; GP.update(1 / 60);
ok('没选过技能时只出新技能', G.choices.length > 0 && G.choices.every(ch => ch.card.unlock), choiceNames(G.choices));
const pickedUnlock = G.choices[0];
GP.applyChoice(pickedUnlock);
ok('获得新技能本身不附带强化', G.cardOrder.length === 1 && G.cardOrder[0] === pickedUnlock.card.id &&
  G.cardLevels[pickedUnlock.card.id] === 1 && GP.ownedWeapons() === 2, '已选 ' + pickedUnlock.card.name);
G.pendingLevelUps = 1; G.choices = []; G.state = 'playing'; GP.update(1 / 60);
ok('选过技能后仍是三选一', G.choices.length > 0, choiceNames(G.choices));
ok('选过技能后卡池只含新技能或强化卡', G.choices.every(ch => ch.card.unlock || G.weapons[ch.card.weapon].owned), choiceNames(G.choices));

/* 刷新：第 3/6/9 波后各 +1，可在升级界面重抽 */
GP.resetRun(0); G.refreshes = 1; G.pendingLevelUps = 1; G.state = 'playing'; GP.update(1 / 60);
ok('有刷新机会时可用', G.refreshes === 1 && GP.refreshChoices() === true, 'before=' + G.refreshes);
ok('刷新消耗 1 次机会且仍有三选一', G.refreshes === 0 && G.choices.length > 0, 'after=' + G.refreshes);
ok('没有刷新机会时不能刷', GP.refreshChoices() === false, 'refreshes=' + G.refreshes);

/* 通过第 3、6、9 波后各获得 1 次刷新 */
function runWaveTransition(waveIndex) {
  GP.resetRun(0); G.state = 'playing'; G.waveIndex = waveIndex;
  G.waveSpawned = C.levels[0].waves[waveIndex].kills; G.pendingLevelUps = 0; G.refreshes = 0; G.spawnTimer = 999;
  for (let i = 0; i < 300; i++) { GP.update(1 / 60); if (G.state === 'levelup') GP.applyChoice(G.choices[0]); }
  return { wave: G.waveIndex, refreshes: G.refreshes };
}
const w3 = runWaveTransition(2), w6 = runWaveTransition(5), w9 = runWaveTransition(8);
ok('通过第 3 波获得 1 次刷新', w3.wave === 3 && w3.refreshes === 1, 'wave=' + w3.wave + ' refreshes=' + w3.refreshes);
ok('通过第 6 波获得 1 次刷新', w6.wave === 6 && w6.refreshes === 1, 'wave=' + w6.wave + ' refreshes=' + w6.refreshes);
ok('通过第 9 波获得 1 次刷新', w9.wave === 9 && w9.refreshes === 1, 'wave=' + w9.wave + ' refreshes=' + w9.refreshes);

/* 波次衔接不打断：本波刷完 3s 后直接进下一波，且不清场 */
GP.resetRun(0); G.waveSpawned = C.levels[0].waves[0].kills; G.pendingLevelUps = 0;
spawnAt('grunt', 200, 300); const leftover = G.enemies[G.enemies.length - 1];
let sawPauseState = false;
for (let i = 0; i < 200; i++) { GP.update(1 / 60); if (G.state === 'intermission') sawPauseState = true; }
ok('刷完 3s 后自动进第 2 波', G.waveIndex === 1, 'waveIndex=' + G.waveIndex);
ok('衔接期间没有暂停状态', !sawPauseState && G.state === 'playing', 'state=' + G.state);
ok('上一波残怪不被清掉', !leftover.dead || leftover.y > 300, '残怪 y=' + leftover.y.toFixed(0));
ok('提示为小 toast 文案「第 2 波来临」', /第 2 波来临/.test(G.toast.text || ''), G.toast.text);

/* 星辉：第 1 关无加成；第 2 关起每颗星 +15% 伤害 */
G.progress.stars = [3, 0, 0, 0, 0];
GP.resetRun(0);
ok('第 1 关不吃星辉加成', G.player.damageMul === 1, 'mul=' + G.player.damageMul);
GP.resetRun(1);
ok('星辉 3 星 → 伤害 ×1.45', Math.abs(G.player.damageMul - 1.45) < 1e-9,
  'mul=' + G.player.damageMul + ' 星=' + G.player.starBonus);
ok('星辉只放大伤害、不改敌人血量表', C.enemyTypes.grunt.hp === 2.2, 'grunt hp=' + C.enemyTypes.grunt.hp);
ok('关卡血量系数已分档', C.levels.every(l => l.hpMul > 1), C.levels.map(l => l.hpMul).join(' / '));
G.progress.stars = [];

console.log(fails ? '\n== ' + fails + ' 项未通过 ==' : '\n== 全部通过 ==');
process.exit(fails ? 1 : 0);
