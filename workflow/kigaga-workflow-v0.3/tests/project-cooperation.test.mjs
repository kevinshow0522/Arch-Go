import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,writeFileSync,readFileSync,existsSync,symlinkSync,openSync,closeSync,ftruncateSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createServer,request} from 'node:http';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {WorkflowStore} from '../src/workflow-store.mjs';
import {createWorkbenchServer} from '../src/server.mjs';

function fixture(t){
 const dir=mkdtempSync(join(tmpdir(),'kg-cooperation-')),dbPath=join(dir,'isolated.db'),projectsRoot=join(dir,'projects');mkdirSync(projectsRoot);
 const store=new WorkflowStore(dbPath,{projectsRoot});
 const p=store.createProject({request_id:randomUUID(),name:'隔离协作测试'}).project;
 t.after(()=>{store.close();const target=resolve(dir);assert.ok(target.startsWith(resolve(tmpdir())+sep)&&target.split(sep).at(-1).startsWith('kg-cooperation-'));rmSync(target,{recursive:true,force:true});});
 return {dir,dbPath,projectsRoot,store,p,args:{project_id:p.id}};
}

// Catches missing registration or an accidental removal of existing tools on either host.
test('GPT and Claude expose the same read-only cooperation tools and retain legacy tools',async t=>{
 const {dbPath,projectsRoot,p}=fixture(t);
 for(const interfaceId of ['gpt','claude']){
  const {server,store}=createWorkbenchServer({dbPath,projectsRoot,interfaceId});
  const client=new Client({name:'ISOLATED cooperation test',version:'1'}),[ct,st]=InMemoryTransport.createLinkedPair();
  await server.connect(st);await client.connect(ct);
  try{
   const tools=(await client.listTools()).tools;
   for(const name of ['kg_get_project_progress','kg_list_project_files','kg_read_project_file']){
    const tool=tools.find(x=>x.name===name);assert.ok(tool,`${interfaceId}: missing ${name}`);assert.equal(tool.annotations.readOnlyHint,true);assert.ok(tool.inputSchema.required.includes('project_id'));
   }
   assert.ok(!tools.some(x=>/^kg_get_map_/.test(x.name)));
   for(const name of ['kg_open_workbench','kg_list_tasks','kg_get_task','kg_read_result','kg_list_records','kg_get_record','kg_save_record'])assert.ok(tools.some(x=>x.name===name),name);
   assert.equal(client.getServerCapabilities().resources,undefined);
   await assert.rejects(client.readResource({uri:'ui://kigaga/workbench-v03.html'}));
   const empty=await client.callTool({name:'kg_get_project_progress',arguments:{}});assert.equal(empty.isError,true);
   const handoff=await client.callTool({name:'kg_save_record',arguments:{request_id:randomUUID(),project_id:p.id,kind:'handoff',title:'协作交接',content:JSON.stringify({from:'claude',to:'codex',summary:'已核对入口',files:['成果输出/入口.md']}),status:'active'}});assert.ok(!handoff.isError,JSON.stringify(handoff));
   const progress=await client.callTool({name:'kg_get_project_progress',arguments:{project_id:p.id}});assert.equal(progress.structuredContent.handoffs[0].from,'claude');
  }finally{await client.close();await server.close();store.close();}
 }
});

