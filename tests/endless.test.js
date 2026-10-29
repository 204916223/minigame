"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {createGame}=require('./harness');
function endless(progress={}){
 const h=createGame({version:2,stars:[1,1,1],candidates:[],...progress});
 assert.equal(h.GP.resetRun(-1),true);h.G.spawnTimer=1e8;return h;
}
function click(h,rect){h.advanceClock(300);h.PM.Input.tap(rect.x+rect.w/2,rect.y+rect.h/2);h.PM.Renderer.render(0);}
function totalXP(h){let total=h.G.player.xp;for(let lvl=1;lvl<h.G.player.lvl;lvl++)total+=h.GP.xpNeed(lvl);return total;}

test('无尽置于第一关之前，前三关都至少一星才解锁，缺备战不阻止无尽但普通关仍需七个',()=>{
 for(const stars of [[],[1],[1,1],[0,1,1],[1,0,1],[1,1,0],[1,1,1]]){
  const h=createGame({stars,candidates:[]}),unlocked=stars.length===3&&stars.every(n=>n>0);
  assert.equal(h.GP.isEndlessUnlocked(),unlocked);assert.equal(h.GP.isLevelUnlocked(-1),unlocked);
  assert.equal(h.GP.canSelectLevel(),unlocked);assert.equal(h.GP.resetRun(-1),unlocked);
  if(!unlocked)assert.equal(h.G.state,'menu');
 }
 const h=endless();h.GP.openLevelSelect();h.PM.Renderer.render(0);
 const rows=h.G.ui.levelButtons;assert.equal(rows.length,6);assert.equal(rows[0].index,-1);assert.equal(rows[1].index,0);
 rows.forEach((r,i)=>{assert.ok(r.x>=0&&r.x+r.w<=h.C.width);if(i)assert.ok(r.y>=rows[i-1].y+rows[i-1].h);});
 assert.ok(rows.at(-1).y+rows.at(-1).h<h.G.ui.menu.y);assert.equal(rows[1].unlocked,false);
 click(h,rows[1]);assert.equal(h.G.state,'levelselect');click(h,rows[0]);assert.equal(h.G.mode,'endless');
 assert.equal(h.GP.ownedSkills(),1);assert.equal(h.G.progress.candidates.length,0);
});

test('无尽每波准确生成1000普通、3小首领、2大首领，跨过第十波继续且不写星级',()=>{
 const h=endless(),keys=[];h.G.skills.basic.owned=false;
 while(h.G.waveSpawned<1005){h.G.spawnTimer=0;h.GP.update(1/60);keys.push(...h.G.enemies.map(e=>e.key));h.G.enemies=[];}
 assert.equal(keys.length,1005);assert.equal(keys.filter(k=>k==='miniboss').length,3);assert.equal(keys.filter(k=>k==='boss').length,2);
 assert.ok(keys.slice(0,1000).every(k=>!['miniboss','boss'].includes(k)));
 assert.deepEqual(keys.slice(1000),['miniboss','miniboss','miniboss','boss','boss']);
 const stars=JSON.stringify(h.G.progress.stars);
 for(const wave of [0,9,10,99,1000]){
  h.G.waveIndex=wave;h.G.waveSpawned=1005;h.G.waveLead=.001;h.GP.update(1/60);
  assert.equal(h.G.waveIndex,wave+1);assert.equal(h.G.state,'playing');assert.equal(h.G.result,null);
  assert.equal(h.GP.waveConfig().kills,1005);assert.equal(h.GP.canContinue(),false);
 }
 assert.equal(JSON.stringify(h.G.progress.stars),stars);
});

