import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createWorkbenchServer,resourceUri} from '../src/server.mjs';

test('本地仅保留数据服务，不再注册重复工作台入口或页面资源',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'kg-sidebar-'));
 const {server,store}=createWorkbenchServer({dbPath:join(dir,'test.db')});
 const client=new Client({name:'ISOLATED SIDEBAR METADATA TEST',version:'1'});
 t.after(async()=>{await client.close();await server.close();store.close();const target=resolve(dir);assert.ok(target.startsWith(resolve(tmpdir())+sep)&&target.split(sep).at(-1).startsWith('kg-sidebar-'));rmSync(target,{recursive:true,force:true});});
 const [a,b]=InMemoryTransport.createLinkedPair();await server.connect(a);await client.connect(b);
 const tools=(await client.listTools()).tools;
 const entry=tools.find(tool=>tool.name==='kg_open_workbench');
 assert.equal(entry._meta['openai/ui'],undefined);
 assert.equal(entry.annotations.readOnlyHint,true);
 assert.equal(entry._meta.ui.resourceUri,undefined);
 assert.equal(entry._meta['openai/outputTemplate'],undefined);
 assert.deepEqual(entry._meta.ui.visibility,['model']);
 assert.ok(tools.every(tool=>!tool._meta?.['openai/ui']?.entrypoints));
 const result=await client.callTool({name:'kg_open_workbench',arguments:{}});
 assert.ok(!result.isError);assert.equal(result._meta.workbench.projects.length,0);
 assert.equal(result._meta.workbench.tasks.length,0);
 assert.equal(client.getServerCapabilities().resources,undefined);
 await assert.rejects(client.readResource({uri:resourceUri}));
});
