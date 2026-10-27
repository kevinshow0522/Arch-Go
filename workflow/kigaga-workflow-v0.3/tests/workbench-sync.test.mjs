import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {JSDOM}=require('jsdom');
const root=process.env.KIGAGA_TEST_ROOT||fileURLToPath(new URL('../',import.meta.url));
const fixture=JSON.parse(readFileSync(join(root,'tests/fixtures/workbench-v04-demo.json'),'utf8'));
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
async function until(check){for(let i=0;i<100;i++){if(check())return;await tick();}assert.fail('没有收到预期的同步结果');}
function snapshot(title){const s=structuredClone(fixture);s.project.id='selected-project';s.project.name=title;return s;}
function open(t,s,callTool){
 const dom=new JSDOM(readFileSync(join(root,'assets/workbench.html'),'utf8'),{url:'https://workbench.invalid/',runScripts:'outside-only'});
 const w=dom.window;t.after(()=>w.close());const timers=new Map();let nextTimer=1,hidden=false;
 w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.structuredClone=structuredClone;w.scrollTo=()=>{};
 w.setInterval=(fn,ms)=>{const id=nextTimer++;timers.set(id,{fn,ms});return id;};w.clearInterval=id=>timers.delete(id);
 Object.defineProperty(w.document,'visibilityState',{get:()=>hidden?'hidden':'visible'});
 // Progress is an independent read; these tests control only the snapshot request race.
 const readTool=(name,args)=>name==='kg_get_project_progress'?Promise.resolve({structuredContent:{project:{id:args.project_id},tasks:{total:0,done:0,doing:[]},handoffs:[]}}):callTool(name,args);
 w.openai={toolInput:{project_id:'stale-input-project'},toolResponseMetadata:{workbench:s},callTool:readTool,sendFollowUpMessage:()=>assert.fail('同步不应发送消息')};
 for(const script of w.document.querySelectorAll('script'))if(!script.src)w.eval(script.textContent);
 return {w,timers,hide:value=>{hidden=value;}};
}

test('可见工作台定期读取当前项目，跨端更新出现后保持当前页面，离开页面停止读取',async t=>{
 let current=snapshot('初始名称'),calls=0,asked;
 const {w,timers,hide}=open(t,current,async(name,args)=>{calls++;asked={name,args};return {_meta:{workbench:current}};});
 await until(()=>w.KiGAGAWorkbench?.getState().project==='初始名称');await tick();
 const poll=[...timers.values()].find(timer=>timer.ms===15000);
 assert.ok(poll,'工作台应每15秒检查共享项目更新');
 w.document.querySelector('[data-act="view"][data-v="results"]').click();
 current=snapshot('Claude 修改后的名称');await poll.fn();
 await until(()=>w.KiGAGAWorkbench.getState().project==='Claude 修改后的名称');
 assert.equal(w.KiGAGAWorkbench.getState().view,'results');
 assert.deepEqual(JSON.parse(JSON.stringify(asked)),{name:'kg_open_workbench',args:{project_id:'selected-project'}});
 const afterSync=calls;hide(true);await poll.fn();assert.equal(calls,afterSync);
 hide(false);w.dispatchEvent(new w.Event('focus'));await until(()=>calls===afterSync+1);
 w.dispatchEvent(new w.Event('pagehide'));assert.equal(timers.size,0);
});

test('读取失败保留已有项目，恢复后清除错误；较慢的旧结果不能盖过宿主新结果',async t=>{
 let behavior=async()=>({isError:true,content:[{type:'text',text:'临时连接失败'}]});
 const {w,timers}=open(t,snapshot('已有项目'),(...args)=>behavior(...args));
 await until(()=>w.KiGAGAWorkbench?.getState().project==='已有项目');await tick();
 const poll=[...timers.values()].find(timer=>timer.ms===15000);assert.ok(poll);
 await poll.fn();await until(()=>w.document.body.textContent.includes('临时连接失败'));
 assert.equal(w.KiGAGAWorkbench.getState().project,'已有项目');
 behavior=async()=>({_meta:{workbench:snapshot('已有项目')}});await poll.fn();
 await until(()=>!w.document.body.textContent.includes('临时连接失败'));
 let deliver;behavior=()=>new Promise(resolve=>{deliver=resolve;});const pending=poll.fn();
 await until(()=>!!deliver);
 w.openai.toolResponseMetadata={workbench:snapshot('宿主最新项目')};w.dispatchEvent(new w.Event('openai:set_globals'));
 deliver({_meta:{workbench:snapshot('过时项目')}});await pending;
 assert.equal(w.KiGAGAWorkbench.getState().project,'宿主最新项目');
});
