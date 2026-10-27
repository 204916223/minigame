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
    bonus: { t_unlock: 40, p_unlock: 40, t_chain: 30, p_burst: 30, t_power: 20, p_power: 20 } },
  /* 聚焦流：只开 2 把武器，把强度卡堆满——接近高手的真实打法 */
  '聚焦流': { unlockFirst: 90, maxWeapons: 2, 强度: 70, 机制: 25, 数量: 10, 解锁: 90,
    bonus: { f_unlock: 50, f_power: 30, b_power: 20, b_rapid: 20 } },
  '数量流': { unlockFirst: 100, 强度: 20, 数量: 100, 机制: 10, 解锁: 100 },
  '伤害流': { unlockFirst: 100, 强度: 100, 数量: 0, 机制: 0, 解锁: 100 },
  '推荐流': { unlockFirst: 100, 强度: 60, 数量: 45, 机制: 25, 解锁: 100 },
  /* 乱选：四个分类同权重，用来验证「无脑点任何卡」不应稳过 */
  '乱选': { unlockFirst: 0, 强度: 0, 数量: 0, 机制: 0, 解锁: 0 }
};
function scoreChoices(policy, choices) {
  let best = null, bestScore = -Infinity;
  choices.forEach(choice => {
    const card = choice.card;
    let score = policy[card.cat] || 0;
    if (card.unlock) { if (policy.unlockFirst) score += policy.unlockFirst;
      if (policy.maxWeapons && GP.ownedWeapons() >= policy.maxWeapons) score -= 500; }
    if (policy.bonus && policy.bonus[card.id]) score += policy.bonus[card.id];
    score += Math.random() * 2;
    if (score > bestScore) { bestScore = score; best = choice; }
  });
  return best;
}
function pickWith(policy, choices) {
  let best = scoreChoices(policy, choices);
  /* 池子里没有这次想要的方向时，用一次刷新重抽（模拟“没有想要的”操作） */
  const unlockScore = (policy.unlockFirst || 0) + (policy['解锁'] || 0);
  let upScore = 0;
  ['强度', '数量', '机制'].forEach(cat => { if ((policy[cat] || 0) > upScore) upScore = policy[cat]; });
  if (GP.state.refreshes > 0 && unlockScore + upScore > 0) {
    let prefersUnlock = unlockScore > upScore;
    if (policy.maxWeapons && GP.ownedWeapons() >= policy.maxWeapons) prefersUnlock = false;
    const hasUnlock = choices.some(ch => ch.card.unlock);
    const hasUpgrade = choices.some(ch => !ch.card.unlock);
    const missing = prefersUnlock ? !hasUnlock : !hasUpgrade;
    const canGet = prefersUnlock ? GP.ownedWeapons() < C.weaponSlots : hasUnlock;
    if (missing && canGet && GP.refreshChoices()) {
      best = scoreChoices(policy, GP.state.choices);
    }
  }
  return best;
}

function simulate(levelIndex, policy, seed) {
  let s = seed;
  Math.random = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  /* 用「每关 STARS 星」建模星辉加成：前面每关按 0~3 星计入总星数 */
  const starArr = new Array(C.levels.length).fill(0);
  for (let i = 0; i < levelIndex; i++) starArr[i] = Math.min(3, STARS);
  GP.state.progress.stars = starArr;
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
const STARS = parseInt(arg('stars', '2'), 10);
const LEVELS = (arg('levels', '0,1,2,3,4') + '').split(',').map(Number);
const policyNames = arg('policy', 'all') === 'all' ? Object.keys(POLICIES) : [arg('policy', 'all')];

console.log('波次 ' + C.waveCount + ' 波/关 · 每关小怪 ' +
  C.levels[0].waves.reduce((sum, w) => sum + w.kills - (w.boss ? 1 : 0), 0) + ' 只 · 卡池 ' + C.cards.length + ' 张' +
  ' · 星辉按每关 ' + STARS + ' 星模拟\n');
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
