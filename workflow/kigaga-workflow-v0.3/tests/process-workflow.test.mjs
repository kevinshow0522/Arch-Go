import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {randomUUID} from 'node:crypto';
import {WorkflowStore} from '../src/workflow-store.mjs';
import {getProjectProgress} from '../src/project-progress.mjs';
import {readMethodCatalog} from '../scripts/method-catalog.mjs';

const result={title:'工作包成果',narrative:'本包判断',facts:[],assumptions:[],questions:[],actions:[]};
function fixture(t){
 const dir=mkdtempSync(join(tmpdir(),'ki-process-130-')),s=new WorkflowStore(join(dir,'test.db'));
 const p=s.createProject({request_id:randomUUID(),name:'隔离流程测试'}).project;
 t.after(()=>{s.close();assert.ok(resolve(dir).startsWith(resolve(tmpdir())+sep));rmSync(dir,{recursive:true,force:true});});
 return {s,p};
}
const task=(s,p,extra={})=>s.prepareTask({request_id:randomUUID(),project_id:p.id,material_ids:[],instruction:'推进本工作包',output:'保存判断与交接',tags:['条目:03.1','包:W3.1'],method_version:'1.30',...extra});
const rec=(s,p,extra={})=>s.saveRecord({request_id:randomUUID(),project_id:p.id,kind:'note',title:'记录',content:'依据',status:'active',...extra});
const save=(s,t,extra={})=>s.saveResult({task_id:t.id,expected_revision:s.getTask(t.id).revision,result,method_version:'1.30',executor:'gpt',...extra});
const cp=(s,t,status,extra={})=>s.checkpointTask({request_id:randomUUID(),task_id:t.id,expected_state_version:s.getTask(t.id).state_version,expected_context_version:s.project(t.project_id).context_version,status,checkpoint:{summary:'已核对',done:[],next:'继续本包',checks:['检查已完成'],blockers:[]},method_version:'1.30',executor:'gpt',...extra});
function handoff(s,p,t,extra={}){
 return rec(s,p,{kind:'handoff',title:'交接｜W3.1',content:JSON.stringify({from:'gpt',to:'any',work_package:'W3.1',task_ids:[t.id],done:'本包已核对',next:'继续下一步',waiting_on_user:[],files:[],method_version:'1.30',created_at:new Date().toISOString(),...extra})});
}

test('1.30目录分别表示表列核心与章末必做，包含所有工作包且停用旧主入口',()=>{
 const catalog=readMethodCatalog();assert.equal(catalog.version,'1.30');
 assert.equal(catalog.framework.declared_core_by_stage.a.length,8);
 assert.equal(catalog.framework.core_by_stage.a.length,10);
 assert.equal(catalog.framework.declared_core_by_stage.b.length,13);
 assert.equal(catalog.framework.core_by_stage.b.length,15);
 for(const id of ['W5.5a','W7.1','W7.4','W8.2'])assert.ok(catalog.framework.work_packages.some(p=>p.id===id));
 assert.equal(catalog.framework.chapters.find(c=>c.number==='06').topics.find(i=>i.id==='06.9').end,true);
});

test('S1 明确旧方法版本的写入被拒绝，现行版本可创建任务',t=>{
 const {s,p}=fixture(t);assert.throws(()=>task(s,p,{method_version:'1.20'}),/方法已更新.*重新加载/);
 assert.equal(task(s,p).method_version,'1.30');
});

test('S2 项目级条件仅复核明确引用者，同子项与真实下游依赖才扩散',t=>{
 const {s,p}=fixture(t),aScope=rec(s,p,{kind:'subproject',title:'甲'}),bScope=rec(s,p,{kind:'subproject',title:'乙'});
 const condition=rec(s,p,{kind:'condition',title:'入口条件',content:'先核入口'});
 const linked=task(s,p,{subproject_id:aScope.id,record_ids:[condition.id]});
 const downstream=task(s,p,{subproject_id:bScope.id,dependency_ids:[linked.id]});
 const unrelated=task(s,p,{subproject_id:bScope.id}),projectTask=task(s,p);
 rec(s,p,{kind:'condition',record_id:condition.id,expected_version:1,title:condition.title,content:'入口条件更新'});
 assert.equal(s.getTask(linked.id).status,'needs_review');assert.equal(s.getTask(downstream.id).status,'needs_review');
 assert.equal(s.getTask(unrelated.id).status,'prepared');assert.equal(s.getTask(projectTask.id).status,'prepared');
 const scoped=rec(s,p,{kind:'condition',subproject_id:bScope.id,content:'乙子项条件'});
 assert.equal(s.getTask(unrelated.id).status,'needs_review');assert.equal(s.getTask(projectTask.id).status,'prepared');assert.ok(scoped.id);
});