// Catches invented method/site/stage values, incomplete task totals and lost recent handoffs.
test('progress uses actual project records, tasks and bounded reverse chronology',async t=>{
 const {store,p,args}=fixture(t),{getProjectProgress}=await import('../src/project-progress.mjs');
 const blank=getProjectProgress(store,args);
 assert.equal(blank.project.method_version,null);assert.equal(blank.project.site,null);assert.equal(blank.stage,null);assert.equal(blank.tasks.total,0);assert.deepEqual(blank.next,[]);
 const prepare=extra=>store.prepareTask({request_id:randomUUID(),project_id:p.id,instruction:'研究入口',output:'判断',material_ids:[],...extra});
 const active=prepare({stage_ids:['site'],tags:['执行:Claude']});
 store.checkpointTask({request_id:randomUUID(),task_id:active.id,expected_state_version:active.state_version,expected_context_version:store.project(p.id).context_version,status:'in_progress',checkpoint:{summary:'比较中',done:[],next:'核对入口宽度',blockers:[],checks:[]}});
 const blocked=prepare({tags:['执行:用户']});
 store.checkpointTask({request_id:randomUUID(),task_id:blocked.id,expected_state_version:blocked.state_version,expected_context_version:store.project(p.id).context_version,status:'waiting_decision',checkpoint:{summary:'等待',done:[],next:'等待选择',blockers:['等待业主确认'],checks:[]}});
 for(let i=0;i<24;i++)store.saveRecord({request_id:randomUUID(),project_id:p.id,kind:'note',title:`记录${i}`,content:'不应整段返回的正文',status:'active'});
 for(let i=0;i<12;i++){
  const legacy=store.saveRecord({request_id:randomUUID(),project_id:p.id,kind:'handoff',title:`交接${i}`,content:JSON.stringify({from:'claude',to:'codex',summary:`已完成${i}`,files:['成果输出/入口.md']}),status:'active'});
  // Seed a pre-validation historical payload only in this disposable database.
  legacy.content=JSON.stringify({from:'claude',to:'codex',summary:`已完成${i}`,files:['成果输出/入口.md','../secret','C:/private.txt']});
  store.db.prepare('UPDATE workflow_records SET payload=? WHERE id=?').run(JSON.stringify(legacy),legacy.id);
 }
 const progress=getProjectProgress(store,args);
 assert.equal(progress.tasks.total,2);assert.equal(progress.tasks.done,0);assert.equal(progress.tasks.doing[0].owner,'claude');assert.equal(progress.tasks.blocked[0].waiting_on,'等待业主确认');
 assert.equal(progress.stage.code,'site');assert.equal(progress.stage.name,'场地研究');assert.equal(progress.next[0].title,'核对入口宽度');assert.equal(progress.recent_records.length,20);assert.equal(progress.recent_records[0].title,'交接11');assert.equal(progress.handoffs.length,10);assert.equal(progress.handoffs[0].summary,'已完成11');assert.deepEqual(progress.handoffs[0].files,['成果输出/入口.md']);
 assert.ok(!JSON.stringify(progress).includes('不应整段返回的正文'));assert.throws(()=>getProjectProgress(store,{}));assert.throws(()=>getProjectProgress(store,{project_id:randomUUID()}));
 const other=store.createProject({request_id:randomUUID(),name:'其他项目'}).project;assert.equal(getProjectProgress(store,{project_id:other.id}).tasks.total,0);
});

// Catches upgrades being reported as a project method version and drafts counted as completed.
test('progress preserves explicit older project method evidence and counts only checked completed tasks',async t=>{
 const {store,p,args}=fixture(t),{getProjectProgress}=await import('../src/project-progress.mjs');
 store.saveRecord({request_id:randomUUID(),project_id:p.id,kind:'note',title:'项目目录',content:'方法版本：1.18\n01 项目机会',status:'active'});
 const task=store.prepareTask({request_id:randomUUID(),project_id:p.id,instruction:'核对入口',output:'入口判断',material_ids:[]});
 store.saveResult({task_id:task.id,expected_revision:0,result:{title:'入口判断',narrative:'判断正文',facts:[],assumptions:[],questions:[],actions:[]}});
 assert.equal(getProjectProgress(store,args).tasks.done,0);
 const current=store.getTask(task.id);store.checkpointTask({request_id:randomUUID(),task_id:task.id,expected_state_version:current.state_version,expected_context_version:store.project(p.id).context_version,status:'completed',checkpoint:{summary:'已核对',done:['判断'],next:'',blockers:[],checks:['实际核读底图']}});
 const result=getProjectProgress(store,args);assert.equal(result.project.method_version,'1.18');assert.equal(result.tasks.done,1);assert.equal(result.stage,null);
 for(let i=0;i<51;i++)store.prepareTask({request_id:randomUUID(),project_id:p.id,instruction:`待办${i}`,output:'判断',material_ids:[]});
 assert.equal(getProjectProgress(store,args).tasks.total,52);
});

