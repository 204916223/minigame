"use strict";
var test = require('node:test'), assert = require('node:assert/strict'), path = require('path');
global.GameGlobal = global; global.performance = { now: function () { return 0; } };
require(path.resolve(__dirname, '../src/config.js'));
require(path.resolve(__dirname, '../src/platform.js'));
require(path.resolve(__dirname, '../src/audio.js'));
require(path.resolve(__dirname, '../src/gameplay.js'));
test('每关固定三波且按击杀目标配置', function () {
  PixelMow.Config.levels.forEach(function (level) { assert.equal(level.waves.length, 3); level.waves.forEach(function (wave) { assert.ok(wave.kills > 0); }); });
});
test('星级阈值严格使用大于号', function () {
  var stars = PixelMow.Gameplay.calculateStars;
  assert.equal(stars(0.30), 0); assert.equal(stars(0.30001), 1);
  assert.equal(stars(0.60), 1); assert.equal(stars(0.60001), 2);
  assert.equal(stars(0.90), 2); assert.equal(stars(0.90001), 3); assert.equal(stars(1), 3);
});
test('后一关需要前一关至少一星', function () {
  var game = PixelMow.Gameplay, state = game.state; state.progress.stars = [];
  assert.equal(game.isLevelUnlocked(0), true); assert.equal(game.isLevelUnlocked(1), false);
  state.progress.stars[0] = 1; assert.equal(game.isLevelUnlocked(1), true);
});
test('一次连升两级必须连续选择两次', function () {
  var game = PixelMow.Gameplay, state = game.state; game.resetRun(0);
  game.grantExperience(24);
  assert.equal(state.player.lvl, 3); assert.equal(state.pendingLevelUps, 2); assert.equal(state.state, 'levelup');
  game.applyChoice(state.choices[0]);
  assert.equal(state.pendingLevelUps, 1); assert.equal(state.state, 'levelup');
  game.applyChoice(state.choices[0]);
  assert.equal(state.pendingLevelUps, 0); assert.equal(state.state, 'playing');
});
test('每波生成数量严格封顶，不因尚未击杀而补刷', function () {
  var game = PixelMow.Gameplay, state = game.state; game.resetRun(0); state.player.cd = 999999;
  var limit = PixelMow.Config.levels[0].waves[0].kills, guard = 0;
  while (state.waveSpawned < limit && guard++ < 400) game.update(0.05);
  assert.equal(state.waveSpawned, limit);
  for (var i = 0; i < 100; i++) game.update(0.05);
  assert.equal(state.waveSpawned, limit);
});
test('最终波最后一只怪被击杀时直接结算，不弹升级', function () {
  var game = PixelMow.Gameplay, state = game.state; game.resetRun(0);
  var wave = PixelMow.Config.levels[0].waves[2]; state.waveIndex = 2; state.waveSpawned = wave.kills; state.waveKills = wave.kills - 1;
  state.player.xp = state.player.xpv - 1; state.player.cd = 999999;
  var enemy = { id: 99999, x: 200, y: 100, hp: 1, maxhp: 1, spd: 0, xp: 18, dmg: 1, r: 12, cell: 3, spr: 'slime', color: '#fff', sway: 0, flash: 0, boss: true, dead: false };
  state.enemies = [enemy]; state.bullets = [{ x: 200, y: 100, vx: 0, vy: 0, speed: 0, target: null, damage: 1, pierce: 0, boom: 0, r: 4, life: 1, turn: 0, hitIds: {}, dead: false }];
  game.update(0.01);
  assert.equal(state.state, 'cleared'); assert.equal(state.pendingLevelUps, 0); assert.equal(state.choices.length, 0);
});
test('爆炸同帧击杀最后两只怪时，遍历完成后再统一结束波次', function () {
  var game = PixelMow.Gameplay, state = game.state; game.resetRun(0);
  var wave = PixelMow.Config.levels[0].waves[0]; state.waveSpawned = wave.kills; state.waveKills = wave.kills - 2; state.player.cd = 999999;
  function enemy(id, x) { return { id: id, x: x, y: 100, hp: 0.5, maxhp: 0.5, spd: 0, xp: 1, dmg: 1, r: 12, cell: 3, spr: 'slime', color: '#fff', sway: 0, flash: 0, boss: false, dead: false }; }
  var first = enemy(10001, 200), second = enemy(10002, 210); state.enemies = [first, second];
  state.bullets = [{ x: 200, y: 100, vx: 0, vy: 0, speed: 0, target: null, damage: 1, pierce: 0, boom: 1, r: 4, life: 1, turn: 0, hitIds: {}, dead: false }];
  game.update(0.01);
  assert.equal(state.player.kills, 2); assert.equal(state.enemies.length, 0); assert.equal(state.state, 'intermission');
});
