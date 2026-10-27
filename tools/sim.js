/* 自动对局模拟：stub 掉 Platform/Audio，直接跑 gameplay 状态机，统计各流派通关率
   用法：node tools/sim.js [--levels 1,3] [--seeds 8] [--policy all] */
"use strict";
const path = require('path');
const BASE = process.env.BASE ? path.resolve(process.env.BASE) : path.resolve(__dirname, '..');
global.window = {};
require(path.join(BASE, 'src', 'config.js'));
const PM = global.window.PixelMow;
PM.Platform = { loadProgress: () => ({ stars: [], flawless: [] }), saveProgress: () => {}, now: () => Date.now() };
PM.Audio = new Proxy({}, { get: () => () => {} });
require(path.join(BASE, 'src', 'gameplay.js'));
const GP = PM.Gameplay, C = PM.Config;
const cardById = id => C.cards.filter(c => c.id === id)[0];

/* 流派：score 越高越优先；解锁卡永远先抢，保证武器线能铺开 */
const POLICIES = {
  '解锁流': { unlockFirst: 100, 强度: 30, 数量: 20, 机制: 20, 解锁: 100 },
  '纯数值': { unlockFirst: 0, 强度: 50, 数量: 10, 机制: 10, 解锁: 0 },
  '控制流': { unlockFirst: 60, 机制: 45, 数量: 20, 强度: 15, 解锁: 60,
    bonus: { i_freeze: 25, w_knock: 25, p_burst: 20, t_chain: 15 } },
  '雷毒 AoE': { unlockFirst: 80, 机制: 40, 强度: 25, 数量: 20, 解锁: 80,
    bonus: { t_unlock: 40, p_unlock: 40, t_chain: 30, p_burst: 30, t_power: 20, p_power: 20 } }
};
function pickWith(policy, choices) {
  let best = null, bestScore = -Infinity;
  choices.forEach(choice => {
    const card = choice.card;
    let score = policy[card.cat] || 0;
    if (card.unlock && policy.unlockFirst) score += policy.unlockFirst;
    if (policy.bonus && policy.bonus[card.id]) score += policy.bonus[card.id];
    score += Math.random() * 2;
    if (score > bestScore) { bestScore = score; best = choice; }
  });
  return best;
}

function simulate(levelIndex, policy, seed) {
  let s = seed;
  Math.random = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  GP.resetRun(levelIndex);
  const G = GP.state, dt = 1 / 60;
  let guard = 0, maxOnScreen = 0;
  while (G.state !== 'cleared' && G.state !== 'over' && guard < 60 * 60 * 45) {
    guard++;
    if (G.state === 'levelup') { if (G.choices.length) GP.applyChoice(pickWith(policy, G.choices)); else G.state = 'playing'; continue; }
    maxOnScreen = Math.max(maxOnScreen, G.enemies.filter(e => !e.dead).length);
    GP.update(dt);
  }
  const build = G.cardOrder.filter(id => !cardById(id).unlock).map(id => cardById(id).name + G.cardLevels[id]).join('/');
  const weapons = C.weapons.filter(w => G.weapons[w.id].owned).map(w => w.name.slice(0, 2)).join('+');
  return { outcome: G.state, wave: G.waveIndex + 1, sec: (G.time / 1000) | 0, lvl: G.player.lvl,
    kills: G.player.kills, hp: Math.ceil(G.player.hp), maxhp: G.player.maxhp, maxOnScreen, weapons, build };
}

const argv = process.argv.slice(2);
const arg = (name, dflt) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : dflt; };
const SEEDS = parseInt(arg('seeds', '8'), 10);
const LEVELS = (arg('levels', '0,1,2,3,4') + '').split(',').map(Number);
const policyNames = arg('policy', 'all') === 'all' ? Object.keys(POLICIES) : [arg('policy', 'all')];

console.log('波次 ' + C.waveCount + ' 波/关 · 每关小怪 ' +
  C.levels[0].waves.reduce((sum, w) => sum + w.kills - (w.boss ? 1 : 0), 0) + ' 只 · 卡池 ' + C.cards.length + ' 张\n');
LEVELS.forEach(lv => {
  policyNames.forEach(name => {
    const policy = POLICIES[name]; let cleared = 0, secs = [], deaths = [], last = null;
    for (let k = 0; k < SEEDS; k++) {
      const r = simulate(lv, policy, 7919 * (lv + 1) + k * 131);
      last = r;
      if (r.outcome === 'cleared') { cleared++; secs.push(r.sec); } else deaths.push(r.wave);
    }
    const avg = secs.length ? Math.round(secs.reduce((a, b) => a + b, 0) / secs.length) : 0;
    console.log(C.levels[lv].name.padEnd(5) + ' ' + name.padEnd(6) + ' 通关 ' + cleared + '/' + SEEDS +
      (cleared ? '  均时 ' + avg + 's' : '') + (deaths.length ? '  阵亡波 ' + deaths.join(',') : '') +
      '  末态 Lv' + last.lvl + ' 同屏峰 ' + last.maxOnScreen);
    if (last.weapons) console.log('        武器 ' + last.weapons + ' │ ' + last.build);
  });
});
