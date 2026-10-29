"use strict";
const test = require('node:test'), assert = require('node:assert/strict');
const { createGame } = require('./harness');
function setup(endless = false) {
  const h = createGame({ stars: [1, 1, 1] }); h.GP.resetRun(endless ? -1 : 0);
  h.equip(['chain', 'lightning', 'waterball', 'geyser']); return h;
}
function open(h) { h.GP.grantExperience(h.G.player.xpv - h.G.player.xp); }
function full(h, choices = h.G.choices) { return choices.filter(c => c.card.unlock && h.R.skill(c.card.skill).mode === 'fullscreen'); }
function upgrade(h) { assert.equal(h.GP.applyChoice(h.G.choices.find(c => !c.card.unlock)), true); }
test('达成前置后30%起步，每次选择加10个百分点，第8次和未选的第9次均必出', () => {
  for (const endless of [false, true]) {
    const h = setup(endless); h.setRandom(() => .99999);
    for (let round = 1; round <= 10; round++) {
      h.G.choiceHistory = [['electric'], ['electric']]; open(h);
      assert.equal(h.GP.fullscreenChance(), Math.min(100, 30 + 10 * (round - 1)));
      assert.equal(full(h).length, round < 8 ? 0 : 1);
      assert.equal(h.G.choices.length, 4); assert.equal(new Set(h.G.choices.map(c => c.card.id)).size, 4);
      assert.ok(h.G.choices.some(c => !c.card.unlock)); upgrade(h);
    }
  }
});
test('各概率门槛精确生效，失败不能从普通随机池或第三轮保底漏出全屏', () => {
  const h = setup(); h.G.candidates = [];
  for (let i = 0; i < 7; i++) {
    h.G.fullscreenSince = 0; h.G.choicesCompleted = i;
    const threshold = (30 + i * 10) / 100;
    h.setRandom(() => threshold - .00001); assert.equal(full(h, h.GP.buildChoices()).length, 1);
    h.setRandom(() => threshold); assert.equal(full(h, h.GP.buildChoices()).length, 0);
    h.setRandom(() => .999); assert.equal(full(h, h.GP.buildChoices()).length, 0);
  }
});
test('门槛之前的选择不累计，凑齐前置的选择不算第一次等待，普通技能和强化都推进', () => {
  const h = createGame({stars:[1,1,1]}); h.GP.resetRun(-1); h.setRandom(() => .999);
  for (let i = 0; i < 8; i++) { open(h); upgrade(h); }
  assert.equal(h.GP.fullscreenChance(), 0);
  h.take('get:chain'); h.take('get:lightning'); h.take('get:waterball'); h.take('get:geyser'); open(h);
  assert.equal(h.GP.fullscreenChance(), 30); upgrade(h); open(h);
  assert.equal(h.GP.fullscreenChance(), 40);
  const ch = h.GP.choicePool().find(c => c.card.id === 'get:fireball'); h.G.choices = [ch]; h.GP.applyChoice(ch); open(h);
  assert.equal(h.GP.fullscreenChance(), 50);
});
test('刷新重抽但不加概率，无效选择不计数，出现但没选不重置，选中后其余全屏回到30%', () => {
  const h = setup(true); h.equip(['chain', 'lightning', 'waterball', 'geyser', 'windblade', 'tornado']); h.setRandom(() => .01); open(h);
  assert.equal(full(h).length, 1); h.G.refreshes = 3;
  h.setRandom(() => .99); assert.equal(h.GP.refreshChoices(), true); assert.equal(full(h).length, 0);
  assert.equal(h.GP.fullscreenChance(), 30); assert.equal(h.G.choicesCompleted, 0);
  assert.equal(h.GP.applyChoice({ card: { id: 'get:unknown' } }), false);
  h.setRandom(() => .01); h.GP.refreshChoices(); assert.equal(full(h).length, 1); upgrade(h); open(h);
  assert.equal(h.GP.fullscreenChance(), 40);
  assert.equal(h.GP.applyChoice(full(h)[0]), true); open(h);
  assert.equal(h.GP.fullscreenChance(), 30); assert.equal(full(h).length, 1);
  h.GP.resetRun(-1); assert.equal(h.G.fullscreenSince, null); assert.equal(h.GP.fullscreenChance(), 0);
});
test('多个全屏共用概率，每轮最多一个，仍有强化；满槽、前置、双向互斥优先', () => {
  const h = setup(true); h.equip(h.C.skills.filter(s => s.mode !== 'fullscreen').map(s => s.id));
  for (let i = 0; i < 100; i++) {
    h.G.fullscreenSince = 0; h.G.choicesCompleted = 8;
    const choices = h.GP.buildChoices(); assert.equal(full(h, choices).length, 1);
    assert.notEqual(full(h, choices)[0].card.unlock, 'unknown'); assert.ok(choices.some(c => !c.card.unlock));
  }
  const limited = setup(); limited.equip(['chain', 'lightning', 'waterball', 'geyser', 'fireball']);
  limited.G.fullscreenSince = 0; limited.G.choicesCompleted = 8;
  assert.equal(full(limited, limited.GP.buildChoices()).length, 0);
  const unknown = setup(true); unknown.equip(['poisonbottle', 'miasma', 'unknown']); unknown.setRandom(() => 0);
  const choices = unknown.GP.buildChoices(); assert.equal(full(unknown, choices).length, 0);
  assert.ok(choices.every(c => !c.card.unlock || unknown.R.skill(c.card.skill).el !== 'wind'));
});
test('连升按每次有效选择累计，选中全屏后同批后续选卡重置概率', () => {
  const h = setup(true); h.equip(['chain', 'lightning', 'waterball', 'geyser', 'windblade', 'tornado']); h.setRandom(() => 0);
  h.GP.grantExperience(22); assert.equal(h.G.pendingLevelUps, 3); assert.equal(h.GP.fullscreenChance(), 30);
  upgrade(h); assert.equal(h.GP.fullscreenChance(), 40);
  h.GP.applyChoice(full(h)[0]); assert.equal(h.GP.fullscreenChance(), 30); assert.equal(h.G.pendingLevelUps, 1);
});
