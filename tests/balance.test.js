"use strict";
const test = require('node:test'), assert = require('node:assert/strict');
const {createGame} = require('./harness');
function run(progress, seed = 1) { const h = createGame(progress, seed); h.GP.resetRun(0); return h; }

test('冷却硬下限经过满卡、满局外和四件羁绊后仍成立，普攻通常最快', () => {
  const h = run({meta:{haste:40}}); h.equip(['windblade','waterball','fireball']);
  const floors = {basic:1,chain:2,windblade:3,waterball:3,icecone:4,poisonbottle:4,fireball:4,laser:10};
  for (const s of h.C.skills) {
    if (s.persistent) continue;
    h.G.cardLevels[s.id + ':cooldown'] = 10;
    const seconds = h.R.derive(h.G,s.id).cd / 1000;
    if (s.mode === 'generate') assert.equal(seconds,8,s.id);
    else if (floors[s.id]) assert.equal(seconds,floors[s.id],s.id);
    assert.ok(s.cd > s.minCd,s.id);
    if (s.id !== 'basic') assert.ok(s.cd > h.R.skill('basic').cd);
  }
  assert.equal(h.R.skill('laser').ratio,2.5);
});

test('基础攻防生命及40级局外养成按初值加算，五项各自独立线性计价', () => {
  const h = run(); assert.equal(h.G.player.hp,400); assert.equal(h.G.player.defense,100); assert.equal(h.G.skills.basic.derived.dmg,200);
  h.G.progress.coins = 1000000;
  for (const u of h.C.meta.upgrades) assert.equal(h.GP.metaCost(u.id),1000);
  assert.equal(h.GP.buyMeta('atk'),true); assert.equal(h.GP.metaCost('atk'),1500); assert.equal(h.GP.metaCost('hp'),1000);
  h.GP.resetRun(0); assert.ok(Math.abs(h.G.skills.basic.derived.dmg-205)<1e-9);
  const maxed = run({meta:{atk:40,hp:40,shield:40,def:40,haste:40},coins:1000000});
  assert.equal(maxed.G.skills.basic.derived.dmg,400); assert.equal(maxed.G.player.maxhp,1200);
  assert.equal(maxed.G.player.defense,300); assert.equal(maxed.G.player.shield,2000); assert.equal(maxed.G.player.haste,.2);
  for (const u of maxed.C.meta.upgrades) {
    assert.equal(u.max,40); assert.equal(maxed.GP.buyMeta(u.id),false);
    maxed.G.progress.meta[u.id] = 39; assert.equal(maxed.GP.metaCost(u.id),20500);
    assert.equal(maxed.GP.buyMeta(u.id),true); assert.equal(maxed.GP.buyMeta(u.id),false);
  }
});

test('第一关首只普通怪150血50防，之后逐只、波次、关卡都成长，元素不影响基础数值', () => {
  const observed = new Set();
  function spawn(level,wave,seed=1) {
    const h = run(undefined,seed); h.GP.resetRun(level); h.G.waveIndex=wave;
    h.C.levels[level].waves[wave].pool={grunt:1}; h.G.spawnTimer=0; h.GP.update(1/60);
    return h;
  }
  const h=spawn(0,0), first=h.G.enemies[0], second=h.G.enemies[1];
  assert.equal(first.hp,150); assert.equal(first.def,50); assert.ok(second.hp>first.hp); assert.ok(second.def>first.def);
  for(let level=0;level<5;level++) for(let wave=0;wave<10;wave++) {
    const e=spawn(level,wave).G.enemies[0];
    if(level||wave) {assert.ok(e.hp>150); assert.ok(e.def>50);}
    if(level) {const prev=spawn(level-1,wave).G.enemies[0]; assert.ok(e.hp>prev.hp); assert.ok(e.def>prev.def);}
  }
  for(let seed=1;seed<=40;seed++) {
    const v=spawn(0,0,seed);
    v.G.enemies.forEach(e=>{observed.add(e.el);assert.equal(e.color,v.C.elements[e.el].color);});
  }
  assert.equal(observed.size,7);
  assert.deepEqual(Object.fromEntries(Object.entries(h.C.elements).map(([id,el])=>[id,el.color])),
    {physical:'#919191',elec:'#fddf0f',fire:'#f95938',wind:'#2cb2a9',ice:'#5a91ff',water:'#48ccff',poison:'#a378fc'});
});

test('十波实际出怪总数与小首领数量准确，最终首领仅在末波最后出现', () => {
  const totals=[30,30,51,100,100,302,500,500,503,1005], minis=[0,0,1,0,0,2,0,0,3,4];
  const h=run();
  for (let wave=0;wave<10;wave++) {
    h.GP.resetRun(0); h.G.waveIndex=wave; h.G.skills.basic.owned=false;
    const keys=[]; let steps=0;
    while(h.G.waveSpawned<totals[wave] && steps++<400) {
      h.G.spawnTimer=0; h.GP.update(1/60); keys.push(...h.G.enemies.map(e=>e.key)); h.G.enemies=[];
    }
    assert.equal(keys.length,totals[wave]); assert.equal(keys.filter(k=>k==='miniboss').length,minis[wave]);
    assert.equal(keys.filter(k=>k==='boss').length,wave===9?1:0);
    if(wave===9) {assert.equal(keys.at(-1),'boss');assert.deepEqual(keys.slice(-5,-1),Array(4).fill('miniboss'));}
  }
});