// Catches accidental content/hash reads, area leaks, lost pages and unbounded metadata responses.
test('file lists stay relative, paginate at 500 and hash only explicit bounded requests',async t=>{
 const {store,p,args}=fixture(t),{listProjectFiles}=await import('../src/project-files.mjs');
 writeFileSync(join(p.storage.materials_directory,'source.txt'),'source');mkdirSync(join(p.storage.output_directory,'drawings'));
 for(let i=0;i<502;i++)writeFileSync(join(p.storage.output_directory,'drawings',`${String(i).padStart(3,'0')}.txt`),'x');
 const first=await listProjectFiles(store,{...args,area:'成果输出',path:'drawings'});
 assert.equal(first.items.length,500);assert.equal(first.truncated,true);assert.equal(first.next_offset,500);assert.equal(first.items[0].path,'drawings/000.txt');assert.equal(first.items[0].sha256,null);assert.ok(!JSON.stringify(first).includes(p.storage.directory));
 const second=await listProjectFiles(store,{...args,area:'成果输出',path:'drawings',offset:first.next_offset});assert.equal(second.items.length,2);assert.equal(second.truncated,false);assert.equal(second.next_offset,null);
 const hashed=await listProjectFiles(store,{...args,area:'项目资料',hash:true});assert.equal(hashed.items[0].sha256,'41cf6794ba4200b839c53531555f0f3998df4cbb01a4d5cb0b94e3ca5e23947d');
 const big=join(p.storage.materials_directory,'large.bin'),fd=openSync(big,'w');ftruncateSync(fd,50*1024*1024+1);closeSync(fd);
 assert.equal((await listProjectFiles(store,{...args,area:'项目资料',hash:true})).items.find(x=>x.name==='large.bin').sha256,null);
 assert.equal((await listProjectFiles(store,{...args,since:'2099-01-01T00:00:00Z'})).items.length,0);
 await assert.rejects(listProjectFiles(store,{...args,limit:501}));await assert.rejects(listProjectFiles(store,{...args,since:'not-a-date'}));
});

// Catches directory traversal, Windows ADS/device paths and escaped junction reads.
test('file reads enforce the three actual storage areas and text/binary byte limits',async t=>{
 const {store,p,args,dir}=fixture(t),{listProjectFiles,readProjectFile}=await import('../src/project-files.mjs');
 writeFileSync(join(p.storage.materials_directory,'readme.txt'),'入口核对');writeFileSync(join(p.storage.output_directory,'image.png'),Buffer.from([137,80,78,71,0]));
 assert.deepEqual(await readProjectFile(store,{...args,area:'项目资料',path:'readme.txt'}),{content_type:'text/plain; charset=utf-8',text:'入口核对'});
 const image=await readProjectFile(store,{...args,area:'成果输出',path:'image.png'});assert.equal(image.content_type,'image/png');assert.equal(image.data_base64,'iVBORwA=');
 for(const path of ['../private.txt','..\\private.txt','/absolute','C:\\private.txt','C:private.txt','file.txt:secret','.. /private.txt','NUL']){
  await assert.rejects(readProjectFile(store,{...args,area:'项目资料',path}),path);await assert.rejects(listProjectFiles(store,{...args,area:'项目资料',path}),path);
 }
 await assert.rejects(readProjectFile(store,{...args,area:'系统',path:'readme.txt'}));
 for(const [name,size] of [['large.txt',1024*1024+1],['large.png',10*1024*1024+1],['60mb.bin',60*1024*1024]]){const fd=openSync(join(p.storage.working_directory,name),'w');ftruncateSync(fd,size);closeSync(fd);await assert.rejects(readProjectFile(store,{...args,area:'工作文件',path:name}),/文件过大/);}
 const outside=join(dir,'outside');mkdirSync(outside);writeFileSync(join(outside,'secret.txt'),'SECRET');symlinkSync(outside,join(p.storage.materials_directory,'escape'),'junction');
 await assert.rejects(readProjectFile(store,{...args,area:'项目资料',path:'escape/secret.txt'}));assert.ok(!(await listProjectFiles(store,{...args,area:'项目资料'})).items.some(x=>x.path.includes('escape')));
 const other=store.createProject({request_id:randomUUID(),name:'其他目录'}).project;await assert.rejects(readProjectFile(store,{project_id:other.id,area:'项目资料',path:'readme.txt'}));
});

