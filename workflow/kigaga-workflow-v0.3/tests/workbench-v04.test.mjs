import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {JSDOM}=require('jsdom');
const html=()=>readFileSync(new URL('../assets/workbench.html',import.meta.url),'utf8');
const fixture=JSON.parse(readFileSync(new URL('./fixtures/workbench-v04-demo.json',import.meta.url),'utf8'));
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
async function until(check){for(let i=0;i<100;i++){if(check())return;await tick();}assert.fail('页面未接收到工作台快照');}
function open(t,openai){
 const dom=new JSDOM(html(),{url:'https://workbench.invalid/',runScripts:'outside-only'});
 const w=dom.window;t.after(()=>w.close());
 w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.structuredClone=structuredClone;w.scrollTo=()=>{};
 if(openai)w.openai={sendFollowUpMessage:()=>assert.fail('只读工作台不能发送消息'),...openai};
 for(const s of w.document.querySelectorAll('script'))if(!s.src)w.eval(s.textContent);
 return w;
}
function snapshot(name,id){return {...structuredClone(fixture),project:{...fixture.project,id,name},tasks:fixture.tasks.map(t=>({...t,project_id:id}))};}

test('连接时显示正在连接，完整宿主快照到达后显示原项目，不回退到默认项目',async t=>{
 const s=snapshot('已选择的项目乙','project-b');
 const w=open(t,{toolOutput:{schema_version:3,tasks:[]},toolResponseMetadata:{workbench:s},callTool:()=>assert.fail('已有完整快照时不能打开默认项目')});
 await until(()=>w.KiGAGAWorkbench?.getState().project==='已选择的项目乙');
 assert.equal(w.KiGAGAWorkbench.getState().project,'已选择的项目乙');
 assert.ok(!w.document.querySelector('#app').textContent.includes('虚构示例数据'));
 assert.equal(w.document.title,'ki-arch');
 assert.equal(w.document.querySelectorAll('textarea,input:not([type=checkbox]):not([type=file])').length,0);
 for(const view of ['results','method','mainline','handoffs','overview']){
  const button=w.document.querySelector('[data-act="view"][data-v="'+view+'"]');
  assert.ok(button);button.click();
  assert.equal(w.KiGAGAWorkbench.getState().view,view);
  assert.ok(w.document.querySelector('#app').textContent.includes('已选择的项目乙'));
 }
});

test('宿主未附完整快照时，按指定项目读取完整数据，后续宿主更新能切换项目',async t=>{
 const a=snapshot('项目甲','project-a'),b=snapshot('项目乙','project-b'),calls=[];
 const w=open(t,{toolInput:{project_id:'project-a'},callTool:async(name,args)=>{calls.push({name,args});if(name==='kg_get_project_progress')return {structuredContent:{project:{id:args.project_id},tasks:{total:3,done:1,doing:[]},handoffs:[]}};assert.equal(name,'kg_open_workbench');return {_meta:{workbench:a}};}});
 await until(()=>w.KiGAGAWorkbench?.getState().project==='项目甲');
 assert.equal(w.KiGAGAWorkbench.getState().project,'项目甲');
 assert.deepEqual(JSON.parse(JSON.stringify(calls)),[{name:'kg_open_workbench',args:{project_id:'project-a'}},{name:'kg_get_project_progress',args:{project_id:'project-a'}}]);
 w.openai.toolResponseMetadata={workbench:b};w.dispatchEvent(new w.Event('openai:set_globals'));
 await until(()=>w.KiGAGAWorkbench.getState().project==='项目乙');
 assert.ok(!w.document.querySelector('#app').textContent.includes('项目甲'));
 assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1))),{name:'kg_get_project_progress',args:{project_id:'project-b'}});
});

test('项目服务错误明确显示错误，连接失败不展示虚构项目',async t=>{
 const w=open(t,{callTool:async()=>({isError:true,content:[{type:'text',text:'连接验证失败'}]})});
 await until(()=>w.document.body.textContent.includes('连接验证失败'));
 assert.equal(w.KiGAGAWorkbench.getState().tasks,0);
 assert.ok(!w.document.querySelector('#app').textContent.includes('坡地社区活动中心'));
});

test('只提供只读工具的侧栏宿主也能连接，不要求发送对话能力',async t=>{
 const s=snapshot('左侧独立工作台','sidebar-project');
 const w=open(t,{sendFollowUpMessage:undefined,toolResponseMetadata:{workbench:s},callTool:()=>assert.fail('已有快照不应再读取默认项目')});
 await until(()=>w.KiGAGAWorkbench?.getState().project==='左侧独立工作台');
 assert.ok(w.document.querySelector('#app').textContent.includes('左侧独立工作台'));
});
