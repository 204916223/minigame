"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {createGame}=require('./harness');
function run(mode){const h=createGame({stars:[1,1,1]});h.GP.resetRun(mode==='endless'?-1:0);h.G.spawnTimer=1e8;h.G.skills.basic.cd=1e9;return h;}
function totalXP(h){let xp=h.G.player.xp;for(let lvl=1;lvl<h.G.player.lvl;lvl++)xp+=h.GP.xpNeed(lvl);return xp;}
function kill(h,xp){const e=h.at(0,-220,{hp:1,maxhp:1,xp});h.GP.combat.hit(e,h.G.skills.basic.derived);return e;}

test('普通关经验75%，无尽再减半为37.5%，覆盖全部怪型和首领，浮字与实际到账一致',()=>{
 const base=run('campaign');
 for(const [id,enemy]of Object.entries(base.C.enemyTypes)){
  const normal=run('campaign'),endless=run('endless');
  for(const [h,multiplier]of [[normal,.75],[endless,.375]]){
   const e=kill(h,enemy.xp),expected=enemy.xp*multiplier;
   assert.equal(totalXP(h),expected,id);assert.equal(h.G.floaters.at(-1).text,'+'+expected,id);
   h.GP.combat.hit(e,h.G.skills.basic.derived);assert.equal(totalXP(h),expected,id);
  }
  assert.equal(totalXP(endless),totalXP(normal)*.5,id);
 }
});

test('小数经验精确累积：普通四只、无尽八只普通怪达到首次升级，选卡不重复减经验',()=>{
 for(const [mode,count]of [['campaign',4],['endless',8]]){
  const h=run(mode);
  for(let i=1;i<=count;i++){
   kill(h,1);h.GP.update(1/60);
   assert.equal(h.G.player.lvl,i<count?1:2);assert.equal(h.G.state,i<count?'playing':'levelup');
  }
  assert.equal(h.G.player.xp,0);assert.equal(h.G.pendingLevelUps,1);
  h.GP.applyChoice(h.G.choices.find(ch=>!ch.card.unlock));assert.equal(h.G.state,'playing');
  kill(h,1);assert.equal(h.G.player.xp,mode==='campaign'?.75:.375);
 }
});

test('首领经验可连续升级并保留余数，不改变金币收益',()=>{
 for(const [mode,level,remainder,coins]of [['campaign',4,.5,1],['endless',3,1.25,.5]]){
  const h=run(mode);kill(h,h.C.enemyTypes.boss.xp);h.GP.update(1/60);
  assert.equal(h.G.player.lvl,level);assert.equal(h.G.player.xp,remainder);assert.equal(h.G.coins,coins);
  while(h.G.state==='levelup')h.GP.applyChoice(h.G.choices.find(ch=>!ch.card.unlock));
  assert.equal(h.G.player.xp,remainder);assert.equal(h.G.pendingLevelUps,0);
 }
});
