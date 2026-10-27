import test from 'node:test';
import assert from 'node:assert/strict';
import {WorkflowStore} from '../src/workflow-store.mjs';
import {getProjectProgress} from '../src/project-progress.mjs';
import {randomUUID} from 'node:crypto';
const result={title:'成果',narrative:'实际判断',facts:[],assumptions:[],questions:[],actions:[]};
function fixture(t){const s=new WorkflowStore(':memory:'),p=s.createProject({request_id:randomUUID(),name:'隔离复核回归'}).project;t.after(()=>s.close());return {s,p};}
const rec=(s,p,extra={})=>s.saveRecord({request_id:randomUUID(),project_id:p.id,kind:'note',title:'记录',content:'依据',status:'active',...extra});
const task=(s,p,extra={})=>s.prepareTask({request_id:randomUUID(),project_id:p.id,method_version:'1.30',material_ids:[],instruction:'核对本包目标',output:'形成可续接判断',tags:['条目:03.8','包:W3.4'],...extra});
const save=(s,t,extra={})=>s.saveResult({task_id:t.id,expected_revision:s.getTask(t.id).revision,executor:'gpt',method_version:'1.30',result,...extra});
const progress=(s,p)=>getProjectProgress(s,{project_id:p.id});
const main=(s,p,version,extra={})=>rec(s,p,{kind:'mainline',title:'主线卡',content:JSON.stringify({version,concept:version+'主张'}),...extra});
const summary=(s,p,extra={})=>rec(s,p,{kind:'chapter_summary',title:'章末03.8',content:JSON.stringify({chapter:'03',item:'03.8',summary:'北侧进入',status:'待确认'}),...extra});

test('复核1：成果保存的上游引用按版本持久化，变更后复核且不能直接确认完成',t=>{
 const {s,p}=fixture(t);main(s,p,'v0.1');const upstream=summary(s,p),a=task(s,p,{tags:['条目:05.2','包:W5.2']});
 save(s,a,{mainline_ref:'主线卡 v0.1',upstream_record_ids:[upstream.id]});
 assert.deepEqual(s.getTask(a.id).record_refs.find(r=>r.id===upstream.id),{id:upstream.id,version:1});
 assert.deepEqual(s.getTask(a.id).result.upstream_record_refs,[{id:upstream.id,version:1}]);
 summary(s,p,{record_id:upstream.id,expected_version:1,content:JSON.stringify({chapter:'03',item:'03.8',summary:'改为南侧进入',status:'待确认'})});
 const current=s.getTask(a.id);assert.equal(current.status,'needs_review');assert.ok(current.review_reasons.length);
 assert.throws(()=>s.checkpointTask({request_id:randomUUID(),task_id:a.id,expected_state_version:current.state_version,expected_context_version:s.project(p.id).context_version,status:'completed',executor:'gpt',acknowledge_changes:true,checkpoint:{summary:'直接完成',done:[],next:'',checks:['检查'],blockers:[]}}),/引用版本|依据|版本已变化/);
});

test('复核2：待确认和历史错误绑定的章末都不能借用无关条目决定变成已确认',t=>{
 const {s,p}=fixture(t),a=task(s,p,{tags:['条目:03.1']});save(s,a);
 const decision=rec(s,p,{kind:'decision',title:'确认03.1',status:'confirmed',source:'用户确认',content:JSON.stringify({task_id:a.id,revision:1,item:'03.1'})});
 const r=summary(s,p,{content:JSON.stringify({chapter:'03',item:'03.8',summary:'等待核对',status:'待确认',decision_ref:decision.id})});
 assert.equal(progress(s,p).chapter_summaries[0].status,'待确认');
 const historical={...r,content:JSON.stringify({chapter:'03',item:'03.8',summary:'历史错误声明',status:'已确认',decision_ref:decision.id})};
 s.db.prepare('UPDATE workflow_records SET payload=? WHERE id=?').run(JSON.stringify(historical),r.id);
 assert.equal(progress(s,p).chapter_summaries[0].status,'待确认');
});

test('复核2：章末确认必须与任务和决定处于同一子项',t=>{
 const {s,p}=fixture(t),scopeA=rec(s,p,{kind:'subproject',title:'甲'}),scopeB=rec(s,p,{kind:'subproject',title:'乙'}),a=task(s,p,{subproject_id:scopeA.id});save(s,a);
 const decision=rec(s,p,{kind:'decision',title:'确认03.8',status:'confirmed',source:'用户确认',content:JSON.stringify({task_id:a.id,revision:1,item:'03.8'})});
 assert.throws(()=>summary(s,p,{subproject_id:scopeB.id,content:JSON.stringify({chapter:'03',item:'03.8',summary:'不能跨子项确认',status:'已确认',decision_ref:decision.id})}),/确认|归属|子项/);
});

test('复核3：另存主线后再更新早先记录，读写均认同当前最高版本',t=>{
 const {s,p}=fixture(t),a=main(s,p,'v1');main(s,p,'v2');main(s,p,'v3',{record_id:a.id,expected_version:1});
 assert.equal(progress(s,p).project.mainline.version,'v3');const display=task(s,p,{tags:['条目:07.1','包:W7.2']});
 assert.equal(save(s,display,{mainline_ref:'主线卡 v3'}).revision,1);
 assert.throws(()=>save(s,display,{mainline_ref:'主线卡 v2'}),/主线/);
});

test('复核3：修改早先主线也不能绕过当前主线的升版要求',t=>{
 const {s,p}=fixture(t),a=main(s,p,'v1');main(s,p,'v2');
 assert.throws(()=>main(s,p,'v1.5',{record_id:a.id,expected_version:1}),/升版|版本/);
});

test('复核4：既有标题和续接卡格式的同版确认保留，旧确认不能沿用到新版',t=>{
 const {s,p}=fixture(t),a=task(s,p);save(s,a);
 const decision=rec(s,p,{kind:'decision',title:`确认 ${a.id} 第1版`,content:'已在对话确认',status:'confirmed',source:'用户明确确认'});
 const current=s.getTask(a.id);s.checkpointTask({request_id:randomUUID(),task_id:a.id,expected_state_version:current.state_version,expected_context_version:s.project(p.id).context_version,status:'in_progress',executor:'gpt',checkpoint:{summary:'确认已记录',done:[`你已确认：第1版（决定${decision.id}）`],next:'继续',checks:[],blockers:[]}});
 assert.equal(progress(s,p).workflow_tasks[0].confirmed,true);save(s,a);assert.equal(progress(s,p).workflow_tasks[0].confirmed,false);
});

test('复核5：实时进度保留本包实际目标和预期输出',t=>{
 const {s,p}=fixture(t),a=task(s,p);const projected=progress(s,p).workflow_tasks[0];
 assert.equal(projected.instruction,a.instruction);assert.equal(projected.output,a.output);
});
