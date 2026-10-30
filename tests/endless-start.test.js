"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),{createGame}=require('./harness');
function run(bestWave=66,wx=false){const h=createGame({stars:[1,1,1],coins:123,endless:{bestWave,bestKills:12000}},1,wx);h.GP.resetRun(-1);return h;}
function totalXP(h){let total=h.G.player.xp;for(let lvl=1;lvl<h.G.player.lvl;lvl++)total+=h.GP.xpNeed(lvl);return total;}
function finishChoices(h,preferUnlock=false){let n=0;while(h.G.state==='levelup'){
 assert.ok(n++<1000);const choices=h.G.choices;
 const choice=preferUnlock&&choices.find(ch=>ch.card.unlock)||choices.find(ch=>ch.card.id==='basic:damage')||choices.find(ch=>!ch.card.unlock);
 assert.ok(choice);assert.equal(h.GP.applyChoice(choice),true);
}return n;}
test('按历史通过记录2/3向下取整，最低第1波；66波从44波起，补前43波经验',()=>{
 for(const wx of [false,true])for(const best of [0,1,2,3,4,5,65,66,67,99]){
  const h=run(best,wx),expected=Math.max(1,Math.floor(best*2/3));
  assert.equal(h.G.startingWave,expected);assert.equal(h.G.waveIndex,expected-1);
  assert.equal(h.G.progress.endless.bestWave,best);assert.equal(h.G.player.kills,0);assert.equal(h.G.coins,0);assert.equal(h.G.progress.coins,123);
  assert.equal(h.G.refreshes,Math.floor((expected-1)/3));
  assert.equal(h.G.skills.basic.owned,true);assert.equal(h.GP.ownedSkills(),1);
  assert.ok(Math.abs(totalXP(h)-h.G.skippedExperience)<1e-7);
  assert.equal(h.G.state,expected>1?'levelup':'playing');
 }
 const h=run();const expectedPerWave=(1000*(1+1+.9+.6)/1.9+3*15+2*30)*.75*.5;
 assert.ok(Math.abs(h.G.skippedExperience-43*expectedPerWave)<1e-7);
});
test('补发经验与固定怪型组合真实击杀一致，升级次数、余数、生命成长一致',()=>{
 const fast=createGame({stars:[1,1,1],endless:{bestWave:3}});fast.C.endless.pool={grunt:1,runner:1};fast.GP.resetRun(-1);
 const real=run(0);real.C.endless.pool={grunt:1,runner:1};
 for(const [count,xp]of [[500,1],[500,2],[3,15],[2,30]])for(let i=0;i<count;i++)real.GP.combat.hit(real.target(240,200,{hp:1,xp}),real.G.skills.basic.derived);
 assert.equal(fast.G.skippedExperience,totalXP(real));assert.equal(fast.G.player.lvl,real.G.player.lvl);assert.equal(fast.G.player.xp,real.G.player.xp);
 assert.equal(fast.G.player.maxhp,real.G.player.maxhp);assert.equal(fast.G.pendingLevelUps,real.G.pendingLevelUps);
 assert.equal(fast.G.player.kills,0);assert.equal(fast.G.coins,0);
});
test('入场选卡冻结刷怪和时间，逐次消费技能点且重算卡池，选完才开始目标波次',()=>{
 const h=run(),count=h.G.pendingLevelUps,timer=h.G.spawnTimer,initial=JSON.stringify(h.G.choices.map(ch=>ch.card.id));
 h.frames(120);assert.equal(h.G.time,0);assert.equal(h.G.spawnTimer,timer);assert.equal(h.G.enemies.length,0);
 assert.equal(h.G.pendingLevelUps,count);assert.equal(JSON.stringify(h.G.choices.map(ch=>ch.card.id)),initial);
 assert.equal(finishChoices(h,true),count);assert.equal(h.G.state,'playing');assert.equal(h.G.pendingLevelUps,0);assert.equal(h.G.choicesCompleted,count);
 assert.ok(h.GP.ownedSkills()>1);assert.equal(h.G.waveIndex,43);assert.equal(h.G.time,0);
 h.G.spawnTimer=0;h.G.skills.basic.cd=1e9;h.GP.update(.01);assert.ok(h.G.enemies.length>0);
 assert.equal(h.G.enemies[0].maxhp,h.C.enemyTypes[h.G.enemies[0].key].hp*2*(1+.15*43));
});
test('重开清除上局buff重新分配相同点数，普通关恢复第1波，入场即退出不刷金币或纪录',()=>{
 const h=run(),before=JSON.stringify(h.G.progress.endless),count=h.G.pendingLevelUps;
 finishChoices(h);assert.ok(h.G.cardLevels['basic:damage']>0);
 h.GP.resetRun(-1);assert.equal(h.G.pendingLevelUps,count);assert.equal(Object.keys(h.G.cardLevels).length,0);assert.equal(h.G.choicesCompleted,0);assert.equal(h.G.fullscreenSince,null);assert.equal(h.GP.ownedSkills(),1);
 h.GP.bankCoins();h.GP.openMenu();assert.equal(h.G.progress.coins,123);assert.equal(JSON.stringify(h.G.progress.endless),before);
 h.GP.resetRun(0);assert.equal(h.G.waveIndex,0);assert.equal(h.G.startingWave,1);assert.equal(h.G.pendingLevelUps,0);assert.equal(h.G.player.lvl,1);assert.equal(h.G.skippedExperience,0);
});
test('无尽入口显示起始波次，快速选卡标题和剩余次数可渲染；未解锁不能跳过选关门槛',()=>{
 const h=run();h.GP.openEndlessSelect();let labels=[];h.PM.Platform.ctx().fillText=t=>labels.push(String(t));h.PM.Renderer.render(0);
 assert.ok(labels.includes('本次第 44 波起 · 跳过 43 波'));
 h.GP.resetRun(-1);labels=[];h.PM.Renderer.render(0);assert.ok(labels.includes('快速备战 · 第 44 波起'));
 const locked=createGame({endless:{bestWave:66}});assert.equal(locked.GP.resetRun(-1),false);assert.equal(locked.G.state,'menu');
});
