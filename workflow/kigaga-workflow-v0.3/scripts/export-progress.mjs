import {DatabaseSync} from 'node:sqlite';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {getProjectProgress} from '../src/project-progress.mjs';
import {storageLocation} from '../src/storage-location.mjs';
import {METHOD_VERSION} from '../src/method-version.mjs';

function portable(value){
 if(Array.isArray(value))return value.map(portable);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,portable(v)]));
 if(typeof value==='string')return value.replace(/(?:[A-Za-z]:[\\/]|\\\\)[^\s"'<>，；]+/g,'[本机路径]').replace(/^\/(?!\/).*/,'[本机路径]');
 return value;
}
export function buildProgressExport(source,{project_id}={}){
 const db=source.db??source,ids=project_id?[project_id]:db.prepare('SELECT id FROM projects ORDER BY rowid').all().map(r=>r.id);
 const projects=ids.map(id=>{
  const progress=getProjectProgress(source,{project_id:id});
  const {site,...project}=progress.project;
  return {...progress,project,workflow_tasks:progress.workflow_tasks.map(t=>({...t,title:t.title?.slice(0,500)??null,result:t.result?{title:t.result.title,mainline_ref:t.result.mainline_ref??null,upstream_record_ids:t.result.upstream_record_ids??[]}:null}))};
 });
 return portable({exported_at:new Date().toISOString(),method_version:METHOD_VERSION,read_only:true,projects});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const options={};
 for(let i=2;i<process.argv.length;i+=1){const key=process.argv[i];if(!['--project-id','--db','--output'].includes(key)||!process.argv[i+1])throw new Error('用法：npm run export-progress -- [--project-id ID] [--db PATH] [--output PATH]');options[key.slice(2)]=process.argv[++i];}
 const db=new DatabaseSync(options.db??storageLocation().dbPath,{readOnly:true});
 try{
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format().replaceAll('-','');
  const target=resolve(options.output??`进度_${date}.json`);
  writeFileSync(target,JSON.stringify(buildProgressExport(db,{project_id:options['project-id']}),null,2)+'\n',{flag:'wx'});
  console.log('已导出只读进度：'+target);
 }finally{db.close();}
}
