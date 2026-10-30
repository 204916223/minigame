"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),{createGame}=require('./harness');
test('七角色按不同通关数解锁；星数和重复通关不额外解锁，旧档兼容并清洗锁定选择',()=>{
 const ids=['physical','fire','poison','elec','water','wind','ice'];
 for(let clears=0;clears<=5;clears++){
  const h=createGame({character:'physical',stars:Array(clears).fill(1)});
  assert.deepEqual(Array.from(h.C.characters,v=>v.id),ids);
  assert.deepEqual(ids.filter(id=>h.R.characterUnlocked(h.G.progress,id)),ids.slice(0,clears+2));
 }
 const h=createGame({character:'physical',stars:[3]});
 assert.equal(h.R.characterUnlocked(h.G.progress,'poison'),true);assert.equal(h.R.characterUnlocked(h.G.progress,'elec'),false);
 assert.equal(createGame({character:'ice'}).GP.selectedCharacter().id,'physical');
 assert.equal(createGame({character:'azure',coins:123,stars:[1]}).G.progress.coins,123);
});
test('七角色开局对应元素加15%，全屏按前置共享，普通异属性不加成，重开不叠加',()=>{
 for(const id of ['physical','fire','poison','elec','water','wind','ice']){
  const h=createGame({character:id,stars:[1,1,1,1,1]});h.GP.resetRun(0);
  for(const s of h.C.skills){
   const affected=s.mode==='fullscreen'?Object.keys(s.cond).includes(id):s.el===id;
   const base=h.C.power.base*s.ratio;
   assert.ok(Math.abs(h.R.derive(h.G,s.id).dmg-base*(affected?1.15:1))<1e-9,id+' '+s.id);
  }
  h.G.cardLevels['attribute:'+id]=2;
  const s=h.C.skills.find(s=>s.mode!=='fullscreen'&&s.el===id);
  assert.ok(Math.abs(h.R.derive(h.G,s.id).dmg-h.C.power.base*s.ratio*1.35)<1e-9);
  h.GP.resetRun(0);assert.equal(h.G.player.characterElement,id);
  assert.ok(Math.abs(h.R.skillAttributeBonus(h.G,s.id)-.15)<1e-9);
 }
});
test('角色说明弹窗隔离点击和空格；锁定角色不能出战；可用角色保存并进入战斗',()=>{
 const h=createGame({character:'physical'});h.PM.Input.bind();const render=()=>h.PM.Renderer.render(0);
 const tap=r=>{h.advanceClock(300);h.PM.Input.tap(r.x+r.w/2,r.y+r.h/2);render();};
 render();tap(h.G.ui.heroPrev);assert.equal(h.GP.previewCharacter().id,'ice');
 tap(h.G.ui.start);assert.equal(h.G.state,'menu');assert.match(h.G.toast.text,/未解锁/);
 tap(h.G.ui.character);assert.equal(h.G.characterInfoOpen,true);
 tap(h.G.ui.heroNext);assert.equal(h.GP.previewCharacter().id,'ice');
 h.events.keydown({code:'Space',preventDefault(){}});assert.equal(h.G.state,'menu');
 tap(h.G.ui.characterInfoDone);tap(h.G.ui.heroNext);tap(h.G.ui.heroNext);
 assert.equal(h.GP.selectedCharacter().id,'fire');
 const stored=JSON.parse(h.storage['pixelMowProgress.v3']);assert.equal(createGame(stored).GP.selectedCharacter().id,'fire');
 tap(h.G.ui.start);assert.equal(h.G.state,'levelselect');h.GP.resetRun(0);assert.equal(h.G.player.characterElement,'fire');
});
