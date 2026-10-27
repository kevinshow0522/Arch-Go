import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const config=JSON.parse(readFileSync(new URL('../storage-location.json',import.meta.url),'utf8'));
const reports=[];
for(const dbPath of [config.dbPath,config.legacyDbPath]){
 const c=new Client({name:'storage-read-only-verification',version:'1'});
 const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../src/server.mjs',import.meta.url))],env:{...process.env,KIGAGA_DB_PATH:dbPath},stderr:'pipe'});transport.stderr?.resume();
 try{
  await c.connect(transport);
  const call=async(name,args)=>{const r=await c.callTool({name,arguments:args});if(r.isError)throw new Error(JSON.stringify(r));return r.structuredContent;};
  const index=await call('kg_find_projects',{limit:50}),projects=[];
  for(const p of index.items){
   const ctx=await call('kg_get_context',{project_id:p.id,max_chars:30000});
   if(!ctx.project.storage?.directory.startsWith(config.projectsRoot))throw new Error('项目目录不在目标盘');
   const artifacts=await call('kg_list_records',{project_id:p.id,kind:'artifact',limit:50});
   for(const a of artifacts.items){const checked=await call('kg_check_artifact',{project_id:p.id,artifact_id:a.id});if(!checked.available||!checked.matches_registered_version)throw new Error('成果文件核对失败');}
   projects.push({id:p.id,context_version:ctx.context_version,storage:ctx.project.storage,artifactCount:artifacts.total});
  }
  reports.push({configuredDbPath:dbPath,projects});
 }finally{await c.close();}
}
if(JSON.stringify(reports[0].projects)!==JSON.stringify(reports[1].projects))throw new Error('新旧连接参数没有指向相同数据');
console.log(JSON.stringify({freshLocalConnection:true,legacyPathRedirectVerified:true,...reports[0]},null,2));
