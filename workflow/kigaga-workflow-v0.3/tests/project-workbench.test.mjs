import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {workbench118Fixture} from './fixtures/workbench-118.mjs';
import {createProjectWorkbench} from '../web/project-workbench.mjs';
const require=createRequire(import.meta.url);
const {JSDOM}=require('jsdom');
const html=()=>readFileSync(fileURLToPath(new URL('../assets/workbench.html',import.meta.url)),'utf8');
const currentMethodVersion=JSON.parse(readFileSync(new URL('../../skills/ki-archmain/references/framework-catalog.json',import.meta.url),'utf8')).method_version;
function open(t,snapshot){
 const dom=new JSDOM(html(),{url:'https://workbench.invalid/',runScripts:'outside-only'});
 t.after(()=>dom.window.close());const w=dom.window;
 w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.structuredClone=structuredClone;w.scrollTo=()=>{};
 w.__KIGAGA_SNAPSHOT__=snapshot;w.__KG_PREVIEW__=snapshot;
 w.openai={toolResponseMetadata:{workbench:snapshot},callTool:()=>assert.fail('项目目录只读检查不应写入项目'),sendFollowUpMessage:()=>assert.fail('未主动确认场地时不发送消息')};
 for(const script of w.document.querySelectorAll('script'))if(!script.src)w.eval(script.textContent);
 return w;
}
const directory=w=>w.document.querySelector('[data-act="view"][data-v="method"]').click();
const item=(w,id)=>w.document.querySelector('[data-project-item="'+id+'"]');

test('方法1.20按完整变更问题编号关闭回复，不混淆不同变更的Q1',t=>{
 const s=workbench118Fixture(),task=s.tasks.find(x=>x.id==='traffic');
 task.result.questions=['E01-Q1：是否保留东侧入口？','E02-Q1：是否保留南侧入口？'];
 task.checkpoint.done=['已回复 E01-Q1（第1版）：保留东侧入口'];
 const w=open(t,s),waiting=w.document.querySelector('#h-wait').closest('section');
 assert.doesNotMatch(waiting.textContent,/是否保留东侧入口/);assert.match(waiting.textContent,/是否保留南侧入口/);
 task.revision=2;task.checkpoint.done=['已回复 E02-Q1（第1版）：保留南侧入口'];w.KiGAGAWorkbench.setSnapshot(s);
 assert.match(w.document.querySelector('#h-wait').closest('section').textContent,/是否保留东侧入口/);
 const model=createProjectWorkbench(s,JSON.parse(readFileSync(new URL('../../skills/ki-archmain/references/framework-catalog.json',import.meta.url),'utf8')));
 assert.equal(model.tasks.find(item=>item.id==='traffic').questions.length,2);
});

test('方法1.20无合适参考时04.1并入04.7简版按一个项目核心条目计数',t=>{
 const s=workbench118Fixture();s.project.summary='服务深度：b；进入：a';
 s.records[0].content='## 04 案例研究\n04.7｜案例与设计借鉴简版｜核心简版｜章末｜M04.1 M04.7';s.tasks=[];
 const w=open(t,s);directory(w);const state=w.KiGAGAWorkbench.getState();
 assert.equal(state.methodVersion,'1.30');assert.equal(state.coreTotal,1);assert.equal(state.coreResults,0);
 assert.equal(w.document.querySelectorAll('[data-project-item]').length,1);assert.ok(item(w,'04.7'));assert.equal(item(w,'04.1'),null);
});

test('工作台按项目目录显示自定义章名、条目与章末，默认方法只在折叠参考内',t=>{
 const w=open(t,workbench118Fixture());directory(w);
 const catalog=w.document.querySelector('[data-project-catalog]');assert.ok(catalog,'显示项目目录而不是固定方法矩阵');
 assert.match(catalog.textContent,/场地与交通研究/);assert.match(catalog.textContent,/本轮场地结论/);
 assert.ok(item(w,'03.6'));assert.equal(item(w,'06.9'),null);
 const reference=w.document.querySelector('[data-method-reference]');assert.ok(reference);assert.equal(reference.open,false);
 assert.ok(reference.textContent.includes(currentMethodVersion));assert.match(reference.textContent,/06\.8/);
 assert.doesNotMatch(catalog.textContent,/固定条目|核心\s*13\s*项|按服务阶段看完成情况/);
});

test('没有项目目录时仅列实际任务，不铺默认50格或显示零进度',t=>{
 const s=workbench118Fixture();s.records=[];const w=open(t,s);directory(w);
 const body=w.document.querySelector('#app').textContent;
 assert.match(body,/尚未整理项目目录/);assert.match(body,/交通到达判断/);
 assert.match(body,/外部已有/);
 assert.equal(w.document.querySelectorAll('[data-project-item]').length,0);
 assert.doesNotMatch(body,/进度暂时都显示为 0|进度为 0|0\/15|0\/13/);
 assert.equal(w.document.querySelector('[data-method-reference]').open,false);
});

