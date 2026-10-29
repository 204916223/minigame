"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),{createGame}=require('./harness');
function run(){const h=createGame({stars:[1]});h.GP.resetRun(0);h.G.spawnTimer=1e6;h.G.skills.basic.cd=1e9;return h;}
test('五种全屏先扫描再伤害，下中上依次命中，控制随接触生效，每个目标只命中一次',()=>{
 for(const id of ['thunderstorm','firestorm','tidalwave','blizzard','flood']){
  const h=run(),top=h.target(240,100),middle=h.target(240,300),bottom=h.target(240,500);
  const d={...h.R.derive(h.G,id),slow:.2,knock:30,freezeChance:1};h.GP.combat.cast(d);
  assert.ok(h.G.enemies.every(e=>e.hp===e.maxhp&&!e.slow&&!e.freezeT));assert.equal(h.G.sweeps.length,1);
  h.GP.combat.update(.2);assert.ok(bottom.hp<bottom.maxhp);assert.equal(middle.hp,middle.maxhp);assert.equal(top.hp,top.maxhp);
  assert.equal(bottom.slow,.2);assert.equal(bottom.freezeT,1);const hp=bottom.hp;
  h.GP.combat.update(.24);assert.ok(middle.hp<middle.maxhp);assert.equal(top.hp,top.maxhp);
  h.GP.combat.update(.36);assert.ok(top.hp<top.maxhp);assert.equal(bottom.hp,hp);assert.equal(h.G.sweeps.length,0);
 }
});
test('扫描线按施放时快照结算同属性半伤，受属性卡影响；不提前伤害屏外目标',()=>{
 const h=run();h.equip(['thunderstorm']);h.G.cardLevels['attribute:elec']=2;h.GP.recompute();
 const same=h.target(100,300,{el:'elec',def:50}),other=h.target(300,300,{el:'fire',def:50}),off=h.target(100,7),edge=h.target(400,8);
 h.GP.combat.cast(h.G.skills.thunderstorm.derived);h.G.skills.thunderstorm.derived.dmg=99999;
 h.GP.combat.update(1);assert.equal(same.hp,same.maxhp-95);assert.equal(other.hp,other.maxhp-190);
 assert.equal(off.hp,off.maxhp);assert.equal(edge.hp,edge.maxhp-240);assert.equal(h.G.sweeps.length,0);
});
test('移动交叉、后入场敌人和低帧率不漏判，已经扫过的位置不会补伤害',()=>{
 for(const dt of [1/60,.05,.2]){
  const h=run(),e=h.target(240,100);h.GP.combat.cast(h.R.derive(h.G,'firestorm'));
  for(let time=0;time<.8-1e-9;time+=dt){e.y+=200*dt;h.GP.combat.update(dt);}
  assert.equal(e.hp,e.maxhp-150);
 }
 const h=run();h.target(240,100);h.GP.combat.cast(h.R.derive(h.G,'firestorm'));h.GP.combat.update(.4);
 const behind=h.target(100,500),ahead=h.target(200,180),crossing=h.target(300,330,{prevY:280});
 h.GP.combat.update(.1);assert.equal(behind.hp,behind.maxhp);assert.equal(crossing.hp,crossing.maxhp-150);assert.equal(ahead.hp,ahead.maxhp);
 h.GP.combat.update(.3);assert.equal(ahead.hp,ahead.maxhp-150);assert.equal(behind.hp,behind.maxhp);
});
test('暂停与选卡冻结扫描，2倍速推进同步，失败通关重开清理未完成扫描',()=>{
 const h=run();h.target();h.GP.combat.cast(h.R.derive(h.G,'firestorm'));h.GP.update(.1);assert.equal(h.G.sweeps[0].age,.1);
 h.GP.pause(true);h.GP.update(.1);assert.equal(h.G.sweeps[0].age,.1);h.GP.pause(false);
 h.GP.grantExperience(3);h.GP.update(.1);assert.equal(h.G.sweeps[0].age,.1);h.GP.applyChoice(h.G.choices[0]);
 h.GP.toggleBattleSpeed();h.GP.update(.1);assert.ok(Math.abs(h.G.sweeps[0].age-.3)<1e-9);
 h.GP.resetRun(0);assert.equal(h.G.sweeps.length,0);
 for(const state of ['over','cleared']){
  const v=run();v.target(200,100);v.GP.combat.cast(v.R.derive(v.G,'firestorm'));
  if(state==='over')v.target(300,v.GP.dangerY(),{hp:10000});
  else{v.G.enemies=[];v.G.waveIndex=9;v.G.waveSpawned=1005;}
  v.GP.update(.01);assert.equal(v.G.state,state);assert.equal(v.G.sweeps.length,0);
 }
});
test('不可知域只改毒色背景，保持单层常驻中毒，不创建扫描或爆炸，重开恢复背景',()=>{
 const h=run(),e=h.target(240,300,{def:0});h.equip(['poisonbottle','miasma','unknown']);h.G.cardLevels['attribute:poison']=2;h.GP.recompute();
 for(let i=0;i<10;i++)h.GP.combat.cast(h.G.skills.unknown.derived);
 assert.equal(Object.keys(e.dots).length,1);assert.equal(e.hp,e.maxhp);h.GP.combat.statuses(e,.5);assert.equal(e.hp,e.maxhp-12);
 assert.equal(h.G.sweeps.length,0);assert.equal(h.G.booms.length,0);assert.equal(e.flash,0);
 const ctx=h.PM.Platform.ctx(),fills=[];ctx.fillRect=(x,y,w,height)=>{if(x===-20&&y===-20)fills.push(ctx.fillStyle);};
 h.PM.Renderer.render(0);assert.equal(fills.at(-1),'#190e2b');h.GP.resetRun(0);h.PM.Renderer.render(0);assert.equal(fills.at(-1),'#070a12');
});
