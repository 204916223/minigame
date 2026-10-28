/* 屏幕外击杀回归探针：commit 0a7b563 的「敌人进入画面才可被锁定」没有断言覆盖，这里补上。
   用法：node tools/offscreen-check.js */
"use strict";
const path = require('path');
const BASE = path.resolve(__dirname, '..');
global.window = {};
function ctxStub() { return new Proxy({}, { get: (t, k) => (k in t ? t[k] : k === 'measureText' ? () => ({ width: 10 }) : () => {}), set: (t, k, v) => { t[k] = v; return true; } }); }
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
const PM = global.window.PixelMow, GP = PM.Gameplay, C = PM.Config, G = GP.state;
const cardById = id => C.cards.filter(c => c.id === id)[0];
let fails = 0;
function ok(label, cond, extra) { console.log((cond ? 'PASS ' : 'FAIL ') + label + (extra ? '  ' + extra : '')); if (!cond) fails++; }

function give(ids) {
  ids.forEach(id => { const c = cardById(id);
    if (!G.cardLevels[id]) G.cardOrder.push(id);
    G.cardLevels[id] = (G.cardLevels[id] || 0) + 1;
    if (c.unlock) G.weapons[c.unlock].owned = true; });
  GP.recompute();
}
let tid = 1e6;
function target(key, x, y, hp) {
  const t = C.enemyTypes[key];
  G.enemies.push({ id: ++tid, key: key, x: x, y: y, hp: hp || 1e9, maxhp: hp || 1e9, spd: 0, xp: 1, dmg: 1,
    r: t.r, cell: t.cell, spr: t.spr, color: '#fff', resist: t.resist, sway: 0, phase: 0, flash: 0,
    freezeT: 0, poisonT: 0, poisonDps: 0, def: 1, boss: !!t.boss, dead: false });
  return G.enemies[G.enemies.length - 1];
}
/* 每段场景各自 resetRun + give，避免在未开局的 G.weapons 上写属性 */

function scenario(label, setup) {
  GP.resetRun(0); give(['f_unlock', 'w_unlock', 't_unlock', 'i_unlock', 'p_unlock', 'f_burn', 'p_burst', 't_chain', 'b_split']);
  G.waveSpawned = 99999;
  const off = setup();
  for (let i = 0; i < 1800; i++) {
    GP.update(1 / 60);
    if (G.state === 'levelup') { if (G.choices.length) GP.applyChoice(G.choices[0]); else G.state = 'playing'; }
    off.y = off.spawnY; off.x = off.spawnX; /* 钉住位置，模拟还在屏幕外走 */
  }
  ok(label, off.hp === off.maxhp, 'hp ' + off.hp + ' / ' + off.maxhp + '（y=' + off.y + '，enterY=' + C.combat.enterY + '）');
  return off;
}

/* 1) 屏幕外单独一只：所有武器都不该打到它 */
scenario('屏幕外单体不被任何武器锁定', () => {
  const off = target('grunt', 240, -40); off.spawnY = -40; off.spawnX = 240; return off;
});

/* 2) 屏幕外贴着一只屏内怪：溅射/传导/毒雾/烧伤区都不该波及屏外那只 */
scenario('溅射与传导不波及屏幕外', () => {
  const on = target('tank', 240, 300, 1e9);
  const off = target('tank', 240, -12, 1e9); off.spawnY = -12; off.spawnX = 240;
  return off;
});

/* 3) 边界值：y 刚好等于 enterY 的怪应该可以被锁定（反向确认没打过头） */
GP.resetRun(0); give(['f_unlock', 't_unlock']);
G.waveSpawned = 99999;
const edge = target('grunt', 240, C.combat.enterY);
for (let i = 0; i < 900; i++) { GP.update(1 / 60); edge.y = C.combat.enterY;
  if (G.state === 'levelup') { if (G.choices.length) GP.applyChoice(G.choices[0]); else G.state = 'playing'; } }
ok('y=enterY 的怪能被打到（没有过度屏蔽）', edge.hp < edge.maxhp, 'hp 缺口 ' + (edge.maxhp - edge.hp));

console.log(fails ? '\n== ' + fails + ' 项未通过 ==' : '\n== 全部通过 ==');
process.exit(fails ? 1 : 0);
