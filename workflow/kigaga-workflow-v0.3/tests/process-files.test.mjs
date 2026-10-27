import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {randomUUID} from 'node:crypto';
import {WorkflowStore} from '../src/workflow-store.mjs';
import {listProjectFiles,readProjectFile} from '../src/project-files.mjs';
import {createProjectReadApiHandler} from '../src/project-read-api.mjs';
function fixture(t){
 const dir=mkdtempSync(join(tmpdir(),'ki-reference-130-')),reference=join(dir,'reference');mkdirSync(reference);writeFileSync(join(reference,'参考.md'),'参考原件');
 const s=new WorkflowStore(join(dir,'test.db'),{referenceRoots:[{label:'测试参考',path:reference}]});const p=s.createProject({request_id:randomUUID(),name:'隔离参考边界'}).project;
 t.after(()=>{s.close();assert.ok(resolve(dir).startsWith(resolve(tmpdir())+sep));rmSync(dir,{recursive:true,force:true});});return {s,p,reference,dir};
}
test('S7 第四区参考库只读，清单相对且读取不改原件，拒绝越界和目录链接',async t=>{
 const {s,p,reference,dir}=fixture(t),args={project_id:p.id,area:'参考库',library:'测试参考'};
 const before=readFileSync(join(reference,'参考.md'));
 const listed=await listProjectFiles(s,args);assert.equal(listed.items[0].path,'参考.md');assert.equal(listed.items[0].library,'测试参考');assert.doesNotMatch(JSON.stringify(listed),/[A-Z]:\\/i);
 assert.equal((await readProjectFile(s,{...args,path:'参考.md'})).text,'参考原件');assert.deepEqual(readFileSync(join(reference,'参考.md')),before);
 for(const path of ['../test.db','C:\\outside.md','/outside.md'])await assert.rejects(()=>readProjectFile(s,{...args,path}));
 const outside=join(dir,'outside');mkdirSync(outside);writeFileSync(join(outside,'outside.md'),'private');symlinkSync(outside,join(reference,'escape'),process.platform==='win32'?'junction':'dir');
 await assert.rejects(()=>readProjectFile(s,{...args,path:'escape/outside.md'}),/链接/);
 assert.throws(()=>s.registerArtifact({request_id:randomUUID(),project_id:p.id,title:'参考不能登记为项目输出',path:join(reference,'参考.md')}),/参考库|目录范围/);
});
test('HTTP读取层不再处理地图路由，且未处理请求不会打开数据库',async()=>{
 const handler=createProjectReadApiHandler({dbPath:'does-not-exist.db'});
 assert.equal(await handler({url:'/api/map-tile?provider=osm',socket:{}},{}),false);
 assert.equal(await handler({url:'/api/map-vectors',socket:{}},{}),false);handler.close();
});
