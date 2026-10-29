"use strict";
const test = require('node:test'), assert = require('node:assert/strict');
const { createGame } = require('./harness');

function run(progress) {
  const h = createGame(progress); h.GP.resetRun(0); h.G.spawnTimer = 1e6; h.clearProps(); return h;
}
/* 把宝箱直接放到角色脚下并锁定结果：weight 只留一项，chooseWeighted 必然开它。
   这样测的是「效果对不对」，而不是概率。 */
function open(h, kind) {
  h.C.chest.weight = {}; h.C.chest.weight[kind] = 1;
  h.G.chests = [{ id: 1, x: h.G.player.x, y: h.G.player.y, r: h.C.chest.r,
    age: 0, life: h.C.chest.life, phase: 0, dead: false }];
  h.frames(1);
}
function atFeet(h) {
  h.G.chests = [{ id: 2, x: h.G.player.x, y: h.G.player.y, r: h.C.chest.r,
    age: 0, life: h.C.chest.life, phase: 0, dead: false }];
}

test('宝箱刷新率很低：首箱 12 秒后才出现，且同屏不超过上限', () => {
  const h = run(), cfg = h.C.chest;
  h.frames(Math.floor((cfg.firstDelay - 1) * 60));
  assert.equal(h.G.chests.length, 0, '首箱之前不应有任何宝箱');
  h.frames(120);
  assert.equal(h.G.chests.length, 1, '首箱应在 12 秒后出现');
  /* 之后间隔 22~34 秒；再跑 5 秒不会冒出第二只 */
  h.frames(300);
  assert.ok(h.G.chests.length <= cfg.max, '同屏宝箱不应超过上限');
  assert.ok(cfg.interval[0] >= 20, '刷新间隔应足够长，避免满地宝箱');
  assert.ok(cfg.weight.luxury < 0.1, '豪华奖励权重应明显低于普通档位');
});

test('宝箱外观完全一致：半径相同、结构里没有任何能区分增益/减益的字段', () => {
  const h = run(), cfg = h.C.chest;
  h.G.chestTimer = 0; h.frames(1);
  const box = h.G.chests[0];
  assert.equal(box.r, cfg.r);
  assert.equal(box.kind, undefined, '宝箱本体不应携带效果类型');
  assert.deepEqual(Object.keys(box).sort(), ['age', 'dead', 'id', 'life', 'phase', 'r', 'x', 'y']);
});

test('拾取：角色碰到宝箱即开启，宝箱随即消失', () => {
  const h = run();
  h.G.chestTimer = 1e6;
  atFeet(h);
  assert.equal(h.G.chests.length, 1);
  h.frames(1);
  assert.equal(h.G.chests.length, 0, '拾取后宝箱应移除');
});

test('增益与减益幅度对称：同一项的权重与数值完全相等', () => {
  const h = run(), cfg = h.C.chest;
  ['speed', 'haste', 'damage'].forEach(key => {
    const up = key + 'Up', down = key + 'Down';
    assert.equal(cfg.weight[up], cfg.weight[down], up + ' 与 ' + down + ' 的中奖权重应相同');
    assert.ok(cfg.step[key] > 0, key + ' 的幅度应为正数，加减共用同一个值');
  });
});

