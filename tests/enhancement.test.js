"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),{createGame}=require('./harness');
function run(){const h=createGame({stars:[1,1,1],meta:{haste:40}});h.GP.resetRun(0);return h;}
function textCalls(h){const calls=[],ctx=h.PM.Platform.ctx();ctx.fillText=(value,x,y)=>calls.push({value:String(value),x,y,color:ctx.fillStyle});h.PM.Renderer.render(0);return calls;}
test('每种属性只有一张无限伤害卡，必须拥有该系技能才入池，不重复绑定技能',()=>{
 const h=run(),cards=h.R.cards.filter(c=>c.tag==='attribute');assert.equal(cards.length,7);
 assert.ok(cards.every(c=>c.element&&!c.skill&&c.max===Infinity&&!c.cost));
 assert.equal(h.R.card('chain:attribute'),undefined);
 assert.equal(h.GP.choicePool().filter(c=>c.card.element).length,1);
 h.equip(['chain','lightning','thunderstorm']);const pool=h.GP.choicePool().filter(c=>c.card.element);
 assert.equal(pool.length,2);assert.equal(pool.filter(c=>c.card.element==='elec').length,1);
 assert.match(h.R.describe(h.R.card('attribute:elec'),3),/电系所有技能伤害 \+30%.*后续/);
});
test('电系属性卡覆盖现有和后续三个电技能；技能伤害仅对指定技能生效，重开清空',()=>{
 const h=run();h.equip(['chain']);h.take('attribute:elec');h.take('attribute:elec');
 assert.equal(h.G.focusedSkill,'chain');assert.equal(h.G.skillPage,0);
 h.take('get:lightning');h.equip(['chain','lightning','waterball','geyser']);h.take('get:thunderstorm');
 for(const id of ['chain','lightning','thunderstorm'])assert.equal(h.G.skills[id].derived.dmg,h.C.power.base*h.R.skill(id).ratio*1.2);
 h.take('lightning:damage');assert.ok(Math.abs(h.G.skills.lightning.derived.dmg-280)<1e-9);
 assert.equal(h.G.skills.chain.derived.dmg,120);assert.equal(h.G.skills.thunderstorm.derived.dmg,240);
 assert.equal(h.G.skills.waterball.derived.dmg,150);
 h.GP.resetRun(0);assert.equal(h.R.attributeBonus(h.G,'elec'),0);
});
test('无尽属性卡无限叠加、选择后定位同系技能，当前同系焦点保留',()=>{
 const h=run();h.GP.resetRun(-1);h.equip(['fireball','meteor','windblade','tornado','icecone','crystal','lightning']);
 h.G.cardLevels['attribute:elec']=1000;h.G.focusedSkill='basic';h.take('attribute:elec');
 assert.equal(h.G.cardLevels['attribute:elec'],1001);assert.equal(h.G.focusedSkill,'lightning');assert.equal(h.G.skillPage,1);
 h.G.focusedSkill='meteor';h.take('attribute:fire');assert.equal(h.G.focusedSkill,'meteor');
});
test('实际冷却硬下限也算满额，卡自身上限与羁绊分开，无上限伤害永不标满',()=>{
 const h=run();h.equip(['fireball','meteor','lightning']);
 h.G.cardLevels['basic:cooldown']=2;assert.equal(h.R.enhancementMaxed(h.G,'basic','cooldown'),false);
 h.G.cardLevels['basic:cooldown']=3;assert.equal(h.R.derive(h.G,'basic').cd,1000);assert.equal(h.R.enhancementMaxed(h.G,'basic','cooldown'),true);
 assert.ok(h.GP.choicePool().some(c=>c.card.id==='basic:cooldown'));
 h.G.cardLevels['fireball:range']=7;assert.equal(h.R.enhancementMaxed(h.G,'fireball','range'),false);
 for(const card of h.R.cards.filter(c=>Number.isFinite(c.max)&&!c.unlock)){
  h.G.cardLevels[card.id]=card.max;assert.equal(h.R.enhancementMaxed(h.G,card.skill,card.tag),true,card.id);
 }
 assert.equal(h.R.enhancementMaxed(h.G,'unknown','duration'),false);
 assert.equal(h.R.enhancementMaxed(h.G,'basic','range'),false);
 assert.equal(h.R.enhancementMaxed(h.G,'basic','damage'),false);
 assert.equal(h.R.enhancementMaxed(h.G,undefined,'attribute'),false);
});
test('满额文字及无增益卡标红，未满和共享属性加成不误标，保留伤害代价警示',()=>{
 const h=run();h.equip(['chain','fireball','meteor']);h.G.cardLevels={'basic:cooldown':3,'attribute:physical':1};h.GP.recompute();
 let labels=textCalls(h).filter(t=>t.x>380);
 for(const value of ['冷却','-50%','红字：当前已满'])assert.ok(labels.some(t=>t.value===value&&t.color==='#ff5d6c'),value);
 assert.ok(labels.some(t=>t.value==='其中属性'&&t.color!=='#ff5d6c'));
 h.G.state='levelup';h.G.choices=['basic:cooldown','chain:cooldown','attribute:elec','basic:damage'].map(id=>({card:h.R.card(id),level:h.G.cardLevels[id]||0}));
 labels=textCalls(h);assert.ok(labels.some(t=>t.value.startsWith('白银子弹·冷却')&&t.color==='#ff5d6c'));
 assert.ok(labels.some(t=>/当前加成已满，本次无增益.*伤害 -5%/.test(t.value)&&t.color==='#ff5d6c'));
 assert.ok(labels.some(t=>t.value.startsWith('闪电链接·冷却')&&t.color!=='#ff5d6c'));
 assert.ok(labels.some(t=>t.value.startsWith('电系·属性伤害')&&t.color!=='#ff5d6c'));
});