test('S3 可以后加依赖，拒绝跨项目、自身和循环依赖，下游完成受上游约束',t=>{
 const {s,p}=fixture(t),a=task(s,p),b=task(s,p),other=s.createProject({request_id:randomUUID(),name:'别的项目'}).project,c=task(s,other);
 assert.equal(typeof s.addDependency,'function');
 s.addDependency({task_id:b.id,dependency_id:a.id,method_version:'1.30'});
 assert.equal(s.getTask(b.id).dependencies[0].task_id,a.id);
 assert.throws(()=>s.addDependency({task_id:a.id,dependency_id:b.id}),/循环/);
 assert.throws(()=>s.addDependency({task_id:a.id,dependency_id:a.id}),/自身/);
 assert.throws(()=>s.addDependency({task_id:a.id,dependency_id:c.id}),/项目/);
 save(s,b);const h=handoff(s,p,b);assert.throws(()=>cp(s,b,'completed',{handoff_record_id:h.id}),/依赖/);
});

test('S4 新任务进入进行中必须指定执行者，非执行者写成果被拒绝',t=>{
 const {s,p}=fixture(t),a=task(s,p);
 assert.throws(()=>cp(s,a,'in_progress',{executor:undefined}),/执行者/);
 cp(s,a,'in_progress');assert.equal(s.getTask(a.id).executor,'gpt');
 assert.throws(()=>save(s,a,{executor:'claude'}),/执行者|交接/);
 assert.equal(save(s,a).revision,1);
 const assigned=task(s,p,{tags:['条目:03.1','执行:Claude']});
 assert.throws(()=>save(s,assigned,{executor:'gpt'}),/执行者|交接/);
});

test('S6 停手必须有本任务交接，交接后新的执行者可以接手且不能重用交接',t=>{
 const {s,p}=fixture(t),a=task(s,p),other=task(s,p);cp(s,a,'in_progress');
 assert.throws(()=>cp(s,a,'waiting_decision'),/交接/);
 const wrong=handoff(s,p,other);assert.throws(()=>cp(s,a,'waiting_decision',{handoff_record_id:wrong.id}),/本任务|归属/);
 const h=handoff(s,p,a,{to:'claude'});cp(s,a,'waiting_decision',{handoff_record_id:h.id});
 cp(s,a,'in_progress',{executor:'claude'});assert.equal(s.getTask(a.id).executor,'claude');
 assert.throws(()=>cp(s,a,'paused',{executor:'claude',handoff_record_id:h.id}),/交接/);
});

test('S5 确认绑定实际成果版本，同条目新确认退役旧确认并保留历史',t=>{
 const {s,p}=fixture(t),a=task(s,p);save(s,a);
 const confirm=revision=>rec(s,p,{kind:'decision',title:'确认03.1',status:'confirmed',source:'用户对话确认',content:JSON.stringify({task_id:a.id,revision,item:'03.1'})});
 assert.throws(()=>confirm(2),/成果版本/);
 const first=confirm(1);save(s,a);const second=confirm(2);
 assert.equal(s.getRecord({project_id:p.id,record_id:first.id}).status,'retired');
 assert.equal(s.getRecord({project_id:p.id,record_id:first.id,version:1}).status,'confirmed');
 assert.equal(s.getRecord({project_id:p.id,record_id:second.id}).status,'confirmed');
});

test('S8/S10 05与06成果必须引用现行主线和本项目上游章末；S9只复核旧主线引用',t=>{
 const {s,p}=fixture(t),a=task(s,p,{tags:['条目:05.2','包:W5.2']}),unrelated=task(s,p);
 assert.throws(()=>save(s,a),/主线/);
 const main=rec(s,p,{kind:'mainline',title:'设计主线卡',content:JSON.stringify({version:'v0.1',concept:'保留开放界面'})});
 assert.throws(()=>save(s,a,{mainline_ref:'主线卡 v0.1'}),/上游/);
 const upstream=rec(s,p,{kind:'chapter_summary',title:'章末｜03.8',content:JSON.stringify({chapter:'03',item:'03.8',summary:'入口朝北',status:'待确认',open_questions:[]})});
 assert.equal(save(s,a,{mainline_ref:'主线卡 v0.1',upstream_record_ids:[upstream.id]}).revision,1);
 rec(s,p,{kind:'mainline',record_id:main.id,expected_version:1,title:main.title,content:JSON.stringify({version:'v0.2',concept:'改为西入口'})});
 assert.equal(s.getTask(a.id).status,'needs_review');assert.equal(s.getTask(unrelated.id).status,'prepared');
 assert.throws(()=>save(s,a,{mainline_ref:'主线卡 v0.1',upstream_record_ids:[upstream.id]}),/主线/);
});

