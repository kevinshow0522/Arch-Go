import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {join,resolve,relative} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {WorkflowStore} from '../src/workflow-store.mjs';
import {createWorkbenchServer} from '../src/server.mjs';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
function fixture(t){
 const dir=mkdtempSync(join(tmpdir(),'kg-storage-')),root=join(dir,'设计项目');mkdirSync(root);
 const db=join(dir,'system','data.db'),store=new WorkflowStore(db,{projectsRoot:root}),cleanup=[];
 t.after(async()=>{for(const close of cleanup)await close();store.close();const rel=relative(resolve(tmpdir()),resolve(dir));assert.ok(rel&&!rel.startsWith('..'));rmSync(dir,{recursive:true,force:true});});
 return {dir,root,db,store,cleanup};
}
test('project folders reuse an existing named folder, separate duplicate names, and survive rename/reopen',t=>{
 const {root,db,store:s}=fixture(t);mkdirSync(join(root,'37 山西室内设计项目'));writeFileSync(join(root,'37 山西室内设计项目','原有图纸.txt'),'keep');
 const p=s.createProject({name:'37 山西室内设计项目',request_id:randomUUID()}).project;
 assert.equal(p.storage?.directory,join(root,'37 山西室内设计项目'));
 assert.ok(existsSync(p.storage.output_directory));
 const q=s.createProject({name:p.name,request_id:randomUUID()}).project;assert.notEqual(q.storage.directory,p.storage.directory);
 s.updateProject({project_id:p.id,request_id:randomUUID(),expected_context_version:s.project(p.id).context_version,name:'已更名',summary:''});
 const reopened=new WorkflowStore(db,{projectsRoot:root});try{assert.equal(reopened.project(p.id).storage.directory,p.storage.directory);}finally{reopened.close();}
 assert.equal(readFileSync(join(p.storage.directory,'原有图纸.txt'),'utf8'),'keep');
});
test('exports use the owning project folder, preserve revisions and never overwrite user edits',t=>{
 const {root,store:s}=fixture(t),p=s.createProject({name:'入口研究',request_id:randomUUID()}).project,q=s.createProject({name:'其他项目',request_id:randomUUID()}).project;
 const task=s.prepareTask({project_id:p.id,material_ids:[],instruction:'分析入口',output:'结果',stage_ids:[],request_id:randomUUID()});
 const result={title:'入口分析',narrative:'第一版内容',facts:[],assumptions:[],questions:[],actions:[]};
 s.saveResult({task_id:task.id,expected_revision:0,result});
 const first=s.exportResult({project_id:p.id,task_id:task.id});assert.ok(first.path.startsWith(p.storage.output_directory));assert.ok(readFileSync(first.path,'utf8').includes('第一版内容'));
 assert.equal(s.exportResult({project_id:p.id,task_id:task.id}).path,first.path);
 assert.throws(()=>s.exportResult({project_id:q.id,task_id:task.id}),/不属于/);
 assert.throws(()=>s.registerArtifact({project_id:q.id,path:first.path,title:'不应串项目',request_id:randomUUID()}),/目录/);
 writeFileSync(first.path,'用户手改');assert.throws(()=>s.exportResult({project_id:p.id,task_id:task.id}),/修改|覆盖/);
 s.saveResult({task_id:task.id,expected_revision:1,result:{...result,narrative:'第二版内容'}});
 const second=s.exportResult({project_id:p.id,task_id:task.id});assert.notEqual(second.path,first.path);assert.equal(readFileSync(first.path,'utf8'),'用户手改');
 assert.ok(readFileSync(second.path,'utf8').includes('第二版内容'));
 assert.equal(s.getContext({project_id:p.id}).project.storage.output_directory,p.storage.output_directory);
 assert.throws(()=>s.prepareProjectStorage({project_id:p.id,directory:join(root,'..','outside')}),/目录|绑定/);
});
test('MCP saves an actual file with each result and exposes its project directory',async t=>{
 const {root,db,cleanup}=fixture(t),{server,store}=createWorkbenchServer({dbPath:db,projectsRoot:root});
 const c=new Client({name:'storage-test',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();
 await server.connect(a);await c.connect(b);cleanup.push(async()=>{await c.close();await server.close();store.close();});
 const call=async(name,args)=>{const r=await c.callTool({name,arguments:args});assert.ok(!r.isError,JSON.stringify(r));return r.structuredContent;};
 const p=(await call('kg_create_project',{request_id:randomUUID(),name:'MCP 文件项目'})).project;
 const task=(await call('kg_prepare_task',{project_id:p.id,request_id:randomUUID(),instruction:'分析',output:'结果',material_ids:[]})).task;
 const saved=await call('kg_save_result',{executor:'gpt',task_id:task.id,expected_revision:0,result:{title:'MCP 输出',narrative:'写入项目盘',facts:[],assumptions:[],questions:[],actions:[]}});
 assert.equal(saved.file_export.saved,true);assert.ok(saved.file_export.path.startsWith(p.storage.output_directory));
 assert.ok(readFileSync(saved.file_export.path,'utf8').includes('写入项目盘'));
 assert.equal((await call('kg_export_result',{project_id:p.id,task_id:task.id})).path,saved.file_export.path);
});