test('普通怪、小首领、最终首领每只1金币，重复命中尸体不能重复领奖', () => {
  const h=run();
  for(const key of ['grunt','miniboss','boss']) {
    const e=h.at(0,-200,{hp:1,xp:0,key,boss:key!=='grunt'});
    h.GP.combat.hit(e,h.G.skills.basic.derived); h.GP.combat.hit(e,h.G.skills.basic.derived);
  }
  assert.equal(h.G.coins,3); assert.equal(h.G.player.kills,3);
});

test('攻防相等或未破防采用25+等级+波次，破防后先比较，非法输入仍不造成伤害', () => {
  const {R}=run();
  assert.equal(R.damage(100,100,0,7,5),37); assert.equal(R.damage(20,100,0,7,5),37);
  assert.equal(R.damage(100,100,.05,7,5),5); assert.equal(R.damage(100,10,0,7,5),90);
  assert.equal(R.damage(100,10,.05,7,5),90.5); assert.equal(R.damage(NaN,100,0,7,5),0);
  assert.equal(R.damage(200,100,0,7,5),100);
});

test('敌人碰撞用剩余生命作攻击，先扣角色绝对防御再扣护盾，未破防也保底', () => {
  function collide(hp,shield=0,level=1,wave=1) {
    const h=run(); h.G.skills.basic.owned=false; h.G.spawnTimer=100;
    h.G.player.shield=shield; h.G.player.lvl=level; h.G.waveIndex=wave-1;
    h.target(h.G.player.x,h.G.player.y,{hp,maxhp:2000}); h.GP.update(1/60); return h.G.player;
  }
  assert.equal(collide(150).hp,350); assert.equal(collide(120).hp,380);
  assert.equal(collide(100).hp,373); assert.equal(collide(80).hp,373); assert.equal(collide(80,0,7,5).hp,363);
  const p=collide(170,50); assert.equal(p.shield,0); assert.equal(p.hp,380);
});

test('闪电链接扣防后半伤，同属性再次减半，未破防保底也按同一倍率结算', () => {
  const h=run(), d=h.R.derive(h.G,'chain');
  const off=h.at(0,-200,{def:50,el:'fire'}), same=h.at(0,-200,{def:50,el:'elec'});
  h.GP.combat.hit(off,d); h.GP.combat.hit(same,d);
  assert.equal(off.maxhp-off.hp,25); assert.equal(same.maxhp-same.hp,12.5);
  const armored=h.at(0,-200,{def:1000,el:'elec'}); h.G.player.lvl=7;h.G.waveIndex=4;
  h.GP.combat.hit(armored,d); assert.equal(armored.maxhp-armored.hp,37*.5*.5);
});

test('所有攻击形态及持续区域对同元素半伤；持续伤害的保底按秒结算', () => {
  for(const skill of run().C.skills) {
    const losses=[];
    for(const same of [false,true]) {
      const h=run();
      for(let dy=-260;dy<=100;dy+=60)for(let dx=-200;dx<=200;dx+=50)h.at(dx,dy,{el:same?skill.el:skill.el==='physical'?'fire':'physical'});
      h.GP.combat.cast(h.R.derive(h.G,skill.id));
      for(let i=0;i<240;i++){h.GP.combat.update(1/60);h.G.enemies.forEach(e=>h.GP.combat.statuses(e,1/60));}
      losses.push(h.G.enemies.reduce((sum,e)=>sum+e.maxhp-e.hp,0));
    }
    assert.ok(losses[0]>0,skill.id); assert.ok(Math.abs(losses[0]-losses[1]*2)<1e-6,skill.id);
  }
  const h=run(),e=h.at(0,-200,{def:1000,el:'poison'});h.G.player.lvl=7;h.G.waveIndex=4;
  h.GP.combat.cast(h.R.derive(h.G,'unknown'));
  for(let i=0;i<60;i++)h.GP.combat.statuses(e,1/60);
  assert.ok(Math.abs(e.maxhp-e.hp-37*.5)<1e-8);
});

test('冰冻基础概率固定10%，仅冰冻卡及羁绊提升概率，时长只按敌人抗性衰减', () => {
  const h=run(); h.equip(['icecone']);
  assert.equal(h.R.derive(h.G,'icecone').freezeChance,.1); assert.equal(h.R.derive(h.G,'basic').freezeChance,0);
  h.G.cardLevels['icecone:damage']=20; h.G.player.haste=.2;
  assert.equal(h.R.derive(h.G,'icecone').freezeChance,.1);
  h.G.cardLevels['icecone:freeze']=1; assert.equal(h.R.derive(h.G,'icecone').freezeChance,.2);
  h.equip(['icecone','crystal']); assert.equal(h.R.derive(h.G,'icecone').freezeChance,.25);
  assert.ok(Math.abs(h.R.derive(h.G,'crystal').freezeChance-.15)<1e-9);
  h.G.cardLevels['icecone:freeze']=5; assert.ok(Math.abs(h.R.derive(h.G,'icecone').freezeChance-.65)<1e-9);
  for(const resistance of [0,.35,.6]) {
    const e=h.at(0,-200,{resist:{freeze:resistance}}),d={...h.R.derive(h.G,'icecone'),freezeChance:1};
    h.GP.combat.hit(e,d); assert.equal(e.freezeT,1-resistance);
  }
});
