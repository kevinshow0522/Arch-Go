import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('standalone workbench declares UTF-8 before any styles or project text',()=>{
  const bytes=readFileSync(new URL('../assets/workbench.html',import.meta.url));
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  assert.match(text.slice(0,1024),/<meta\s+charset=["']utf-8["']/i);
  assert.match(text,/<html\s+lang=["']zh-CN["']/i);
});

test('multi-stage tasks count once globally; paused and review work stay incomplete',async()=>{
  const {taskProgress,tasksForStage}=await import('../web/dashboard-model.mjs');
  const tasks=[
    {id:'a',stage_ids:['positioning','site'],status:'completed'},
    {id:'b',stage_ids:['site'],status:'needs_review'},
    {id:'c',stage_ids:['site'],status:'paused'},
    {id:'d',stage_ids:['site'],status:'cancelled'},
  ];
  assert.deepEqual(taskProgress(tasks),{total:3,completed:1,remaining:2,cancelled:1,percent:33});
  assert.equal(tasksForStage(tasks,'positioning').length,1);
  assert.equal(tasksForStage(tasks,'site').length,4);
  assert.equal(taskProgress([]).percent,0);
  assert.equal(taskProgress([{id:'a',status:'in_progress',revision:2}]).completed,0);
});

test('stage progress never treats completing one task as approval of the whole stage',async()=>{
  const {stageProgress}=await import('../web/dashboard-model.mjs');
  const stage=stageProgress([{id:'a',stage_ids:['site'],status:'completed'}],'site');
  assert.equal(stage.percent,100);
  assert.equal(stage.stageComplete,false);
  assert.equal(stage.status,'阶段待确认');
  assert.equal(stage.tone,'red');
  assert.equal(stageProgress([],'site').status,'未开始');
});
