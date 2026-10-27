import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {WorkflowStore} from '../src/workflow-store.mjs';
test('storage migration preserves source and task revisions, creates a verified backup and exports into the destination project',t=>{
 const dir=mkdtempSync(join(tmpdir(),'kg-migration-')),old=join(dir,'old.db'),root=join(dir,'设计项目'),target=join(root,'_KiGAGA系统','database','workflow.db'),backups=join(root,'_KiGAGA系统','backups');mkdirSync(root);
 t.after(()=>{const rel=relative(resolve(tmpdir()),resolve(dir));assert.ok(rel&&!rel.startsWith('..'));rmSync(dir,{recursive:true,force:true});});
 const s=new WorkflowStore(old),p=s.createProject({name:'旧项目',request_id:randomUUID()}).project;
 const task=s.prepareTask({project_id:p.id,request_id:randomUUID(),material_ids:[],instruction:'分析',output:'判断'});
 s.saveResult({task_id:task.id,expected_revision:0,result:{title:'旧成果',narrative:'必须保留的内容',facts:[],assumptions:[],questions:[],actions:[]}});s.close();
 const sourceBytes=readFileSync(old);
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/migrate-project-data.mjs',import.meta.url)),old,target,root,backups],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);assert.deepEqual(readFileSync(old),sourceBytes);
 const report=JSON.parse(readFileSync(join(backups,'migration-report.json'),'utf8'));
 assert.equal(report.projects[0].id,p.id);assert.ok(report.exports[0].path.startsWith(root));
 assert.ok(readFileSync(report.exports[0].path,'utf8').includes('必须保留的内容'));
 const migrated=new WorkflowStore(target,{projectsRoot:root});try{assert.equal(migrated.getTask(task.id).revision,1);assert.equal(migrated.getTask(task.id).result.narrative,'必须保留的内容');}finally{migrated.close();}
 const retry=spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/migrate-project-data.mjs',import.meta.url)),old,target,root,backups],{encoding:'utf8'});assert.notEqual(retry.status,0);assert.ok(retry.stderr.includes('拒绝覆盖'));
});
