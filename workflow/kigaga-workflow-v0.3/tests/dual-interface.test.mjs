import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const root=process.env.KIGAGA_TEST_ROOT||fileURLToPath(new URL('../',import.meta.url));
const {createWorkbenchServer}=await import(pathToFileURL(join(root,'src/server.mjs')));
const loader=process.env.KIGAGA_TEST_HOOK?['--import',process.env.KIGAGA_TEST_HOOK]:[];
const outcome=title=>({title,narrative:title+'正文',facts:['隔离的临时测试数据'],assumptions:[],questions:[],actions:[]});

test('独立接口发现共享项目库缺失时停止，不建立另一份空库',()=>{
 const dir=mkdtempSync(join(tmpdir(),'kg-dual-interface-')),db=join(dir,'missing.db');
 try{
  for(const kind of ['gpt','claude']){
   const result=spawnSync(process.execPath,[...loader,join(root,'src/server-'+kind+'.mjs')],{env:{...process.env,KIGAGA_DB_PATH:db},encoding:'utf8',timeout:10000});
   assert.notEqual(result.status,0);assert.match(result.stderr,/共享项目库不存在/);assert.equal(existsSync(db),false);
  }
 }finally{const target=resolve(dir);assert.ok(target.startsWith(resolve(tmpdir())+sep)&&target.split(sep).at(-1).startsWith('kg-dual-interface-'));rmSync(target,{recursive:true,force:true});}
});

test('GPT 与 Claude 独立进程共用项目与成果，跨端过期写入被拒绝，重启可继续读回',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'kg-dual-interface-')),db=join(dir,'shared.db'),clients=[];
 const seed=createWorkbenchServer({dbPath:db});seed.store.close();await seed.server.close();
 t.after(async()=>{for(const client of clients)await client.close();const target=resolve(dir);assert.ok(target.startsWith(resolve(tmpdir())+sep)&&target.split(sep).at(-1).startsWith('kg-dual-interface-'));rmSync(target,{recursive:true,force:true});});
 async function connect(kind){
  const client=new Client({name:'ISOLATED '+kind+' TEST',version:'1'});clients.push(client);
  const transport=new StdioClientTransport({command:process.execPath,args:[...loader,join(root,'src/server-'+kind+'.mjs')],env:{...process.env,KIGAGA_DB_PATH:db,KIGAGA_PROJECTS_ROOT:dir},stderr:'pipe'});
  let diagnostic='';transport.stderr?.on('data',chunk=>{diagnostic+=chunk.toString();});
  try{await client.connect(transport);}catch(error){throw new Error(kind+': '+diagnostic,{cause:error});}return client;
 }
 const [gpt,claude]=await Promise.all([connect('gpt'),connect('claude')]);
 const call=async(c,name,args={})=>{const r=await c.callTool({name,arguments:args});assert.ok(!r.isError,JSON.stringify(r));return r;};
 const gi=(await call(gpt,'kg_get_connection')).structuredContent;
 const ci=(await call(claude,'kg_get_connection')).structuredContent;
 assert.equal(gi.interface_id,'gpt');assert.equal(ci.interface_id,'claude');assert.equal(gi.data_source_id,ci.data_source_id);
 assert.notEqual(gpt.getServerVersion().name,claude.getServerVersion().name);
 const created=await call(gpt,'kg_create_project',{name:'仅临时同步验证',request_id:randomUUID()});
 const pid=created._meta.workbench.project.id;
 const material=await call(gpt,'kg_add_material',{project_id:pid,title:'共享测试资料',content:'同步依据',request_id:randomUUID()});
 const mid=material._meta.workbench.materials[0].id;
 const prepared=await call(gpt,'kg_prepare_task',{project_id:pid,stage_ids:['site'],tags:['条目:03.1','包:W3.1'],material_ids:[mid],instruction:'临时验证跨端成果',output:'同步验证',request_id:randomUUID()});
 const tid=prepared.structuredContent.task.id;
 const seen=await call(claude,'kg_open_workbench',{project_id:pid});
 assert.equal(seen._meta.workbench.tasks[0].id,tid);assert.equal(seen._meta.workbench.materials[0].content,'同步依据');
 await call(claude,'kg_save_result',{executor:'claude',task_id:tid,expected_revision:0,result:outcome('Claude 第一版')});
 const gptView=await call(gpt,'kg_open_workbench',{project_id:pid});
 assert.equal(gptView._meta.workbench.tasks[0].result.title,'Claude 第一版');
 const handoff=(await call(claude,'kg_save_record',{request_id:randomUUID(),project_id:pid,kind:'handoff',title:'交接｜W3.1｜Claude→GPT',status:'active',content:JSON.stringify({from:'claude',to:'gpt',work_package:'W3.1',task_ids:[tid],done:'完成第一版',next:'Codex核对并继续',waiting_on_user:[],files:[]})})).structuredContent;
 const checkpoint=async(c,executor,status,extra={})=>{const ctx=(await call(c,'kg_get_context',{project_id:pid,task_id:tid})).structuredContent;return call(c,'kg_checkpoint_task',{request_id:randomUUID(),task_id:tid,executor,expected_state_version:ctx.task.state_version,expected_context_version:ctx.context_version,status,checkpoint:{summary:'已交接',done:[],next:'Codex核对并继续',blockers:[],checks:[]},...extra});};
 await checkpoint(claude,'claude','waiting_decision',{handoff_record_id:handoff.id});
 const opening=(await call(gpt,'kg_get_context',{project_id:pid,task_id:tid})).structuredContent;assert.equal(opening.handoffs[0].next,'Codex核对并继续');
 await checkpoint(gpt,'gpt','in_progress');
 await call(gpt,'kg_save_result',{executor:'gpt',task_id:tid,expected_revision:1,result:outcome('GPT 第二版')});
 const stale=await claude.callTool({name:'kg_save_result',arguments:{task_id:tid,expected_revision:1,result:outcome('不应覆盖的旧版')}});assert.equal(stale.isError,true);
 const current=(await call(claude,'kg_get_context',{project_id:pid,task_id:tid})).structuredContent;
 await call(gpt,'kg_checkpoint_task',{executor:'gpt',request_id:randomUUID(),task_id:tid,expected_state_version:current.task.state_version,expected_context_version:current.context_version,status:'in_progress',checkpoint:{summary:'双端读回验证',done:['跨端成果可见'],next:'继续核对',blockers:[],checks:['拒绝过期覆盖']}});
 const refreshed=(await call(gpt,'kg_get_context',{project_id:pid,task_id:tid})).structuredContent;
 assert.equal(refreshed.task.checkpoint.next,'继续核对');
 await gpt.close();const restarted=await connect('gpt');
 const restored=await call(restarted,'kg_open_workbench',{project_id:pid});
 assert.equal(restored._meta.workbench.tasks[0].revision,2);assert.equal(restored._meta.workbench.tasks[0].result.title,'GPT 第二版');
 assert.equal(restored.structuredContent.connection.interface_id,'gpt');
});
