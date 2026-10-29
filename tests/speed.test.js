"use strict";
const test = require('node:test'), assert = require('node:assert/strict');
const {createGame} = require('./harness');
function run(progress = {stars:[1,1,1]}, wechat = false) {
  const h = createGame(progress, 18, wechat); h.GP.resetRun(0); return h;
}
function tap(h, rect) { h.advanceClock(300); h.PM.Input.tap(rect.x+rect.w/2, rect.y+rect.h/2); h.PM.Renderer.render(0); }
test('倍速由第一关至少一星或有效购买标记解锁，旧存档默认兼容', () => {
  for (const [progress,expected] of [[{},false],[{stars:[0,3]},false],[{stars:[1]},true],
    [{doubleSpeedUnlocked:true},true],[{doubleSpeedUnlocked:'true'},false],[{doubleSpeedUnlocked:1},false]]) {
    const h = run(progress); assert.equal(h.GP.isDoubleSpeedUnlocked(),expected);
    h.GP.toggleBattleSpeed(); assert.equal(h.G.battleSpeed,expected?2:1); assert.equal(h.G.speedUnlockOpen,!expected);
  }
  for (const ratio of [.3,.31,1]) {
    const h = run({}); h.G.player.hp = h.G.player.maxhp * ratio;
    h.G.waveIndex = 9; h.G.waveSpawned = h.GP.waveConfig().kills; h.GP.update(.01);
    assert.equal(h.G.state,'cleared'); assert.equal(h.GP.isDoubleSpeedUnlocked(),ratio>.3);
    h.GP.resetRun(0); assert.equal(h.G.battleSpeed,1);
  }
});
test('浏览器和微信永久购买仅扣2000金币，支持本局金币补差，不重复扣费', () => {
  for (const wechat of [false,true]) for (const [bank,coins] of [[2500,0],[1500,700],[0,2000],[1999.5,.5]]) {
    const h = run({coins:bank},wechat); h.G.coins = coins;
    assert.equal(h.GP.buyDoubleSpeed(),false); h.GP.toggleBattleSpeed();
    assert.equal(h.GP.buyDoubleSpeed(),true); assert.equal(h.G.speedUnlockOpen,false); assert.equal(h.G.paused,false);
    assert.equal(h.G.progress.coins+h.G.coins,bank+coins-2000); assert.equal(h.G.battleSpeed,2);
    assert.equal(h.GP.buyDoubleSpeed(),false); h.GP.bankCoins(); h.GP.bankCoins();
    const restored = createGame(undefined,18,wechat,h.storage);
    assert.equal(restored.GP.isDoubleSpeedUnlocked(),true); assert.equal(restored.G.progress.coins,bank+coins-2000);
    restored.GP.resetRun(0); assert.equal(restored.G.battleSpeed,1); restored.GP.toggleBattleSpeed();
    assert.equal(restored.G.battleSpeed,2); assert.equal(restored.G.progress.coins,bank+coins-2000);
  }
});
test('金币不足、取消和自动解锁不扣费；弹窗暂停且P键不能穿透恢复', () => {
  const h = run({coins:1999}); h.PM.Input.bind(); h.PM.Renderer.render(0);
  tap(h,h.G.ui.speed); assert.equal(h.G.speedUnlockOpen,true); const time=h.G.time;
  h.events.keydown({key:'p'}); h.GP.update(1); assert.equal(h.G.time,time); assert.equal(h.G.paused,true);
  tap(h,h.G.ui.speedBuy); assert.equal(h.G.progress.coins,1999); assert.equal(h.GP.isDoubleSpeedUnlocked(),false);
  tap(h,h.G.ui.speedCancel); assert.equal(h.G.paused,false); assert.equal(h.G.speedUnlockOpen,false); assert.equal(h.G.battleSpeed,1);
  assert.equal(h.G.progress.coins,1999);
  const free=run({stars:[1],coins:2500}); free.GP.toggleBattleSpeed();
  assert.equal(free.G.battleSpeed,2); assert.equal(free.G.progress.coins,2500); assert.equal(free.G.speedUnlockOpen,false);
});
test('2×与执行两次1×逐步一致，包含刷怪、移动、弹道、生成爆发、持续伤害及奖励', () => {
  for (const mode of [0,-1]) {
    const normal=run(),fast=run();
    for(const h of [normal,fast]){
      h.GP.resetRun(mode); h.equip(['blackhole','chain','fireball','waterball','poisonbottle']);
      h.target(240,180,{hp:10000,maxhp:10000,spd:20,poisonT:10,poisonDps:2});
    }
    fast.GP.toggleBattleSpeed();
    for(let frame=0;frame<360;frame++){
      normal.GP.update(1/60); normal.GP.update(1/60); fast.GP.update(1/60);
      for(const h of [normal,fast])if(h.G.state==='levelup')h.GP.applyChoice(h.G.choices.find(ch=>!ch.card.unlock));
    }
    const keys=['state','time','player','skills','enemies','bullets','telegraphs','zones','parts','booms','coins','waveIndex','waveSpawned','spawnTimer'];
    keys.forEach(key=>assert.equal(JSON.stringify(fast.G[key]),JSON.stringify(normal.G[key]),key));
    assert.equal(JSON.stringify(fast.generatedEvents),JSON.stringify(normal.generatedEvents)); assert.ok(fast.generatedEvents.length);
  }
});
test('2×准确推进两倍游戏时间和位移，暂停、选卡、失败及通关在首个子步立即停止', () => {
  const h=run();h.GP.toggleBattleSpeed();h.G.spawnTimer=100;h.G.skills.basic.cd=1e9;
  const e=h.target(240,150,{spd:20});h.frames(60);
  assert.ok(Math.abs(h.G.time-2000)<1e-8);assert.ok(Math.abs(e.y-190)<1e-8);assert.ok(Math.abs(h.G.spawnTimer-98)<1e-8);
  h.GP.pause(true);h.GP.update(.05);assert.ok(Math.abs(h.G.time-2000)<1e-8);h.GP.pause(false);
  for(const state of ['levelup','over','cleared']){
    const v=run();v.GP.toggleBattleSpeed();v.G.skills.basic.cd=1e9;v.G.spawnTimer=100;
    if(state==='levelup'){v.target(240,510,{hp:1,xp:4});v.GP.combat.cast(v.R.derive(v.G,'basic'));}
    if(state==='over')v.target(240,v.GP.dangerY(),{hp:10000});
    if(state==='cleared'){v.G.waveIndex=9;v.G.waveSpawned=v.GP.waveConfig().kills;}
    v.GP.update(.05);assert.equal(v.G.state,state);assert.equal(v.G.time,50);
    v.GP.update(.05);assert.equal(v.G.time,50);
  }
});
test('倍速按钮和购买输入在浏览器及微信安全区可用，暂停不误切换，重开恢复1×', () => {
  for(const wechat of [false,true]){
    const h=run({coins:2000},wechat);h.PM.Renderer.render(0);
    const r=h.G.ui.speed,p=h.G.ui.pause;
    assert.ok(r.x>=0&&r.x+r.w<p.x&&r.y>=h.PM.Platform.safeTop()&&r.y+r.h<h.G.ui.skillSlots[0].y);
    tap(h,r);tap(h,h.G.ui.speedBuy);assert.equal(h.G.battleSpeed,2);
    tap(h,h.G.ui.speed);assert.equal(h.G.battleSpeed,1);tap(h,h.G.ui.speed);assert.equal(h.G.battleSpeed,2);
    tap(h,h.G.ui.pause);tap(h,h.G.ui.speed);assert.equal(h.G.battleSpeed,2);assert.equal(h.G.paused,true);
    tap(h,h.G.ui.resume);assert.equal(h.G.battleSpeed,2);h.GP.resetRun(0);
    assert.equal(h.G.battleSpeed,1);assert.equal(h.G.speedUnlockOpen,false);assert.equal(h.GP.isDoubleSpeedUnlocked(),true);
  }
});