// Catches byte/character confusion at exact limits and implicit global project selection under concurrent reads.
test('file reads accept exact byte limits and concurrent projects keep independent storage',async t=>{
 const {store,p,args}=fixture(t),{readProjectFile,listProjectFiles}=await import('../src/project-files.mjs');
 writeFileSync(join(p.storage.materials_directory,'boundary.txt'),'x'.repeat(1024*1024));
 assert.equal((await readProjectFile(store,{...args,area:'项目资料',path:'boundary.txt'})).text.length,1024*1024);
 writeFileSync(join(p.storage.materials_directory,'unicode.txt'),'入'.repeat(350000));
 await assert.rejects(readProjectFile(store,{...args,area:'项目资料',path:'unicode.txt'}),/文件过大/);
 const other=store.createProject({request_id:randomUUID(),name:'隔离项目B'}).project;
 writeFileSync(join(p.storage.output_directory,'same.txt'),'A');writeFileSync(join(other.storage.output_directory,'same.txt'),'B');
 const values=await Promise.all([readProjectFile(store,{...args,area:'成果输出',path:'same.txt'}),readProjectFile(store,{project_id:other.id,area:'成果输出',path:'same.txt'})]);assert.deepEqual(values.map(x=>x.text),['A','B']);
 const lists=await Promise.all([listProjectFiles(store,{...args,area:'成果输出'}),listProjectFiles(store,{project_id:other.id,area:'成果输出'})]);assert.equal(lists[0].root_label,'隔离协作测试');assert.equal(lists[1].root_label,'隔离项目B');
 await assert.rejects(readProjectFile(store,{...args,area:'成果输出',path:'same.txt '}));await assert.rejects(listProjectFiles(store,{...args,hash:'true'}));
});

function httpGet(port,path,headers={}){return new Promise((resolve,reject)=>{const req=request({hostname:'127.0.0.1',port,path,headers},res=>{const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:JSON.parse(Buffer.concat(chunks).toString()||'null')}));});req.on('error',reject);req.end();});}

// Catches read-only endpoints that initialize/migrate schema, create missing DBs or accept cross-site requests.
test('HTTP API uses read-only SQLite, validates loopback requests and rejects retired map routes',async t=>{
 const {dbPath,store,p,dir}=fixture(t),{createProjectReadApiHandler}=await import('../src/project-read-api.mjs');
 writeFileSync(join(p.storage.output_directory,'answer.txt'),'42');store.close();
 const before=readFileSync(dbPath),handler=createProjectReadApiHandler({dbPath,});
 const server=createServer(async(req,res)=>{if(!await handler(req,res)){res.writeHead(404);res.end('{}');}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));handler.close();});
 const url=`/api/project-progress?project_id=${p.id}`,progress=await httpGet(port,url);assert.equal(progress.status,200);assert.equal(progress.body.project.id,p.id);assert.equal(progress.body.project.method_version,null);
 assert.equal((await httpGet(port,'/api/project-progress')).status,400);
 const listed=await httpGet(port,`/api/project-files?project_id=${p.id}&area=${encodeURIComponent('成果输出')}`);assert.equal(listed.body.items[0].sha256,null);
 const hashed=await httpGet(port,`/api/project-files?project_id=${p.id}&area=${encodeURIComponent('成果输出')}&hash=true`);assert.equal(hashed.body.items[0].sha256,'73475cb40a568e8da8a045ced110137e159f890ac4da883b6b17dc651b3a8049');
 assert.equal((await httpGet(port,`/api/project-files?project_id=${p.id}&hash=1`)).status,400);
 const read=await httpGet(port,`/api/project-file?project_id=${p.id}&area=${encodeURIComponent('成果输出')}&path=answer.txt`);assert.equal(read.body.text,'42');
 assert.equal((await httpGet(port,url,{Host:'evil.example'})).status,403);assert.equal((await httpGet(port,url,{Origin:'https://evil.example'})).status,403);assert.equal((await httpGet(port,url,{'Sec-Fetch-Site':'cross-site'})).status,403);
 assert.equal((await httpGet(port,'/api/map-tile?provider=osm&z=1&x=0&y=0')).status,404);
 const bad=await httpGet(port,`/api/project-file?project_id=${p.id}&area=${encodeURIComponent('成果输出')}&path=..%2Fprivate.txt`);assert.equal(bad.status,400);assert.ok(!JSON.stringify(bad.body).includes(dir));
 handler.close();assert.deepEqual(readFileSync(dbPath),before);
 const missing=join(dir,'missing.db'),unavailable=createProjectReadApiHandler({dbPath:missing});const unbound=createServer(async(req,res)=>{await unavailable(req,res);});await new Promise(resolve=>unbound.listen(0,'127.0.0.1',resolve));
 try{assert.equal((await httpGet(unbound.address().port,url)).status,503);assert.equal(existsSync(missing),false);}finally{await new Promise(resolve=>unbound.close(resolve));unavailable.close();}
});
