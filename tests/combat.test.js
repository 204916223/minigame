"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {createGame}=require('./harness');
function run(){const h=createGame();h.GP.resetRun(0);return h;}
test('提速弹道在远处目标横移前命中，维持直线和原施放间隔，低帧率不穿靶',()=>{
 for(const skill of ['basic','windblade','icecone','waterball','fireball','poisonbottle']) {
  for(const dt of [1/60,1/20]) {
   const h=run(),t=h.target(80,h.C.hero.y-452),d={...h.R.derive(h.G,skill),count:1},cd=d.cd;
   h.GP.combat.cast(d);const b=h.G.bullets[0],vx=b.vx,vy=b.vy;
   let time=0;
   while(time<.4 && t.hp===t.maxhp){t.x+=60*dt;t.y+=34*dt;h.GP.combat.update(dt);time+=dt;}
   assert.ok(t.hp<t.maxhp,skill+' dt='+dt);assert.ok(time<=.35,skill);
   assert.equal(b.vx,vx);assert.equal(b.vy,vy);assert.equal(h.R.derive(h.G,skill).cd,cd);
  }
 }
});
test('多重只增加初始不同目标，不额外复制同一目标',()=>{
 const h=run();h.G.cardLevels['basic:multi']=2;h.GP.recompute();h.target(200,300);h.target(250,300);h.target(300,300);
 h.GP.combat.cast(h.G.skills.basic.derived);assert.equal(h.G.bullets.length,3);assert.equal(new Set(h.G.bullets.map(b=>b.targetId)).size,3);
 h.G.bullets=[];h.G.enemies.length=1;h.GP.combat.cast(h.G.skills.basic.derived);assert.equal(h.G.bullets.length,1);
});
test('命中后分裂两个不同目标，半攻击力，不回打原目标、不递归',()=>{
 const h=run();h.G.cardLevels['basic:split']=1;h.GP.recompute();const parent=h.target(240,400),left=h.target(180,300),right=h.target(300,300);
 const d=h.G.skills.basic.derived;h.GP.combat.cast(d);h.GP.combat.update(.4);
 const children=h.G.bullets.filter(b=>b.child);assert.equal(children.length,2);assert.equal(new Set(children.map(b=>b.targetId)).size,2);
 assert.ok(children.every(b=>b.damage===d.dmg*.5&&b.targetId!==parent.id));
 h.GP.combat.update(.5);assert.equal(left.hp,left.maxhp-d.dmg*.5);assert.equal(right.hp,right.maxhp-d.dmg*.5);assert.equal(h.G.bullets.length,0);
});
test('穿透父弹最多分裂一次，低帧率线段碰撞不漏目标',()=>{
 const h=run();h.G.cardLevels={'basic:split':1,'basic:pierce':2};h.GP.recompute();
 const a=h.target(240,400),b=h.target(240,300),c=h.target(240,200);h.target(180,320);
 h.GP.combat.cast(h.G.skills.basic.derived);h.GP.combat.update(1);
 assert.ok(a.hp<a.maxhp&&b.hp<b.maxhp&&c.hp<c.maxhp);assert.equal(h.G.bullets.filter(v=>v.child).length,2);
});
test('目标死亡或移动后直线弹不改变方向',()=>{
 const h=run(),t=h.target();h.GP.combat.cast(h.G.skills.basic.derived);const b=h.G.bullets[0],vx=b.vx,vy=b.vy;
 t.dead=true;t.x=10;h.GP.combat.update(.1);assert.equal(b.vx,vx);assert.equal(b.vy,vy);
});
test('传导基础额外五目标，首目标死亡仍继续、无重复目标',()=>{
 const h=run();const first=h.target(240,400,{hp:1});for(let i=1;i<=6;i++)h.target(240+i*25,400-i*20);
 const d={...h.R.derive(h.G,'chain'),count:1};h.GP.combat.cast(d);
 assert.equal(first.dead,true);assert.equal(h.G.enemies.filter(e=>e.hp<e.maxhp).length,6);
});
test('所有21技能均能伤害屏内靶，不污染数值',()=>{
 const data=run().C.skills;
 for(const skill of data){const h=run();
  for(let y=80;y<=480;y+=50)for(let x=35;x<470;x+=45)h.target(x,y);
  const d=h.R.derive(h.G,skill.id);assert.equal(h.GP.combat.cast(d),true,skill.id);
  for(let i=0;i<180;i++){h.GP.combat.update(1/60);h.G.enemies.forEach(e=>h.GP.combat.statuses(e,1/60));}
  assert.ok(h.G.enemies.some(e=>e.hp<e.maxhp),skill.id);assert.ok(h.G.enemies.every(e=>Number.isFinite(e.hp)),skill.id);
 }
});
test('所有攻击模式、区域与持续伤害均不得波及屏幕外，边界可命中',()=>{
 for(const skill of run().C.skills){const h=run();const off=h.target(240,7),on=h.target(240,8),d=h.R.derive(h.G,skill.id);
  h.GP.combat.cast(d);for(let i=0;i<180;i++){h.GP.combat.update(1/60);h.G.enemies.forEach(e=>h.GP.combat.statuses(e,1/60));}
  assert.equal(off.hp,off.maxhp,skill.id);
  h.GP.combat.hit(on,d);assert.ok(on.hp<on.maxhp,skill.id);
 }
});
test('持续伤害按每秒扣防后乘时间，同技能刷新而不堆叠',()=>{
 const h=run(),t=h.target(240,300,{def:10}),d={...h.R.derive(h.G,'unknown'),dmg:100,breach:.05};
 h.GP.combat.cast(d);h.GP.combat.cast(d);assert.equal(Object.keys(t.dots).length,1);
 h.GP.combat.statuses(t,.5);assert.equal(t.hp,t.maxhp-45.25);
 t.y=7;const hp=t.hp;h.GP.combat.statuses(t,.5);assert.equal(t.hp,hp);
});
test('控制效果：冰冻概率与抗性、减速、击退不出场、聚集数量',()=>{
 const h=run(),d={...h.R.derive(h.G,'icecone'),freezeChance:1};const t=h.target();t.resist.freeze=.6;
 h.GP.combat.hit(t,d);assert.ok(Math.abs(t.freezeT-.4)<1e-9);
 h.GP.combat.hit(t,{...d,knock:1000,slow:.5});assert.equal(t.y,8);assert.equal(t.slow,.5);
 const a=h.target(180,200),b=h.target(250,200);h.GP.combat.area(200,200,{...d,gather:1,radius:100},false);
 assert.equal(a.x,190);assert.equal(b.x,250);
});
test('激光反射路径有界、每段有效；几何函数处理零长度',()=>{
 const h=run();h.target();h.GP.combat.cast(h.R.derive(h.G,'laser'));
 assert.ok(h.G.arcs.length>0&&h.G.arcs.length<=4);
 assert.ok(h.G.arcs.every(a=>[a.x1,a.x2,a.y1,a.y2].every(Number.isFinite)&&a.x2>=0&&a.x2<=480&&a.y2>=8-1e-9));
 assert.equal(h.PM.Combat.distSegment({x:3,y:4},{x:0,y:0},{x:0,y:0}),5);
});
test('生成技能落在屏内敌人脚下，多重使用不同初始目标',()=>{
 const h=run();h.target(100,150);h.target(110,160);h.target(400,350);const d={...h.R.derive(h.G,'blackhole'),count:2};
 const first=h.GP.combat.densest(d.radius,{});assert.ok(h.G.enemies.includes(first));
 h.GP.combat.cast(d);assert.equal(h.G.telegraphs.length,2);assert.notEqual(h.G.telegraphs[0].x+','+h.G.telegraphs[0].y,h.G.telegraphs[1].x+','+h.G.telegraphs[1].y);
 assert.equal(h.G.booms.length,0);h.GP.combat.update(1);assert.equal(h.G.booms.length,2);assert.equal(h.G.telegraphs.length,0);
});
test('半秒持续强化在区域结束时也结算，不被整数tick吞掉',()=>{
 const h=run(),t=h.target(240,300),d={...h.R.derive(h.G,'fireball'),dmg:100,duration:3.5};
 h.GP.combat.area(t.x,t.y,d,true);for(let i=0;i<210;i++)h.GP.combat.update(1/60);
 // 浮点帧累计可能差一个极小量，补一个帧触发末尾部分tick。
 h.GP.combat.update(1/60);assert.ok(Math.abs(t.hp-(t.maxhp-100-87.5))<1e-8);
});
