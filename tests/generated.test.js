"use strict";
const test = require('node:test'), assert = require('node:assert/strict');
const { createGame } = require('./harness');

function setup() {
  const h = createGame(); h.GP.resetRun(0);
  h.G.spawnTimer = 1e6; h.G.skills.basic.cd = 1e9;
  return h;
}
function advance(h, seconds, cadence = [1/60]) {
  let elapsed = 0, frame = 0;
  while (elapsed < seconds - 1e-9) {
    const dt = Math.min(seconds - elapsed, cadence[frame++ % cadence.length]);
    h.GP.update(dt); elapsed += dt;
  }
}
const generated = setup().C.skills.filter(s => s.mode === 'generate');

test('七种生成技在 60/20 FPS 和波动帧率下均完成预警和爆发，预判普通及后期跑怪', () => {
  for (const skill of generated) for (const cadence of [[1/60], [.05], [.016,.05,.033,.017]]) {
    for (const scenario of ['stationary', 'runner', 'lateRunner']) {
      const h = setup(), d = h.R.derive(h.G, skill.id);
      // 第 7 波、角色 20 级的跑怪：46 × (1 + 19 × 5%) = 89.7 像素/秒。
      const speed = scenario === 'stationary' ? 0 : h.C.enemyTypes.runner.spd *
        (scenario === 'lateRunner' ? 1 + 19 * (h.C.curve.levelEnemyGrowth - 1) : 1);
      const enemy = h.at(0,-220,{spd:speed,r:10,def:55,el:skill.el === 'physical' ? 'fire' : 'physical'});
      const label = skill.id + ' / ' + cadence + ' / ' + scenario;
      const startX = enemy.x, startY = enemy.y;
      assert.equal(h.GP.combat.cast(d),true,label);
      assert.equal(h.G.telegraphs.length,1,label);
      advance(h,.5,cadence); assert.equal(enemy.hp,enemy.maxhp,label); assert.equal(h.G.booms.length,0,label);
      assert.ok(Math.abs(h.G.telegraphs[0].age-.5)<1e-9,label);
      advance(h,.25,cadence); assert.equal(enemy.hp,enemy.maxhp,label);
      assert.equal(h.G.telegraphs.length,1,label); assert.equal(h.G.zones.length,0,label);
      advance(h,.25,cadence);
      assert.equal(h.G.telegraphs.length,0,label); assert.equal(h.G.booms.length,1,label);
      assert.equal(h.G.booms[0].x,startX,label); assert.equal(h.G.booms[0].y,startY+speed,label);
      assert.ok(h.G.booms[0].age<=.05+1e-9,label); // 爆发至少可见约 0.4 秒。
      assert.ok(enemy.hp<enemy.maxhp,label);
      advance(h,.1,cadence); assert.equal(h.G.booms.length,1,label);
      assert.equal(h.G.zones.length,d.duration ? 1 : 0,label);
    }
  }
});

test('预判尊重冻结、减速到期及横移；预警开始后落点不追踪，允许目标离开',()=>{
  for(const statuses of [{freezeT:.6},{slowT:.4,slow:.5},{sway:14,phase:1},{freezeT:.3,slowT:.7,slow:.5,sway:14,phase:1}]){
    const h=setup(),e=h.at(0,-220,{spd:90,...statuses});
    h.GP.combat.cast(h.R.derive(h.G,'blackhole'));const point={...h.G.telegraphs[0]};
    advance(h,1);assert.ok(e.hp<e.maxhp);assert.equal(h.G.booms[0].x,point.x);assert.equal(h.G.booms[0].y,point.y);
  }
  const h=setup(),e=h.at(0,-220,{spd:25});h.GP.combat.cast(h.R.derive(h.G,'blackhole'));
  e.spd=150;advance(h,1);assert.equal(e.hp,e.maxhp);assert.equal(h.generatedEvents[0].hits,0);
  assert.equal(h.G.booms[0].y,h.G.player.y-195);
});

test('爆发前必然越过防线的目标不浪费生成技冷却，有新目标后可施放',()=>{
  const h=setup();h.equip(['blackhole']);h.G.skills.basic.cd=1e9;
  advance(h,.1);
  assert.equal(h.G.telegraphs.length,0);assert.ok(h.G.skills.blackhole.cd<=120);
  h.at(0,-220);advance(h,.2);assert.equal(h.G.telegraphs.length,1);assert.ok(h.G.skills.blackhole.cd>20000);
});

