import {randomUUID} from 'node:crypto';
import {dirname,join,relative,isAbsolute} from 'node:path';
import {ProjectStore} from './store.mjs';
import {inspectArtifact} from './artifacts.mjs';
import {STAGES} from './stages.mjs';
import {workflowInputs as schema} from './workflow-contracts.mjs';
import {briefTask,boundedContext} from './context.mjs';
import {ProjectStorage} from './project-storage.mjs';
import {getProjectProgress} from './project-progress.mjs';
import {defaultReferenceRoots} from './storage-location.mjs';
import {METHOD_VERSION,assertMethodVersion} from './method-version.mjs';
import {recordBody,canonicalActor,taskItems,workPackage,confirmationRef,matchesMainline,versionAdvances,currentMainline,chapterConfirmed,validateStructuredRecord} from './workflow-records.mjs';
const now=()=>new Date().toISOString();
const json=JSON.stringify;
const parse=r=>JSON.parse(r.payload);
const list=(db,table,pid)=>db.prepare(`SELECT payload FROM ${table} WHERE project_id=? ORDER BY rowid`).all(pid).map(parse);
function page(items,offset,limit){return {items:items.slice(offset,offset+limit),total:items.length,next_offset:offset+limit<items.length?offset+limit:null};}
const normalize=t=>({...t,state_version:t.state_version??1,stage_ids:t.stage_ids??(t.stage_id?[t.stage_id]:[]),subproject_id:t.subproject_id??null,dependencies:t.dependencies??[],record_refs:t.record_refs??[],review_reasons:t.review_reasons??[],checkpoint:t.checkpoint??null});

