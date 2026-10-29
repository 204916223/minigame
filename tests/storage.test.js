"use strict";
const test = require('node:test'), assert = require('node:assert/strict');
const { createGame } = require('./harness');
const KEY = 'pixelMowProgress.v3';
for (const wechat of [false, true]) {
  const label = wechat ? '微信' : '浏览器';
  const encoded = value => wechat ? value : JSON.stringify(value);
  test(label + '发布清档：清除所有旧进度和备份，其他应用数据保留', () => {
    for (const version of [undefined, 1, 2]) {
      const old = { version, coins: 999999, stars: [3, 3, 3, 3, 3], flawless: [true],
        meta: { atk: 40, def: 40, hp: 40, haste: 40, shield: 40 }, candidates: ['windblade'] };
      const h = createGame(undefined, 1, wechat, {
        pixelMowProgress: encoded(old), 'pixelMowProgress.beforeV2': encoded(old), otherApp: 'keep'
      });
      assert.equal(h.G.progress.version, 3);
      assert.equal(h.G.progress.coins, 0);
      assert.ok(h.G.progress.stars.every(n => n === 0));
      assert.ok(h.G.progress.flawless.every(n => n === false));
      assert.ok(Object.values(h.G.progress.meta).every(n => n === 0));
      assert.deepEqual(Array.from(h.G.progress.candidates), Array.from(h.C.loadout.defaults));
      assert.equal(h.GP.isLevelUnlocked(1), false);
      assert.equal(h.GP.isEndlessUnlocked(), false);
      assert.equal(h.storage.pixelMowProgress, undefined);
      assert.equal(h.storage['pixelMowProgress.beforeV2'], undefined);
      assert.equal(h.storage.otherApp, 'keep');
      assert.ok(h.storage[KEY]);
    }
  });
  test(label + '清档只执行一次，新金币、养成、星级和备战在重开后保留；旧页面写入不覆盖新档', () => {
    const h = createGame(undefined, 1, wechat, { pixelMowProgress: encoded({ coins: 100000 }) });
    h.G.progress.coins = 1500.5;
    assert.equal(h.GP.buyMeta('atk'), true);
    h.G.progress.stars = [3, 2, 1, 0, 0];
    h.G.progress.flawless[0] = true;
    h.G.progress.candidates = ['fireball'];
    h.PM.Platform.saveProgress(h.G.progress);
    h.storage.pixelMowProgress = encoded({ version: 2, coins: 999999, stars: [3, 3, 3, 3, 3] });
    const reload = createGame(undefined, 1, wechat, h.storage);
    assert.equal(JSON.stringify(reload.G.progress), JSON.stringify(h.G.progress));
    assert.equal(reload.G.progress.coins, 500.5);
    assert.equal(reload.G.progress.meta.atk, 1);
    assert.equal(reload.GP.isEndlessUnlocked(), true);
    assert.equal(reload.storage.pixelMowProgress, undefined);
    const again = createGame(undefined, 1, wechat, reload.storage);
    assert.equal(JSON.stringify(again.G.progress), JSON.stringify(reload.G.progress));
  });
  test(label + '新档损坏时安全初始化，绝不回退到旧备份', () => {
    const h = createGame(undefined, 1, wechat, {
      [KEY]: '{invalid', 'pixelMowProgress.beforeV2': encoded({ coins: 9999, stars: [3] })
    });
    assert.equal(h.G.progress.coins, 0);
    assert.ok(h.G.progress.stars.every(n => n === 0));
    assert.ok(h.storage[KEY]);
    const reload = createGame(undefined, 1, wechat, h.storage);
    assert.equal(JSON.stringify(reload.G.progress), JSON.stringify(h.G.progress));
  });
}
