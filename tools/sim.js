"use strict";
const {simulate,args}=require('./sim-core');const options=args();
console.log('新档独立样本；通关=至少一星；时间不含选卡思考耗时。');
for(const level of options.levels)for(const policy of options.policies){const rows=[];
 for(let seed=0;seed<options.seeds;seed++)rows.push(simulate({level,policy,seed:7919*(level+1)+seed*131}));
 const wins=rows.filter(r=>r.cleared),avg=wins.length?Math.round(wins.reduce((s,r)=>s+r.seconds,0)/wins.length):null;
 console.log(JSON.stringify({level:level+1,policy,cleared:wins.length,samples:rows.length,averageWinSeconds:avg,failedWaves:rows.filter(r=>!r.cleared).map(r=>r.wave),peakEnemies:Math.max(...rows.map(r=>r.maxEnemies))}));
}
