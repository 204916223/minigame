"use strict";
const test = require('node:test'), assert = require('node:assert/strict');
const { createGame } = require('./harness');
function run(seed = 1) { const h = createGame(undefined, seed); h.GP.resetRun(0); return h; }
function open(h) { h.GP.grantExperience(h.G.player.xpv - h.G.player.xp); }
function elements(choices, R) { return [...new Set(choices.filter(ch => ch.card.unlock).map(ch => R.skill(ch.card.skill).el))]; }
function takeUpgrade(h) { assert.equal(h.GP.applyChoice(h.G.choices.find(ch => !ch.card.unlock)), true); }

test('同攻击方式下高伤技能更慢且初始目标不更多，满冷却强化保留节奏差异', () => {
  const h = run();
  for (const low of h.C.skills) for (const high of h.C.skills) {
    if (low.id === 'basic' || high.id === 'basic' || low.persistent || high.persistent || low.mode !== high.mode || low.ratio >= high.ratio) continue;
    assert.ok(low.cd <= high.cd, low.id + ' / ' + high.id);
    assert.ok((low.targets || 1) >= (high.targets || 1));
  }
  h.G.player.haste = .2;
  for (const s of h.C.skills.filter(s => !s.persistent)) {
    h.G.cardLevels[s.id + ':cooldown'] = 10;
    assert.equal(h.R.derive(h.G, s.id).cd, s.minCd * 1000, s.id);
  }
  h.G.cardLevels['windblade:multi'] = 6; h.equip(['windblade']);
  assert.equal(h.R.derive(h.G, 'windblade').count, 9);
  assert.ok(h.GP.choicePool().some(ch => ch.card.id === 'windblade:multi'));
  h.G.cardLevels['windblade:multi']++;
  assert.equal(h.R.derive(h.G, 'windblade').count, 10);
  assert.ok(!h.GP.choicePool().some(ch => ch.card.id === 'windblade:multi'));
});

test('每第三次选择保底新技能和强化，刷新不推进轮次且保留保底', () => {
  const h = run();
  // 大强化池下，新技能保底仍必须兑现。仅留一种水系新技能，避免元素限制干扰。
  h.equip(['laser','chain','fireball','icecone']); h.G.candidates = ['waterball'];
  for (let round = 1; round <= 9; round++) {
    if (round % 3 === 0) h.G.choiceHistory = [[], []];
    open(h); assert.equal(h.G.choicesCompleted, round - 1);
    assert.equal(h.G.choices.length, 4);
    assert.equal(new Set(h.G.choices.map(ch => ch.card.id)).size, 4);
    assert.ok(h.G.choices.some(ch => !ch.card.unlock));
    if (round % 3 === 0) {
      const before = JSON.stringify(h.G.choiceHistory); h.G.refreshes = 20;
      for (let i = 0; i <= 20; i++) {
        assert.ok(h.G.choices.some(ch => ch.card.id === 'get:waterball'));
        assert.ok(h.G.choices.some(ch => !ch.card.unlock));
        if (i < 20) assert.equal(h.GP.refreshChoices(), true);
        assert.equal(h.G.choicesCompleted, round - 1); assert.equal(JSON.stringify(h.G.choiceHistory), before);
      }
    }
    takeUpgrade(h); assert.equal(h.G.choicesCompleted, round);
  }
});

