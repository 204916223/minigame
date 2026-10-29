"use strict";
const {simulate,spend}=require('./sim-core');let progress;
for(let i=0;i<3;i++){const result=simulate({progress,seed:9001+i*37,policy:'bond'});progress=spend(result.progress);console.log(JSON.stringify({attempt:i+1,cleared:result.cleared,wave:result.wave,kills:result.kills,coins:progress.coins,meta:progress.meta}));}
