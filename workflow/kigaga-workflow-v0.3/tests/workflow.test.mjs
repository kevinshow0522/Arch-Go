import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {ProjectStore} from '../src/store.mjs';
const mod = await import('../src/workflow-store.mjs').catch(e => e.code==='ERR_MODULE_NOT_FOUND' ? {} : Promise.reject(e));
const WorkflowStore = mod.WorkflowStore;
const result = {title:'入口研究',narrative:'比较两种入口组织。',facts:[],assumptions:['待现场复核'],questions:[],actions:['比较入口动线']};
function fixture(t){
  assert.equal(typeof WorkflowStore,'function','WorkflowStore must provide durable workflow behavior');
  const dir=mkdtempSync(join(tmpdir(),'kg-workflow-'));
  const path=join(dir,'project.db');const store=new WorkflowStore(path);
  t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
  const p=store.createProject({request_id:randomUUID(),name:'测试停车项目'}).project;
  return {store,p,path,dir};
}
const task=(s,p,extra={})=>s.prepareTask({request_id:randomUUID(),project_id:p.id,instruction:'研究入口',output:'设计判断',material_ids:[],...extra});
const record=(s,p,extra={})=>s.saveRecord({request_id:randomUUID(),project_id:p.id,kind:'condition',title:'保留范围',content:'保留主体结构',status:'confirmed',source:'用户本次明确要求',...extra});
function checkpoint(s,t,status='in_progress',extra={}){
 return s.checkpointTask({request_id:randomUUID(),task_id:t.id,expected_state_version:s.getTask(t.id).state_version,expected_context_version:s.getContext({project_id:t.project_id,task_id:t.id}).context_version,status,checkpoint:{summary:'已比较入口',done:['比较两种组织'],next:'比较入口动线',blockers:[],checks:['已核对所选资料'],...extra}});
}
test('project lookup preserves ambiguous names and pages instead of silently selecting',t=>{
 const {store:s,p}=fixture(t);s.createProject({request_id:randomUUID(),name:p.name});
 const found=s.findProjects({query:p.name,limit:1,offset:0});assert.equal(found.total,2);assert.equal(found.items.length,1);assert.equal(found.next_offset,1);
 assert.notEqual(s.findProjects({query:p.name,limit:1,offset:1}).items[0].id,found.items[0].id);
});
test('tasks support project scope, subprojects, multiple stages and restart checkpoints',t=>{
 const {store:s,p,path}=fixture(t);const sp=record(s,p,{kind:'subproject',title:'入口专项',content:'入口与人流',status:'active'});
 const a=task(s,p,{subproject_id:sp.id,stage_ids:['site','concept'],tags:['专项研究']});
 assert.deepEqual(a.stage_ids,['site','concept']);assert.equal(a.subproject_id,sp.id);
 const b=task(s,p);assert.deepEqual(b.stage_ids,[]);
 s.saveResult({task_id:a.id,expected_revision:0,result});checkpoint(s,a);
 s.close();const reopened=new WorkflowStore(path);
 try{const c=reopened.getContext({project_id:p.id,task_id:a.id});assert.equal(c.task.checkpoint.next,'比较入口动线');assert.equal(c.scope.title,'入口专项');assert.equal(c.task.result_revision,1);}finally{reopened.close();}
});
test('draft saving does not complete work and completion needs outcome and checks',t=>{
 const {store:s,p}=fixture(t);const a=task(s,p);
 assert.throws(()=>checkpoint(s,a,'completed'),/成果/);
 assert.equal(s.saveResult({task_id:a.id,expected_revision:0,result}).status,'in_progress');
 assert.throws(()=>checkpoint(s,a,'completed',{checks:[]}),/检查/);
 assert.equal(checkpoint(s,a,'completed').status,'completed');
 const sp=record(s,p,{kind:'subproject',title:'独立专项',status:'completed'});assert.equal(s.getRecord({project_id:p.id,record_id:sp.id}).status,'completed');
 assert.equal(s.getTask(a.id).status,'completed');assert.equal(s.getContext({project_id:p.id}).project.name,p.name);
});
test('records retain versions and retries; stale task checkpoints cannot overwrite',t=>{
 const {store:s,p}=fixture(t);const request_id=randomUUID();const args={request_id,project_id:p.id,kind:'decision',title:'方向',content:'先比较',status:'proposed',source:'本次分析'};
 const r=s.saveRecord(args);assert.equal(s.saveRecord(args).id,r.id);
 assert.throws(()=>s.saveRecord({...args,content:'不同'}),/请求/);
 const next=s.saveRecord({...args,request_id:randomUUID(),record_id:r.id,expected_version:1,content:'采纳方向',status:'confirmed'});
 assert.equal(next.version,2);assert.equal(s.getRecord({project_id:p.id,record_id:r.id,version:1}).content,'先比较');
 assert.throws(()=>s.saveRecord({...args,request_id:randomUUID(),record_id:r.id,expected_version:1}),/版本/);
 const a=task(s,p);const c=s.getContext({project_id:p.id,task_id:a.id});record(s,p);
 assert.throws(()=>s.checkpointTask({request_id:randomUUID(),task_id:a.id,expected_state_version:a.state_version,expected_context_version:c.context_version,status:'in_progress',checkpoint:{summary:'旧记录',done:[],next:'下一步',blockers:[],checks:[]}}),/版本/);
});
test('other projects cannot enter scope, evidence, context, records or dependencies',t=>{
 const {store:s,p}=fixture(t);const other=s.createProject({request_id:randomUUID(),name:'其他项目'}).project;
 const foreign=record(s,other,{kind:'subproject',status:'active'});const ftask=task(s,other);
 assert.throws(()=>task(s,p,{subproject_id:foreign.id}),/项目/);
 assert.throws(()=>task(s,p,{dependency_ids:[ftask.id]}),/项目/);
 assert.throws(()=>task(s,p,{record_ids:[foreign.id]}),/项目/);
 assert.throws(()=>s.getRecord({project_id:p.id,record_id:foreign.id}),/项目/);
 assert.throws(()=>s.getContext({project_id:p.id,task_id:ftask.id}),/项目/);
 assert.throws(()=>s.getContext({project_id:p.id,subproject_id:foreign.id}),/项目/);
 assert.equal(s.listTasks({project_id:p.id}).total,0);
});
test('unreferenced project records leave unrelated scopes alone while scoped changes require review',t=>{
 const {store:s,p}=fixture(t);const sp1=record(s,p,{kind:'subproject',status:'active',title:'入口'});const sp2=record(s,p,{kind:'subproject',status:'active',title:'屋面'});
 const a=task(s,p,{subproject_id:sp1.id}),b=task(s,p,{subproject_id:sp2.id});
 for(const v of [a,b]){s.saveResult({task_id:v.id,expected_revision:0,result});checkpoint(s,v,'completed');}
 record(s,p,{subproject_id:sp1.id});assert.equal(s.getTask(a.id).status,'needs_review');assert.equal(s.getTask(b.id).status,'completed');
 record(s,p);assert.equal(s.getTask(b.id).status,'completed');
});
test('material changes flag pinned evidence and propagate recheck through dependent tasks',t=>{
 const {store:s,p}=fixture(t);const m=s.addMaterial({request_id:randomUUID(),project_id:p.id,title:'入口资料',content:'旧入口'}).materials[0];
 const a=task(s,p,{material_ids:[m.id]});s.saveResult({task_id:a.id,expected_revision:0,result});checkpoint(s,a,'completed');
 const b=task(s,p,{dependency_ids:[a.id]});s.saveResult({task_id:b.id,expected_revision:0,result});checkpoint(s,b,'completed');
 const c=task(s,p,{dependency_ids:[b.id]});s.saveResult({task_id:c.id,expected_revision:0,result});checkpoint(s,c,'completed');
 s.updateMaterial({material_id:m.id,expected_version:1,title:'入口资料',content:'新入口'});
 for(const v of [a,b,c])assert.equal(s.getTask(v.id).status,'needs_review');
 const ctx=s.getContext({project_id:p.id,task_id:a.id});assert.equal(ctx.materials[0].version,1);assert.equal(ctx.materials[0].current_version,2);
 assert.equal(s.readMaterial({project_id:p.id,material_id:m.id,version:1}).content,'旧入口');
 assert.throws(()=>checkpoint(s,c,'completed'),/依赖/);
});
test('context excludes material bodies and unrelated scope, with explicit overflow and paged detail',t=>{
 const {store:s,p}=fixture(t);const sp1=record(s,p,{kind:'subproject',title:'入口',status:'active'}),sp2=record(s,p,{kind:'subproject',title:'屋面',status:'active'});
 record(s,p,{subproject_id:sp2.id,content:'UNRELATED-PRIVATE-DESIGN'});
 const m=s.addMaterial({request_id:randomUUID(),project_id:p.id,title:'长文',content:'PRIVATE-BODY'.repeat(3000)}).materials[0];
 const a=task(s,p,{subproject_id:sp1.id,material_ids:[m.id]});
 const c=s.getContext({project_id:p.id,task_id:a.id,max_chars:5000});assert.equal(c.ready,true);assert.ok(JSON.stringify(c).length<=5000);assert.ok(!JSON.stringify(c).includes('PRIVATE-BODY'));assert.ok(!JSON.stringify(c).includes('UNRELATED-PRIVATE-DESIGN'));
 const page=s.readMaterial({project_id:p.id,material_id:m.id,version:1,offset:0,limit:200});assert.equal(page.content.length,200);assert.equal(page.next_offset,200);
 record(s,p,{content:'重要约束'.repeat(2000)});const overflow=s.getContext({project_id:p.id,task_id:a.id,max_chars:2000});assert.equal(overflow.ready,false);assert.ok(overflow.omitted_details);assert.ok(JSON.stringify(overflow).length<=2000);
});
test('completed dependency revision changes cannot silently reuse downstream approval',t=>{
 const {store:s,p}=fixture(t);const a=task(s,p);s.saveResult({task_id:a.id,expected_revision:0,result});checkpoint(s,a,'completed');
 const b=task(s,p,{dependency_ids:[a.id]});s.saveResult({task_id:b.id,expected_revision:0,result});checkpoint(s,b,'completed');
 s.saveResult({task_id:a.id,expected_revision:1,result:{...result,title:'新的入口判断'}});assert.equal(s.getTask(b.id).status,'needs_review');assert.equal(s.getTask(a.id).status,'in_progress');
});
test('legacy v2 database opens with original materials and result history intact',t=>{
 assert.equal(typeof WorkflowStore,'function');const dir=mkdtempSync(join(tmpdir(),'kg-migration-'));const path=join(dir,'legacy.db');t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const old=new ProjectStore(path);const p=old.createProject({request_id:randomUUID(),name:'旧工程'}).project;const a=old.prepareTask({request_id:randomUUID(),project_id:p.id,stage_id:'site',material_ids:[],instruction:'分析场地',output:'场地判断'});old.saveResult({task_id:a.id,expected_revision:0,result});old.close();
 const s=new WorkflowStore(path);try{assert.equal(s.getTask(a.id).history[0].result.title,'入口研究');assert.deepEqual(s.getContext({project_id:p.id,task_id:a.id}).task.stage_ids,['site']);assert.equal(s.db.prepare('PRAGMA user_version').get().user_version,3);}finally{s.close();}
});
test('large project lists remain compact and stale evidence cannot be marked completed',t=>{
 const {store:s,p}=fixture(t);
 for(let i=0;i<12;i++)task(s,p,{instruction:'详细要求'.repeat(1000),output:'输出要求'.repeat(400)});
 assert.ok(JSON.stringify(s.listTasks({project_id:p.id,limit:10})).length<15000);
 const m=s.addMaterial({request_id:randomUUID(),project_id:p.id,title:'现状',content:'旧条件'}).materials[0];
 const a=task(s,p,{material_ids:[m.id]});s.saveResult({task_id:a.id,expected_revision:0,result});s.updateMaterial({material_id:m.id,expected_version:1,title:'现状',content:'新条件'});
 assert.throws(()=>s.checkpointTask({request_id:randomUUID(),task_id:a.id,expected_state_version:s.getTask(a.id).state_version,expected_context_version:s.getContext({project_id:p.id,task_id:a.id}).context_version,status:'completed',checkpoint:{summary:'更新',done:[],next:'',blockers:[],checks:['已检查']},acknowledge_changes:true}),/资料版本/);
});
test('pausing a completed upstream task invalidates its completed downstream task',t=>{
 const {store:s,p}=fixture(t);const a=task(s,p);s.saveResult({task_id:a.id,expected_revision:0,result});checkpoint(s,a,'completed');
 const b=task(s,p,{dependency_ids:[a.id]});s.saveResult({task_id:b.id,expected_revision:0,result});checkpoint(s,b,'completed');
 checkpoint(s,a,'paused');assert.equal(s.getTask(b.id).status,'needs_review');
});
test('completion must refresh changed record and dependency references after review',t=>{
 const {store:s,p}=fixture(t);const r=record(s,p);const a=task(s,p);s.saveResult({task_id:a.id,expected_revision:0,result});checkpoint(s,a,'completed');
 const b=task(s,p,{dependency_ids:[a.id],record_ids:[r.id]});s.saveResult({task_id:b.id,expected_revision:0,result});checkpoint(s,b,'completed');
 s.saveResult({task_id:a.id,expected_revision:1,result:{...result,title:'修订'}});checkpoint(s,a,'completed');
 assert.throws(()=>s.checkpointTask({request_id:randomUUID(),task_id:b.id,expected_state_version:s.getTask(b.id).state_version,expected_context_version:s.getContext({project_id:p.id,task_id:b.id}).context_version,status:'completed',checkpoint:{summary:'复核',done:[],next:'',blockers:[],checks:['复核']},acknowledge_changes:true}),/引用版本/);
});
test('legacy saved-result status is not migrated as verified completion',t=>{
 assert.equal(typeof WorkflowStore,'function');const dir=mkdtempSync(join(tmpdir(),'kg-legacy-status-'));const path=join(dir,'old.db');t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const old=new ProjectStore(path);const p=old.createProject({request_id:randomUUID(),name:'旧项目'}).project;const a=old.prepareTask({request_id:randomUUID(),project_id:p.id,stage_id:'site',material_ids:[],instruction:'旧任务',output:'成果'});old.saveResult({task_id:a.id,expected_revision:0,result});old.close();
 const s=new WorkflowStore(path);try{assert.equal(s.getTask(a.id).status,'needs_review');assert.equal(s.getTask(a.id).history.length,1);}finally{s.close();}
});
test('subproject scope edits invalidate its tasks and downstream only',t=>{
 const {store:s,p}=fixture(t);const sp=record(s,p,{kind:'subproject',status:'active'});const other=record(s,p,{kind:'subproject',status:'active'});
 const a=task(s,p,{subproject_id:sp.id});s.saveResult({task_id:a.id,expected_revision:0,result});checkpoint(s,a,'completed');
 const b=task(s,p,{dependency_ids:[a.id]}),c=task(s,p,{subproject_id:other.id});for(const x of [b,c]){s.saveResult({task_id:x.id,expected_revision:0,result});checkpoint(s,x,'completed');}
 record(s,p,{kind:'subproject',status:'active',record_id:sp.id,expected_version:1,content:'修改专项边界'});
 assert.equal(s.getTask(a.id).status,'needs_review');assert.equal(s.getTask(b.id).status,'needs_review');assert.equal(s.getTask(c.id).status,'completed');
});
test('late result cannot reopen cancelled or paused tasks',t=>{
 const {store:s,p}=fixture(t);for(const status of ['paused','cancelled']){const a=task(s,p);checkpoint(s,a,status);s.saveResult({task_id:a.id,expected_revision:0,result});assert.equal(s.getTask(a.id).status,status);}
});
test('material mutation snapshot reflects invalidation immediately',t=>{
 const {store:s,p}=fixture(t);const m=s.addMaterial({request_id:randomUUID(),project_id:p.id,title:'现状',content:'旧'}).materials[0];const a=task(s,p,{material_ids:[m.id]});s.saveResult({task_id:a.id,expected_revision:0,result});checkpoint(s,a,'completed');
 const response=s.updateMaterial({material_id:m.id,expected_version:1,title:'现状',content:'新'});const returned=response.tasks.find(x=>x.id===a.id);assert.equal(returned.status,'needs_review');assert.equal(returned.state_version,s.getTask(a.id).state_version);
});
test('completion rejects missing or modified referenced files',async t=>{
 const {store:s,p,dir}=fixture(t);const {mkdirSync,writeFileSync}=await import('node:fs');mkdirSync(join(dir,'artifacts'));const path=join(dir,'artifacts','plan.md');writeFileSync(path,'original');
 const r=s.registerArtifact({request_id:randomUUID(),project_id:p.id,title:'底稿',path});const a=task(s,p,{record_ids:[r.id]});s.saveResult({task_id:a.id,expected_revision:0,result});
 writeFileSync(path,'changed');assert.throws(()=>checkpoint(s,a,'completed'),/文件/);rmSync(path);assert.throws(()=>checkpoint(s,a,'completed'),/文件/);writeFileSync(path,'original');assert.equal(checkpoint(s,a,'completed').status,'completed');
});
