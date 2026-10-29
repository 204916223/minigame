"use strict";
const test = require('node:test'), assert = require('node:assert/strict');
const { createGame } = require('./harness');
function run(progress) { const h = createGame(progress); h.GP.resetRun(0); h.G.spawnTimer = 1e6; return h; }
function key(h, code, down = true) {
  h.events.keydown({ code, key: code, preventDefault() {} });
  if (!down) h.events.keyup({ code, preventDefault() {} });
}

test('WASD 与方向键驱动角色移动，斜向不加速，松键即停', () => {
  const h = run(); h.PM.Input.bind();
  const start = { x: h.G.player.x, y: h.G.player.y }, speed = h.C.hero.speed;
  h.events.keydown({ code: 'KeyD', preventDefault() {} }); h.frames(60);
  assert.ok(Math.abs(h.G.player.x - (start.x + speed)) < 1e-6); assert.equal(h.G.player.y, start.y);
  h.events.keyup({ code: 'KeyD', preventDefault() {} }); h.frames(30);
  assert.ok(Math.abs(h.G.player.x - (start.x + speed)) < 1e-6);
  h.GP.resetRun(0); h.G.spawnTimer = 1e6;
  h.events.keydown({ code: 'KeyW', preventDefault() {} }); h.events.keydown({ code: 'KeyD', preventDefault() {} }); h.frames(60);
  assert.ok(Math.abs(h.G.player.x - (start.x + speed / Math.SQRT2)) < 1e-6);
  assert.ok(Math.abs(h.G.player.y - (start.y - speed / Math.SQRT2)) < 1e-6);
  h.events.keyup({ code: 'KeyW', preventDefault() {} }); h.events.keyup({ code: 'KeyD', preventDefault() {} });
});

test('角色被夹在地图内，镜头跟随并在地图边界停住', () => {
  const h = run(), C = h.C;
  h.GP.setMove(1, 0); h.frames(600);
  assert.equal(h.G.player.x, C.world.w - C.hero.r);
  assert.equal(h.G.cam.x, C.world.w - C.width);
  assert.equal(h.GP.view().x + h.GP.view().w, C.world.w);
  h.GP.setMove(0, 1); h.frames(600);
  assert.equal(h.G.player.y, C.world.h - C.hero.r);
  assert.equal(h.G.cam.y, C.world.h - C.height);
  h.GP.setMove(-1, -1); h.frames(1200);
  assert.equal(h.G.player.x, C.hero.r); assert.equal(h.G.player.y, C.hero.r);
  assert.equal(h.G.cam.x, 0); assert.equal(h.G.cam.y, 0);
});

test('敌人从视口外的环形随机点刷入，且始终落在世界地图内', () => {
  const h = run(), C = h.C, sides = new Set(), angles = [];
  h.GP.setMove(0, 0);
  for (let batch = 0; batch < 24; batch++) {
    const before = h.G.enemies.length;
    h.G.waveSpawned = 0; h.G.spawnTimer = 0; h.GP.update(1 / 60);
    const fresh = h.G.enemies.slice(before);
    fresh.forEach(e => { e.spd = 0; });
    assert.ok(fresh.length >= 1);
    const view = h.GP.view();
    for (const e of fresh) {
      const outside = e.x < view.x || e.x > view.x + view.w || e.y < view.y || e.y > view.y + view.h;
      assert.ok(outside, '刷在视口内 ' + e.x + ',' + e.y);
      assert.ok(e.x >= 0 && e.x <= C.world.w && e.y >= 0 && e.y <= C.world.h);
      const dx = e.x - h.G.player.x, dy = e.y - h.G.player.y;
      angles.push(Math.atan2(dy, dx));
      sides.add(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'E' : 'W') : (dy > 0 ? 'S' : 'N'));
    }
  }
  assert.ok(angles.length >= 24);
  assert.equal(sides.size, 4, '整场刷怪应覆盖四个方向');
});

test('贴墙时刷怪点仍然有效：不会卡在地图外，也不会因角度不可用而失败', () => {
  const h = run(), C = h.C;
  h.G.player.x = C.hero.r; h.G.player.y = C.hero.r; h.GP.clampCamera();
  for (let i = 0; i < 40; i++) { const p = h.GP.ringPoint(); assert.ok(p.x >= 0 && p.x <= C.world.w && p.y >= 0 && p.y <= C.world.h, JSON.stringify(p)); }
});

test('敌人全向追击角色，贴身碰撞先扣防御再扣血并消失', () => {
  const h = run();
  const e = h.at(-200, 0, { hp: 150, maxhp: 150, spd: 60 });
  h.frames(1);
  assert.ok(e.x > h.G.player.x - 200, '敌人应向角色靠近');
  const before = h.G.player.hp;
  e.x = h.G.player.x; e.y = h.G.player.y;
  h.frames(1);
  assert.equal(e.dead, true);
  assert.equal(h.G.player.hp, before - (150 - h.G.player.defense));
});

test('触屏摇杆：拖拽方向决定移动，松开即停；点击 UI 不会误触发摇杆', () => {
  const h = run(), start = h.G.player.x;
  h.PM.Input.startJoy(240, 320); h.PM.Input.moveJoy(286, 320); h.frames(60);
  assert.ok(Math.abs(h.G.player.x - (start + h.C.hero.speed)) < 1e-6);
  assert.ok(h.G.joy && h.G.joy.active);
  h.PM.Input.endJoy(); h.frames(30);
  assert.ok(Math.abs(h.G.player.x - (start + h.C.hero.speed)) < 1e-6);
  assert.equal(h.G.joy, null);
  h.PM.Renderer.render(0);
  h.advanceClock(300);
  const slot = h.G.ui.skillSlots[0];
  assert.equal(h.PM.Input.tap(slot.x + slot.w / 2, slot.y + slot.h / 2), true);
  h.advanceClock(300);
  assert.equal(h.PM.Input.tap(240, 200), false);
});
