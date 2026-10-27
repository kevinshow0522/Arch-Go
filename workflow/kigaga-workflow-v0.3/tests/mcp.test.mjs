import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createWorkbenchServer} from '../src/server.mjs';

test('MCP 往返保存结构化成果，界面快照不把未选资料传给模型',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'kg-mcp-'));
  const {server,store}=createWorkbenchServer({dbPath:join(dir,'test.db')});
  const client=new Client({name:'local-integration-test',version:'1'});
  t.after(async()=>{await client.close();await server.close();store.close();rmSync(dir,{recursive:true,force:true});});
  const [a,b]=InMemoryTransport.createLinkedPair();await server.connect(a);await client.connect(b);
  const call=(name,args)=>client.callTool({name,arguments:args});
  const p=await call('kg_create_project',{name:'MCP 测试项目',request_id:randomUUID()});
  const project=p._meta.workbench.project;
  const material=await call('kg_add_material',{project_id:project.id,title:'选中资料',content:'selected text',request_id:randomUUID()});
  await call('kg_add_material',{project_id:project.id,title:'未选资料',content:'UNSELECTED-PRIVATE-CONTENT',request_id:randomUUID()});
  const snap=await call('kg_open_workbench',{project_id:project.id});
  assert.equal(snap._meta.workbench.materials.length,2);
  assert.ok(!JSON.stringify(snap.structuredContent).includes('UNSELECTED-PRIVATE-CONTENT'));
  const prepared=await call('kg_prepare_task',{project_id:project.id,stage_id:'opportunity',material_ids:[material._meta.workbench.materials[0].id],instruction:'只分析所选资料',output:'机会简析',request_id:randomUUID()});
  const task=prepared.structuredContent.task;
  assert.equal(task.materials.length,1);
  const saved=await call('kg_save_result',{executor:'gpt',task_id:task.id,expected_revision:0,result:{title:'测试回填',narrative:'测试，不是模型产出。',facts:['selected text'],assumptions:[],questions:['待核实'],actions:['补充资料']}});
  assert.equal(saved.structuredContent.task.revision,1);
  assert.equal((await call('kg_get_task',{task_id:task.id})).structuredContent.task.result.title,'测试回填');
  assert.equal((await call('kg_save_result',{executor:'gpt',task_id:task.id,expected_revision:0,result:{title:'错误覆盖',narrative:'',facts:[],assumptions:[],questions:[],actions:[]}})).isError,true);
  const tools=(await client.listTools()).tools;
  assert.deepEqual(tools.find(t=>t.name==='kg_save_result')._meta.ui.visibility,['model']);
  assert.equal(tools.find(t=>t.name==='kg_open_workbench')._meta.ui.resourceUri,undefined);
});

test('真实 stdio 进程重启后可读取项目与任务',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'kg-stdio-v2-'));
  const connections=[];
  t.after(async()=>{for(const c of connections)await c.close();rmSync(dir,{recursive:true,force:true});});
  async function connect(){
    const client=new Client({name:'stdio-test',version:'1'});connections.push(client);
    await client.connect(new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../src/server.mjs',import.meta.url))],env:{...process.env,KIGAGA_DB_PATH:join(dir,'test.db')}}));return client;
  }
  const a=await connect();
  const p=await a.callTool({name:'kg_create_project',arguments:{name:'进程重启测试',request_id:randomUUID()}});
  const id=p._meta.workbench.project.id;
  await a.close();
  const b=await connect();
  const snap=await b.callTool({name:'kg_open_workbench',arguments:{project_id:id}});
  assert.equal(snap._meta.workbench.project.name,'进程重启测试');
});
