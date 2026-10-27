import {join,win32} from 'node:path';
import {workflowInputs as schema} from './workflow-contracts.mjs';
import {STAGES} from './stages.mjs';
import {METHOD_VERSION} from './method-version.mjs';
import {workPackage,taskItems,taskConfirmed,chapterConfirmed,currentMainline,safeRecordFile} from './workflow-records.mjs';

export class ProjectReadError extends Error {
 constructor(message,status=400,code='invalid_request'){super(message);this.name='ProjectReadError';this.status=status;this.code=code;}
}
const database=source=>source.db??source;
const hasTable=(db,name)=>!!db.prepare('SELECT 1 FROM sqlite_master WHERE type=? AND name=?').get('table',name);
const entries=(db,table,pid)=>hasTable(db,table)?db.prepare(`SELECT rowid AS sequence,payload FROM ${table} WHERE project_id=? ORDER BY rowid DESC`).all(pid).map(row=>({...JSON.parse(row.payload),_sequence:row.sequence})):[];
const timestamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?value:null;
const latest=values=>values.map(timestamp).filter(Boolean).sort((a,b)=>Date.parse(b)-Date.parse(a))[0]??null;
const changed=value=>latest([value.updated_at,value.checkpoint?.saved_at,value.accepted_at,value.created_at]);
const newest=(a,b)=>(Date.parse(changed(b))||0)-(Date.parse(changed(a))||0)||(b._sequence??0)-(a._sequence??0);
const actor=value=>typeof value==='string'?({'gpt':'codex','codex':'codex','claude':'claude','user':'user','用户':'user'}[value.trim().toLowerCase()]??null):null;
const body=record=>{try{const value=JSON.parse(record.content);return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}catch{return {};}};
const title=task=>task.title??task.result?.title??task.instruction??null;
const owner=task=>actor(task.executor)??actor(task.owner)??actor((task.tags??[]).find(tag=>/^执行[:：]/.test(tag))?.replace(/^执行[:：]/,''));
const safeHandoffFile=value=>typeof value==='string'&&!win32.isAbsolute(value)&&!value.includes(':')&&!/[\x00-\x1f]/.test(value)&&!value.replaceAll('\\','/').split('/').some(part=>part==='..'||/[. ]$/.test(part))&&/^(项目资料|工作文件|成果输出)\/.+/.test(value.replaceAll('\\','/'));

// This adapter deliberately performs SELECTs only. It never initializes a store or schema.
export function readStoredProject(source,projectId){
 schema.projectProgress.parse({project_id:projectId});
 const db=database(source),row=db.prepare('SELECT payload FROM projects WHERE id=?').get(projectId);
 if(!row)throw new ProjectReadError('项目不存在，请核对项目编号。',404,'project_not_found');
 const project=JSON.parse(row.payload);
 const bound=hasTable(db,'project_storage')?db.prepare('SELECT directory FROM project_storage WHERE project_id=?').get(projectId):null;
 return {...project,storage:bound?{directory:bound.directory,materials_directory:join(bound.directory,'项目资料'),working_directory:join(bound.directory,'工作文件'),output_directory:join(bound.directory,'成果输出')}:null};
}

