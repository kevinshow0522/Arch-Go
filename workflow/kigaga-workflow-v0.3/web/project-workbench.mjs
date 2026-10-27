const array=value=>Array.isArray(value)?value:[];
const strings=value=>array(value).map(x=>typeof x==='string'?x:x?.text||x?.title||'').filter(Boolean);
const requirement=value=>/^补齐|^核心/.test(value)?'c':/^沿用/.test(value)?'k':/^(先不做|不适用)/.test(value)?'s':'o';
const hasResult=task=>!!(task.result&&(task.result.narrative||strings(task.result.facts).length||strings(task.result.actions).length));
const depth=content=>String(content||'').split(/\r?\n/,1)[0].match(/服务深度\s*[:：]\s*([0abc])(?=\s|[；;，,]|$)/)?.[1]||null;

export function createProjectWorkbench(snapshot,method){
 const project=snapshot.project||{},pid=project.id;
 const records=array(snapshot.records).concat(snapshot.project_catalog?[snapshot.project_catalog]:[])
  .filter(r=>r&&(!pid||!r.project_id||r.project_id===pid));
 const methods={};array(method.chapters).forEach(c=>array(c.topics).forEach(t=>{methods['M'+t.id]={...t,chapter:c};}));
 const notes=records.filter(r=>r.kind==='note'&&r.title==='项目目录'&&!r.subproject_id&&['active','confirmed'].includes(r.status))
  .sort((a,b)=>String(b.updated_at||b.created_at||'').localeCompare(String(a.updated_at||a.created_at||''))||(b.version||0)-(a.version||0));
 const record=notes[0]||null,chapters=[],items={},aliases={},warnings=[];
 let current=null,oldNumbers=false;
 if(record){
  for(const rawLine of String(record.content||'').split(/\r?\n/)){
   const line=rawLine.trim();
   if(/^##\s+曾用编号/.test(line)){oldNumbers=true;continue;}
   const heading=line.match(/^##\s+([\p{L}\p{N}_.-]+)\s+(.+)$/u);
   if(heading){oldNumbers=false;current={id:'project-'+chapters.length,num:heading[1],title:heading[2],short:heading[2],items:[]};chapters.push(current);continue;}
   if(oldNumbers){const match=line.match(/^(.+?)\s*(?:→|->|=>)\s*(.+)$/);if(match)aliases[match[1].trim()]=match[2].trim();continue;}
   if(!current||!line.includes('｜')&&!line.includes('|'))continue;
   const cells=line.split(/[｜|]/).map(s=>s.trim()).filter(Boolean);
   if(cells.length<3||/^(?:项目编号|[-: ]+)$/.test(cells[0]))continue;
   if(items[cells[0]]){warnings.push('项目目录编号重复：'+cells[0]);continue;}
   const refs=[...cells.slice(3).join(' ').matchAll(/M(\d{2}\.\d+)/g)].map(m=>'M'+m[1]);
   const item={id:cells[0],title:cells[1],req:requirement(cells[2]),requirement:cells[2],
    simple:/简版/.test(cells[2]),backfill:/^补齐/.test(cells[2]),end:cells.includes('章末'),methodRefs:refs,
    counted:!refs.length||refs.some(ref=>methods[ref]?.counted!==false),
    question:refs.map(ref=>methods[ref]?.question||'').filter(Boolean).join('；'),
    reason:cells.find(cell=>/^补充[:：]/.test(cell))?.replace(/^补充[:：]/,'')||'',chapter:current.id};
   item.supp=!!item.reason||!refs.length;items[item.id]=item;current.items.push(item);
  }
  chapters.forEach(c=>{
   c.entry=c.items.length>0&&c.items.every(item=>!item.counted);
   if(c.items.some(item=>item.req==='c'&&item.counted)){
    const ends=c.items.filter(item=>item.end&&item.counted);
    if(!ends.length)warnings.push(c.num+' '+c.title+'有核心项，尚未指定章末结论');
    ends.forEach(item=>{if(item.req!=='c'){item.req='c';item.simple=true;item.requirement='核心简版';}});
   }
  });
  if(!chapters.length)warnings.push('项目目录记录没有可读取的章和条目，请在对话中整理。');
  if(notes.length>1)warnings.push('存在多份活动项目目录，当前显示最近更新的一份。');
 }
 const resolve=id=>{let value=id;const seen=new Set();while(aliases[value]&&!seen.has(value)){seen.add(value);value=aliases[value];}return value;};
 const summary=String(project.summary||''),serviceDepth=depth(summary),firstLine=summary.split(/\r?\n/,1)[0];
 const entryStage=firstLine.match(/进入\s*[:：]\s*([0abc])(?=\s|[；;，,]|$)/)?.[1]||null;
 const subprojects=records.filter(r=>r.kind==='subproject'&&r.status!=='archived').map(r=>({id:r.id,title:r.title,stage:depth(r.content)}));
 const subById=Object.fromEntries(subprojects.map(r=>[r.id,r]));
 const expand=value=>{
  if(items[resolve(value)])return [resolve(value)];
  const range=value.match(/^(.+?)[-—–](.+)$/);
  if(!range)return [resolve(value)];
  const start=resolve(range[1]),end=resolve(range[2]);
  const chapter=chapters.find(c=>c.items.some(i=>i.id===start)&&c.items.some(i=>i.id===end));
  if(chapter){const a=chapter.items.findIndex(i=>i.id===start),b=chapter.items.findIndex(i=>i.id===end);return a<=b?chapter.items.slice(a,b+1).map(i=>i.id):[start];}
  const numeric=start.match(/^(\d+\.)(\d+)$/),last=end.match(/^(\d+\.)(\d+)$/);
  if(numeric&&last&&numeric[1]===last[1]&&+last[2]>=+numeric[2]&&+last[2]-+numeric[2]<100)return Array.from({length:+last[2]-+numeric[2]+1},(_,i)=>numeric[1]+(+numeric[2]+i));
  return [resolve(value)];
 };
 const tasks=array(snapshot.tasks).filter(t=>t&&(!pid||!t.project_id||t.project_id===pid)).map(raw=>{
  const tags=strings(raw.tags),tagValue=key=>tags.find(tag=>new RegExp('^'+key+'[:：]').test(tag))?.replace(new RegExp('^'+key+'[:：]'),'').trim();
  const topics=[...new Set((tags.filter(tag=>/^条目[:：]/.test(tag)).length?tags.filter(tag=>/^条目[:：]/.test(tag)).flatMap(tag=>expand(tag.replace(/^条目[:：]/,'').trim())):array(raw.topic_ids).flatMap(id=>expand(String(id)))))];
  const checkpoint=raw.checkpoint||{},done=strings(checkpoint.done),revision=Number(raw.revision??raw.result_revision)||0;
  const replied=new Set(done.flatMap(line=>{
   const explicitRevision=line.match(/第\s*(\d+)\s*版/);
   // Updating a checkpoint can retain old done lines, so its timestamp cannot date a reply.
   const applies=explicitRevision?+explicitRevision[1]===revision:revision<=1;
   return applies?[...line.matchAll(/已回复\s*((?:[A-Za-z0-9][A-Za-z0-9_.-]*-)?Q\s*\d+)/gi)].map(match=>match[1].replace(/\s/g,'').toUpperCase()):[];
  }));
  const questions=strings(raw.result?.questions).filter((question,index)=>{
   const explicit=question.match(/^\s*(?:[-*]\s*)?([A-Za-z0-9][A-Za-z0-9_.-]*-Q\d+)(?=\s|[：:、.]|$)/i);
   return !replied.has(explicit?explicit[1].toUpperCase():'Q'+(index+1));
  });
  const marker=done.some(line=>[...line.matchAll(/你已确认\s*[:：]\s*第\s*(\d+)\s*版/g)].some(match=>+match[1]===revision));
  const decisions=records.filter(r=>r.kind==='decision'&&r.status==='confirmed'&&r.source);
  const confirmed=hasResult(raw)&&marker&&decisions.some(r=>(r.title||'').includes(raw.id)&&new RegExp('第\\s*'+revision+'\\s*版').test(r.title||'')||done.some(line=>line.includes(r.id)&&new RegExp('第\\s*'+revision+'\\s*版').test(line)));
  const external=tagValue('来源')==='外部已有',read=external&&hasResult(raw)&&strings(checkpoint.checks).length>0&&!['needs_review','cancelled'].includes(raw.status);
  const subproject=subById[raw.subproject_id],scopeDepth=subproject?.stage||serviceDepth;
  let state=raw.status==='cancelled'?'cancelled':raw.status==='needs_review'||raw.status==='waiting_decision'||raw.status==='waiting_material'?'need':external?(read?'external':'external-unread'):raw.status==='in_progress'||raw.status==='message_accepted'?'active':confirmed?'confirmed':hasResult(raw)?'result':raw.status==='paused'?'paused':'queued';
  const executor=tagValue('执行')||raw.executor||null,from=tagValue('转自');
  return {id:String(raw.id),raw,topics,primary:topics[0]||null,executor,from,questions,confirmed,external,externalRead:read,
   hasResult:hasResult(raw),state,subproject:subproject||null,scopeDepth,
   credit:raw.status!=='cancelled'&&raw.status!=='needs_review'&&(external?read:hasResult(raw))};
 });
 if(!record){
  for(const task of tasks)for(const id of task.topics){
   if(items[id])continue;
   const ref=methods['M'+id],number=id.includes('.')?id.split('.')[0]:'task';
   let chapter=chapters.find(c=>c.num===number);
   if(!chapter){chapter={id:'observed-'+chapters.length,num:number,title:ref?.chapter.title||'本项目工作',short:ref?.chapter.title||'本项目工作',items:[]};chapters.push(chapter);}
   const item={id,title:ref?.title||id,req:'o',requirement:'已关联工作',methodRefs:ref?['M'+id]:[],counted:ref?.counted!==false,end:false,question:ref?.question||'',chapter:chapter.id};
   items[id]=item;chapter.items.push(item);
  }
  chapters.forEach(c=>{c.entry=c.items.every(item=>!item.counted);});
 }
 const backfill=record&&serviceDepth===entryStage?array(method.entry_backfill?.[entryStage]).map(id=>'M'+id).filter(ref=>!Object.values(items).some(item=>item.methodRefs.includes(ref))).map(ref=>({method:ref,title:methods[ref]?.title||ref})):[];
 const rank={need:9,active:8,paused:7,confirmed:6,external:5,result:4,'external-unread':3,queued:2,related:1,none:0};
 const itemStates={},itemCredit={};
 for(const item of Object.values(items)){
  const main=tasks.filter(t=>t.primary===item.id&&t.state!=='cancelled'),related=tasks.filter(t=>t.primary!==item.id&&t.topics.includes(item.id)&&t.state!=='cancelled');
  itemStates[item.id]=main.sort((a,b)=>rank[b.state]-rank[a.state])[0]?.state||(related.length?'related':'none');
  itemCredit[item.id]=main.some(t=>t.credit);
 }
 const core=record?Object.values(items).filter(i=>i.counted&&i.req==='c'):[];
 return {methodVersion:method.method_version,record,hasCatalog:!!record,chapters,items,aliases,methods,tasks,subprojects,
  serviceDepth,entryStage,summary:summary.replace(/^服务深度\s*[:：][^\r\n]*(?:\r?\n|$)/,''),warnings,backfill,itemStates,itemCredit,
  coreTotal:core.length+backfill.length,coreResults:core.filter(i=>itemCredit[i.id]).length,
  catalogVersion:record?.version||null};
}
