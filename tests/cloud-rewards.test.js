"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),{webcrypto}=require('node:crypto'),{createGame}=require('./harness');
const flush=async()=>{for(let i=0;i<10;i++)await new Promise(resolve=>setImmediate(resolve));};
function setup(){
 const h=createGame(),storage={},elements={},calls=[];let row=null,failSave=false,lostResponse=false;
 const node=()=>({style:{},handlers:{},addEventListener(name,fn){this.handlers[name]=fn;},appendChild(){}});
 const document={body:node(),head:node(),createElement:node,getElementById:id=>elements[id]||(elements[id]=node())};
 const sdk={createWorkBuddyCloud:()=>({database:{rpc:async(name,args)=>{
  calls.push({name,args});
  if(name==='player_register'){
   if(row)return {error:new Error('account_exists')};
   row={id:'one',account:args.p_account,progress:JSON.parse(JSON.stringify(h.R.progress({})))};return {data:structuredClone(row)};
  }
  if(name==='player_login')return {data:row&&structuredClone(row)};
  if(name==='player_save'){
   if(failSave)throw new Error('offline');
   row.progress=structuredClone(args.p_progress);
   if(lostResponse){lostResponse=false;throw new Error('response lost');}
   return {data:null};
  }
 }}})};
 const root={PixelMow:h.PM,WorkBuddyCloud:sdk,crypto:webcrypto,setTimeout:()=>1,clearTimeout(){},location:{reload(){}}};
 const context={window:root,WorkBuddyCloud:sdk,crypto:webcrypto,TextEncoder,document,localStorage:{getItem:k=>storage[k]||null,setItem:(k,v)=>storage[k]=v,removeItem:k=>delete storage[k]},Promise};
 vm.runInNewContext(fs.readFileSync('src/cloud.js','utf8'),context);
 elements['pm-cloud-account'].value='player';elements['pm-cloud-password'].value='testpass';
 return {storage,calls,elements,register:()=>elements['pm-cloud-register'].handlers.click(),login:()=>elements['pm-cloud-login'].handlers.click(),get row(){return row;},set failSave(value){failSave=value;},set lostResponse(value){lostResponse=value;}};
}
test('新注册立即上传2000及领取标记，反复登录或重复点击注册不重复送',async()=>{
 const s=setup();s.register();s.register();await flush();
 assert.equal(s.row.progress.coins,2000);assert.equal(s.row.progress.rewards.registration,true);
 assert.equal(s.calls.filter(c=>c.name==='player_register').length,1);
 s.login();await flush();assert.equal(s.row.progress.coins,2000);
 s.register();await flush();assert.equal(s.row.progress.coins,2000);
});
test('注册奖励上传失败保留待领标记，登录重试补发；云端已保存但响应丢失也不重领',async()=>{
 for(const lostResponse of [false,true]){
  const s=setup();s.failSave=!lostResponse;s.lostResponse=lostResponse;s.register();await flush();
  assert.ok(s.storage.pixelMowPendingRegistrationReward);
  assert.match(s.elements['pm-cloud-status'].textContent,/尚未保存/);
  s.failSave=false;s.login();await flush();
  assert.equal(s.row.progress.coins,2000);assert.equal(s.row.progress.rewards.registration,true);
  assert.equal(s.storage.pixelMowPendingRegistrationReward,undefined);
  s.login();await flush();assert.equal(s.row.progress.coins,2000);
 }
});
test('已有账号登录不补发注册奖励，游客不调用注册或保存接口',async()=>{
 const s=setup();await flush();assert.equal(s.calls.length,0);
 s.register();await flush();s.row.progress.coins=75;s.row.progress.rewards.registration=false;
 const before=s.calls.filter(c=>c.name==='player_save').length;
 s.login();await flush();assert.equal(s.row.progress.coins,75);
 assert.equal(s.calls.filter(c=>c.name==='player_save').length,before);
});