test('服务深度只读摘要首行，进入阶段独立，不能把前序阶段自动标为已完成',t=>{
 const s=workbench118Fixture();s.project.service_stage='c';const w=open(t,s);
 const state=w.KiGAGAWorkbench.getState();assert.equal(state.serviceDepth,'b');assert.equal(state.entryStage,'b');
 assert.doesNotMatch(w.document.querySelector('#app').textContent,/项目启动.*已完成/);
 assert.equal(state.methodVersion,currentMethodVersion);
});

test('任务标签识别执行者、转交与曾用编号，关联条目只给主条目计成果',t=>{
 const w=open(t,workbench118Fixture());directory(w);
 assert.equal(item(w,'03.4').getAttribute('data-item-state'),'confirmed');
 assert.equal(item(w,'03.6').getAttribute('data-item-state'),'related');
 assert.equal(item(w,'03.5').getAttribute('data-item-state'),'result');
 assert.match(item(w,'03.5').textContent,/Claude/);
 assert.equal(w.KiGAGAWorkbench.getState().coreResults,2,'核读的03.1与主条目03.4有成果，相关03.6不重复计入');
});

test('完成任务的未回复问题留在AI在等你，已回复Q1不再显示，确认只匹配当前成果版本',t=>{
 const s=workbench118Fixture();const w=open(t,s);
 const waiting=w.document.querySelector('#h-wait').closest('section');
 assert.match(waiting.textContent,/仍待决定的后勤时段/);assert.doesNotMatch(waiting.textContent,/已经回复的入口问题/);
 s.tasks.find(x=>x.id==='traffic').revision=2;w.KiGAGAWorkbench.setSnapshot(s);directory(w);
 assert.notEqual(item(w,'03.4').getAttribute('data-item-state'),'confirmed');
});

test('外部已有单独显示，缺少实际核读检查不能满足补齐项',t=>{
 const s=workbench118Fixture();const w=open(t,s);directory(w);
 assert.equal(item(w,'03.1').getAttribute('data-item-state'),'external');assert.match(item(w,'03.1').textContent,/外部已有/);
 s.tasks.find(x=>x.id==='external').checkpoint.checks=[];w.KiGAGAWorkbench.setSnapshot(s);
 assert.equal(w.KiGAGAWorkbench.getState().coreResults,1);
 assert.equal(item(w,'03.1').getAttribute('data-item-state'),'external-unread');
});

test('展示任务按项目编号显示工作状态，delivery标签不能把它搬到交付归档',t=>{
 const w=open(t,workbench118Fixture());directory(w);
 assert.equal(item(w,'09.1').getAttribute('data-item-state'),'active');assert.match(item(w,'09.1').textContent,/Claude/);
 assert.equal(item(w,'09.1').getAttribute('data-counted'),'false');
 assert.equal(w.KiGAGAWorkbench.getState().coreTotal,7);
});

test('同章条目范围展开并识别主条目，未声明的其他项目任务不能混入',t=>{
 const s=workbench118Fixture();s.tasks=[{...s.tasks[1],id:'range',tags:['条目:03.4-03.6','执行:GPT'],checkpoint:{done:[],checks:['核对'],next:'继续',blockers:[]}},{...s.tasks[0],id:'other',project_id:'another-project',result:{title:'不得混入其他项目',narrative:'其他项目'}}];
 const w=open(t,s);directory(w);
 assert.equal(item(w,'03.4').getAttribute('data-item-state'),'result');
 assert.equal(item(w,'03.5').getAttribute('data-item-state'),'related');
 assert.equal(item(w,'03.6').getAttribute('data-item-state'),'related');
 assert.doesNotMatch(w.document.querySelector('#app').textContent,/不得混入其他项目/);
});

test('项目将某项设为核心时，显式标记的章末自动成为核心简版，不按最后一行猜章末',t=>{
 const s=workbench118Fixture();s.records[0].content=s.records[0].content.replace('03.6｜本轮场地结论｜核心','03.6｜本轮场地结论｜按需')+'\n';
 const w=open(t,s);directory(w);assert.equal(item(w,'03.6').getAttribute('data-requirement'),'core');
 assert.match(item(w,'03.6').textContent,/章末|简版/);
});

test('进入阶段缺少的上游要求单列为补齐，不生成虚构成果或真实任务',t=>{
 const s=workbench118Fixture();s.records[0].content=s.records[0].content.replace('01.3｜本轮决策关系｜补齐｜M01.3\n','');
 const w=open(t,s);directory(w);
 assert.match(w.document.querySelector('[data-project-catalog]').textContent,/进入阶段补齐/);
 assert.ok(w.document.querySelector('[data-backfill-method="M01.3"]'));
 assert.equal(w.KiGAGAWorkbench.getState().tasks,5);
 assert.equal(w.KiGAGAWorkbench.getState().coreTotal,7);
});

