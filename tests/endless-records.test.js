"use strict";
const test = require('node:test'), assert = require('node:assert/strict');
const { createGame } = require('./harness');
function start(wechat, progress = {}) {
  const h = createGame({ stars: [1, 1, 1], candidates: [], ...progress }, 1, wechat);
  h.GP.resetRun(-1); h.G.spawnTimer = 1e8; h.G.skills.basic.owned = false; return h;
}
function kill(h, count) {
  for (let i = 0; i < count; i++) {
    const e = h.target(240, 200, { hp: 1, xp: 0 });
    h.GP.combat.hit(e, h.G.skills.basic.derived);
    h.GP.combat.hit(e, h.G.skills.basic.derived); // 同一尸体不重复计数
  }
}
function next(h) { h.G.waveSpawned = 1005; h.G.waveLead = .001; h.GP.update(1 / 60); }
function reload(h, wechat) { return createGame(undefined, 1, wechat, h.storage); }
for (const wechat of [false, true]) {
  const label = wechat ? '微信' : '浏览器';
  test(label + '最高通过波次排除当前波，过波即保存；失败保存单局击杀，重试不重置纪录', () => {
    const h = start(wechat); kill(h, 3);
    h.GP.bankCoins(); assert.equal(h.G.progress.endless.bestWave, 0);
    next(h); assert.equal(h.G.waveIndex, 1);
    assert.equal(reload(h, wechat).G.progress.endless.bestWave, 1);
    kill(h, 4);
    h.target(240, h.GP.dangerY(), { hp: 1e9 }); h.GP.update(1 / 60);
    assert.equal(h.G.state, 'over');
    assert.equal(h.G.progress.endless.bestWave, 1);
    assert.equal(h.G.progress.endless.bestKills, 7);
    assert.equal(reload(h, wechat).G.progress.endless.bestKills, 7);
    h.PM.Renderer.render(0); const back = h.G.ui.back;
    h.PM.Input.tap(back.x + 1, back.y + 1); assert.equal(h.G.state, 'endlessselect');
    h.GP.resetRun(-1); assert.equal(h.G.player.kills, 0); assert.equal(h.G.waveIndex, 0);
    assert.equal(h.G.progress.endless.bestWave, 1); assert.equal(h.G.progress.endless.bestKills, 7);
  });
  test(label + '最高波次和最多击杀独立取最大值，退出与直接重开均保存，普通关不污染纪录', () => {
    const h = start(wechat, { endless: { bestWave: 2, bestKills: 10 } });
    kill(h, 5); next(h); next(h); next(h);
    h.GP.openEndlessSelect();
    assert.equal(h.G.progress.endless.bestWave, 3); assert.equal(h.G.progress.endless.bestKills, 10);
    h.GP.resetRun(-1); kill(h, 12); h.GP.resetRun(-1);
    assert.equal(h.G.progress.endless.bestWave, 3); assert.equal(h.G.progress.endless.bestKills, 12);
    h.GP.resetRun(0); h.G.waveIndex = 9; h.G.player.kills = 9999; h.GP.openMenu();
    const saved = reload(h, wechat).G.progress;
    assert.equal(saved.endless.bestWave, 3); assert.equal(saved.endless.bestKills, 12);
    assert.equal(saved.coins, 8.5); // 17 次真实无尽击杀，重复退出不重复结算
  });
  test(label + '无尽纪录页显示两个历史值，入口和按钮在安全区内', () => {
    const h = start(wechat, { endless: { bestWave: 12, bestKills: 12850 } });
    h.GP.openEndlessSelect(); const text = [];
    h.PM.Platform.ctx().fillText = value => text.push(String(value)); h.PM.Renderer.render(0);
    for (const expected of ['最高通过波次', '单局最多击杀', '12', '12850']) assert.ok(text.includes(expected));
    for (const r of [h.G.ui.endlessStart, h.G.ui.menu, h.G.ui.shop]) {
      assert.ok(r.y >= h.PM.Platform.safeTop()); assert.ok(r.y + r.h <= h.PM.Platform.safeBottom());
    }
    for (const r of [h.G.ui.selectPrev, h.G.ui.selectNext]) assert.ok(r.y + r.h <= h.PM.Platform.safeBottom());
  });
}
test('已有 v3 存档补零纪录且保留进度；非法纪录清洗，不改变存档空间', () => {
  const h = createGame({ version: 3, coins: 1000, stars: [3, 2, 1], meta: { atk: 4 }, candidates: ['fireball'] });
  assert.equal(h.G.progress.endless.bestWave, 0); assert.equal(h.G.progress.endless.bestKills, 0);
  const saved = reload(h, false).G.progress;
  assert.equal(saved.coins, 1000); assert.equal(saved.meta.atk, 4); assert.equal(saved.stars[0], 3);
  assert.deepEqual(Array.from(saved.candidates), ['fireball']);
  for (const value of [-5, NaN, Infinity, '12', null]) {
    const record = h.R.progress({ endless: { bestWave: value, bestKills: value } }).endless;
    assert.equal(record.bestWave, 0); assert.equal(record.bestKills, 0);
  }
  assert.equal(h.R.progress({ endless: { bestWave: 2.8 } }).endless.bestWave, 2);
});
