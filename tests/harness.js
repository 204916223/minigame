"use strict";
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
function createGame(progress, seed = 1, wechat = false, initialStorage = {}) {
  let clock = 0, randomState = seed >>> 0;
  const math = Object.create(Math);
  math.random = () => { randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0; return randomState / 4294967296; };
  const ctx = new Proxy({}, { get: (obj, k) => k in obj ? obj[k] : k === 'measureText' ? text => ({ width: String(text).length * 10 }) : k.startsWith('create') ? () => ({ addColorStop() {} }) : () => {}, set: (obj, k, v) => { obj[k] = v; return true; } });
  const canvas = { width: 480, height: 640, getContext: () => ctx, getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 640 }), addEventListener() {} };
  const storage = { ...initialStorage };
  // 普通战斗测试直接构造当前版本存档；旧档测试通过 initialStorage 传入真实旧键。
  if (progress !== undefined) storage['pixelMowProgress.v3'] = JSON.stringify(progress);
  const events = {};
  const sandbox = { window: { devicePixelRatio: 1, addEventListener: (name, callback) => { events[name] = callback; } }, document: { getElementById: () => canvas },
    Math: math, setTimeout: fn => fn(), performance: { now: () => clock }, localStorage: { getItem: k => storage[k] || null, setItem: (k, v) => { storage[k] = v; }, removeItem: k => { delete storage[k]; } } };
  if (wechat) {
    sandbox.GameGlobal = sandbox.window;
    sandbox.wx = { createCanvas: () => canvas, getWindowInfo: () => ({ windowWidth: 480, windowHeight: 640, safeArea: { top: 20, bottom: 620 } }),
      getStorageSync: k => storage[k] || '', setStorageSync: (k,v) => { storage[k] = v; }, removeStorageSync: k => { delete storage[k]; }, onTouchStart() {} };
  }
  vm.createContext(sandbox);
  const generatedEvents = [];
  ['config', 'rules', 'combat', 'platform', 'audio', 'gameplay', 'renderer', 'input'].forEach(name => {
    if (name === 'gameplay') {
      const combat = sandbox.window.PixelMow.Combat, create = combat.create;
      combat.create = (state, hooks) => create(state, Object.assign({}, hooks, { generated: event => generatedEvents.push(event) }));
    }
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', name + '.js'), 'utf8'), sandbox, { filename: name + '.js' });
  });
  const PM = sandbox.window.PixelMow, GP = PM.Gameplay, G = GP.state;
  PM.Platform.setupCanvas();
  let nextId = 100000;
  function target(x = 240, y = 300, options = {}) {
    const e = Object.assign({ id: ++nextId, x, y, hp: 10000, maxhp: 10000, spd: 0, xp: 0, dmg: 1, r: 12, cell: 3, spr: 'slime', color: '#fff', resist: {}, def: 0, flash: 0, freezeT: 0, poisonT: 0, dead: false }, options);
    G.enemies.push(e); return e;
  }
  function equip(ids) {
    G.equippedOrder = [PM.Config.loadout.initial].concat(ids.filter(id => id !== PM.Config.loadout.initial));
    PM.Config.skills.forEach(s => { G.skills[s.id].owned = G.equippedOrder.includes(s.id); });
    GP.recompute();
  }
  function take(id) {
    if (G.state !== 'levelup') GP.grantExperience(G.player.xpv - G.player.xp);
    const choice = GP.choicePool().find(ch => ch.card.id === id);
    if (!choice) throw new Error('无法获取 ' + id);
    G.choices = [choice]; return GP.applyChoice(choice);
  }
  function frames(n) { for (let i = 0; i < n; i++) { clock += 1000 / 60; GP.update(1 / 60); } }
  return { random: math.random, PM, C: PM.Config, R: PM.Rules, GP, G, target, equip, take, frames, storage, events, generatedEvents, advanceClock: ms => { clock += ms; } };
}
module.exports = { createGame };
