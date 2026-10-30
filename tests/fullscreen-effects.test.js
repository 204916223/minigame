"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),{createGame}=require('./harness');
function run(){const h=createGame({stars:[1]});h.GP.resetRun(0);h.G.spawnTimer=1e6;h.G.skills.basic.cd=1e9;return h;}
test('五种全屏先扫描再伤害，下中上依次命中，控制随接触生效，每个目标只命中一次',()=>{
 for(const id of ['thunderstorm','firestorm','tidalwave','blizzard','flood']){
  const h=run(),top=h.target(240,h.C.height*.15625),middle=h.target(240,h.C.height*.46875),bottom=h.target(240,h.C.height*.78125);
  const d={...h.R.derive(h.G,id),slow:.2,knock:30,freezeChance:1};h.GP.combat.cast(d);
  assert.ok(h.G.enemies.every(e=>e.hp===e.maxhp&&!e.slow&&!e.freezeT));assert.equal(h.G.sweeps.length,1);assert.equal(h.G.sweeps[0].life,3);
  h.GP.combat.update(.75);assert.ok(bottom.hp<bottom.maxhp);assert.equal(middle.hp,middle.maxhp);assert.equal(top.hp,top.maxhp);
  assert.equal(bottom.slow,.2);assert.equal(bottom.freezeT,1);const hp=bottom.hp;
  h.GP.combat.update(.9);assert.ok(middle.hp<middle.maxhp);assert.equal(top.hp,top.maxhp);
  h.GP.combat.update(1.35);assert.ok(top.hp<top.maxhp);assert.equal(bottom.hp,hp);assert.equal(h.G.sweeps.length,0);
 }
});
test('扫描线按施放时快照结算同属性半伤，受属性卡影响；不提前伤害屏外目标',()=>{
 const h=run();h.equip(['thunderstorm']);h.G.cardLevels['attribute:elec']=2;h.GP.recompute();
 const same=h.target(100,300,{el:'elec',def:50}),other=h.target(300,300,{el:'fire',def:50}),off=h.target(100,7),edge=h.target(400,8);
 h.GP.combat.cast(h.G.skills.thunderstorm.derived);h.G.skills.thunderstorm.derived.dmg=99999;
 h.GP.combat.update(3);assert.equal(same.hp,same.maxhp-95);assert.equal(other.hp,other.maxhp-190);
 assert.equal(off.hp,off.maxhp);assert.equal(edge.hp,edge.maxhp-240);assert.equal(h.G.sweeps.length,0);
});
test('移动交叉、后入场敌人和低帧率不漏判，已经扫过的位置不会补伤害',()=>{
 for(const dt of [1/60,.05,.2]){
  const h=run(),e=h.target(240,100);h.GP.combat.cast(h.R.derive(h.G,'firestorm'));
  for(let time=0;time<3-1e-9;time+=dt){e.y+=200*dt;h.GP.combat.update(dt);}
  assert.equal(e.hp,e.maxhp-150);
 }
 const h=run();h.target(240,100);h.GP.combat.cast(h.R.derive(h.G,'firestorm'));h.GP.combat.update(1.5);
 assert.equal(h.G.sweeps[0].y,h.C.height/2);
 const behind=h.target(100,h.C.height*.5625),ahead=h.target(200,h.C.height*.28125),crossing=h.target(300,h.C.height*.515625,{prevY:h.C.height*.4375});
 h.GP.combat.update(.375);assert.equal(behind.hp,behind.maxhp);assert.equal(crossing.hp,crossing.maxhp-150);assert.equal(ahead.hp,ahead.maxhp);
 h.GP.combat.update(1.125);assert.equal(ahead.hp,ahead.maxhp-150);assert.equal(behind.hp,behind.maxhp);
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
test('除不可知域外全屏固定 10 秒，满冷却卡与满攻速及羁绊都不改变，不出冷却卡且卡面写固定',()=>{
 const h=createGame({stars:[1]});h.GP.resetRun(0);
 const fixed=h.C.skills.filter(s=>s.fixedCd);
 assert.equal(fixed.length,5);assert.equal(fixed.some(s=>s.id==='unknown'),false);
 assert.equal(h.C.skills.filter(s=>s.mode==='fullscreen'&&!s.fixedCd&&!s.persistent).length,0);
 h.equip(['chain','lightning','waterball','geyser','thunderstorm']); // 五件冷却标签，四件羁绊 +15%
 h.G.player.haste=.2;
 for(const s of fixed){
  h.G.cardLevels[s.id+':cooldown']=10;
  assert.equal(h.R.derive(h.G,s.id).cd,10000,s.id);
  assert.equal(h.R.cards.some(c=>c.skill===s.id&&c.tag==='cooldown'),false,s.id+' 不出冷却卡');
  assert.ok(h.R.describe(h.R.card('get:'+s.id),0).indexOf('冷却 10s（固定）')>=0,s.id+' 卡面文案');
 }
 // 10 秒间隔接得上 3 秒扫描：上一次扫描结束后才可能有下一条扫描线
 const v=createGame({stars:[1]});v.GP.resetRun(0);v.G.spawnTimer=1e6;v.G.skills.basic.cd=1e9;
 v.equip(['thunderstorm']);v.target(240,300);v.G.skills.thunderstorm.cd=0;
 v.frames(60);assert.equal(v.G.sweeps.length,1);
 v.frames(240);assert.equal(v.G.sweeps.length,0);assert.ok(v.G.skills.thunderstorm.cd>0);
 v.frames(240);assert.equal(v.G.sweeps.length,0);
 v.frames(120);assert.equal(v.G.sweeps.length,1);
});
test('不可知域只改毒色背景，保持单层常驻中毒，不创建扫描或爆炸，重开恢复背景',()=>{
 const h=run(),e=h.target(240,300,{def:0});h.equip(['poisonbottle','miasma','unknown']);h.G.cardLevels['attribute:poison']=2;h.GP.recompute();
 for(let i=0;i<10;i++)h.GP.combat.cast(h.G.skills.unknown.derived);
 assert.equal(Object.keys(e.dots).length,1);assert.equal(e.hp,e.maxhp);h.GP.combat.statuses(e,.5);assert.equal(e.hp,e.maxhp-12);
 assert.equal(h.G.sweeps.length,0);assert.equal(h.G.booms.length,0);assert.equal(e.flash,0);
 const ctx=h.PM.Platform.ctx(),fills=[];ctx.fillRect=(x,y,w,height)=>{if(x===-20&&y===-20)fills.push(ctx.fillStyle);};
 h.PM.Renderer.render(0);assert.equal(fills.at(-1),'#190e2b');h.GP.resetRun(0);h.PM.Renderer.render(0);assert.equal(fills.at(-1),'#070a12');
});

test('全屏伤害累加前置元素加成，不乘前置数量，不混入无关属性或重复自身属性',()=>{
 const h=run();
 for(const s of h.C.skills.filter(s=>s.mode==='fullscreen')){
  h.G.cardLevels={};h.G.player.damageBonus=.25;
  Object.keys(h.C.elements).forEach((el,i)=>{h.G.cardLevels['attribute:'+el]=i+1;});
  h.G.cardLevels[s.id+':damage']=2;
  const expected=Object.keys(s.cond).reduce((n,el)=>n+h.R.attributeBonus(h.G,el),0);
  assert.ok(Math.abs(h.R.skillAttributeBonus(h.G,s.id)-expected)<1e-9,s.id);
  assert.ok(Math.abs(h.R.derive(h.G,s.id).dmg-h.C.power.base*s.ratio*(1+.25+.4+expected))<1e-9,s.id);
 }
 h.G.cardLevels={'attribute:elec':2,'attribute:water':3,'attribute:fire':100};h.G.player.damageBonus=0;
 assert.equal(h.R.derive(h.G,'thunderstorm').dmg,300); // +20% 电 +30% 水
 assert.equal(h.R.derive(h.G,'chain').dmg,120); // 普通电技能只吃电加成
 h.equip(['thunderstorm']);h.GP.recompute();
 const e=h.target(240,300,{def:0,el:'fire'});h.GP.combat.cast(h.G.skills.thunderstorm.derived);h.GP.combat.update(3);
 assert.equal(e.hp,e.maxhp-300);
});
test('普通和无尽全屏均需当前已有至少四技能，初始计数且同时检查前置和空槽',()=>{
 for(const mode of ['campaign','endless']){
  const h=run();h.G.mode=mode;
  h.equip(['poisonbottle','miasma']);assert.equal(h.GP.ownedSkills(),3);
  assert.equal(h.R.eligible(h.G,'unknown'),false);
  assert.equal(h.GP.choicePool().some(ch=>ch.card.unlock==='unknown'),false);
  h.equip(['poisonbottle','miasma','laser']);assert.equal(h.GP.ownedSkills(),4);
  assert.equal(h.R.eligible(h.G,'unknown'),true);
  h.equip(['poisonbottle','laser','blackhole']);assert.equal(h.R.eligible(h.G,'unknown'),false);
  h.equip(['poisonbottle','miasma','laser','blackhole','chain']);
  assert.equal(h.R.eligible(h.G,'unknown'),mode==='endless');
 }
});

test('六种全屏只生成专属伤害卡，实际卡池保留伤害与前置属性卡，普通技能强化不受影响',()=>{
 const h=run();h.G.mode='endless';
 const full=h.C.skills.filter(s=>s.mode==='fullscreen');
 for(const s of full){
  h.equip([s.id].concat(h.C.skills.filter(v=>v.mode!=='fullscreen'&&Object.keys(s.cond).includes(v.el)).map(v=>v.id)));
  const definitions=h.R.cards.filter(c=>c.skill===s.id&&!c.unlock);
  assert.deepEqual(Array.from(definitions,c=>c.tag),['damage'],s.id);
  const pool=h.GP.choicePool();
  assert.deepEqual(Array.from(pool.filter(ch=>ch.card.skill===s.id&&!ch.card.unlock),ch=>ch.card.tag),['damage'],s.id);
  for(const el of Object.keys(s.cond))assert.ok(pool.some(ch=>ch.card.id==='attribute:'+el),s.id+' '+el);
  const before=h.R.derive(h.G,s.id).dmg;
  h.take(s.id+':damage');assert.ok(h.R.derive(h.G,s.id).dmg>before);
  for(const tag of s.tags)assert.equal(h.R.enhancementMaxed(h.G,s.id,tag),false);
 }
 for(const id of ['basic:cooldown','chain:slow','icecone:freeze','waterball:breach'])assert.ok(h.R.card(id),id);
});