test('连续轮次按出现的新技能元素判定，含刷新出现过的元素，不按玩家选择判定', () => {
  for (let seed = 1; seed <= 15; seed++) {
    const h = run(seed); h.G.refreshes = 120;
    const history = [];
    for (let round = 1; round <= 30; round++) {
      open(h); const offered = new Set();
      for (let refresh = 0; refresh < 3; refresh++) {
        const current = elements(h.G.choices, h.R);
        current.forEach(el => {
          assert.ok(!(history.length >= 2 && history[history.length - 1].has(el) && history[history.length - 2].has(el)), '三轮连续 ' + el);
          offered.add(el);
        });
        assert.equal(h.G.choices.length, 4); assert.ok(h.G.choices.some(ch => !ch.card.unlock));
        if (round % 3 === 0) {
          const legal = h.GP.choicePool().filter(ch => ch.card.unlock).filter(ch => {
            const el = h.R.skill(ch.card.skill).el;
            return !(history.length >= 2 && history[history.length - 1].has(el) && history[history.length - 2].has(el));
          });
          if (legal.length) assert.ok(current.length > 0);
        }
        if (refresh < 2) h.GP.refreshChoices();
      }
      // 始终选择强化：所有出现过的新技能仍须纳入连续元素判定。
      takeUpgrade(h); history.push(offered);
      assert.deepEqual([...h.G.choiceHistory.at(-1)].sort(), [...offered].sort());
    }
  }
});

test('三轮保底尊重连续元素限制、装备上限与不可知域互斥；无技能时正常给强化', () => {
  const h = run(); h.G.candidates = ['windblade','tornado'];
  h.G.choicesCompleted = 2; h.G.choiceHistory = [['wind'], ['wind']]; open(h);
  assert.equal(h.G.choices.length, 4); assert.ok(h.G.choices.every(ch => !ch.card.unlock));
  takeUpgrade(h); assert.ok(!h.G.choiceHistory.at(-1).length);
  h.G.choicesCompleted = 5; open(h); assert.ok(h.G.choices.some(ch => ch.card.unlock)); takeUpgrade(h);
  h.equip(['poisonbottle','miasma','unknown']); h.G.choicesCompleted = 8; h.G.choiceHistory = []; open(h);
  assert.ok(h.G.choices.every(ch => !ch.card.unlock)); takeUpgrade(h);
  h.equip(['laser','chain','lightning','waterball','geyser']); h.G.choicesCompleted = 11; open(h);
  assert.equal(h.G.choices.length, 4); assert.ok(h.G.choices.every(ch => !ch.card.unlock));
});

test('连升逐轮计次，无效选择不计次，重新开局清空历史', () => {
  const h = run(); h.GP.grantExperience(22); assert.equal(h.G.pendingLevelUps, 3);
  assert.equal(h.GP.applyChoice({card:{id:'not-found'}}), false); assert.equal(h.G.choicesCompleted, 0);
  takeUpgrade(h); takeUpgrade(h); assert.equal(h.G.choicesCompleted, 2);
  assert.equal(h.G.state, 'levelup'); assert.ok(h.G.choices.some(ch => ch.card.unlock));
  takeUpgrade(h); assert.equal(h.G.choicesCompleted, 3); assert.equal(h.G.state, 'playing');
  h.GP.resetRun(0); assert.equal(h.G.choicesCompleted, 0); assert.equal(h.G.choiceHistory.length, 0); assert.equal(h.G.currentOfferElements.length, 0);
});

test('第三个已装备技能即时解锁羁绊，二件档仍有效，卡和候选不解锁', () => {
  const h = run(); h.G.candidates = ['windblade','laser','fireball','meteor','waterball','geyser','chain'];
  h.take('get:windblade'); h.take('basic:multi');
  assert.equal(h.R.bondsUnlocked(h.G), false); assert.equal(h.G.skills.basic.derived.count, 2);
  assert.equal(h.G.skills.windblade.derived.cd, 6000); assert.equal(h.G.skills.windblade.derived.count, 3);
  h.take('get:laser'); assert.equal(h.R.bondsUnlocked(h.G), true);
  assert.equal(h.R.bonds(h.G).multi, 2); assert.equal(h.G.skills.basic.derived.count, 3);
  assert.ok(Math.abs(h.G.skills.windblade.derived.cd - 5700) < 1e-8); assert.equal(h.G.skills.windblade.derived.count, 4);
  assert.equal(h.G.skills.windblade.derived.child, 0);
  h.GP.resetRun(0); assert.equal(h.R.bondsUnlocked(h.G), false); assert.equal(h.G.skills.basic.derived.count, 1);
});

