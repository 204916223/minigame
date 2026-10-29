"use strict";
const test = require('node:test'), assert = require('node:assert/strict');
const {createGame} = require('./harness');
function tap(h,rect) { h.advanceClock(300); h.PM.Input.tap(rect.x+rect.w/2,rect.y+rect.h/2); h.PM.Renderer.render(0); }
test('重置退款按每项各级实际购买价格累加，五项40级共返172万', () => {
  const h=createGame({coins:3000000});h.GP.openMeta();let spent=0;
  for(const upg of h.C.meta.upgrades)for(let level=0;level<40;level++){
    const before=h.G.progress.coins;assert.equal(h.GP.buyMeta(upg.id),true);
    spent+=before-h.G.progress.coins;
    assert.equal(h.GP.metaResetQuote().spent,spent);
    assert.equal(h.GP.metaResetQuote().refund,Math.floor(spent*.8));
  }
  assert.equal(spent,2150000);assert.equal(h.GP.metaResetQuote().refund,1720000);
  assert.equal(h.GP.openMetaReset(),true);assert.equal(h.GP.resetMeta(),true);
  assert.equal(h.G.progress.coins,2570000);assert.equal(h.GP.metaResetQuote().levels,0);
  h.C.meta.upgrades.forEach(upg=>{assert.equal(h.G.progress.meta[upg.id],0);assert.equal(h.GP.metaCost(upg.id),1000);});
});
test('必须在强化页确认才能重置，空强化和取消不改变进度，确认期间禁止购买', () => {
  const h=createGame({coins:10000,meta:{atk:3}}),before=JSON.stringify(h.G.progress);
  assert.equal(h.GP.openMetaReset(),false);assert.equal(h.GP.resetMeta(),false);
  h.GP.openMeta();assert.equal(h.GP.resetMeta(),false);assert.equal(h.GP.openMetaReset(),true);
  assert.equal(h.GP.buyMeta('hp'),false);h.GP.closeMetaReset();assert.equal(h.GP.resetMeta(),false);
  assert.equal(JSON.stringify(h.G.progress),before);
  h.GP.openMetaReset();h.GP.leaveMeta();assert.equal(h.G.metaResetOpen,false);assert.equal(h.GP.resetMeta(),false);
  const empty=createGame();empty.GP.openMeta();assert.equal(empty.GP.openMetaReset(),false);assert.equal(empty.GP.resetMeta(),false);
  assert.equal(empty.G.progress.coins,0);
});
test('重复重置不重复退款，重新购买后的退款只计算新投入', () => {
  const h=createGame({coins:2500});h.GP.openMeta();h.GP.buyMeta('atk');h.GP.buyMeta('atk');
  assert.equal(h.G.progress.coins,0);h.GP.openMetaReset();h.GP.resetMeta();assert.equal(h.G.progress.coins,2000);
  assert.equal(h.GP.resetMeta(),false);assert.equal(h.GP.openMetaReset(),false);assert.equal(h.G.progress.coins,2000);
  assert.equal(h.GP.buyMeta('atk'),true);assert.equal(h.GP.metaResetQuote().spent,1000);
  h.GP.openMetaReset();h.GP.resetMeta();assert.equal(h.G.progress.coins,1800);
});
test('浏览器和微信重开保留退款和零级强化，星级、纪录、备战及倍速资格不变', () => {
  for(const wechat of [false,true]){
    const h=createGame({coins:1250.5,meta:{atk:3,hp:2,shield:1},stars:[3,2,1],flawless:[true],
      candidates:['fireball','waterball'],endless:{bestWave:12,bestKills:12850},doubleSpeedUnlocked:true},1,wechat);
    const before=JSON.parse(JSON.stringify(h.G.progress));h.GP.openMeta();h.GP.openMetaReset();
    assert.equal(h.GP.metaResetQuote().spent,8000);assert.equal(h.GP.metaResetQuote().refund,6400);h.GP.resetMeta();
    const restored=createGame(undefined,1,wechat,h.storage);
    assert.equal(restored.G.progress.coins,7650.5);assert.ok(Object.values(restored.G.progress.meta).every(n=>n===0));
    for(const key of ['version','stars','flawless','candidates','endless','doubleSpeedUnlocked'])
      assert.equal(JSON.stringify(restored.G.progress[key]),JSON.stringify(before[key]),key);
    assert.equal(restored.GP.isEndlessUnlocked(),true);assert.equal(restored.GP.isDoubleSpeedUnlocked(),true);
    restored.GP.resetRun(0);assert.equal(restored.G.skills.basic.derived.dmg,200);assert.equal(restored.G.player.hp,400);
    assert.equal(restored.G.player.defense,100);assert.equal(restored.G.player.shield,0);assert.equal(restored.G.player.haste,0);
  }
});
test('真实重置输入展示准确退款、拦截背景点击，重复确认不会误购强化', () => {
  for(const wechat of [false,true]){
    const h=createGame({coins:10000,meta:{atk:3,hp:2}},1,wechat);h.GP.openMeta();let labels=[];
    h.PM.Platform.ctx().fillText=text=>labels.push(String(text));h.PM.Renderer.render(0);
    const reset=h.G.ui.metaReset,back=h.G.ui.metaBack,last=h.G.ui.metaRows.at(-1);
    assert.ok(reset.x>back.x+back.w&&reset.y>last.y+last.h&&reset.y+reset.h<h.PM.Platform.safeBottom());
    tap(h,reset);assert.equal(h.G.metaResetOpen,true);
    assert.ok(labels.includes('已投入 7000 金币'));assert.ok(labels.includes('返还 5600 金币（80%）'));
    tap(h,h.G.ui.metaRows[0]);assert.equal(h.G.progress.meta.atk,3);assert.equal(h.G.progress.coins,10000);
    tap(h,h.G.ui.metaResetCancel);assert.equal(h.G.state,'meta');assert.equal(h.G.metaResetOpen,false);
    tap(h,reset);const confirm=h.G.ui.metaResetConfirm;tap(h,confirm);assert.equal(h.G.progress.coins,15600);
    tap(h,confirm);assert.equal(h.G.progress.coins,15600);assert.ok(Object.values(h.G.progress.meta).every(n=>n===0));
    labels=[];h.PM.Renderer.render(0);assert.ok(labels.includes('暂无强化'));
    tap(h,h.G.ui.metaBack);assert.equal(h.G.state,'menu');
  }
});
