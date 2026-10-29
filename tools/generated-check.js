"use strict";
const {simulate}=require('./sim-core');
const {createGame}=require('../tests/harness');
const C=createGame().C,skills=C.skills.filter(s=>s.mode==='generate').map(s=>s.id);
const samples=Number(process.argv[2]||3),totals={},groups={};
if(!Number.isInteger(samples)||samples<1)throw new Error('种子数量必须为正整数');
let runs=0;
for(const [loadout,candidates]of Object.entries({generated:skills,mixed:C.loadout.defaults}))
for(let level=0;level<5;level++)for(const metaLevel of [0,10,40])for(let seed=1;seed<=samples;seed++){
 const result=simulate({level,seed:level*1000+metaLevel*100+seed,policy:'bond',progress:{version:2,candidates,
  meta:{atk:metaLevel,hp:metaLevel,shield:metaLevel,def:metaLevel,haste:metaLevel}}});
 runs++;
 for(const [id,stats]of Object.entries(result.generated)){
  const sum=totals[id]||(totals[id]={bursts:0,empty:0});sum.bursts+=stats.bursts;sum.empty+=stats.empty;
  const group=groups[loadout]||(groups[loadout]={bursts:0,empty:0});group.bursts+=stats.bursts;group.empty+=stats.empty;
 }
}
console.log('正常战斗自动选卡；生成/混合两组候选 × 5 关 × 0/10/40 级养成 × '+samples+' 种子，共 '+runs+' 局。原目标提前死亡也计入空炸；结算清除的未爆发预警不计。');
let bursts=0,empty=0;
for(const id of skills){const n=totals[id]||{bursts:0,empty:0};bursts+=n.bursts;empty+=n.empty;
 console.log(JSON.stringify({skill:id,...n,emptyPct:n.bursts?+(n.empty/n.bursts*100).toFixed(2):null}));}
console.log(JSON.stringify({total:true,bursts,empty,emptyPct:bursts?+(empty/bursts*100).toFixed(2):null}));
for(const [loadout,n]of Object.entries(groups))console.log(JSON.stringify({loadout,...n,emptyPct:+(n.empty/n.bursts*100).toFixed(2)}));
if(skills.some(id=>!totals[id]||totals[id].empty/totals[id].bursts>.20)||
 Object.values(groups).some(n=>!n.bursts||n.empty/n.bursts>.20))process.exitCode=1;