test('无尽血防按波次增长，速度最多初始1.5倍，波内和角色升级不会再暗加速度',()=>{
 const h=endless();h.G.skills.basic.owned=false;
 for(const wave of [0,1,5,10,11,100,1000])for(const key of Object.keys(h.C.enemyTypes)){
  h.G.waveIndex=wave;h.G.waveSpawned=key==='boss'?1003:key==='miniboss'?1000:0;
  h.C.endless.pool={[key]:1};h.G.player.lvl=80;h.G.enemies=[];h.G.spawnTimer=0;h.GP.update(1/60);
  const e=h.G.enemies[0],base=h.C.enemyTypes[key];assert.ok(e);
  assert.equal(e.maxhp,base.hp*2*(1+.15*wave));assert.equal(e.def,base.def*(1+.1*wave));
  assert.equal(e.spd,base.spd*Math.min(1.5,1+.05*wave));assert.ok(e.spd<=base.spd*1.5);
  const before={hp:e.maxhp,def:e.def,spd:e.spd};h.GP.grantExperience(h.G.player.xpv-h.G.player.xp);
  assert.deepEqual({hp:e.maxhp,def:e.def,spd:e.spd},before);h.G.state='playing';h.G.pendingLevelUps=0;
 }
});

test('无尽金币减半，经验为普通关的一半且保留小数，首领也适用，结算和重试不重复给金币',()=>{
 const h=endless();
 for(const xp of [1,1,15,30]){const e=h.at(0,-220,{hp:1,maxhp:1,xp});h.GP.combat.hit(e,h.G.skills.basic.derived);h.GP.combat.hit(e,h.G.skills.basic.derived);}
 assert.equal(h.G.coins,2);assert.equal(h.G.player.kills,4);assert.equal(totalXP(h),17.625);
 h.GP.bankCoins();h.GP.bankCoins();assert.equal(h.G.progress.coins,2);
 const e=h.at(0,-220,{hp:1,xp:1});h.GP.combat.hit(e,h.G.skills.basic.derived);assert.equal(h.G.coins,.5);
 h.GP.openLevelSelect();assert.equal(h.G.progress.coins,2.5);h.GP.resetRun(-1);assert.equal(h.G.progress.coins,2.5);
 const restored=createGame(JSON.parse(h.storage['pixelMowProgress.v3']));assert.equal(restored.G.progress.coins,2.5);
 h.GP.resetRun(0);h.GP.combat.hit(h.at(0,-220,{hp:1,xp:1}),h.G.skills.basic.derived);
 assert.equal(h.G.coins,1);assert.equal(totalXP(h),.75);assert.equal(h.G.mode,'campaign');
});

test('无尽突破六格和备战池，仍保留全屏前置、不可知域与风系双向互斥',()=>{
 const h=endless();assert.equal(h.R.eligible(h.G,'thunderstorm'),false);
 for(const id of ['laser','blackhole','chain','lightning','waterball','geyser','fireball'])h.take('get:'+id);
 assert.equal(h.GP.ownedSkills(),8);assert.equal(h.R.eligible(h.G,'thunderstorm'),true);h.take('get:thunderstorm');
 h.take('get:poisonbottle');h.take('get:miasma');h.take('get:unknown');
 assert.equal(h.R.eligible(h.G,'windblade'),false);assert.equal(h.R.eligible(h.G,'tornado'),false);
 const wind=endless();wind.equip(['poisonbottle','miasma','windblade']);assert.equal(wind.R.eligible(wind.G,'unknown'),false);
 // 风系路线可同时装备其余20个技能；不可知域继续排除。
 const all=endless();for(const s of all.C.skills.filter(s=>s.mode!=='fullscreen'&&s.id!=='basic'))all.take('get:'+s.id);
 for(const s of all.C.skills.filter(s=>s.mode==='fullscreen'&&s.id!=='unknown'))all.take('get:'+s.id);
 assert.equal(all.GP.ownedSkills(),20);assert.equal(all.GP.choicePool().some(ch=>ch.card.unlock),false);
 all.GP.resetRun(0);all.equip(['laser','blackhole','chain','lightning','waterball']);assert.equal(all.R.eligible(all.G,'geyser'),false);
});