test('子项读取自身服务深度，与项目深度分别显示',t=>{
 const s=workbench118Fixture();s.records.push({id:'sub-c',project_id:s.project.id,kind:'subproject',title:'入口深化',content:'服务深度：c\n只深化入口',status:'active',version:1});s.tasks.find(x=>x.id==='school').subproject_id='sub-c';
 const w=open(t,s);w.document.querySelector('[data-act="open-task"][data-id="school"]')?.click();
 w.KiGAGAWorkbench.setSnapshot(s);directory(w);assert.match(item(w,'03.5').textContent,/子项.*c|c.*方案设计/);
 assert.equal(w.KiGAGAWorkbench.getState().serviceDepth,'b');
});

test('项目目录与任务文本作为内容显示，不执行HTML，目录升级后保留当前页面',t=>{
 const s=workbench118Fixture();const w=open(t,s);directory(w);
 s.records[0].version=3;s.records[0].content=s.records[0].content.replace('场地与交通研究','<img src=x onerror="window.bad=1">');
 w.KiGAGAWorkbench.setSnapshot(s);
 assert.equal(w.KiGAGAWorkbench.getState().view,'method');assert.equal(w.document.querySelector('[data-project-catalog] img'),null);assert.equal(w.bad,undefined);
 assert.equal(w.KiGAGAWorkbench.getState().catalogVersion,3);
});

test('总览与成果分组也把自定义章名作为文字显示',t=>{
 const s=workbench118Fixture(),title='<img src=x onerror="window.injected=1">';
 s.records[0].content=s.records[0].content.replace('场地与交通研究',title);
 const w=open(t,s),stage=w.document.querySelector('#h-stage').closest('section');
 assert.match(stage.textContent,/<img src=x/);assert.equal(stage.querySelectorAll('img').length,0);
 w.document.querySelector('[data-act="view"][data-v="results"]').click();

 assert.equal(w.document.querySelectorAll('#app img').length,0);
});

test('含横线的自定义编号作为完整编号关联，只有实际条目范围才展开',t=>{
 const s=workbench118Fixture();s.project.summary='服务深度：0；进入：0';
 s.records[0].content='## A 入口专项\nA-1｜入口判断｜核心｜章末｜补充：本项目入口';
 s.tasks=[{...s.tasks[1],tags:['条目:A-1','执行:GPT']}];
 const w=open(t,s);directory(w);
 assert.equal(item(w,'A-1').dataset.itemState,'confirmed');
 assert.equal(w.KiGAGAWorkbench.getState().coreResults,1);
});

test('旧版Q1回复不能隐藏新版Q1；只更新续接点不等于本版问题已回复',t=>{
 const s=workbench118Fixture(),task=s.tasks.find(x=>x.id==='traffic');
 task.revision=2;task.result.questions=['第二版新增：是否取消后勤入口？'];
 task.history=[{revision:1,saved_at:'2026-10-15T10:00:00.000Z'},{revision:2,saved_at:'2026-10-15T11:00:00.000Z'}];
 task.checkpoint.saved_at='2026-10-15T10:01:00.000Z';
 const w=open(t,s);assert.match(w.document.querySelector('#h-wait').closest('section').textContent,/第二版新增/);
 task.checkpoint.saved_at='2026-10-15T11:01:00.000Z';task.checkpoint.next='继续等待用户回复第二版Q1';w.KiGAGAWorkbench.setSnapshot(s);
 assert.match(w.document.querySelector('#h-wait').closest('section').textContent,/第二版新增/);
 task.checkpoint.saved_at='2026-10-15T11:00:00.000Z';w.KiGAGAWorkbench.setSnapshot(s);
 assert.match(w.document.querySelector('#h-wait').closest('section').textContent,/第二版新增/,'同毫秒无法区分先后时保留新问题');
 task.checkpoint.done.push('已回复 Q1（第2版）：保留后勤入口');w.KiGAGAWorkbench.setSnapshot(s);
 assert.doesNotMatch(w.document.querySelector('#h-wait').closest('section').textContent,/第二版新增/);
});

test('目录明确列入的子项核心按自身深度工作后可贡献成果进度',t=>{
 const s=workbench118Fixture();s.project.summary='服务深度：b；进入：a';
 s.records[0].content='## 06 入口深化\n06.1｜入口技术判断｜核心｜M06.1\n06.8｜入口结论｜核心｜章末｜M06.8';
 s.records.push({id:'sub-c',project_id:s.project.id,kind:'subproject',title:'入口深化',content:'服务深度：c',status:'active',version:1});
 s.tasks=[{...s.tasks[1],id:'entry-technical',subproject_id:'sub-c',tags:['条目:06.1','执行:GPT']},{...s.tasks[1],id:'entry-conclusion',subproject_id:'sub-c',tags:['条目:06.8','执行:GPT']}];
 const w=open(t,s);directory(w);assert.equal(w.KiGAGAWorkbench.getState().coreTotal,2);
 assert.equal(w.KiGAGAWorkbench.getState().coreResults,2);assert.match(item(w,'06.1').textContent,/子项 c/);
});
