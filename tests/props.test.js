"use strict";
const test = require('node:test'), assert = require('node:assert/strict');
const { createGame } = require('./harness');

function run(progress) { const h = createGame(progress); h.GP.resetRun(0); h.G.spawnTimer = 1e6; return h; }
/* 用固定装饰替换随机地图：坐标断言才有确定性。 */
function layout(h, stones, bushes) {
  h.G.stones = stones || []; h.G.bushes = bushes || [];
  h.G.props = h.G.stones.concat(h.G.bushes);
  h.G.player.inBush = false;
}
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

test('开局随机撒点：石头与草丛都在地图内，石头之间留间距且不压出生点', () => {
  const h = run(), cfg = h.C.props, p = h.G.player;
  assert.ok(h.G.props.length > 0, '应生成装饰物');
  assert.ok(h.G.stones.length >= cfg.stoneCount * 0.8, '石头数量应接近配置值，实际 ' + h.G.stones.length);
  assert.ok(h.G.bushes.length >= cfg.bushCount * 0.8, '草丛数量应接近配置值，实际 ' + h.G.bushes.length);
  for (const s of h.G.stones) {
    assert.ok(s.x - s.r >= cfg.edge - 1e-6 && s.x + s.r <= h.C.world.w - cfg.edge + 1e-6, '石头应在地图内（横向）');
    assert.ok(s.y - s.r >= cfg.edge - 1e-6 && s.y + s.r <= h.C.world.h - cfg.edge + 1e-6, '石头应在地图内（纵向）');
    assert.ok(distance(s, p) >= cfg.spawnClear + s.r, '石头不应压住出生点');
  }
  for (let i = 0; i < h.G.stones.length; i++) for (let j = i + 1; j < h.G.stones.length; j++) {
    const a = h.G.stones[i], b = h.G.stones[j];
    assert.ok(distance(a, b) >= a.r + b.r + cfg.gap - 1e-6, '石头之间应留出可通行的间距');
  }
  for (const b of h.G.bushes) assert.ok(b.x > 0 && b.x < h.C.world.w && b.y > 0 && b.y < h.C.world.h, '草丛应在地图内');
});

test('石头阻挡角色：一直朝石头走也穿不过去', () => {
  const h = run(), p = h.G.player, heroR = h.C.hero.r;
  const stone = { kind: 'stone', x: p.x, y: p.y + 130, r: 30, phase: .7, tone: .3 };
  layout(h, [stone]);
  h.hold(0, 1, 150);
  assert.ok(Math.hypot(p.x - stone.x, p.y - stone.y) >= stone.r + heroR - 1e-6, '角色不应与石头重叠');
  assert.ok(p.y <= stone.y - stone.r - heroR + 1e-6, '角色应被石头挡在正面');
});

test('石头会挡住擦边移动：沿切线滑过而不是穿模', () => {
  const h = run(), p = h.G.player, start = { x: p.x, y: p.y };
  const stone = { kind: 'stone', x: p.x + 20, y: p.y, r: 34, phase: 0, tone: .8 };
  layout(h, [stone]);
  h.hold(1, 0, 90);
  assert.ok(Math.hypot(p.x - stone.x, p.y - stone.y) >= stone.r + h.C.hero.r - 1e-6, '全程不得穿进石头');
  assert.ok(Math.hypot(p.x - start.x, p.y - start.y) > 1, '应沿石头边缘滑走，而不是被完全钉住');
});

test('草丛可以进入：站在草丛里不透明判定为 true，且不阻挡移动', () => {
  const h = run(), p = h.G.player;
  const bx = p.x, by = p.y + 100;
  layout(h, [], [{ kind: 'bush', x: bx, y: by, r: 26, phase: 0, tone: .4 }]);
  h.GP.setMove(0, 1);
  for (let i = 0; i < 200 && Math.abs(p.y - by) > 2; i++) h.frames(1);
  h.GP.setMove(0, 0); h.frames(1);
  assert.ok(Math.abs(p.y - by) <= 2, '草丛不应阻挡角色，实际 y=' + p.y.toFixed(2));
  assert.equal(p.inBush, true, '站进草丛后应标记为在草丛内');
  /* 走出草丛后立刻恢复，避免半透明状态残留。 */
  h.GP.setMove(0, 1); h.frames(60); h.GP.setMove(0, 0); h.frames(1);
  assert.equal(p.inBush, false, '离开草丛应解除草丛状态');
});

test('敌人绕开石头追击，全程不会穿进石头', () => {
  const h = run(), p = h.G.player;
  const stone = { kind: 'stone', x: p.x, y: p.y - 120, r: 34, phase: 0, tone: .6 };
  layout(h, [stone]);
  const e = h.at(0, -260, { hp: 1e9, maxhp: 1e9, spd: 70 });
  let minClear = Infinity, frames = 0;
  while (frames < 1200 && !e.dead) {
    h.frames(1); frames++;
    minClear = Math.min(minClear, distance(e, stone) - (stone.r + e.r));
  }
  assert.ok(minClear >= -1e-6, '敌人不应穿进石头，最小间隙 ' + minClear.toFixed(3));
  assert.equal(e.dead, true, '敌人应绕过石头追上角色（1200 帧内未到达）');
});

test('刷在石头里的敌人会被挤到石头边缘', () => {
  const h = run();
  const stone = { kind: 'stone', x: 900, y: 900, r: 40, phase: 0, tone: .5 };
  layout(h, [stone]);
  const e = h.target(905, 905, { hp: 1e9, maxhp: 1e9, spd: 0 });
  h.frames(1);
  assert.ok(distance(e, stone) >= stone.r + e.r - 1e-6, '敌人应被推出石头');
});

test('装饰物不影响渲染：石头、草丛与草丛内的角色都能画出来', () => {
  const h = run(), p = h.G.player;
  layout(h, [{ kind: 'stone', x: p.x + 60, y: p.y, r: 26, phase: 1, tone: .7 }],
    [{ kind: 'bush', x: p.x, y: p.y, r: 28, phase: 2, tone: .2 }]);
  h.frames(1);
  p.inBush = true;
  h.PM.Renderer.render(0);
  h.PM.Renderer.render(16);
  assert.equal(h.G.state, 'playing');
});
