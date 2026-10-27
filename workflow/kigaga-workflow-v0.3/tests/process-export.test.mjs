import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {WorkflowStore} from '../src/workflow-store.mjs';
test('进度导出只读，保留完整交接与旧项目缺项，清除绝对本机路径',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'ki-export-130-')),path=join(dir,'test.db'),s=new WorkflowStore(path);
 t.after(()=>{s.close();assert.ok(resolve(dir).startsWith(resolve(tmpdir())+sep));rmSync(dir,{recursive:true,force:true});});
 const p=s.createProject({request_id:randomUUID(),name:'导出测试'}).project;
 s.saveRecord({request_id:randomUUID(),project_id:p.id,kind:'handoff',title:'交接',status:'active',content:JSON.stringify({from:'claude',to:'gpt',work_package:'W3.4',done:'完成判断',next:'研究案例',waiting_on_user:['核对 C:\\private\\input.md'],files:['成果输出/判断.md']})});
 s.close();const before=readFileSync(path),db=new DatabaseSync(path,{readOnly:true});
 try{
  const mod=await import('../scripts/export-progress.mjs').catch(e=>e.code==='ERR_MODULE_NOT_FOUND'?{}:Promise.reject(e));
  assert.equal(typeof mod.buildProgressExport,'function');
  const output=mod.buildProgressExport(db,{project_id:p.id});assert.equal(output.method_version,'1.30');
  assert.equal(output.projects[0].project.method_version,null);assert.equal(output.projects[0].handoffs[0].next,'研究案例');
  assert.equal(output.projects[0].handoffs[0].files[0],'成果输出/判断.md');assert.doesNotMatch(JSON.stringify(output),/private|[A-Z]:\\/i);
 }finally{db.close();}
 assert.deepEqual(readFileSync(path),before);
});
