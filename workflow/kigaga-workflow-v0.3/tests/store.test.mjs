import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {ProjectStore} from '../src/store.mjs';

function fixture(t) {
  const dir=mkdtempSync(join(tmpdir(),'kg-v2-'));
  const path=join(dir,'test.db');
  const store=new ProjectStore(path);
  t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
  const project=store.createProject({request_id:randomUUID(),name:'隔离测试项目',summary:'测试数据'}).project;
  return {store,project,path};
}
const result=title=>({title,narrative:'只依据所选资料。',facts:['已知为改造'],assumptions:[],questions:['请确认用途'],actions:['补充现状照片']});
function prepare(store,project,extra={}) {
  return store.prepareTask({request_id:randomUUID(),project_id:project.id,stage_id:'opportunity',material_ids:[],instruction:'评估改造机会',output:'分析与行动建议',...extra});
}

test('只携带所选资料，后续资料修改不会改变已下发任务',t=>{
  const {store,project}=fixture(t);
  const m=store.addMaterial({request_id:randomUUID(),project_id:project.id,title:'访谈',content:'原始资料'}).materials[0];
  store.addMaterial({request_id:randomUUID(),project_id:project.id,title:'未选资料',content:'不得进入任务'});
  const task=prepare(store,project,{material_ids:[m.id]});
  store.updateMaterial({material_id:m.id,expected_version:1,title:'访谈更新',content:'修改后的资料'});
  assert.equal(store.getTask(task.id).materials.length,1);
  assert.equal(store.getTask(task.id).materials[0].content,'原始资料');
  assert.equal(store.snapshot(project.id).materials.find(x=>x.id===m.id).version,2);
  assert.throws(()=>store.updateMaterial({material_id:m.id,expected_version:1,title:'旧版本',content:'不应覆盖'}),/版本/);
});

test('拒绝其他项目资料且失败不创建任务',t=>{
  const {store,project}=fixture(t);
  const other=store.createProject({request_id:randomUUID(),name:'另一项目'}).project;
  const m=store.addMaterial({request_id:randomUUID(),project_id:other.id,title:'私有资料',content:'其他项目'}).materials[0];
  assert.throws(()=>prepare(store,project,{material_ids:[m.id]}),/项目/);
  assert.equal(store.snapshot(project.id).tasks.length,0);
});

test('关闭重开后保留成果历史，旧版本不能覆盖新版本',t=>{
  const {store,project,path}=fixture(t);
  const task=prepare(store,project);
  const first=store.saveResult({task_id:task.id,expected_revision:0,result:result('第一版')});
  assert.equal(first.revision,1);
  assert.equal(store.saveResult({task_id:task.id,expected_revision:0,result:result('第一版')}).revision,1);
  assert.throws(()=>store.saveResult({task_id:task.id,expected_revision:0,result:result('错误覆盖')}),/版本/);
  store.saveResult({task_id:task.id,expected_revision:1,result:result('第二版')});
  store.close();
  const reopened=new ProjectStore(path);
  try {
    const saved=reopened.getTask(task.id);
    assert.equal(saved.status,'completed');
    assert.deepEqual(saved.history.map(x=>x.result.title),['第一版','第二版']);
    assert.equal(reopened.markAccepted({task_id:task.id}).status,'completed');
  } finally {reopened.close();}
});

test('相同任务重试不重复创建，内容改变必须用新请求编号',t=>{
  const {store,project}=fixture(t);
  const input={request_id:randomUUID(),project_id:project.id,stage_id:'opportunity',material_ids:[],instruction:'改造',output:'建议'};
  const a=store.prepareTask(input),b=store.prepareTask(input);
  assert.equal(a.id,b.id);
  assert.equal(a.status,'prepared');
  assert.throws(()=>store.prepareTask({...input,instruction:'换了内容'}),/请求/);
  assert.equal(store.markAccepted({task_id:a.id}).status,'message_accepted');
  assert.equal(store.snapshot(project.id).tasks.length,1);
});

test('不同数据库连接不能覆盖已经提交的成果版本',t=>{
  const {store,project,path}=fixture(t);
  const task=prepare(store,project);
  const second=new ProjectStore(path);
  try {
    store.saveResult({task_id:task.id,expected_revision:0,result:result('版本一')});
    assert.throws(()=>second.saveResult({task_id:task.id,expected_revision:0,result:result('冲突版本')}),/版本/);
    assert.equal(second.getTask(task.id).result.title,'版本一');
  } finally {second.close();}
});

test('项目与资料创建可以安全重试，空指令或未知阶段会拒绝',t=>{
  const {store,project}=fixture(t);
  const input={request_id:randomUUID(),name:'重试项目',summary:'测试'};
  assert.equal(store.createProject(input).project.id,store.createProject(input).project.id);
  assert.throws(()=>store.createProject({...input,name:'不同项目'}),/请求/);
  const m={request_id:randomUUID(),project_id:project.id,title:'任务书',content:'未知预算'};
  const first=store.addMaterial(m).materials[0];
  assert.equal(store.addMaterial(m).materials[0].id,first.id);
  assert.throws(()=>prepare(store,project,{instruction:' '}));
  assert.throws(()=>prepare(store,project,{stage_id:'unknown'}));
  assert.equal(store.snapshot(project.id).tasks.length,0);
});

test('资料版本与任务快照保留原文首尾及缩进空白',t=>{
  const {store,project}=fixture(t);
  const original='\n  第一行\n    缩进内容\n';
  const updated='  更新后\n\t制表符缩进\n\n';
  const material=store.addMaterial({request_id:randomUUID(),project_id:project.id,title:'保真资料',content:original}).materials[0];
  const firstTask=prepare(store,project,{material_ids:[material.id]});

  store.updateMaterial({material_id:material.id,expected_version:1,title:'保真资料',content:updated});
  const secondTask=prepare(store,project,{material_ids:[material.id]});

  assert.equal(store.getTask(firstTask.id).materials[0].content,original);
  assert.equal(store.snapshot(project.id).materials[0].content,updated);
  assert.equal(store.getTask(secondTask.id).materials[0].content,updated);
});

test('资料内容只有空白时仍会被拒绝',t=>{
  const {store,project}=fixture(t);
  assert.throws(()=>store.addMaterial({request_id:randomUUID(),project_id:project.id,title:'空资料',content:' \n\t '}));
  assert.equal(store.snapshot(project.id).materials.length,0);
});
