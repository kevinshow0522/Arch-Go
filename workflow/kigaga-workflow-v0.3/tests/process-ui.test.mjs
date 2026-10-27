import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {processSnapshot} from './fixtures/workbench-130.mjs';
function open(t,snapshot=processSnapshot()){
 const dom=new JSDOM(readFileSync(new URL('../assets/workbench.html',import.meta.url),'utf8'),{url:'https://workbench.invalid/',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;t.after(()=>w.close());w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.structuredClone=structuredClone;w.scrollTo=()=>{};
 w.__KIGAGA_SNAPSHOT__=snapshot;w.KIGAGA_OFFLINE=true;
 w.openai={toolResponseMetadata:{workbench:snapshot},callTool:()=>assert.fail('离线只读页不能调用工具'),sendFollowUpMessage:()=>assert.fail('工作台不能发送消息')};
 for(const script of w.document.querySelectorAll('script'))if(!script.src)w.eval(script.textContent);
 return w;
}
test('流程工作台无地图、输入、发送和展示编排；所有视图都是只读',t=>{
 const w=open(t);assert.equal(w.document.title,'ki-arch');
 assert.equal(w.document.querySelectorAll('input,textarea,select,form,[contenteditable=true],[data-ki-map-open],[data-ki-map-panel]').length,0);
 assert.equal(w.document.querySelector('[data-act="view"][data-v="present"]'),null);
 for(const name of ['overview','results','method','mainline','handoffs']){
  const button=w.document.querySelector(`[data-act="view"][data-v="${name}"]`);assert.ok(button,name);button.click();
  assert.equal(w.KiGAGAWorkbench.getState().view,name);
  assert.equal(w.document.querySelectorAll('input,textarea,select,form,[contenteditable=true]').length,0);
 }
 assert.doesNotMatch(readFileSync(new URL('../assets/workbench.html',import.meta.url),'utf8'),/api\.mapbox\.com|tianditu|tile\.openstreetmap|data-map-action/);
});
test('总览展示实际交接与章末，工作包执行者含用户，指标七列只读且编号有来源',t=>{
 const w=open(t),text=()=>w.document.querySelector('#app').textContent;
 assert.match(text(),/完成场地判断/);assert.match(text(),/核对北侧位置/);assert.match(text(),/请提供方位/);
 w.document.querySelector('[data-v="results"]').click();assert.match(text(),/W3.3/);assert.match(text(),/用户/);assert.match(text(),/乙/);assert.match(text(),/◐/);
 w.document.querySelector('[data-v="method"]').click();assert.match(text(),/北侧进入/);assert.match(text(),/待确认/);
 w.document.querySelector('[data-v="mainline"]').click();assert.match(text(),/C03-1/);assert.match(text(),/C02-2/);assert.match(text(),/车位数/);
 assert.equal(w.document.querySelectorAll('[data-metrics] thead th').length,7);
});
test('服务方法版本不符明确提示，旧项目方法与阶段不虚构，项目文字不执行',t=>{
 const s=processSnapshot();s.method_version='1.20';s.project.name='<img src=x onerror=alert(1)>';s.project.summary='旧项目';s.tasks=[];
 const w=open(t,s),text=w.document.querySelector('#app').textContent;
 assert.match(text,/工作台需要重建/);assert.match(text,/项目方法未记录/);assert.match(text,/阶段未记录/);
 assert.equal(w.document.querySelectorAll('#app img').length,0);assert.ok(text.includes(s.project.name));
 delete s.method_version;w.KIGAGA_OFFLINE=false;w.KiGAGAWorkbench.setSnapshot(s);
 assert.match(w.document.querySelector('#app').textContent,/服务尚未报告方法版本.*重新连接/);w.KIGAGA_OFFLINE=true;
});
test('进度回执先看到新版成果时，不沿用旧版确认或旧问题的回复',t=>{
 const s=processSnapshot(),task=s.tasks[0];task.revision=1;task.result.questions=['旧问题'];task.checkpoint.done=['你已确认：第1版（决定decision-old）','已回复 Q1（第1版）：旧问题已处理'];
 s.records=[{id:'decision-old',kind:'decision',status:'confirmed',source:'用户确认',title:'确认 task-1 第1版',content:'确认上一版'}];
 const w=open(t,s);w.document.querySelector('[data-v="results"]').click();assert.match(w.document.querySelector('#app').textContent,/✓ 已确认/);
 const current=structuredClone(task);current.revision=2;current.confirmed=false;current.result.questions=['第二版新问题'];
 w.KiGAGAWorkbench.setProgress({projectId:s.project.id,data:{project:{id:s.project.id},workflow_tasks:[current],handoffs:s.handoffs}});
 assert.doesNotMatch(w.document.querySelector('#app').textContent,/✓ 已确认/);
 w.document.querySelector('[data-v="overview"]').click();assert.match(w.document.querySelector('#h-wait').closest('section').textContent,/第二版新问题/);
});