test('章末快照保留最近有效摘要、主线、指标和完整交接，旧项目字段不虚构',t=>{
 const {s,p}=fixture(t),a=task(s,p);
 rec(s,p,{kind:'mainline',title:'主线卡',content:JSON.stringify({version:'v0.1',concept:'先核入口',conflicts:[{id:'C1',source:['C03-1']}],strategies:[],pending:['核位置']})});
 rec(s,p,{kind:'metrics',title:'指标表',content:JSON.stringify({version:'v2',rows:[{name:'车位数',value:100,unit:'辆',caliber:'目标',nature:'目标',source_grade:'B',status:'待确认',credibility:'●',affected_items:['05.2']}]})});
 rec(s,p,{kind:'chapter_summary',title:'章末03.8',content:JSON.stringify({chapter:'03',item:'03.8',summary:'旧结论',status:'待确认'})});
 rec(s,p,{kind:'chapter_summary',title:'章末03.8',content:JSON.stringify({chapter:'03',item:'03.8',summary:'新结论',status:'待确认'})});
 handoff(s,p,a,{from:'claude',to:'gpt',done:'完成场地判断',next:'研究案例',waiting_on_user:['待你提供方位']});
 const before=s.project(p.id).context_version,progress=getProjectProgress(s,{project_id:p.id});
 assert.equal(progress.method_version,'1.30');assert.equal(progress.project.method_version,null);
 assert.equal(progress.project.mainline.version,'v0.1');assert.equal(progress.project.metrics.rows[0].value,100);
 assert.equal(progress.chapter_summaries.length,1);assert.equal(progress.chapter_summaries[0].summary,'新结论');
 assert.equal(progress.handoffs[0].done,'完成场地判断');assert.equal(progress.handoffs[0].work_package,'W3.1');
 assert.deepEqual(progress.handoffs[0].waiting_on_user,['待你提供方位']);assert.equal(s.project(p.id).context_version,before);
 const context=s.getContext({project_id:p.id,task_id:a.id,max_chars:30000});assert.equal(context.handoffs[0].next,'研究案例');
});

test('S9 主线另存新记录同样触发复核，版本不能倒退或重复改内容',t=>{
 const {s,p}=fixture(t),a=task(s,p);
 rec(s,p,{kind:'mainline',title:'主线卡',content:JSON.stringify({version:'v0.1',concept:'旧主张'})});
 save(s,a,{mainline_ref:'主线卡 v0.1'});
 const latest=rec(s,p,{kind:'mainline',title:'主线卡',content:JSON.stringify({version:'v0.2',concept:'新主张'})});
 assert.equal(s.getTask(a.id).status,'needs_review');
 assert.throws(()=>rec(s,p,{kind:'mainline',record_id:latest.id,expected_version:1,title:'主线卡',content:JSON.stringify({version:'v0.1',concept:'倒退'})}),/升版|版本/);
});

test('章末已确认必须绑定同条目的当前成果确认，不能借用其他条目的决定',t=>{
 const {s,p}=fixture(t),wrong=task(s,p);save(s,wrong);
 const decision=rec(s,p,{kind:'decision',title:'确认03.1',status:'confirmed',source:'用户明确确认',content:JSON.stringify({task_id:wrong.id,revision:1,item:'03.1'})});
 assert.throws(()=>rec(s,p,{kind:'chapter_summary',title:'章末03.8',content:JSON.stringify({chapter:'03',item:'03.8',summary:'不能沿用其他条目确认',status:'已确认',decision_ref:decision.id})}),/确认|条目/);
});

test('实际成果、检查和新交接齐备后可完成，检查完成与用户确认分别表示',t=>{
 const {s,p}=fixture(t),a=task(s,p);save(s,a);const h=handoff(s,p,a);cp(s,a,'completed',{handoff_record_id:h.id});
 let progress=getProjectProgress(s,{project_id:p.id});assert.equal(progress.tasks.done,1);assert.equal(progress.workflow_tasks[0].confirmed,false);
 rec(s,p,{kind:'decision',title:'确认03.1',status:'confirmed',source:'用户明确确认',content:JSON.stringify({task_id:a.id,revision:1,item:'03.1'})});
 progress=getProjectProgress(s,{project_id:p.id});assert.equal(progress.workflow_tasks[0].confirmed,true);assert.equal(progress.tasks.done,1);
});
