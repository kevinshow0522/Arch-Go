// 成果确认和章末确认状态的连带复核范围。
// 确认只表示用户认可某个任务的某一版，不改变设计条件：不应把整个子项目及其下游标为待复核；
// 普通决定（设计条件）仍按子项目范围复核；撤回确认、章末改回待确认时，引用它的任务仍要复核。
import test from 'node:test';
import assert from 'node:assert/strict';
import {WorkflowStore} from '../src/workflow-store.mjs';
import {randomUUID} from 'node:crypto';

const result={title:'成果',narrative:'实际判断',facts:[],assumptions:[],questions:[],actions:[]};
function fixture(t){const s=new WorkflowStore(':memory:'),p=s.createProject({request_id:randomUUID(),name:'确认范围回归'}).project;t.after(()=>s.close());return {s,p};}
const rec=(s,p,extra={})=>s.saveRecord({request_id:randomUUID(),project_id:p.id,kind:'note',title:'记录',content:'依据',status:'active',...extra});
const task=(s,p,extra={})=>s.prepareTask({request_id:randomUUID(),project_id:p.id,method_version:'1.30',material_ids:[],instruction:'核对本包目标',output:'形成可续接判断',...extra});
const save=(s,t)=>s.saveResult({task_id:t.id,expected_revision:s.getTask(t.id).revision,executor:'gpt',method_version:'1.30',result});
const state=(s,t)=>{const x=s.getTask(t.id);return {status:x.status,reasons:x.review_reasons.length};};
const confirm=(s,p,t,extra={})=>rec(s,p,{kind:'decision',title:'确认成果',status:'confirmed',source:'用户确认',content:JSON.stringify({task_id:t.id,revision:s.getTask(t.id).revision,...extra.body}),subproject_id:extra.subproject_id??null});

test('子项目里的成果确认不连带标记同章任务和下游', t=>{
 const {s,p}=fixture(t);
 const sub=rec(s,p,{kind:'subproject',title:'02 项目定位与设计任务',content:'章节子项目'});
 const a=task(s,p,{subproject_id:sub.id,tags:['条目:02.1','包:W2.1']});save(s,a);
 const b=task(s,p,{subproject_id:sub.id,tags:['条目:02.2','包:W2.2']});save(s,b);
 const c=task(s,p,{tags:['条目:03.1','包:W3.1'],dependency_ids:[b.id]});save(s,c);
 const before={b:state(s,b),c:state(s,c)};
 confirm(s,p,a,{subproject_id:sub.id});
 assert.deepEqual(state(s,b),before.b,'同章任务不应因确认而待复核');
 assert.deepEqual(state(s,c),before.c,'下游任务不应因确认而待复核');
 // 普通决定（设计条件）仍然按子项目范围复核
 rec(s,p,{kind:'decision',title:'高度控制24m',status:'confirmed',source:'用户决定',content:'综合楼总高不超过24m',subproject_id:sub.id});
 assert.equal(s.getTask(b.id).status,'needs_review');
 assert.equal(s.getTask(c.id).status,'needs_review');
});

test('撤回确认只复核引用这条确认的任务', t=>{
 const {s,p}=fixture(t);
 const a=task(s,p,{tags:['条目:02.1','包:W2.1']});save(s,a);
 const d=confirm(s,p,a);
 const cites=task(s,p,{tags:['条目:02.2','包:W2.2'],record_ids:[d.id]});save(s,cites);
 const other=task(s,p,{tags:['条目:02.3','包:W2.3']});save(s,other);
 const before=state(s,other);
 s.saveRecord({request_id:randomUUID(),project_id:p.id,record_id:d.id,expected_version:d.version,kind:'decision',title:d.title,status:'retired',source:d.source+' · 撤回',content:d.content});
 assert.equal(s.getTask(cites.id).status,'needs_review','引用这条确认的任务要复核');
 assert.deepEqual(state(s,other),before,'不相关的任务不受影响');
});

test('章末只改确认状态时不复核引用它的任务，改回待确认时要复核', t=>{
 const {s,p}=fixture(t);
 const g=task(s,p,{tags:['条目:03.8','包:W3.4']});save(s,g);
 const d=confirm(s,p,g,{body:{item:'03.8'}});
 const body={chapter:'03',item:'03.8',summary:'北侧进入',status:'待确认'};
 const sm=rec(s,p,{kind:'chapter_summary',title:'章末03.8',content:JSON.stringify(body)});
 const h=task(s,p,{tags:['条目:04.1','包:W4.1'],record_ids:[sm.id]});save(s,h);
 const before=state(s,h);
 const confirmed=s.saveRecord({request_id:randomUUID(),project_id:p.id,record_id:sm.id,expected_version:sm.version,kind:'chapter_summary',title:sm.title,status:sm.status,source:sm.source,content:JSON.stringify({...body,status:'已确认',decision_ref:d.id})});
 assert.deepEqual(state(s,h),before,'只改确认状态，内容没变，不应复核');
 s.saveRecord({request_id:randomUUID(),project_id:p.id,record_id:sm.id,expected_version:confirmed.version,kind:'chapter_summary',title:sm.title,status:sm.status,source:sm.source,content:JSON.stringify({...body,status:'待确认',decision_ref:null})});
 assert.equal(s.getTask(h.id).status,'needs_review','改回待确认后，引用它的任务要复核');
});

test('章末确认同时改了正文时照常复核', t=>{
 const {s,p}=fixture(t);
 const g=task(s,p,{tags:['条目:03.8','包:W3.4']});save(s,g);
 const d=confirm(s,p,g,{body:{item:'03.8'}});
 const body={chapter:'03',item:'03.8',summary:'北侧进入',status:'待确认'};
 const sm=rec(s,p,{kind:'chapter_summary',title:'章末03.8',content:JSON.stringify(body)});
 const h=task(s,p,{tags:['条目:04.1','包:W4.1'],record_ids:[sm.id]});save(s,h);
 s.saveRecord({request_id:randomUUID(),project_id:p.id,record_id:sm.id,expected_version:sm.version,kind:'chapter_summary',title:sm.title,status:sm.status,source:sm.source,content:JSON.stringify({...body,summary:'改为南侧进入',status:'已确认',decision_ref:d.id})});
 assert.equal(s.getTask(h.id).status,'needs_review');
});
