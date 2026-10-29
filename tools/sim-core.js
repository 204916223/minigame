"use strict";
const {createGame}=require('../tests/harness');
function pick(h,policy){
 const {G,R}=h;
 if(policy==='random')return G.choices[Math.floor(h.random()*G.choices.length)];
 if(policy!=='bond')throw new Error('未知策略 '+policy+'；支持 random / bond');
 const possible=h.C.skills.filter(s=>s.mode==='fullscreen'&&!R.owned(G).some(v=>v.id===s.id)&&!(s.excludes||[]).some(el=>R.owned(G).some(v=>v.el===el))&&Object.entries(s.cond).every(([el,n])=>[...new Set([h.C.loadout.initial,...G.candidates,...G.equippedOrder])].filter(id=>R.skill(id).el===el).length>=n));
 const goal=possible[0],counts=R.bonds(G),owned=R.owned(G);
 function score(ch){const c=ch.card,s=R.skill(c.skill);
  if(c.unlock){if(s.mode==='fullscreen')return 1000;
   if(goal&&owned.length===5)return -100;
   const needed=goal&&goal.cond[s.el]&&owned.filter(v=>v.el===s.el).length<goal.cond[s.el];
   return (needed?150:70)+s.tags.reduce((v,t)=>v+((counts[t]===1||counts[t]===3)?10:0),0);
  }
  return c.tag==='damage'?35:c.tag==='multi'?28:c.tag==='pierce'||c.tag==='split'?22:c.tag==='attribute'?18:10;
 }
 return [...G.choices].sort((a,b)=>score(b)-score(a))[0];
}
function simulate({progress,level=0,seed=1,policy='bond',maxSeconds=1200}={}){
 const h=createGame(progress,seed);h.GP.resetRun(level);const {G,GP}=h;
 let frames=0,maxEnemies=0;
 while(G.state!=='over'&&G.state!=='cleared'&&frames<maxSeconds*60){
  if(G.state==='levelup'){const choice=pick(h,policy);if(!choice||!GP.applyChoice(choice))throw new Error('选卡死锁');}
  else{GP.update(1/60);frames++;maxEnemies=Math.max(maxEnemies,G.enemies.length);}
 }
 const generated={};h.generatedEvents.forEach(e=>{const n=generated[e.skill]||(generated[e.skill]={bursts:0,empty:0});n.bursts++;if(!e.hits)n.empty++;});
 return {cleared:G.state==='cleared'&&G.result.stars>=1,outcome:G.state,stars:G.result?G.result.stars:0,seconds:Math.round(G.time/1000),wave:G.waveIndex+1,kills:G.player.kills,maxEnemies,generated,
  equipped:[...G.equippedOrder],progress:JSON.parse(JSON.stringify(G.progress))};
}
function spend(progress){const h=createGame(progress);for(let i=0;i<100;i++){let bought=false;for(const id of ['atk','hp','shield','def','haste'])bought=h.GP.buyMeta(id)||bought;if(!bought)break;}return JSON.parse(JSON.stringify(h.G.progress));}
function args(argv=process.argv.slice(2)){const get=(k,d)=>{const i=argv.indexOf('--'+k);return i>=0?argv[i+1]:d;};
 const policy=get('policy','all');if(!['all','random','bond'].includes(policy))throw new Error('policy 必须为 random / bond / all');
 const seeds=Number(get('seeds',3)),attempts=Number(get('attempts',8)),levels=get('levels','0').split(',').map(Number);
 if(!Number.isInteger(seeds)||seeds<1||!Number.isInteger(attempts)||attempts<1||levels.some(n=>!Number.isInteger(n)||n<0||n>4))throw new Error('无效 seeds / attempts / levels 参数');
 return {seeds,attempts,levels,policies:policy==='all'?['random','bond']:[policy]};}
module.exports={simulate,spend,args};
