"use strict";
const test = require('node:test'), assert = require('node:assert/strict');
const {createGame} = require('./harness');
const multipliers = [1,1,1,1,1,1,1.1,1.2,1.3,1.4];
function spawn(h, level, wave, lvl, key = 'runner') {
  h.GP.resetRun(level); h.G.waveIndex = wave - 1; h.G.player.lvl = lvl;
  h.G.skills.basic.cd = 1e9; h.C.levels[level].waves[wave - 1].pool = {[key]:1};
  h.G.spawnTimer = 0; h.GP.update(1/60); h.G.spawnTimer = 1e8;
  return h.G.enemies[0];
}
test('五关所有怪型含首领按出生波次固定移速，角色1/20/60级均为同一倍率', () => {
  const h = createGame();
  for (let level = 0; level < 5; level++) for (let wave = 1; wave <= 10; wave++) {
    for (const lvl of [1,20,60]) for (const key of Object.keys(h.C.enemyTypes)) {
      const e = spawn(h, level, wave, lvl, key);
      const expected = h.C.enemyTypes[key].spd * h.C.levels[level].speedScale * multipliers[wave - 1];
      assert.equal(e.spd, expected, `${level + 1}关/${wave}波/${lvl}级/${key}`);
      const beforeY = e.y; h.GP.update(1/60);
      assert.ok(Math.abs(e.y - beforeY - expected / 60) < 1e-10);
    }
  }
});
test('连升不再加速场上怪物，前三波血量和4-6波防御成长保留', () => {
  const h = createGame();
  for (let wave = 1; wave <= 10; wave++) {
    const e = spawn(h, 0, wave, 20), before = {hp:e.hp, def:e.def, spd:e.spd};
    for (let i = 0; i < 5; i++) {
      h.GP.grantExperience(h.G.player.xpv - h.G.player.xp);
      assert.equal(e.spd, before.spd);
      assert.equal(h.GP.applyChoice(h.G.choices.find(ch => !ch.card.unlock)), true);
    }
    assert.equal(h.G.player.lvl, 25);
    if (wave <= 3) { assert.ok(e.hp > before.hp); assert.equal(e.def, before.def); }
    else if (wave <= 6) { assert.equal(e.hp, before.hp); assert.ok(e.def > before.def); }
    else { assert.equal(e.hp, before.hp); assert.equal(e.def, before.def); }
    h.G.spawnTimer = 0; const previous = new Set(h.G.enemies); h.GP.update(1/60);
    const fresh = h.G.enemies.find(enemy => !previous.has(enemy));
    assert.ok(fresh); assert.equal(fresh.spd, before.spd);
  }
});
test('第6-10波自然衔接使用各波固定加成，残敌保留出生移速且不累计乘算', () => {
  const h = createGame(); spawn(h, 0, 6, 30);
  for (let wave = 7; wave <= 10; wave++) {
    const previous = new Map(h.G.enemies.map(e => [e,e.spd]));
    h.G.waveSpawned = h.GP.waveConfig().kills; h.G.waveLead = .001; h.GP.update(.01);
    assert.equal(h.G.waveIndex + 1, wave);
    previous.forEach((speed,e) => assert.equal(e.spd,speed));
    h.C.levels[0].waves[wave - 1].pool = {runner:1}; h.G.spawnTimer = 0; h.GP.update(1/60);
    const fresh = h.G.enemies.filter(e => !previous.has(e)); assert.ok(fresh.length);
    fresh.forEach(e => assert.equal(e.spd, 46 * multipliers[wave - 1]));
    h.G.spawnTimer = 1e8;
  }
});
