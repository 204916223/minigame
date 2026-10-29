"use strict";
const test = require('node:test'), assert = require('node:assert/strict');
const { createGame } = require('./harness');
function run() { const h = createGame(); h.GP.resetRun(0); return h; }
test('原始设计表：21技能、6全屏、黑洞不分裂、雷暴与排山倒海前置', () => {
  const { C, R } = run();
  assert.equal(C.skills.length, 21); assert.equal(C.skills.filter(s => s.mode === 'fullscreen').length, 6);
  assert.equal(R.has(R.skill('blackhole'), 'split'), false);
  assert.equal(JSON.stringify(R.skill('thunderstorm').cond), '{"elec":2,"water":2}');
  assert.equal(JSON.stringify(R.skill('tidalwave').cond), '{"wind":2,"elec":2}');
});
test('开局仅普攻；七候选不自动装备；强化只属于已装备技能', () => {
  const { G, GP } = run(); assert.equal(G.candidates.length, 7); assert.equal(GP.ownedSkills(), 1);
  assert.equal(Object.keys(G.cardLevels).length, 0);
  assert.ok(GP.choicePool().filter(ch => ch.card.unlock).every(ch => G.candidates.includes(ch.card.unlock)));
  assert.ok(GP.choicePool().filter(ch => !ch.card.unlock).every(ch => ch.card.skill === 'basic'));
});
test('获得风刃不送强化，基础三个目标，两技能尚未解锁羁绊', () => {
  const h = run(); h.G.candidates = ['windblade']; h.take('get:windblade');
  assert.equal(h.GP.ownedSkills(), 2); assert.equal(Object.keys(h.G.cardLevels).length, 0);
  assert.equal(h.G.skills.windblade.derived.child, 0); assert.equal(h.G.skills.windblade.derived.count, 3);
  assert.equal(h.R.derive({ skills: { windblade: { owned: true } }, cardLevels: {}, player: {} }, 'windblade').count, 3);
});
test('四选一去重，初次升级及满槽都保证强化', () => {
  const h = run();
  for (const ids of [[], ['laser','blackhole','chain','lightning','waterball']]) {
    h.equip(ids);
    for (let i = 0; i < 100; i++) {
      const choices = h.GP.buildChoices(); assert.equal(choices.length, 4);
      assert.equal(new Set(choices.map(ch => ch.card.id)).size, 4); assert.ok(choices.some(ch => !ch.card.unlock));
      if (ids.length === 5) assert.ok(choices.every(ch => !ch.card.unlock));
    }
  }
});
test('不可知域只看装备，满足前置即可出现，获取后禁止装备风系', () => {
  const h = run(); h.G.candidates = ['poisonbottle','miasma','windblade']; h.equip(['poisonbottle','miasma']);
  assert.ok(h.R.eligible(h.G, 'unknown')); h.take('get:unknown'); assert.equal(h.GP.ownedSkills(),4);
  assert.equal(h.R.eligible(h.G,'windblade'),false);
  h.equip(['poisonbottle','miasma','windblade']); assert.equal(h.R.eligible(h.G,'unknown'),false);
});
test('六种全屏均可达，满六槽不再出技能', () => {
  const h=run(), builds={ thunderstorm:['chain','lightning','waterball','geyser'], firestorm:['fireball','meteor','windblade','tornado'], tidalwave:['windblade','tornado','chain','lightning'], blizzard:['icecone','crystal','windblade','tornado'], flood:['waterball','geyser','windblade','tornado'], unknown:['poisonbottle','miasma'] };
  Object.entries(builds).forEach(([id,ids])=>{h.equip(ids);assert.equal(h.R.eligible(h.G,id),true,id);});
  h.equip(['chain','lightning','waterball','geyser','laser']); assert.equal(h.R.eligible(h.G,'thunderstorm'),false);
});
test('羁绊数技能，四件替换两件，卡等级不计数，无标签不受益', () => {
  const h=run();h.equip(['fireball']);assert.equal(h.R.bondsUnlocked(h.G),false);assert.equal(h.R.derive(h.G,'fireball').cd,10000);
  h.G.cardLevels['basic:cooldown']=8;assert.equal(h.R.bonds(h.G).cooldown,2);
  h.equip(['fireball','meteor','windblade']);assert.equal(h.R.bonus(h.R.bonds(h.G),'cooldown'),.15);
  h.equip(['unknown']);assert.equal(h.R.derive(h.G,'unknown').cd,0);assert.equal(h.R.has(h.R.skill('unknown'),'cooldown'),false);
});
test('技能名与派系唯一标识；属性伤害不影响同元素其他技能', () => {
  const h=run();h.equip(['fireball','meteor']);const before=h.G.skills.meteor.derived.dmg;
  h.G.cardLevels['fireball:attribute']=3;h.GP.recompute();assert.equal(h.G.skills.meteor.derived.dmg,before);
  assert.ok(Math.abs(h.G.skills.fireball.derived.dmg-325)<1e-9);
  assert.equal(new Set(h.R.cards.map(c=>c.id)).size,h.R.cards.length);
});
test('强化加算、伤害代价计入、持续时间加秒', () => {
  const h=run();h.G.cardLevels={'basic:damage':2,'basic:attribute':1,'basic:cooldown':1};
  assert.ok(Math.abs(h.R.derive(h.G,'basic').dmg-290)<1e-9);assert.ok(Math.abs(h.R.derive(h.G,'basic').cd-1900)<1e-9);
  h.equip(['fireball']);h.G.cardLevels['fireball:duration']=2;assert.equal(h.R.derive(h.G,'fireball').duration,4);
});
test('卡达到上限不出现，羁绊另加，冷却遵守上下限', () => {
  const h=run();h.equip(['fireball','meteor','blackhole','lightning']);h.G.cardLevels['fireball:range']=10;
  assert.ok(Math.abs(h.R.derive(h.G,'fireball').radius-55*1.65)<1e-9);
  assert.equal(h.GP.choicePool().some(ch=>ch.card.id==='fireball:range'),false);
  h.G.cardLevels['basic:cooldown']=10;h.G.player.haste=.5;assert.equal(h.R.derive(h.G,'basic').cd,1000);
  h.equip(['laser']);h.G.cardLevels['laser:cooldown']=10;assert.equal(h.R.derive(h.G,'laser').cd,10000);
});
test('分裂首张2、后续+1、卡上限5，羁绊不能自行开启', () => {
  const h=run();assert.equal(h.R.derive(h.G,'basic').child,0);
  for (const [lv, count] of [[1,2],[2,3],[4,5]]) {h.G.cardLevels['basic:split']=lv;assert.equal(h.R.derive(h.G,'basic').child,count);}
  assert.equal(h.GP.choicePool().some(ch=>ch.card.id==='basic:split'),false);
  h.equip(['windblade','icecone','waterball']);assert.equal(h.R.derive(h.G,'basic').child,8);assert.equal(h.R.derive(h.G,'windblade').child,0);
});
test('减法防御、破防和数值边界', () => {
  const {R}=run();assert.equal(R.damage(100,10,0),90);assert.equal(R.damage(100,10,.05),90.5);
  assert.equal(R.damage(2,10,0),27);assert.equal(R.damage(NaN,10,0),0);assert.equal(R.damage(Infinity,10,0),0);
});
test('十波及末波1005，批次封顶，波次衔接保留残怪', () => {
  const h=run();assert.ok(h.C.levels.every(l=>l.waves.length===10&&l.waves[9].kills===1005));
  h.G.skills.basic.owned=false;h.C.levels[0].waves[0].interval=.01;h.G.spawnTimer=0;h.GP.update(1/60);
  assert.ok(h.G.enemies.length>=3&&h.G.enemies.length<=5);h.frames(30);assert.equal(h.G.waveSpawned,30);
  const mob=h.G.enemies[0];h.frames(200);assert.equal(h.G.waveIndex,1);assert.ok(h.G.enemies.includes(mob));
});
test('连升逐次选择，刷新不消耗升级，拒绝旧选项', () => {
  const h=run();h.GP.grantExperience(10);assert.equal(h.G.pendingLevelUps,2);assert.equal(h.G.player.lvl,3);
  h.G.refreshes=1;assert.equal(h.GP.refreshChoices(),true);assert.equal(h.G.refreshes,0);assert.equal(h.G.pendingLevelUps,2);
  const choice=h.G.choices[0];assert.equal(h.GP.applyChoice(choice),true);assert.equal(h.G.pendingLevelUps,1);
  h.GP.applyChoice(h.G.choices[0]);assert.equal(h.G.state,'playing');assert.equal(h.GP.applyChoice(choice),false);
});
test('末波同帧清场直接结算、不弹升级', () => {
  const h=run();h.G.waveIndex=9;h.G.waveSpawned=1005;h.G.player.xp=h.G.player.xpv-1;
  h.target(200,300,{hp:1,xp:1});h.target(205,300,{hp:1,xp:1});
  h.GP.combat.area(200,300,{...h.G.skills.basic.derived,radius:50},false);h.GP.update(1/60);
  assert.equal(h.G.state,'cleared');assert.equal(h.G.pendingLevelUps,0);assert.equal(h.G.choices.length,0);assert.equal(h.G.player.kills,2);
});
test('星级解锁和3/6/9波刷新', () => {
  const h=run(),stars=h.GP.calculateStars;
  assert.equal(stars(.3),0);assert.equal(stars(.6),1);assert.equal(stars(.9),2);assert.equal(stars(1),3);
  assert.equal(h.GP.isLevelUnlocked(1),false);h.G.progress.stars[0]=1;assert.equal(h.GP.isLevelUnlocked(1),true);
  [2,5,8].forEach(w=>{h.GP.resetRun(0);h.G.waveIndex=w;h.G.waveSpawned=h.C.levels[0].waves[w].kills;h.G.waveLead=.001;h.GP.update(1/60);assert.equal(h.G.refreshes,1);});
});
test('旧存档清洗保留金币养成、候选去重、迁移幂等、局外才可编辑', () => {
  const h=createGame({stars:[3],coins:123,meta:{atk:4},candidates:['windblade','windblade','unknown','basic','not-found','__proto__','constructor']});
  assert.equal(h.G.progress.version,2);assert.equal(h.G.progress.coins,123);assert.equal(h.G.progress.meta.atk,4);
  assert.equal(JSON.stringify(h.G.progress.candidates),'["windblade"]');assert.equal(JSON.stringify(h.R.progress(h.G.progress)),JSON.stringify(h.G.progress));
  assert.equal(h.GP.toggleCandidate('unknown'),false);assert.equal(h.GP.toggleCandidate('basic'),false);
  h.GP.toggleCandidate('laser');assert.ok(h.G.progress.candidates.includes('laser'));h.GP.resetRun(0);assert.equal(h.GP.toggleCandidate('laser'),false);
});
test('局外购买扣费与金币结算不重复', () => {
  const h=run();h.G.progress.coins=2000;const cost=h.GP.metaCost('atk');assert.equal(h.GP.buyMeta('atk'),true);
  assert.equal(h.G.progress.meta.atk,1);assert.equal(h.G.progress.coins,2000-cost);
  h.G.coins=7;h.GP.bankCoins();h.GP.bankCoins();assert.equal(h.G.progress.coins,2007-cost);
});
test('不可知域常驻单层，不出持续强化，但计入持续羁绊',()=>{
 const h=run();h.equip(['poisonbottle','miasma','unknown']);
 assert.equal(h.R.card('unknown:duration'),undefined);assert.equal(h.R.bonds(h.G).duration,3);
 assert.equal(h.GP.choicePool().some(ch=>ch.card.id==='unknown:duration'),false);
});
test('旧存档首次迁移保留备份，已迁移存档不重复备份',()=>{
 const old={stars:[2],coins:90,meta:{atk:3}};const h=createGame(old);
 assert.equal(h.storage['pixelMowProgress.beforeV2'],JSON.stringify(old));
 const saved=JSON.parse(h.storage.pixelMowProgress);assert.equal(saved.version,2);assert.equal(saved.coins,90);
 const fresh=createGame(saved);assert.equal(fresh.storage['pixelMowProgress.beforeV2'],undefined);
});