test('宝箱加减益效果：移速 / 攻速 / 伤害各自按同一幅度生效', () => {
  const h = run(), p = h.G.player, base = h.GP.state.player;
  const startX = p.x, step = h.C.hero.speed;

  open(h, 'speedUp');
  assert.equal(p.speedMod, h.C.chest.step.speed);
  h.hold(1, 0, 60);
  assert.ok(Math.abs(p.x - (startX + step * 1.25)) < 0.01, '移速 +25% 应体现为同时间更远的位移');

  p.x = startX; p.speedMod = 0;
  open(h, 'speedDown');
  h.hold(1, 0, 60);
  assert.ok(Math.abs(p.x - (startX + step * 0.75)) < 0.01, '移速 -25% 应体现为同时间更近的位移');

  base.hasteMod = 0; base.damageMod = 0;
  const cd0 = h.R.derive(h.G, 'basic').cd, dmg0 = h.R.derive(h.G, 'basic').dmg;
  open(h, 'hasteUp');
  assert.ok(Math.abs(h.R.derive(h.G, 'basic').cd / cd0 - 0.8) < 0.02, '攻速 +20% 应让冷却缩到 0.8 倍');
  base.hasteMod = 0;
  open(h, 'hasteDown');
  assert.ok(Math.abs(h.R.derive(h.G, 'basic').cd / cd0 - 1.2) < 0.02, '攻速 -20% 应让冷却变成 1.2 倍');

  base.damageMod = 0;
  open(h, 'damageUp');
  assert.ok(Math.abs(h.R.derive(h.G, 'basic').dmg / dmg0 - 1.25) < 1e-6, '伤害 +25%');
  base.damageMod = 0;
  open(h, 'damageDown');
  assert.ok(Math.abs(h.R.derive(h.G, 'basic').dmg / dmg0 - 0.75) < 1e-6, '伤害 -25%');
});

test('豪华奖励：直接通关本关并记三星，结算界面不再显示生命比例', () => {
  const h = run();
  h.G.player.hp = h.G.player.maxhp * 0.2;
  open(h, 'luxury');
  assert.equal(h.G.state, 'cleared');
  assert.equal(h.G.result.stars, 3);
  assert.equal(h.G.result.luxury, true);
  assert.equal(h.G.result.flawless, false, '豪华奖励不应顺带记满血通关');
  assert.equal(h.G.progress.stars[0], 3, '应把三星写进存档');
  /* 渲染冒烟：结果页要能画出来 */
  h.PM.Renderer.render(0);
});

test('无尽模式下豪华奖励改为回满生命与金币，不进入通关结算', () => {
  const h = createGame({ stars: [1, 1, 1], candidates: ['laser'] });
  h.GP.resetRun(-1); h.G.spawnTimer = 1e6; h.clearProps();
  h.G.player.hp = 10;
  open(h, 'luxury');
  assert.equal(h.G.state, 'playing', '无尽模式没有终点，不应切到通关界面');
  assert.equal(h.G.player.hp, h.G.player.maxhp);
  assert.equal(h.G.coins, 50);
});

test('宝箱只落在视口内、不压在石头里，且离角色有距离', () => {
  const h = run(), cfg = h.C.chest;
  /* 摆一圈石头把视口塞住，检验落点仍会绕开 */
  h.G.stones = []; for (let i = 0; i < 40; i++) {
    h.G.stones.push({ kind: 'stone', x: 600 + (i % 8) * 60, y: 700 + Math.floor(i / 8) * 80, r: 22, phase: 0, tone: .5 });
  }
  h.G.props = h.G.stones.slice();
  h.G.chests = []; h.G.chestTimer = 0;
  h.frames(1);
  for (const box of h.G.chests) {
    const v = h.view();
    assert.ok(box.x >= v.x && box.x <= v.x + v.w, '宝箱应在视口内（横向）');
    assert.ok(box.y >= v.y && box.y <= v.y + v.h, '宝箱应在视口内（纵向）');
    assert.ok(Math.hypot(box.x - h.G.player.x, box.y - h.G.player.y) >= 130, '宝箱不应糊在脚下');
    for (const s of h.G.stones) {
      assert.ok(Math.hypot(box.x - s.x, box.y - s.y) >= s.r + cfg.r, '宝箱不应生成在石头里');
    }
  }
});

test('宝箱会过期消失，避免地图上越攒越多', () => {
  const h = run(), cfg = h.C.chest;
  h.G.chestTimer = 1e6;
  h.G.chests = [{ id: 9, x: h.G.player.x + 300, y: h.G.player.y + 200, r: cfg.r,
    age: 0, life: cfg.life, phase: 0, dead: false }];
  h.frames(Math.ceil((cfg.life - 1) * 60));
  assert.equal(h.G.chests.length, 1, '到期前应仍在地图上');
  h.frames(120);
  assert.equal(h.G.chests.length, 0, '到期后应消失');
});