test('七种生成技的多重落点和连续施放独立保存，目标全部消失后仍完整爆发', () => {
  for (const skill of generated) {
    const h = setup(), d = {...h.R.derive(h.G,skill.id),count:3};
    [-140,0,140].forEach(dx=>h.at(dx,-220));
    h.GP.combat.cast(d); advance(h,.4);
    h.GP.combat.cast(d); assert.equal(h.G.telegraphs.length,6,skill.id);
    const first = h.G.telegraphs.slice(0,3).map(t=>t.x+','+t.y);
    assert.equal(new Set(first).size,3,skill.id);
    h.G.enemies = []; // 原目标被其他攻击清除，预警不能依赖其存活。
    advance(h,.6); assert.equal(h.G.booms.length,3,skill.id); assert.equal(h.G.telegraphs.length,3,skill.id);
    advance(h,.4); assert.equal(h.G.booms.length,6,skill.id); assert.equal(h.G.telegraphs.length,0,skill.id);
    assert.equal(h.G.zones.length,d.duration ? 6 : 0,skill.id);
    advance(h,.5); assert.equal(h.G.booms.length,0,skill.id);
    assert.equal(h.GP.combat.cast(d),false,skill.id); assert.equal(h.G.telegraphs.length,0,skill.id);
  }
});

test('先爆发的生成技触发选卡时，后续预警保留，选卡和暂停后继续命中新目标', () => {
  const h = setup(),first=h.at(0,-220,{hp:500,maxhp:500,xp:4});
  h.GP.combat.cast(h.R.derive(h.G,'blackhole')); advance(h,.4);
  h.GP.combat.cast(h.R.derive(h.G,'meteor'));
  first.hp=50; // 施放后被其他技能打残，第一轮爆发提前触发升级。
  advance(h,.6);
  assert.equal(h.G.state,'levelup'); assert.equal(h.G.telegraphs.length,1);
  const age=h.G.telegraphs[0].age; advance(h,2); assert.equal(h.G.telegraphs[0].age,age);
  assert.equal(h.GP.applyChoice(h.G.choices.find(ch=>!ch.card.unlock)),true);
  const next=h.at(0,-220); h.GP.pause(true); advance(h,2); assert.equal(h.G.telegraphs[0].age,age);
  h.GP.pause(false); advance(h,.4);
  assert.equal(h.G.telegraphs.length,0); assert.ok(next.hp<next.maxhp); assert.equal(h.G.zones.length,1);
});

test('优先避开已被待爆发伤害覆盖的残血目标，不阻止对高血量目标连续施放',()=>{
  const h=setup();h.at(-140,-220,{hp:100});h.at(140,-220,{hp:100});
  assert.equal(h.GP.combat.cast(h.R.derive(h.G,'blackhole')),true);
  assert.equal(h.GP.combat.cast(h.R.derive(h.G,'geyser')),true);
  assert.notEqual(h.G.telegraphs[0].x,h.G.telegraphs[1].x);
  assert.equal(h.GP.combat.cast(h.R.derive(h.G,'crystal')),false);
  const strong=setup();strong.at(0,-220,{hp:1000,def:100,el:'physical'});
  for(let i=0;i<3;i++)assert.equal(strong.GP.combat.cast(strong.R.derive(strong.G,'blackhole')),true);
  assert.equal(strong.G.telegraphs.length,3);
});

test('范围强化扩大实际命中范围，仍可弥补预警期间的意外位移',()=>{
  for(const skill of generated)for(const rangeCards of [0,10]){
    const h=setup(),enemy=h.at(0,-220);h.G.cardLevels[skill.id+':range']=rangeCards;
    h.GP.combat.cast(h.R.derive(h.G,skill.id));enemy.x+=80;advance(h,1);
    assert.equal(h.generatedEvents[0].hits,rangeCards?1:0,skill.id);
  }
});

test('预估弹道抢先击杀时生成技换目标，正确计入同属性与未破防伤害',()=>{
  for(const hp of [75,101]){
    const h=setup();h.at(0,-220,{hp,def:0,el:'physical'});
    h.GP.combat.cast(h.R.derive(h.G,'basic'));
    // 普攻 200 攻击，同属性半伤 = 100；101 HP 仍可承接生成技。
    assert.equal(h.GP.combat.cast(h.R.derive(h.G,'blackhole')),hp>100);
  }
  const h=setup();h.at(0,-220,{hp:100});h.GP.combat.cast(h.R.derive(h.G,'basic'));
  h.at(-140,-220,{hp:100});h.GP.combat.cast(h.R.derive(h.G,'blackhole'));
  assert.equal(h.G.telegraphs[0].x,h.G.player.x-140);
  const shielded=setup();shielded.at(0,-220,{hp:100,def:300});
  shielded.GP.combat.cast(shielded.R.derive(shielded.G,'basic'));
  assert.equal(shielded.GP.combat.cast(shielded.R.derive(shielded.G,'blackhole')),true);
});