test('所有特殊强化满后四选一只出技能伤害和属性伤害，两类均可无限升级',()=>{
 const h=endless();h.equip(h.C.skills.filter(s=>s.id!=='unknown').map(s=>s.id));
 h.R.cards.filter(c=>!c.unlock&&Number.isFinite(c.max)).forEach(c=>{h.G.cardLevels[c.id]=c.max;});
 h.R.cards.filter(c=>!c.unlock&&!Number.isFinite(c.max)).forEach(c=>{h.G.cardLevels[c.id]=10000;});
 for(let i=0;i<12;i++){
  h.GP.grantExperience(h.G.player.xpv-h.G.player.xp);assert.equal(h.G.choices.length,4);
  assert.equal(new Set(h.G.choices.map(ch=>ch.card.id)).size,4);
  assert.ok(h.G.choices.every(ch=>['damage','attribute'].includes(ch.card.tag)));
  assert.ok(h.G.choices.every(ch=>ch.level>=10000));h.GP.applyChoice(h.G.choices[0]);
 }
 assert.ok(h.GP.choicePool().every(ch=>['damage','attribute'].includes(ch.card.tag)));
});

test('无尽技能栏只分页显示，不限制后台攻击；新增技能自动定位，暂停返回和失败重试保留模式',()=>{
 const h=endless();h.equip(h.C.skills.filter(s=>s.id!=='unknown').map(s=>s.id));h.PM.Renderer.render(0);
 assert.equal(h.G.ui.skillSlots.length,6);click(h,h.G.ui.skillNext);assert.equal(h.G.skillPage,1);
 assert.equal(h.G.ui.skillSlots[0].id,h.G.equippedOrder[6]);
 h.GP.selectSkill('flood');h.PM.Renderer.render(0);assert.ok(h.G.ui.skillSlots.some(s=>s.id==='flood'));
 h.at(0,-220,{hp:1e6,maxhp:1e6});h.GP.update(1/60);
 h.G.equippedOrder.forEach(id=>assert.ok(h.G.skills[id].cd>0,id));
 const p=h.G.skillPage;h.GP.pause(true);assert.equal(h.GP.changeSkillPage(1),false);assert.equal(h.G.skillPage,p);
 h.PM.Renderer.render(0);click(h,h.G.ui.pauseBack);assert.equal(h.G.state,'levelselect');
 click(h,h.G.ui.levelButtons[0]);assert.equal(h.G.mode,'endless');assert.equal(h.GP.ownedSkills(),1);assert.equal(h.G.skillPage,0);
 h.target(h.G.player.x,h.G.player.y,{hp:1e9});h.GP.update(1/60);assert.equal(h.G.state,'over');h.PM.Renderer.render(0);
 click(h,h.G.ui.retry);assert.equal(h.G.mode,'endless');assert.equal(h.G.waveIndex,0);assert.equal(h.G.state,'playing');
});

test('微信安全区内可显示多页技能，无尽计时超过100分钟不回绕',()=>{
 const h=createGame({stars:[1,1,1],candidates:[]},1,true);h.GP.resetRun(-1);
 h.equip(h.C.skills.filter(s=>s.id!=='unknown').map(s=>s.id));h.GP.selectSkill('miasma');
 h.G.time=(101*60+5)*1000;const texts=[];h.PM.Platform.ctx().fillText=value=>texts.push(String(value));h.PM.Renderer.render(0);
 assert.ok(texts.includes('101:05'));assert.ok(texts.includes('4/4 页'));assert.ok(texts.includes('装备 20 · 全部生效'));
 assert.ok(h.G.ui.skillSlots.every(r=>r.y+r.h<=h.PM.Platform.safeBottom()));
 assert.ok(h.G.ui.skillNext.y+h.G.ui.skillNext.h<h.G.ui.skillSlots[0].y);
});