export class WorkflowStore extends ProjectStore {
 constructor(path,{artifactRoots=[],projectsRoot,referenceRoots=defaultReferenceRoots}={}){
  super(path);this.artifactRoots=artifactRoots.length?artifactRoots:[join(dirname(path),'artifacts')];this.referenceRoots=referenceRoots;
  try{this.transaction(()=>{this.db.exec(`
   CREATE TABLE IF NOT EXISTS workflow_records(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id),kind TEXT NOT NULL,payload TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS workflow_record_versions(record_id TEXT NOT NULL REFERENCES workflow_records(id),version INTEGER NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(record_id,version));
   CREATE TABLE IF NOT EXISTS workflow_requests(id TEXT PRIMARY KEY,input TEXT NOT NULL,response TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS task_checkpoints(task_id TEXT NOT NULL REFERENCES tasks(id),state_version INTEGER NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(task_id,state_version));
   CREATE INDEX IF NOT EXISTS workflow_records_project ON workflow_records(project_id);
   PRAGMA user_version=3;
  `);
   for(const row of this.db.prepare('SELECT payload FROM tasks').all()){
    const old=parse(row);if(old.state_version!==undefined)continue;
    const t=normalize(old);
    if(t.status==='completed'){t.status='needs_review';t.review_reasons=['旧版保存成果不代表已完成检查，请复核后更新状态'];}
    this.putTask(t);
   }
  });this.projectFiles=projectsRoot?new ProjectStorage(this.db,projectsRoot):null;}catch(e){this.close();throw e;}
 }
 project(id){const p=this.record('projects',id);return {...p,context_version:p.context_version??0,...(this.projectFiles?{storage:this.projectFiles.get(id)}:{})};}
 snapshot(projectId,taskId){const s=super.snapshot(projectId,taskId);if(this.projectFiles){s.projects=s.projects.map(p=>({...p,storage:this.projectFiles.get(p.id)}));if(s.project)s.project=this.project(s.project.id);}return s;}
 createProject(raw){assertMethodVersion(raw.method_version);const s=super.createProject(raw);if(this.projectFiles)this.prepareProjectStorage({project_id:s.project.id});return this.snapshot(s.project.id);}
 prepareProjectStorage({project_id,directory}){if(!this.projectFiles)throw new Error('尚未配置项目存储盘。');return this.transaction(()=>this.projectFiles.prepare(this.project(project_id),directory));}
 exportResult({project_id,task_id}){
  if(!this.projectFiles)throw new Error('尚未配置项目存储盘。');
  const t=this.getTask(task_id);if(t.project_id!==project_id)throw new Error('任务不属于所选项目。');if(!t.result)throw new Error('任务尚无可导出的成果。');
  const storage=this.prepareProjectStorage({project_id});
  const path=this.projectFiles.export(t,storage),artifact=inspectArtifact(path,[storage.directory]);
  return this.transaction(()=>{
   const old=list(this.db,'workflow_records',project_id).find(r=>r.kind==='artifact'&&r.artifact?.path===path&&r.artifact.sha256===artifact.sha256);
   const record=old||this.writeRecord({project_id,kind:'artifact',title:`${t.result.title} · v${t.revision}`,content:'已导出到项目成果目录；文件存在与哈希已核对。',status:'active',source:`task:${task_id}:revision:${t.revision}`,subproject_id:t.subproject_id,artifact:{...artifact,task_id,revision:t.revision}});
   return {saved:true,project_id,task_id,revision:t.revision,artifact_id:record.id,...artifact};
  });
 }
 bump(projectId){const p=this.project(projectId);p.context_version++;p.updated_at=now();this.db.prepare('UPDATE projects SET payload=? WHERE id=?').run(json(p),p.id);return p.context_version;}
 putTask(t){const {history,...payload}=t;this.db.prepare('UPDATE tasks SET payload=? WHERE id=?').run(json(payload),t.id);return payload;}
 getTask(id){return normalize(super.getTask(id));}
 scoped(projectId,id,table='workflow_records'){
  const r=this.record(table,id);if(r.project_id!==projectId)throw new Error('记录不属于当前项目。');return r;
 }
 scope(projectId,id){if(!id)return null;const r=this.scoped(projectId,id);if(r.kind!=='subproject')throw new Error('所选记录不是子项目。');return r;}
 once(input,fn){return this.transaction(()=>{
  const key=input.request_id;const old=this.db.prepare('SELECT input,response FROM workflow_requests WHERE id=?').get(key);
  if(old){if(old.input!==json(input))throw new Error('相同请求编号对应不同内容。');return JSON.parse(old.response);}
  const result=fn();this.db.prepare('INSERT INTO workflow_requests VALUES(?,?,?)').run(key,json(input),json(result));return result;
 });}
 findProjects(raw={}){
  const a=schema.findProjects.parse(raw);const items=this.db.prepare('SELECT payload FROM projects ORDER BY rowid DESC').all().map(parse).filter(p=>!a.query||p.name.includes(a.query)||p.id===a.query).map(p=>({id:p.id,name:p.name,summary_excerpt:p.summary.slice(0,200),context_version:p.context_version??0}));return page(items,a.offset,a.limit);
 }
 listTasks(raw){const a=schema.listTasks.parse(raw);this.project(a.project_id);if(a.subproject_id)this.scope(a.project_id,a.subproject_id);const items=list(this.db,'tasks',a.project_id).map(normalize).filter(t=>a.subproject_id===undefined||t.subproject_id===a.subproject_id).reverse().map(t=>({id:t.id,subproject_id:t.subproject_id,stage_ids:t.stage_ids,status:t.status,state_version:t.state_version,result_revision:t.revision,instruction_excerpt:t.instruction.slice(0,200),next_excerpt:t.checkpoint?.next.slice(0,200)??'',details_tool:'kg_get_task'}));return page(items,a.offset,a.limit);}
 listMaterials(raw){const a=schema.listMaterials.parse(raw);this.project(a.project_id);return page(list(this.db,'materials',a.project_id).map(({id,title,version})=>({id,title,version,body_tool:'kg_read_material'})),a.offset,a.limit);}
 listRecords(raw){const a=schema.listRecords.parse(raw);this.project(a.project_id);if(a.subproject_id)this.scope(a.project_id,a.subproject_id);const items=list(this.db,'workflow_records',a.project_id).filter(r=>(!a.kind||r.kind===a.kind)&&(a.subproject_id===undefined||r.subproject_id===a.subproject_id)).map(({id,kind,title,status,version,subproject_id})=>({id,kind,title,status,version,subproject_id}));return page(items,a.offset,a.limit);}
 getRecord(raw){const a=schema.getRecord.parse(raw);let r=this.scoped(a.project_id,a.record_id);if(a.version!==undefined){const old=this.db.prepare('SELECT payload FROM workflow_record_versions WHERE record_id=? AND version=?').get(a.record_id,a.version);if(!old)throw new Error('记录版本不存在。');r=parse(old);}const full=r.content;return {...r,content:full.slice(a.offset,a.offset+a.limit),offset:a.offset,total_chars:full.length,next_offset:a.offset+a.limit<full.length?a.offset+a.limit:null};}
 saveRecord(raw){assertMethodVersion(raw.method_version);const a=schema.saveRecord.parse(raw);if(a.status==='confirmed'&&!a.source)throw new Error('已确认记录需要来源。');return this.once(a,()=>this.writeRecord(a));}
 writeRecord(a){
  this.project(a.project_id);this.scope(a.project_id,a.subproject_id);
  validateStructuredRecord(a);
  if(['mainline','metrics'].includes(a.kind)&&a.subproject_id)throw new Error('主线卡与指标表属于整个项目。');
  const confirmation=a.kind==='decision'&&a.status==='confirmed'?confirmationRef(a):null;
  if(confirmation){const task=this.scoped(a.project_id,confirmation.task_id,'tasks');if(task.revision!==confirmation.revision)throw new Error('确认必须引用当前实际成果版本 task_id@revision。');if(a.subproject_id&&a.subproject_id!==task.subproject_id)throw new Error('确认记录与任务子项归属不一致。');a={...a,subproject_id:task.subproject_id??null};}
  if(a.kind==='handoff')for(const id of recordBody(a).task_ids??[])this.scoped(a.project_id,id,'tasks');
  if(a.kind==='chapter_summary'&&recordBody(a).status==='已确认'){
   const id=recordBody(a).decision_ref;if(!id)throw new Error('已确认章末需要decision_ref。');
   const decision=this.scoped(a.project_id,id),candidates=list(this.db,'tasks',a.project_id).map(normalize);
   if(!candidates.some(task=>chapterConfirmed(decision,task,recordBody(a).item,a.subproject_id)))throw new Error('章末确认必须对应同条目、同子项的当前实际成果。');
  }
  if(a.kind==='subproject'&&a.subproject_id)throw new Error('第一版子项目直接属于项目。');
  let old=null;
  if(a.record_id){old=this.scoped(a.project_id,a.record_id);if(old.version!==a.expected_version)throw new Error('记录版本已变化，请重新读取。');if(old.kind!==a.kind||old.subproject_id!==(a.subproject_id??null))throw new Error('记录类型与归属不能通过修改内容改变。');}
  else if(a.expected_version!==undefined)throw new Error('新记录不能指定旧版本。');
  const previousMainline=a.kind==='mainline'?currentMainline(list(this.db,'workflow_records',a.project_id)):null;
  if(previousMainline&&a.content!==old?.content&&previousMainline.content!==a.content&&!versionAdvances(previousMainline,a))throw new Error('主线卡内容变化时必须高于当前主线版本，不能倒退或重复。');
  if(confirmation){
   for(const previous of list(this.db,'workflow_records',a.project_id)){
    if(previous.id===old?.id||previous.kind!=='decision'||previous.status!=='confirmed')continue;
    const ref=confirmationRef(previous);
    if(ref&&(ref.task_id===confirmation.task_id||confirmation.item&&ref.item===confirmation.item)&&previous.subproject_id===(a.subproject_id??null))this.writeRecord({...previous,record_id:previous.id,expected_version:previous.version,status:'retired'});
   }
  }
  const r={id:old?.id??randomUUID(),project_id:a.project_id,kind:a.kind,subproject_id:a.subproject_id??null,title:a.title,content:a.content,status:a.status,source:a.source,version:(old?.version??0)+1,created_at:old?.created_at??now(),updated_at:now(),...(a.artifact?{artifact:a.artifact}:{})};
  if(old)this.db.prepare('UPDATE workflow_records SET payload=? WHERE id=?').run(json(r),r.id);
  else this.db.prepare('INSERT INTO workflow_records VALUES(?,?,?,?)').run(r.id,r.project_id,r.kind,json(r));
  this.db.prepare('INSERT INTO workflow_record_versions VALUES(?,?,?)').run(r.id,r.version,json(r));
  this.bump(r.project_id);
  if(a.kind==='mainline'){
   const current=currentMainline(list(this.db,'workflow_records',a.project_id));
   if(current?.content!==previousMainline?.content)this.invalidate(r.project_id,t=>!!t.result?.mainline_ref&&(!current||!matchesMainline(t.result.mainline_ref,current)),`设计主线卡已升版，请复核旧版引用。`);
  }
  if(r.kind==='condition'||r.kind==='decision'||old)this.invalidate(r.project_id,t=>{
   if(confirmation?.task_id===t.id)return false;
   const linked=t.record_refs.some(ref=>ref.id===r.id)||(r.kind==='subproject'&&t.subproject_id===r.id)||(['condition','decision'].includes(r.kind)&&!!r.subproject_id&&t.subproject_id===r.subproject_id);
   return linked||!!(old&&r.kind==='mainline'&&matchesMainline(t.result?.mainline_ref,old));
  },`记录 ${r.id} 更新为版本 ${r.version}`);
  return r;
 }
 invalidate(projectId,predicate,reason){
  const tasks=list(this.db,'tasks',projectId).map(normalize);const affected=new Set(tasks.filter(predicate).map(t=>t.id));
  let changed=true;while(changed){changed=false;for(const t of tasks)if(!affected.has(t.id)&&t.dependencies.some(d=>affected.has(d.task_id))){affected.add(t.id);changed=true;}}
  for(const t of tasks){if(!affected.has(t.id)||t.status==='cancelled')continue;if(!t.review_reasons.includes(reason))t.review_reasons.push(reason);t.review_reasons=t.review_reasons.slice(-20);t.status=t.status==='paused'?'paused':'needs_review';t.state_version++;this.putTask(t);}
 }
 prepareTask(raw){
  assertMethodVersion(raw.method_version);
  const a=schema.prepareTask.parse(raw);
  if(a.stage_id&&a.stage_ids.length&&!a.stage_ids.includes(a.stage_id))throw new Error('单阶段字段与多阶段标签不一致。');
  return this.transaction(()=>{
   const old=this.retry('tasks',a);if(old)return this.getTask(old.id);
   const p=this.project(a.project_id);this.scope(p.id,a.subproject_id);
   const materials=a.material_ids.map(id=>{const m=this.scoped(p.id,id,'materials');return {id:m.id,title:m.title,content:m.content,source:m.source,version:m.version};});
   if(materials.reduce((n,m)=>n+m.content.length,0)>120000)throw new Error('所选资料过多，请拆分任务。');
   const dependencies=a.dependency_ids.map(id=>{const t=normalize(this.scoped(p.id,id,'tasks'));return {task_id:t.id,revision:t.revision};});
   const record_refs=a.record_ids.map(id=>{const r=this.scoped(p.id,id);if(r.subproject_id&&r.subproject_id!==a.subproject_id)throw new Error('记录属于其他子项目，请显式协调后创建合适归属的任务。');return {id:r.id,version:r.version};});
   const stage_ids=[...new Set(a.stage_ids.length?a.stage_ids:a.stage_id?[a.stage_id]:[])];
   const t={id:randomUUID(),request_id:a.request_id,project_id:p.id,project_name:p.name,subproject_id:a.subproject_id,stage_ids,stage_id:stage_ids[0]??'general',stage_name:stage_ids.length?stage_ids.map(id=>STAGES.find(s=>s.id===id).name).join(' / '):'项目任务',tags:a.tags,instruction:a.instruction,output:a.output,materials,dependencies,record_refs,status:'prepared',revision:0,state_version:1,checkpoint:null,review_reasons:[],result:null,created_at:now()};
   if(a.method_version)t.method_version=a.method_version;
   const taggedActor=a.tags.find(tag=>/^执行[:：]/.test(tag))?.replace(/^执行[:：]/,'');
   if(a.executor&&canonicalActor(taggedActor)&&canonicalActor(a.executor)!==canonicalActor(taggedActor))throw new Error('执行者字段与执行标签不一致。');
   const assignedActor=canonicalActor(a.executor)??canonicalActor(taggedActor);if(assignedActor)t.executor=assignedActor;
   if(a.work_package||workPackage(t))t.work_package=a.work_package??workPackage(t);
   if(a.credibility)t.credibility=a.credibility;
   this.db.prepare('INSERT INTO tasks VALUES(?,?,?,?,?)').run(t.id,p.id,a.request_id,json(a),json(t));this.bump(p.id);return {...t,history:[]};
  });
 }
 addDependency(raw){
  assertMethodVersion(raw.method_version);const a=schema.addDependency.parse(raw);
  const apply=()=>{
   const task=this.getTask(a.task_id),dependency=this.getTask(a.dependency_id);
   if(task.id===dependency.id)throw new Error('任务不能依赖自身。');
   if(task.project_id!==dependency.project_id)throw new Error('依赖必须属于同一项目。');
   if(a.expected_state_version!==undefined&&task.state_version!==a.expected_state_version)throw new Error('任务版本已变化。');
   if(task.dependencies.some(d=>d.task_id===dependency.id))return briefTask(task);
   const seen=new Set();const reaches=id=>{if(id===task.id)return true;if(seen.has(id))return false;seen.add(id);return this.getTask(id).dependencies.some(d=>reaches(d.task_id));};
   if(reaches(dependency.id))throw new Error('依赖不能形成循环。');
   task.dependencies.push({task_id:dependency.id,revision:dependency.revision});task.state_version++;this.putTask(task);this.bump(task.project_id);
   if(task.status==='completed')this.invalidate(task.project_id,t=>t.id===task.id,'完成后补充依赖，需要重新核对依据。');
   return briefTask(this.getTask(task.id));
  };
  return a.request_id?this.once(a,apply):this.transaction(apply);
 }
 assertExecutor(task,value,required=false){
  const actor=canonicalActor(value);
  if(!required&&value===undefined)return;
  if(!actor)throw new Error('进行中的任务必须明确执行者 Claude／GPT／用户。');
  if(task.executor&&task.executor!==actor){
   const h=task.last_handoff;
   if(task.status==='in_progress'||!h||h.consumed||!(h.to==='any'||canonicalActor(h.to)===actor))throw new Error('任务由另一执行者负责，请先交接后接手。');
   h.consumed=true;
  }
  task.executor=actor;
 }
 assertResultEvidence(task,result){
  if(task.method_version!==METHOD_VERSION)return;
  const items=taskItems(task),pkg=workPackage(task),design=items.some(id=>/^(05|06)\./.test(id))||/^W[56]\./.test(pkg??'')||task.stage_ids.some(id=>['concept','development'].includes(id));
  const display=items.some(id=>/^07\./.test(id))||/^W7\./.test(pkg??'');
  if(!design&&!display)return;
  const mainline=currentMainline(list(this.db,'workflow_records',task.project_id));
  if(!mainline||!matchesMainline(result.mainline_ref,mainline))throw new Error('成果必须注明当前设计主线卡版本 mainline_ref。');
  if(design){
   const refs=result.upstream_record_ids??task.record_refs.map(ref=>ref.id);
   if(!refs.length)throw new Error('05／06成果需要引用本项目上游章末结论记录。');
   const upstream=refs.map(id=>this.scoped(task.project_id,id));
   if(!upstream.some(r=>r.kind==='chapter_summary'&&['01.5','02.7','03.8','04.7','05.1','05.9'].includes(recordBody(r).item)&&!['retired','rejected'].includes(r.status)))throw new Error('05／06成果需要有效的上游章末结论记录。');
  }
 }
 addMaterial(raw){return this.transaction(()=>{const old=this.db.prepare('SELECT id FROM materials WHERE request_id=?').get(raw.request_id);const v=super.addMaterial(raw);if(!old)this.bump(raw.project_id);return v;});}
 updateMaterial(raw){return this.transaction(()=>{const before=this.record('materials',raw.material_id);super.updateMaterial(raw);const after=this.record('materials',raw.material_id);if(after.version!==before.version){this.bump(after.project_id);this.invalidate(after.project_id,t=>t.materials.some(m=>m.id===after.id),`资料 ${after.id} 更新为版本 ${after.version}`);}return this.snapshot(after.project_id);});}
 saveResult(raw){assertMethodVersion(raw.method_version);const a=schema.saveResult.parse(raw);return this.transaction(()=>{
  const before=this.getTask(a.task_id);this.assertExecutor(before,a.executor,before.method_version===METHOD_VERSION);
  const result={...a.result,...(a.mainline_ref?{mainline_ref:a.mainline_ref}:{}),...(a.upstream_record_ids?{upstream_record_ids:a.upstream_record_ids}:{})};
  this.assertResultEvidence(before,result);
  const explicit=result.upstream_record_ids;
  const upstreams=explicit??before.record_refs.filter(ref=>this.scoped(before.project_id,ref.id).kind==='chapter_summary').map(ref=>ref.id);
  delete result.upstream_record_refs;
  if(upstreams.length){
   const refs=upstreams.map(id=>({id,version:explicit?this.scoped(before.project_id,id).version:before.record_refs.find(ref=>ref.id===id).version}));
   result.upstream_record_refs=refs;
   before.record_refs=[...before.record_refs.filter(old=>!refs.some(ref=>ref.id===old.id)),...refs];
  }
  const out=super.saveResult({task_id:a.task_id,expected_revision:a.expected_revision,result});
  if(out.revision===before.revision)return this.getTask(raw.task_id);
  const t={...normalize(out),record_refs:before.record_refs,...(before.executor?{executor:before.executor}:{}),status:['prepared','message_accepted','completed'].includes(before.status)?'in_progress':before.status,state_version:before.state_version+1};this.putTask(t);this.bump(t.project_id);this.invalidate(t.project_id,v=>v.dependencies.some(d=>d.task_id===t.id),`上游任务 ${t.id} 成果更新为版本 ${t.revision}`);return this.getTask(t.id);
 });}
 checkpointTask(raw){assertMethodVersion(raw.method_version);const a=schema.checkpointTask.parse(raw);return this.once(a,()=>{
  const t=this.getTask(a.task_id);const p=this.project(t.project_id);
  if(t.state_version!==a.expected_state_version||p.context_version!==a.expected_context_version)throw new Error('任务或项目上下文版本已变化，请重新读取后合并。');
  this.assertExecutor(t,a.executor,t.method_version===METHOD_VERSION&&(['in_progress'].includes(a.status)||t.status==='in_progress'));
  if(a.status==='completed'){
   if(!t.result)throw new Error('完成任务需要先保存实际成果。');
   for(const ref of t.record_refs){const r=this.scoped(t.project_id,ref.id);if(r.kind==='artifact'){const check=this.checkArtifact({project_id:t.project_id,artifact_id:r.id});if(!check.available||!check.matches_registered_version)throw new Error('引用文件缺失或与登记版本不一致，请核对并重新登记。');}}
   if(!a.checkpoint.checks.length)throw new Error('完成任务需要记录检查依据。');
   if(t.dependencies.some(d=>this.getTask(d.task_id).status!=='completed'))throw new Error('依赖任务尚未完成或需要复核。');
   if(!a.refresh_evidence&&(t.dependencies.some(d=>this.getTask(d.task_id).revision!==d.revision)||t.record_refs.some(r=>this.scoped(t.project_id,r.id).version!==r.version)))throw new Error('引用版本已变化，请读取新依据后刷新引用。');
   if(t.review_reasons.length&&!a.acknowledge_changes)throw new Error('存在变更，请复核后明确确认变更已处理。');
   if(t.materials.some(m=>this.record('materials',m.id).version!==m.version)&&!a.refresh_evidence)throw new Error('资料版本已变化，请读取最新资料并刷新引用。');
  }
  if(a.refresh_evidence){t.materials=t.materials.map(m=>{const latest=this.record('materials',m.id);return {id:latest.id,title:latest.title,content:latest.content,source:latest.source,version:latest.version};});t.record_refs=t.record_refs.map(r=>({id:r.id,version:this.scoped(t.project_id,r.id).version}));t.dependencies=t.dependencies.map(d=>({task_id:d.task_id,revision:this.getTask(d.task_id).revision}));}
  const previousStatus=t.status;
  if(t.method_version===METHOD_VERSION&&previousStatus==='in_progress'&&a.status!=='in_progress'){
   if(!a.handoff_record_id)throw new Error('任务停手需要本任务的新交接记录。');
   const handoff=this.scoped(t.project_id,a.handoff_record_id),body=recordBody(handoff);
   if(handoff.kind!=='handoff'||!(body.task_ids??[]).includes(t.id)||handoff.subproject_id&&handoff.subproject_id!==t.subproject_id||canonicalActor(body.from)!==t.executor||workPackage(t)&&body.work_package!==workPackage(t))throw new Error('交接记录必须属于本任务、工作包和执行者。');
   if(t.last_handoff?.id===handoff.id&&t.last_handoff.version===handoff.version)throw new Error('需要新的交接记录，不能重用上次交接。');
   t.last_handoff={id:handoff.id,version:handoff.version,to:body.to,from:body.from,consumed:false};
  }
  t.status=a.status;t.checkpoint={...a.checkpoint,saved_at:now()};t.state_version++;
  if(a.acknowledge_changes)t.review_reasons=[];
  this.putTask(t);this.db.prepare('INSERT INTO task_checkpoints VALUES(?,?,?)').run(t.id,t.state_version,json({checkpoint:t.checkpoint,status:t.status,material_refs:t.materials.map(m=>({id:m.id,version:m.version})),record_refs:t.record_refs,dependencies:t.dependencies}));this.bump(t.project_id);
  if(previousStatus==='completed'&&t.status!=='completed')this.invalidate(t.project_id,v=>v.dependencies.some(d=>d.task_id===t.id),`上游任务 ${t.id} 状态变为 ${t.status}`);
  return briefTask(t);
 });}
 readMaterial(raw){const a=schema.readMaterial.parse(raw);const current=this.scoped(a.project_id,a.material_id,'materials');const version=a.version??current.version;const row=this.db.prepare('SELECT payload FROM material_versions WHERE material_id=? AND version=?').get(a.material_id,version);if(!row)throw new Error('资料版本不存在。');const m=parse(row);return {id:m.id,title:m.title,source:m.source,version,current_version:current.version,content:m.content.slice(a.offset,a.offset+a.limit),offset:a.offset,total_chars:m.content.length,next_offset:a.offset+a.limit<m.content.length?a.offset+a.limit:null};}
 getContext(raw){const a=schema.context.parse(raw);const p=this.project(a.project_id);const t=a.task_id?this.getTask(a.task_id):null;
  if(t&&t.project_id!==p.id)throw new Error('任务不属于当前项目。');
  if(t&&a.subproject_id&&t.subproject_id!==a.subproject_id)throw new Error('任务与子项目归属不一致。');
  const scope=this.scope(p.id,a.subproject_id??t?.subproject_id);
  const progress=getProjectProgress(this,{project_id:p.id});
  const records=list(this.db,'workflow_records',p.id).filter(r=>['condition','decision'].includes(r.kind)&&!['retired','rejected'].includes(r.status)&&(!r.subproject_id||r.subproject_id===scope?.id));
  for(const ref of t?.record_refs??[]){if(!records.some(r=>r.id===ref.id)){const r=this.scoped(p.id,ref.id);records.push(r);}}
  const materials=(t?t.materials:list(this.db,'materials',p.id).slice(0,20)).map(m=>({id:m.id,title:m.title,version:m.version,current_version:this.record('materials',m.id).version,source:m.source}));
  const dependencies=(t?.dependencies??[]).map(d=>{const current=this.getTask(d.task_id);return {...d,current_revision:current.revision,status:current.status,title:current.result?.title??current.instruction};});
  return boundedContext({project:{id:p.id,name:p.name,summary:p.summary,...(p.storage?{storage:p.storage}:{})},context_version:p.context_version,scope:scope?{id:scope.id,title:scope.title,content:scope.content,version:scope.version}:null,task:t?briefTask(t):null,records,materials,dependencies,...(!t?{tasks:this.listTasks({project_id:p.id,...(scope?{subproject_id:scope.id}:{}),limit:10}),material_index_partial:list(this.db,'materials',p.id).length>20}:{}),read_tools:{material_index:'kg_list_materials',materials:'kg_read_material',records:'kg_get_record',task:'kg_get_task'},method_version:METHOD_VERSION,handoffs:progress.handoffs,chapter_summaries:progress.chapter_summaries,mainline:progress.project.mainline,metrics:progress.project.metrics,rules_version:'KI-1.30',budget_unit:'serialized_characters'},a.max_chars);
 }
 updateProject(raw){const a=schema.updateProject.parse(raw);return this.once(a,()=>{
  const p=this.project(a.project_id);if(p.context_version!==a.expected_context_version)throw new Error('项目上下文版本已变化，请重新读取。');
  const next={...p,name:a.name,summary:a.summary};this.db.prepare('UPDATE projects SET payload=? WHERE id=?').run(json(next),p.id);
  this.bump(p.id);if(p.summary!==a.summary)this.invalidate(p.id,()=>true,'项目摘要与目标已更新');return this.project(p.id);
 });}
 readResult(raw){const a=schema.readResult.parse(raw);const t=this.scoped(a.project_id,a.task_id,'tasks');const revision=a.revision??t.revision;const row=this.db.prepare('SELECT payload FROM result_versions WHERE task_id=? AND version=?').get(t.id,revision);if(!row)throw new Error('成果版本不存在。');return {task_id:t.id,revision,format:'application/json',content:row.payload.slice(a.offset,a.offset+a.limit),offset:a.offset,total_chars:row.payload.length,next_offset:a.offset+a.limit<row.payload.length?a.offset+a.limit:null};}
 registerArtifact(raw){const a=schema.registerArtifact.parse(raw);return this.once(a,()=>{
  this.project(a.project_id);this.scope(a.project_id,a.subproject_id);
  if(this.referenceRoots.some(root=>{const rel=relative(root.path,a.path);return !isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..\\')&&!rel.startsWith('../');}))throw new Error('参考库只读，不能登记为项目输出。');
  if(a.artifact_id)this.scoped(a.project_id,a.artifact_id);
  const artifact=inspectArtifact(a.path,this.projectFiles?[this.prepareProjectStorage({project_id:a.project_id}).directory]:this.artifactRoots);
  return this.writeRecord({...a,record_id:a.artifact_id,kind:'artifact',content:'文件存在及哈希已检查；专业内容检查另见任务记录。',status:'active',artifact});
 });}
 checkArtifact(raw){const a=schema.checkArtifact.parse(raw);const r=this.scoped(a.project_id,a.artifact_id);if(r.kind!=='artifact')throw new Error('记录不是文件成果。');
  try{const file=inspectArtifact(r.artifact.path,this.projectFiles?[this.projectFiles.get(a.project_id)?.directory].filter(Boolean):this.artifactRoots);return {id:r.id,version:r.version,available:true,matches_registered_version:file.sha256===r.artifact.sha256,...file};}
  catch(e){return {id:r.id,version:r.version,available:false,matches_registered_version:false,reason:e.message};}
 }

}
