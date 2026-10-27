import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,mkdirSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
async function fixture(t){
 const dir=mkdtempSync(join(tmpdir(),'kg-headless-'));const clients=[];mkdirSync(join(dir,'artifacts'));
 t.after(async()=>{for(const c of clients)await c.close();rmSync(dir,{recursive:true,force:true});});
 async function connect(){const c=new Client({name:'workflow-test-not-GPT',version:'1'});clients.push(c);await c.connect(new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../src/server.mjs',import.meta.url))],env:{...process.env,KIGAGA_DB_PATH:join(dir,'project.db')},stderr:'pipe'}));return c;}
 const c=await connect();const call=async(name,args)=>{const v=await c.callTool({name,arguments:args});assert.ok(!v.isError,JSON.stringify(v));return v.structuredContent;};
 return {dir,c,connect,call};
}
const result={title:'入口分析',narrative:'OUTCOME-BODY',facts:['保持结构'],assumptions:[],questions:[],actions:['比较动线']};
test('native MCP performs headless create, checkpoint, restart and current-context resume',async t=>{
 const {c,call,connect}=await fixture(t);const names=(await c.listTools()).tools;
 assert.ok(names.some(x=>x.name==='kg_get_context'),'headless context tool must exist');
 for(const name of ['kg_get_context','kg_save_record','kg_checkpoint_task','kg_find_projects'])assert.equal(names.find(x=>x.name===name)._meta?.ui?.resourceUri,undefined);
 const created=await call('kg_create_project',{request_id:randomUUID(),name:'续接测试'});const pid=created.project.id;
 const sub=await call('kg_save_record',{request_id:randomUUID(),project_id:pid,kind:'subproject',title:'入口研究',content:'范围：人车入口',status:'active'});
 const mat=await call('kg_add_material',{request_id:randomUUID(),project_id:pid,title:'业主要求',content:'MATERIAL-BODY-PRIVATE'});
 const a=(await call('kg_prepare_task',{request_id:randomUUID(),project_id:pid,subproject_id:sub.id,stage_ids:['site'],material_ids:[mat.materials.at(-1).id],instruction:'比较入口',output:'入口判断'})).task;
 const saved=(await call('kg_save_result',{executor:'gpt',task_id:a.id,expected_revision:0,result})).task;assert.equal(saved.status,'in_progress');
 const ctx=await call('kg_get_context',{project_id:pid,task_id:a.id});assert.ok(!JSON.stringify(ctx).includes('MATERIAL-BODY-PRIVATE'));
 const args={executor:'gpt',request_id:randomUUID(),task_id:a.id,expected_state_version:ctx.task.state_version,expected_context_version:ctx.context_version,status:'in_progress',checkpoint:{summary:'已比较两个方向',done:['初步比较'],next:'比较入口动线',blockers:[],checks:['核对所选资料']}};
 const first=await call('kg_checkpoint_task',args);const retry=await call('kg_checkpoint_task',args);assert.equal(first.state_version,retry.state_version);
 await c.close();const next=await connect();const resume=await next.callTool({name:'kg_get_context',arguments:{project_id:pid,task_id:a.id}});
 assert.equal(resume.structuredContent.task.checkpoint.next,'比较入口动线');assert.equal(resume.structuredContent.scope.title,'入口研究');
 const read=await next.callTool({name:'kg_read_result',arguments:{project_id:pid,task_id:a.id,revision:1}});assert.ok(read.structuredContent.content.includes('OUTCOME-BODY'));
});
test('project summary updates reject stale context and stay visible across future reads',async t=>{
 const {call,c}=await fixture(t);assert.ok((await c.listTools()).tools.some(x=>x.name==='kg_update_project'));
 const p=(await call('kg_create_project',{request_id:randomUUID(),name:'旧名称'})).project;
 const ctx=await call('kg_get_context',{project_id:p.id});
 const input={request_id:randomUUID(),project_id:p.id,expected_context_version:ctx.context_version,name:'新名称',summary:'当前目标：研究入口'};
 await call('kg_update_project',input);const latest=await call('kg_get_context',{project_id:p.id});assert.equal(latest.project.summary,'当前目标：研究入口');
 const failed=await c.callTool({name:'kg_update_project',arguments:{...input,request_id:randomUUID(),summary:'旧摘要覆盖'}});assert.equal(failed.isError,true);
});
test('artifact registry verifies file existence, project isolation, configured roots and changed bytes',async t=>{
 const {dir,call,c}=await fixture(t);assert.ok((await c.listTools()).tools.some(x=>x.name==='kg_register_artifact'));
 const p=(await call('kg_create_project',{request_id:randomUUID(),name:'文件验证'})).project;
 const path=join(dir,'artifacts','analysis.md');writeFileSync(path,'已生成成果');
 const r=await call('kg_register_artifact',{request_id:randomUUID(),project_id:p.id,title:'分析底稿',path});
 assert.equal((await call('kg_check_artifact',{project_id:p.id,artifact_id:r.id})).matches_registered_version,true);
 writeFileSync(path,'用户直接修改');assert.equal((await call('kg_check_artifact',{project_id:p.id,artifact_id:r.id})).matches_registered_version,false);
 const outside=join(dir,'outside.md');writeFileSync(outside,'outside');let linked=join(dir,'artifacts','link.md');
 try{symlinkSync(outside,linked);}catch(error){if(process.platform!=='win32'||error.code!=='EPERM')throw error;const outsideDir=join(dir,'outside-directory');mkdirSync(outsideDir);writeFileSync(join(outsideDir,'outside.md'),'outside');const junction=join(dir,'artifacts','outside-junction');symlinkSync(outsideDir,junction,'junction');linked=join(junction,'outside.md');}
 for(const path of [outside,join(dir,'artifacts','missing.md'),linked])assert.equal((await c.callTool({name:'kg_register_artifact',arguments:{request_id:randomUUID(),project_id:p.id,title:'应拒绝',path}})).isError,true);
 const other=(await call('kg_create_project',{request_id:randomUUID(),name:'其他项目'})).project;assert.equal((await c.callTool({name:'kg_check_artifact',arguments:{project_id:other.id,artifact_id:r.id}})).isError,true);
 rmSync(path);assert.equal((await call('kg_check_artifact',{project_id:p.id,artifact_id:r.id})).available,false);
});
test('all material IDs remain discoverable through paginated model tools',async t=>{
 const {call}=await fixture(t);const p=(await call('kg_create_project',{request_id:randomUUID(),name:'资料分页'})).project;const expected=[];
 for(let i=0;i<41;i++){const s=await call('kg_add_material',{request_id:randomUUID(),project_id:p.id,title:`资料${i}`,content:'BODY-SECRET'});expected.push(s.materials.at(-1).id);}
 const ctx=await call('kg_get_context',{project_id:p.id,max_chars:30000});assert.equal(ctx.read_tools.material_index,'kg_list_materials');
 const found=[];let offset=0;do{const page=await call('kg_list_materials',{project_id:p.id,offset,limit:20});assert.ok(!JSON.stringify(page).includes('BODY-SECRET'));found.push(...page.items.map(x=>x.id));offset=page.next_offset;}while(offset!==null);
 assert.deepEqual(found,expected);
});
test('overflow can recover pinned record and dependency relationships',async t=>{
 const {call}=await fixture(t);const p=(await call('kg_create_project',{request_id:randomUUID(),name:'超预算续接'})).project;
 const note=await call('kg_save_record',{request_id:randomUUID(),project_id:p.id,kind:'note',title:'指定依据',content:'NOTE',status:'active'});
 const make=extra=>call('kg_prepare_task',{request_id:randomUUID(),project_id:p.id,instruction:'研究',output:'判断',material_ids:[],...extra});const a=(await make({})).task;const b=(await make({dependency_ids:[a.id],record_ids:[note.id]})).task;
 for(let i=0;i<3;i++)await call('kg_save_record',{request_id:randomUUID(),project_id:p.id,kind:'condition',title:`约束${i}`,content:'X'.repeat(11000),status:'pending'});
 const ctx=await call('kg_get_context',{project_id:p.id,task_id:b.id,max_chars:30000});assert.equal(ctx.ready,false);
 const detail=(await call('kg_get_task',{task_id:b.id})).task;assert.deepEqual(detail.dependencies,[{task_id:a.id,revision:0}]);assert.deepEqual(detail.record_refs,[{id:note.id,version:1}]);
});
