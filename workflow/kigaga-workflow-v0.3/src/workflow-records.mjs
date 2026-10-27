import {win32} from 'node:path';

export const recordBody=record=>{try{const v=JSON.parse(record?.content);return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}catch{return {};}};
export const canonicalActor=value=>typeof value==='string'?({gpt:'gpt',codex:'gpt',claude:'claude',user:'user','用户':'user'}[value.trim().toLowerCase()]??null):null;
export const taskItems=task=>[...new Set([...(task.topic_ids??[]),...(task.tags??[]).filter(tag=>/^条目[:：]/.test(tag)).flatMap(tag=>[...tag.matchAll(/(?:M)?(0\d\.\d+)/g)].map(m=>m[1]))])];
export const workPackage=task=>task.work_package??task.tags?.find(tag=>/^包[:：]/.test(tag))?.replace(/^包[:：]/,'').trim()??null;
export const safeRecordFile=value=>typeof value==='string'&&!win32.isAbsolute(value)&&!value.includes(':')&&!/[\x00-\x1f]/.test(value)&&!value.replaceAll('\\','/').split('/').some(part=>part==='..'||part==='.'||/[. ]$/.test(part))&&/^(项目资料|工作文件|成果输出)\/.+/.test(value.replaceAll('\\','/'));
export function confirmationRef(record){
 const b=recordBody(record),ref=b.task_ref??record.source?.match(/([\da-f-]{36})@(\d+)/i)?.[0];
 const match=(typeof ref==='string'?/^([\da-f-]{36})@(\d+)$/i.exec(ref):null)??record.source?.match(/task:([\da-f-]{36}):revision:(\d+)/i)??record.title?.match(/([\da-f-]{36})\s*@?第\s*(\d+)\s*版/i);
 const task_id=b.task_id??match?.[1],revision=b.revision??b.result_revision??(match?Number(match[2]):null);
 return task_id&&Number.isSafeInteger(revision)&&revision>0?{task_id,revision,item:b.item??null}:null;
}
export const mainlineVersion=record=>String(recordBody(record).version??'').replace(/^v/i,'');
export function versionAdvances(previous,next){const a=mainlineVersion(previous).split('.').map(Number),b=mainlineVersion(next).split('.').map(Number);for(let i=0;i<Math.max(a.length,b.length);i++){if((b[i]??0)!==(a[i]??0))return (b[i]??0)>(a[i]??0);}return false;}
export function currentMainline(records){
 return records.filter(r=>!r.subproject_id&&!['retired','rejected'].includes(r.status)&&(r.kind==='mainline'||r.kind==='note'&&/主线卡/.test(r.title))&&/^\d+(?:\.\d+)*$/.test(mainlineVersion(r))).reduce((best,r)=>{
  if(!best||versionAdvances(best,r))return r;
  if(versionAdvances(r,best))return best;
  const rank=x=>[x.updated_at??x.created_at??'',String(x.version??0).padStart(12,'0'),x.id??''].join('|');
  return rank(r)>rank(best)?r:best;
 },null);
}
export function taskConfirmed(task,decision){
 if(!task?.result||decision?.kind!=='decision'||decision.status!=='confirmed'||!decision.source)return false;
 const revision=task.revision??0,ref=confirmationRef(decision);
 if(ref)return ref.task_id===task.id&&ref.revision===revision;
 // Pre-1.30 confirmations sometimes linked a decision in the checkpoint only.
 const done=Array.isArray(task.checkpoint?.done)?task.checkpoint.done:[];
 if(!done.some(line=>new RegExp('你已确认\\s*[:：]\\s*第\\s*'+revision+'\\s*版').test(line)))return false;
 return done.some(line=>line.includes(decision.id)&&new RegExp('第\\s*'+revision+'\\s*版').test(line));
}
export function chapterConfirmed(decision,task,item,subprojectId=null){
 const ref=confirmationRef(decision);
 return taskConfirmed(task,decision)&&taskItems(task).includes(item)&&(!ref?.item||ref.item===item)&&(task.subproject_id??null)===(subprojectId??null)&&(decision.subproject_id??null)===(subprojectId??null);
}
export const matchesMainline=(ref,record)=>typeof ref==='string'&&ref.match(/v(\d+(?:\.\d+)*)/i)?.[1]===mainlineVersion(record);
export function validateStructuredRecord(record){
 if(!['handoff','mainline','metrics','chapter_summary'].includes(record.kind))return;
 const b=recordBody(record);
 if(!Object.keys(b).length)throw new Error('交接、章末摘要、主线卡和指标表需要JSON对象内容。');
 if(record.kind==='handoff'){
  if(!canonicalActor(b.from)||!(canonicalActor(b.to)||b.to==='any')||!(typeof (b.done??b.summary)==='string'&&(b.done??b.summary).trim()))throw new Error('交接需要有效的from、to和done（兼容summary）。');
  if(b.task_ids!==undefined&&(!Array.isArray(b.task_ids)||b.task_ids.length>40||b.task_ids.some(id=>typeof id!=='string')))throw new Error('交接task_ids必须是任务编号数组。');
  if(b.files!==undefined&&(!Array.isArray(b.files)||b.files.some(file=>!safeRecordFile(file))))throw new Error('交接文件必须是项目三区内相对路径。');
 }
 if(['mainline','metrics'].includes(record.kind)&&!/^v?\d+(?:\.\d+)*$/i.test(String(b.version??'')))throw new Error('主线卡或指标表需要明确版本号。');
 if(record.kind==='metrics'&&(!Array.isArray(b.rows)||b.rows.length>200))throw new Error('指标表需要rows数组。');
 if(record.kind==='chapter_summary'&&(!/^0[1-8]$/.test(b.chapter??'')||!new RegExp('^'+b.chapter+'\\.\\d+$').test(b.item??'')||typeof b.summary!=='string'||!b.summary.trim()))throw new Error('章末摘要需要chapter、item和实际summary。');
}
