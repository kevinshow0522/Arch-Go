import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {randomUUID} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createWorkbenchServer} from '../src/server.mjs';
async function fixture(t){
 const dir=mkdtempSync(join(tmpdir(),'ki-service-130-')),{server,store}=createWorkbenchServer({dbPath:join(dir,'test.db')});
 const client=new Client({name:'isolated-process-test',version:'1'}),[ct,st]=InMemoryTransport.createLinkedPair();
 await server.connect(st);await client.connect(ct);
 t.after(async()=>{await client.close();await server.close();store.close();assert.ok(resolve(dir).startsWith(resolve(tmpdir())+sep));rmSync(dir,{recursive:true,force:true});});
 const call=(name,args={})=>client.callTool({name,arguments:args});
 return {client,store,call};
}
test('方法版本进入连接与快照，所有写工具拒绝明确不一致的方法版本',async t=>{
 const {client,call}=await fixture(t);
 assert.equal((await call('kg_get_connection')).structuredContent.method_version,'1.30');
 const bad=await call('kg_create_project',{request_id:randomUUID(),name:'不应创建',method_version:'1.20'});
 assert.equal(bad.isError,true);assert.match(bad.content[0].text,/方法已更新.*重新加载/);
 const created=await call('kg_create_project',{request_id:randomUUID(),name:'隔离项目',method_version:'1.30'});assert.ok(!created.isError,JSON.stringify(created));
 assert.equal(created._meta.workbench.project.method_version,'1.30');
 const id=created._meta.workbench.project.id;
 const snapshot=await call('kg_open_workbench',{project_id:id});assert.equal(snapshot.structuredContent.method_version,'1.30');assert.equal(snapshot._meta.workbench.method_version,'1.30');
 assert.ok((await client.listTools()).tools.some(t=>t.name==='kg_add_dependency'));
});
test('地图工具及网络权限已撤除，工作台工具仍是只读',async t=>{
 const {client,call}=await fixture(t),tools=(await client.listTools()).tools;
 assert.ok(!tools.some(t=>/map|地图|图块/.test(t.name+' '+t.description)));
 assert.equal(tools.find(t=>t.name==='kg_open_workbench').annotations.readOnlyHint,true);
 assert.ok(tools.filter(t=>t.annotations.readOnlyHint===false).every(t=>!t._meta.ui.visibility.includes('app')),'写工具不向工作台应用开放');
 assert.equal(client.getServerCapabilities().resources,undefined);
 await assert.rejects(client.readResource({uri:'ui://kigaga/workbench-v03.html'}));
 assert.equal((await call('kg_get_map_vectors',{bbox:[116,39,116.01,39.01]})).isError,true);
});
test('章末摘要和交接从服务进入工作台快照，同时保留旧项目方法未记录状态',async t=>{
 const {store,call}=await fixture(t),p=store.createProject({request_id:randomUUID(),name:'历史项目'}).project;
 const r=await call('kg_save_record',{request_id:randomUUID(),project_id:p.id,kind:'chapter_summary',title:'章末03.8',status:'active',method_version:'1.30',content:JSON.stringify({chapter:'03',item:'03.8',summary:'仅北侧可到达',status:'待确认'})});assert.ok(!r.isError,JSON.stringify(r));
 const s=(await call('kg_open_workbench',{project_id:p.id}))._meta.workbench;
 assert.equal(s.chapter_summaries[0].summary,'仅北侧可到达');assert.equal(s.project.recorded_method_version,null);
});
