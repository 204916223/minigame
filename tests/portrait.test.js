"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),{createGame}=require('./harness');
test('9:16保持横向坐标与怪物速度，交战线后移且确实延长可攻击时间',()=>{
 const h=createGame();assert.equal(h.C.width/h.C.height,9/16);
 assert.ok(Math.abs(h.GP.dangerY()-544-(h.C.height-640-32))<1e-9);
 h.GP.resetRun(0);h.G.spawnTimer=1e8;h.G.skills.basic.cd=1e9;
 const e=h.target(240,100,{spd:20,hp:10000}),hp=h.G.player.hp;
 for(let i=0;i<450;i++)h.GP.update(.05);
 assert.ok(e.y>544);assert.equal(e.spd,20);assert.equal(h.G.state,'playing');assert.equal(h.G.player.hp,hp);
 for(let i=0;i<220&&h.G.state==='playing';i++)h.GP.update(.05);
 assert.equal(h.G.state,'over');
});
test('竖屏各页按钮在画布内且首页分区、配置技能与强化行不重叠',()=>{
 for(const wx of [false,true]){
  const h=createGame({stars:[1,1,1,1,1]},1,wx),render=()=>h.PM.Renderer.render(0);
  const inside=r=>{assert.ok(r.x>=0&&r.y>=0);assert.ok(r.x+r.w<=h.C.width&&r.y+r.h<=h.C.height);};
  render();['character','loadout','start','shop','heroPrev','heroNext'].forEach(k=>inside(h.G.ui[k]));
  assert.ok(h.G.ui.character.y+h.G.ui.character.h<h.G.ui.shop.y);
  assert.ok(h.G.ui.loadout.y+h.G.ui.loadout.h<h.G.ui.start.y);
  h.G.loadoutOpen=true;render();h.G.ui.candidates.forEach(inside);inside(h.G.ui.loadoutDone);
  assert.ok(h.G.ui.candidates.at(-1).y+h.G.ui.candidates.at(-1).h<h.G.ui.loadoutDone.y);
  h.G.loadoutOpen=false;h.GP.openMeta();render();h.G.ui.metaRows.forEach(inside);inside(h.G.ui.metaBack);
  assert.ok(h.G.ui.metaRows.at(-1).y+h.G.ui.metaRows.at(-1).h<h.G.ui.metaBack.y);
  h.GP.leaveMeta();h.GP.openLevelSelect();render();h.G.ui.levelButtons.forEach(inside);inside(h.G.ui.menu);
  h.GP.resetRun(0);render();h.G.ui.skillSlots.forEach(inside);
  assert.ok(h.G.ui.skillSlots[0].y>h.C.hero.y);
  h.GP.grantExperience(3);render();h.G.ui.cards.forEach(inside);inside(h.G.ui.refresh);
  assert.ok(h.G.ui.cards.at(-1).y+h.G.ui.cards.at(-1).h<h.G.ui.refresh.y);
 }
});

test('浏览器可见高度变化后重设画布，DPR和点击映射保持正确，不重置游戏进度',()=>{
 const h=createGame({character:'fire'});h.PM.Input.bind();h.GP.resetRun(0);h.G.spawnTimer=1e6;
 const canvas=h.PM.Platform.canvas();
 for(const height of [650,760,600]){
  h.viewport.height=height;
  const width=(height-24)*9/16;
  const rect={left:12,top:24,width,height:width*16/9};
  canvas.getBoundingClientRect=()=>rect;
  h.events['viewport:resize']();h.PM.Renderer.render(0);
  assert.equal(h.cssVars['--viewport-height'],height+'px');
  const slot=h.G.ui.skillSlots[0],x=slot.x+slot.w/2,y=slot.y+slot.h/2;
  const point=h.PM.Platform.logical(rect.left+x*width/h.C.width,rect.top+y*rect.height/h.C.height,rect);
  assert.ok(Math.abs(point.x-x)<1);assert.ok(Math.abs(point.y-y)<1);
  assert.equal(h.G.state,'playing');assert.equal(h.G.player.characterElement,'fire');
 }
});
