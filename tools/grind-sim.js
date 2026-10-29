"use strict";
const {simulate,spend,args}=require('./sim-core');const options=args();
console.log('每组从新档开始，失败后按攻/血/盾/防/速循环购买；每关独立测量。');
for(const level of options.levels)for(const policy of options.policies){const firstClears=[];
 for(let sample=0;sample<options.seeds;sample++){let progress,first=null;
  for(let attempt=1;attempt<=options.attempts;attempt++){
   const result=simulate({level,policy,progress,seed:4241+level*977+sample*1009+attempt*61});
   if(result.cleared){first=attempt;break;}progress=spend(result.progress);
  }firstClears.push(first);
 }
 console.log(JSON.stringify({level:level+1,policy,firstClearAttempts:firstClears,attemptLimit:options.attempts}));
}
