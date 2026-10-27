"use strict";
const path = require('path');
const BASE = process.env.BASE ? path.resolve(process.env.BASE) : path.resolve(__dirname, '..');
global.window = {};
require(path.join(BASE, 'src', 'config.js'));
const PM = global.window.PixelMow, C = PM.Config;
const progress = { stars: [], flawless: [], coins: 0, meta: { hp: 0, shield: 0, def: 0, haste: 0 } };
PM.Platform = { loadProgress: () => progress, saveProgress: () => {}, now: () => Date.now() };
PM.Audio = new Proxy({}, { get: () => () => {} });
require(path.join(BASE, 'src', 'gameplay.js'));
const GP = PM.Gameplay, G = GP.state;

function pick(choices) {
  const order = ['解锁', '数量', '强度', '机制'];
  for (const cat of order) { const c = choices.find(ch => ch.card.cat === cat); if (c) return c; }
  return choices[0];
}
function run(seed) {
  let s = seed; Math.random = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  GP.resetRun(0);
  const dt = 1 / 60; let guard = 0;
  while (G.state !== 'cleared' && G.state !== 'over' && guard < 60 * 60 * 30) {
    guard++;
    if (G.state === 'levelup') { if (G.choices.length) GP.applyChoice(pick(G.choices)); else G.state = 'playing'; continue; }
    GP.update(dt);
  }
  return { outcome: G.state, wave: G.waveIndex + 1, kills: G.player.kills, lvl: G.player.lvl, coins: G.progress.coins };
}
console.log('初始 coins=' + progress.coins + ' meta=' + JSON.stringify(progress.meta));
for (let i = 0; i < 3; i++) {
  const r = run(9001 + i * 37);
  console.log(`第 ${i + 1} 把：${r.outcome} wave ${r.wave} lvl ${r.lvl} kills ${r.kills} → coins ${progress.coins}`);
  const order = ['atk', 'hp', 'shield', 'def', 'haste'];
  let bought = 0;
  for (let pass = 0; pass < 30; pass++) {
    let any = false;
    for (const id of order) { if (GP.buyMeta(id)) { any = true; bought++; } }
    if (!any) break;
  }
  console.log(`  升级 ${bought} 次，剩余 ${progress.coins}，meta=${JSON.stringify(progress.meta)}`);
}
let cleared = 0;
for (let k = 0; k < 20; k++) { const r = run(500 + k * 131); if (r.outcome === 'cleared') cleared++; }
console.log(`强化后 20 把：通关 ${cleared}/20`);
