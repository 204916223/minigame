"use strict";
const test=require('node:test'),assert=require('node:assert/strict');const {createGame}=require('./harness');
test('所有状态正常渲染；四张选项不重叠且在画布内',()=>{
 const h=createGame();h.GP.resetRun(0);
 for(const state of ['menu','levelselect','meta','playing','levelup','over','cleared']){
  h.G.state=state;h.G.result={stars:2,ratio:.8,flawless:false,coins:0};h.G.choices=h.GP.buildChoices();
  assert.doesNotThrow(()=>h.PM.Renderer.render(1/60),state);
 }
 h.G.state='levelup';h.PM.Renderer.render(1/60);assert.equal(h.G.ui.cards.length,4);
 h.G.ui.cards.forEach((r,i,all)=>{assert.ok(r.y+r.h<=h.G.ui.refresh.y);if(i)assert.ok(r.y>=all[i-1].y+all[i-1].h);});
});
test('真实输入路径：候选取消/添加、冒险、返回配置、开局、四选一',()=>{
 const h=createGame();const render=()=>h.PM.Renderer.render(1/60);
 function tap(r){h.advanceClock(300);h.PM.Input.tap(r.x+r.w/2,r.y+r.h/2);render();}
 render();const selected=h.G.ui.candidates.find(r=>h.G.progress.candidates.includes(r.id)),before=h.G.progress.candidates.length;
 tap(selected);assert.equal(h.G.progress.candidates.length,before-1);tap(selected);assert.equal(h.G.progress.candidates.length,before);
 tap(h.G.ui.start);assert.equal(h.G.state,'levelselect');tap(h.G.ui.menu);assert.equal(h.G.state,'menu');
 tap(h.G.ui.start);tap(h.G.ui.levelButtons[0]);assert.equal(h.G.state,'playing');assert.equal(h.GP.ownedSkills(),1);
 h.GP.grantExperience(3);render();assert.equal(h.G.ui.cards.length,4);tap(h.G.ui.cards[0]);assert.equal(h.G.state,'playing');
});
test('微信 GameGlobal 和存储分支能加载新模块、迁移并渲染',()=>{
 const h=createGame({stars:[1],coins:77,meta:{hp:2}},1,true);
 assert.equal(h.PM.Platform.isWx,true);assert.equal(h.G.progress.coins,77);assert.equal(h.G.progress.meta.hp,2);
 assert.equal(h.storage.pixelMowProgress.version,2);assert.ok(h.storage['pixelMowProgress.beforeV2']);
 h.PM.Input.bind();h.PM.Renderer.render(1/60);h.GP.resetRun(0);h.frames(2);h.PM.Renderer.render(1/60);
 assert.equal(h.GP.ownedSkills(),1);
});
