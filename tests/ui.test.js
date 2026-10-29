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
 tap(selected);assert.equal(h.G.progress.candidates.length,before-1);
 tap(h.G.ui.start);assert.equal(h.G.state,'menu');assert.match(h.G.toast.text,/请先选满 7/);
 tap(selected);assert.equal(h.G.progress.candidates.length,before);
 tap(h.G.ui.start);assert.equal(h.G.state,'levelselect');tap(h.G.ui.menu);assert.equal(h.G.state,'menu');
 tap(h.G.ui.start);tap(h.G.ui.levelButtons.find(r=>r.index===0));assert.equal(h.G.state,'playing');assert.equal(h.GP.ownedSkills(),1);
 h.GP.grantExperience(3);render();assert.equal(h.G.ui.cards.length,4);tap(h.G.ui.cards[0]);assert.equal(h.G.state,'playing');
});
test('不足七个候选时点击、空格和选关接口均不能进入；补满后恢复',()=>{
 const h=createGame({version:2,candidates:[]});h.PM.Input.bind();
 const space=()=>h.events.keydown({code:'Space',preventDefault(){}});
 for(let count=0;count<=7;count++){
  h.G.progress.candidates=h.C.loadout.defaults.slice(0,count);h.G.state='menu';
  const labels=[];h.PM.Platform.ctx().fillText=value=>labels.push(String(value));h.PM.Renderer.render(0);
  assert.equal(h.GP.canSelectLevel(),count===7);
  if(count<7){
   assert.ok(labels.includes('选满 7 个技能后选关（'+count+'/7）'));
   assert.equal(h.GP.openLevelSelect(),false);assert.equal(h.G.state,'menu');
   h.advanceClock(300);const r=h.G.ui.start;h.PM.Input.tap(r.x+r.w/2,r.y+r.h/2);assert.equal(h.G.state,'menu');
   space();assert.equal(h.G.state,'menu');
  }else{space();assert.equal(h.G.state,'levelselect');}
 }
 h.GP.openMenu();h.GP.openMeta();h.GP.leaveMeta();assert.equal(h.GP.openLevelSelect(),true);
});
test('微信 GameGlobal 和当前存储分支能加载新模块、清洗并渲染',()=>{
 const h=createGame({stars:[1],coins:77,meta:{hp:2}},1,true);
 assert.equal(h.PM.Platform.isWx,true);assert.equal(h.G.progress.coins,77);assert.equal(h.G.progress.meta.hp,2);
 assert.equal(h.storage['pixelMowProgress.v3'].version,3);assert.equal(h.storage['pixelMowProgress.beforeV2'],undefined);
 h.PM.Input.bind();h.PM.Renderer.render(1/60);h.GP.resetRun(0);h.frames(2);h.PM.Renderer.render(1/60);
 assert.equal(h.GP.ownedSkills(),1);
});
test('左右竖排：四段圆环按技能数显示，冷却变化不改变进度，微信安全区不压住技能栏',()=>{
 const h=createGame(undefined,1,true);h.GP.resetRun(0);h.equip(['chain','fireball','windblade','icecone','waterball']);
 const ctx=h.PM.Platform.ctx();let currentArc=null,rings=[],texts=[];
 ctx.beginPath=()=>{currentArc=null;};ctx.arc=(...args)=>{currentArc=args;};
 ctx.stroke=()=>{if(currentArc&&currentArc[0]===18&&currentArc[2]===9)rings.push({arc:currentArc,color:ctx.strokeStyle});};
 ctx.fillText=(value,x,y)=>texts.push({value:String(value),x,y,font:ctx.font});
 h.PM.Renderer.render(0);
 const expected=Object.entries(h.R.bonds(h.G)).filter(([tag])=>h.C.factions[tag].bond);
 assert.equal(expected.length,10);assert.equal(rings.length,40);
 assert.equal(rings.filter(r=>r.color!=='#26324a').length,expected.reduce((sum,[,n])=>sum+Math.min(4,n),0));
 assert.ok(rings.every(r=>r.arc[4]-r.arc[3]<Math.PI/2&&r.arc[1]+r.arc[2]<h.G.ui.skillSlots[0].y-100));
 assert.equal(rings.at(-1).arc[1]-rings[0].arc[1],22*(expected.length-1));
 assert.ok(texts.some(t=>t.value==='当前强化'&&t.x>h.C.width*.75));
 const names=texts.filter(t=>expected.some(([tag])=>h.C.factions[tag].name===t.value)&&t.x===18&&t.y>100);
 assert.equal(names.length,expected.length);assert.ok(names.every(t=>t.font.includes(' 5px ')));
 const before=JSON.stringify(rings);rings=[];h.G.skills.basic.cd=1500;h.PM.Renderer.render(0);assert.equal(JSON.stringify(rings),before);
});
test('点技能格切换专属强化；新获取或强化自动定位；空格和暂停不会误选',()=>{
 const h=createGame();h.GP.resetRun(0);h.equip(['fireball','laser']);
 h.G.cardLevels={'basic:damage':1,'fireball:attribute':3};h.GP.recompute();
 let drawn=[];h.PM.Platform.ctx().fillText=(value,x,y)=>{if(x>380&&y>90&&y<500)drawn.push(String(value));};
 const render=()=>{drawn=[];h.PM.Renderer.render(0);};render();assert.ok(drawn.includes('+20%'));assert.ok(!drawn.includes('+30%'));
 const slot=h.G.ui.skillSlots.find(s=>s.id==='fireball');h.advanceClock(300);h.PM.Input.tap(slot.x+slot.w/2,slot.y+slot.h/2);render();
 assert.equal(h.G.focusedSkill,'fireball');assert.ok(drawn.includes('+30%'));assert.ok(!drawn.includes('+20%'));assert.equal(h.G.state,'playing');
 assert.equal(h.GP.selectSkill('unknown'),false);h.GP.pause(true);assert.equal(h.GP.selectSkill('basic'),false);h.GP.pause(false);
 h.take('basic:attribute');assert.equal(h.G.focusedSkill,'basic');
 h.take('get:blackhole');assert.equal(h.G.focusedSkill,'blackhole');h.GP.resetRun(0);assert.equal(h.G.focusedSkill,'basic');
});
