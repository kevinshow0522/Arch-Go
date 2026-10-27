import test from 'node:test';
import assert from 'node:assert/strict';
import {installProjectProgress} from '../web/project-progress.mjs';
test('进度资料未变化时DOM通知不会重复重绘工作台',()=>{
 let renders=0;
 const win={document:{querySelector:()=>({})},KiGAGAWorkbench:{setProgress:()=>renders++},MutationObserver:class{observe(){}disconnect(){}},addEventListener(){}};
 const progress=installProjectProgress(win,{getProject:()=>null,requestProgress:async()=>{}});
 progress.render();progress.render();progress.render();
 assert.equal(renders,1);progress.close();
});
