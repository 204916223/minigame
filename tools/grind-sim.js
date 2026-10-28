/* 局外养成闭环模拟：按「打不动就回去买强化再来」的真实节奏，逐关推进
   用法：node tools/grind-sim.js [--attempts 8]
   回答的问题：每关要 grind 几把才第一次通关、通关后 10 把的通过率是多少 */
"use strict";
const path = require('path');
const BASE = path.resolve(__dirname, '..');
global.window = {};
require(path.join(BASE, 'src', 'config.js'));
const PM = global.window.PixelMow, C = PM.Config;
const progress = { stars: [], flawless: [], coins: 0, meta: { atk: 0, hp: 0, shield: 0, def: 0, haste: 0 } };
PM.Platform = { loadProgress: () => progress, saveProgress: () => {}, now: () => Date.now() };
PM.Audio = new Proxy({}, { get: () => () => {} });
require(path.join(BASE, 'src', 'gameplay.js'));
const GP = PM.Gameplay, G = GP.state;

function pick(choices) {
  const order = ['解锁', '数量', '强度', '机制'];
  for (const cat of order) { const c = choices.find(ch => ch.card.cat === cat); if (c) return c; }
  return choices[0];
}
function run(level, seed) {
  let s = seed; Math.random = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  GP.resetRun(level);
  const dt = 1 / 60; let guard = 0;
  while (G.state !== 'cleared' && G.state !== 'over' && guard < 60 * 60 * 25) {
    guard++;
    if (G.state === 'levelup') { if (G.choices.length) GP.applyChoice(pick(G.choices)); else G.state = 'playing'; continue; }
    GP.update(dt);
  }
  return { outcome: G.state, wave: G.waveIndex + 1, lvl: G.player.lvl, kills: G.player.kills,
    stars: G.result ? G.result.stars : 0, coins: progress.coins, meta: JSON.stringify(progress.meta) };
}
function spendAll() { /* 金币全砸下去：按 攻→血→盾→防→速 顺序买 */
  let bought = 0;
  for (let pass = 0; pass < 40; pass++) {
    let any = false;
    for (const id of ['atk', 'hp', 'shield', 'def', 'haste']) if (GP.buyMeta(id)) { any = true; bought++; }
    if (!any) break;
  }
  return bought;
}
const argv = process.argv.slice(2);
const attempts = +(argv.indexOf('--attempts') >= 0 ? argv[argv.indexOf('--attempts') + 1] : 8);

C.levels.forEach((lv, i) => {
  let firstClear = 0, deaths = [];
  for (let k = 1; k <= attempts; k++) {
    const r = run(i, 4241 + i * 977 + k * 61);
    if (r.outcome === 'cleared') { firstClear = k; break; }
    deaths.push(r.wave);
    spendAll();
  }
  if (!firstClear) { console.log(`${lv.name}：${attempts} 把内没打通（阵亡波 ${deaths.join(',')}）meta=${JSON.stringify(progress.meta)}`); return; }
  let cleared = 0, secs = [];
  for (let k = 0; k < 10; k++) { const r = run(i, 77 + i * 13 + k * 29); if (r.outcome === 'cleared') cleared++; }
  console.log(`${lv.name}：第 ${firstClear} 把首次通关（此前阵亡波 ${deaths.join(',') || '—'}）` +
    ` → 通关后 10 把 ${cleared}/10 │ 星 ${progress.stars.filter(Boolean).join('/')} │ 金币 ${progress.coins} │ meta=${JSON.stringify(progress.meta)}`);
  spendAll();
});