test('所有关卡、成长阶段及首领的敌方血量恰好翻倍，其余数值不随之翻倍', () => {
  for (let level = 0; level < 5; level++) for (const wave of [0,4,8,9]) for (const key of ['grunt','runner','bat','tank','miniboss','boss']) {
    const h = run(), old = run(); old.C.enemyHpMultiplier = 1;
    for (const v of [h,old]) {
      v.GP.resetRun(level); v.G.waveIndex = wave; v.G.player.lvl = 7;
      v.C.levels[level].waves[wave].pool = {[key]:1}; v.G.spawnTimer = 0; v.GP.update(1/60);
    }
    const a = h.G.enemies[0], b = old.G.enemies[0];
    assert.ok(a && b); assert.equal(a.hp, b.hp * 2); assert.equal(a.maxhp, b.maxhp * 2);
    for (const stat of ['def','spd','xp']) assert.equal(a[stat], b[stat], key + ' ' + stat);
  }
});

test('生成技先等待半秒再填充半秒，伤害、控制、区域都在填满时结算且只爆发一次', () => {
  const h = run(), t = h.target(), d = {...h.R.derive(h.G, 'meteor'), dmg:100, slow:.5};
  h.GP.combat.cast(d); assert.equal(h.G.telegraphs.length, 1); assert.equal(t.hp, t.maxhp);
  h.GP.combat.update(.5); assert.equal(t.hp, t.maxhp); assert.equal(h.G.zones.length, 0); assert.equal(t.slow, undefined);
  h.GP.combat.update(.25); assert.equal(t.hp, t.maxhp); assert.equal(h.G.booms.length, 0);
  h.GP.combat.update(.25); assert.equal(t.hp, t.maxhp - 100); assert.equal(t.slow, .5);
  assert.equal(h.G.telegraphs.length, 0); assert.equal(h.G.booms.length, 1); assert.equal(h.G.zones.length, 1); assert.equal(h.G.zones[0].age, 0);
  h.GP.combat.update(.5); assert.equal(t.hp, t.maxhp - 100); assert.equal(h.G.booms.length, 1);
});

test('生成落点和攻击快照固定，移动脱离可躲避，原目标死亡仍在原地爆发', () => {
  const h = run(), moved = h.target(), d = {...h.R.derive(h.G, 'blackhole'), dmg:100};
  h.GP.combat.cast(d); moved.x = 450; moved.dead = true; d.dmg = 900;
  const newcomer = h.target(240,300); h.GP.combat.update(1);
  assert.equal(moved.hp, moved.maxhp); assert.equal(newcomer.hp, newcomer.maxhp - 100);
  assert.equal(h.G.booms[0].x, 240); assert.equal(h.G.booms[0].y, 300);
});

test('暂停和选卡冻结生成预警，失败、通关和重开清除未爆发效果', () => {
  const h = run(); h.G.spawnTimer = 100; const t = h.target();
  h.GP.combat.cast(h.R.derive(h.G, 'blackhole')); h.G.skills.basic.cd = 100000;
  h.GP.pause(true); h.GP.update(.6); assert.equal(h.G.telegraphs[0].age, 0);
  h.GP.pause(false); open(h); h.GP.update(.6); assert.equal(h.G.telegraphs[0].age, 0);
  takeUpgrade(h); h.GP.update(.6); assert.equal(h.G.telegraphs[0].age, .6);
  t.y = h.GP.dangerY(); t.hp = 9999; h.GP.update(.01); assert.equal(h.G.state, 'over'); assert.equal(h.G.telegraphs.length, 0);
  h.GP.resetRun(0); h.target(); h.GP.combat.cast(h.R.derive(h.G, 'blackhole'));
  h.G.enemies = []; h.G.waveIndex = 9; h.G.waveSpawned = 1005; h.GP.update(.01);
  assert.equal(h.G.state, 'cleared'); assert.equal(h.G.telegraphs.length, 0);
  h.GP.resetRun(0); h.target(); h.GP.combat.cast(h.R.derive(h.G, 'blackhole')); h.GP.resetRun(0); assert.equal(h.G.telegraphs.length, 0);
});
