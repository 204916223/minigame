"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),{createGame}=require('./harness');
function clear(h,index,hpRatio=1){h.GP.resetRun(index);h.G.player.hp=h.G.player.maxhp*hpRatio;h.G.spawnTimer=1e9;h.G.waveIndex=h.C.levels[index].waves.length-1;h.G.waveSpawned=h.GP.waveConfig().kills;h.GP.update(.01);assert.equal(h.G.state,'cleared');}
test('五个关卡首次各1000，重复通关与重载不重复，结算金币包含奖励',()=>{
 for(const wx of [false,true]){
  let h=createGame(undefined,1,wx);
  for(let index=0;index<5;index++){
   clear(h,index);assert.equal(h.G.result.firstClearReward,1000);assert.equal(h.G.progress.coins,1000*(index+1));
   clear(h,index);assert.equal(h.G.result.firstClearReward,0);assert.equal(h.G.progress.coins,1000*(index+1));
   const data=h.storage['pixelMowProgress.v3'];h=createGame(typeof data==='string'?JSON.parse(data):data,1,wx);
   clear(h,index);assert.equal(h.G.result.firstClearReward,0);
  }
  assert.equal(h.G.progress.coins,5000);
 }
});
test('零星通关也只领取一次；老存档已有星关卡不补发，失败和无尽不奖励',()=>{
 const h=createGame();clear(h,0,.2);assert.equal(h.G.result.stars,0);assert.equal(h.G.progress.coins,1000);
 const reloaded=createGame(JSON.parse(h.storage['pixelMowProgress.v3']));clear(reloaded,0);assert.equal(reloaded.G.progress.coins,1000);
 const old=createGame({stars:[1,2,3],coins:50});clear(old,1);assert.equal(old.G.progress.coins,50);clear(old,3);assert.equal(old.G.progress.coins,1050);
 const failed=createGame();failed.GP.resetRun(0);failed.G.spawnTimer=1e9;failed.target(240,failed.GP.dangerY(),{hp:10000});failed.GP.update(.01);assert.equal(failed.G.state,'over');assert.equal(failed.G.progress.coins,0);
 const endless=createGame({stars:[1,1,1]});endless.GP.resetRun(-1);endless.G.spawnTimer=1e9;endless.G.waveSpawned=endless.GP.waveConfig().kills;endless.GP.update(.01);assert.equal(endless.G.progress.coins,0);
});