export function getProjectProgress(source,raw){
 const {project_id}=schema.projectProgress.parse(raw),db=database(source),project=readStoredProject(source,project_id);
 const tasks=entries(db,'tasks',project_id).sort(newest),records=entries(db,'workflow_records',project_id).sort(newest);
 const doing=tasks.filter(task=>['in_progress','message_accepted'].includes(task.status));
 const blocked=tasks.filter(task=>['waiting_material','waiting_decision','needs_review'].includes(task.status)||(task.checkpoint?.blockers??[]).length);
 let stage=null;
 if(project.stage&&typeof project.stage==='object'&&(project.stage.code||project.stage.name))stage={code:project.stage.code??null,name:project.stage.name??null,updated_at:timestamp(project.stage.updated_at)};
 else{
  const active=doing.find(task=>(task.stage_ids??(task.stage_id?[task.stage_id]:[])).length===1&&task.stage_id!=='general');
  if(active){const code=(active.stage_ids??[active.stage_id])[0];stage={code,name:STAGES.find(item=>item.id===code)?.name??active.stage_name??null,updated_at:changed(active)};}
 }
 const catalog=records.find(record=>record.kind==='note'&&record.title==='项目目录'&&!['retired','rejected'].includes(record.status));
 const method=project.method_version??body(catalog??{}).method_version??catalog?.content?.match(/(?:方法版本|method_version)\s*[:：]\s*([\d.]+)/)?.[1]??null;
 const site=project.site&&Number.isFinite(project.site.lng)&&Number.isFinite(project.site.lat)&&Math.abs(project.site.lng)<=180&&Math.abs(project.site.lat)<=90?{lng:project.site.lng,lat:project.site.lat,label:project.site.label??null}:null;
 const resultTime=hasTable(db,'result_versions')?db.prepare('SELECT MAX(r.saved_at) AS saved_at FROM result_versions r JOIN tasks t ON t.id=r.task_id WHERE t.project_id=?').get(project_id)?.saved_at:null;
 const active=record=>!['retired','rejected'].includes(record.status);
 const objectRecord=kind=>{const r=kind==='mainline'?currentMainline(records):records.find(r=>(r.kind===kind||r.kind==='note'&&/指标表/.test(r.title))&&active(r));return r?{...body(r),record_id:r.id,record_version:r.version}:null;};
 const summaries=[],summaryKeys=new Set();
 for(const record of records.filter(r=>r.kind==='chapter_summary'&&active(r))){
  const value=body(record),key=(record.subproject_id??'')+':'+value.item;if(summaryKeys.has(key))continue;summaryKeys.add(key);
  const decision=records.find(r=>r.id===value.decision_ref);
  summaries.push({...value,record_id:record.id,record_version:record.version,subproject_id:record.subproject_id??null,status:value.status==='已确认'&&tasks.some(task=>chapterConfirmed(decision,task,value.item,record.subproject_id))?'已确认':'待确认',updated_at:changed(record)});
 }
 return {
  method_version:METHOD_VERSION,project:{id:project.id,name:project.name,method_version:method,site,mainline:objectRecord('mainline'),metrics:objectRecord('metrics')},stage,
  chapter_summaries:summaries,
  workflow_tasks:tasks.map(t=>({id:t.id,title:title(t),instruction:t.instruction??null,output:t.output??null,status:t.status,revision:t.revision??0,state_version:t.state_version??1,subproject_id:t.subproject_id??null,work_package:workPackage(t),executor:owner(t),method_version:t.method_version??null,topic_ids:taskItems(t),credibility:t.credibility??t.result?.credibility??null,tags:t.tags??[],result:t.result??null,checkpoint:t.checkpoint??null,review_reasons:t.review_reasons??[],confirmed:records.some(r=>taskConfirmed(t,r)),updated_at:changed(t)})),
  tasks:{total:tasks.length,done:tasks.filter(task=>task.status==='completed').length,doing:doing.map(task=>({id:task.id,title:title(task),owner:owner(task),updated_at:changed(task)})),blocked:blocked.map(task=>({id:task.id,title:title(task),waiting_on:[...(task.checkpoint?.blockers??[]),...(task.review_reasons??[])].join('；')||null}))},
  next:tasks.filter(task=>!['completed','cancelled','paused','waiting_material','waiting_decision','needs_review'].includes(task.status)&&task.checkpoint?.next).map(task=>({id:task.id,title:task.checkpoint.next})),
  recent_records:records.slice(0,20).map(record=>({id:record.id,title:record.title,kind:record.kind,created_at:timestamp(record.created_at),by:actor(record.by)??actor(body(record).by)??actor(body(record).from)??actor(record.source)})),
  handoffs:records.filter(record=>record.kind==='handoff'&&!['retired','rejected'].includes(record.status)).slice(0,10).map(record=>{const content=body(record);return {id:record.id,version:record.version,at:timestamp(content.created_at)??timestamp(content.at)??changed(record),from:actor(content.from),to:content.to==='any'?'any':actor(content.to),work_package:typeof content.work_package==='string'?content.work_package:null,task_ids:Array.isArray(content.task_ids)?content.task_ids:[],done:typeof content.done==='string'?content.done:typeof content.summary==='string'?content.summary:null,next:typeof content.next==='string'?content.next:null,waiting_on_user:Array.isArray(content.waiting_on_user)?content.waiting_on_user.filter(v=>typeof v==='string'):[],mainline_ref:typeof content.mainline_ref==='string'?content.mainline_ref:null,method_version:typeof content.method_version==='string'?content.method_version:null,summary:typeof content.summary==='string'?content.summary:typeof content.done==='string'?content.done:record.content??null,files:(Array.isArray(content.files)?content.files:[]).filter(safeRecordFile).map(path=>path.replaceAll('\\','/'))};}),
  updated_at:latest([changed(project),resultTime,...tasks.map(changed),...records.map(changed)]),
 };
}
