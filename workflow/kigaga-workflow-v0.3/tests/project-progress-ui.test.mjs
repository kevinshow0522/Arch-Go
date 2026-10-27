import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';

test('进度卡按真实结果显示，项目切换后旧回执不能污染当前项目',async t=>{
 const ui=await import('../web/project-progress.mjs').catch(()=>({}));
 assert.equal(typeof ui.installProjectProgress,'function','需要只读进度卡');
 const dom=new JSDOM('<main id="app"><div class="col-side"></div></main>');t.after(()=>dom.window.close());
 let project={id:'a',name:'甲'},finish;
 const controller=ui.installProjectProgress(dom.window,{getProject:()=>project,requestProgress:()=>new Promise(resolve=>{finish=resolve;})});
 const pending=controller.refresh();project={id:'b',name:'乙'};
 finish({project:{id:'a'},tasks:{total:99,done:99,doing:[]},handoffs:[]});await pending;
 assert.doesNotMatch(dom.window.document.body.textContent,/99/);
 const next=controller.refresh();finish({project:{id:'b'},stage:null,tasks:{total:3,done:1,doing:[{title:'<img src=x onerror=alert(1)>',owner:'codex'}]},handoffs:[{summary:'等待复核'}]});await next;
 assert.match(dom.window.document.body.textContent,/1\s*\/\s*3/);assert.match(dom.window.document.body.textContent,/等待复核/);
 assert.equal(dom.window.document.querySelectorAll('img').length,0);assert.equal(controller.getState().projectId,'b');
});

test('协作工具尚未加载时进度卡显示明确提示，并可刷新恢复',async t=>{
 const ui=await import('../web/project-progress.mjs').catch(()=>({}));assert.equal(typeof ui.installProjectProgress,'function');
 const dom=new JSDOM('<main id="app"><div class="col-side"></div></main>');t.after(()=>dom.window.close());let fail=true;
 const controller=ui.installProjectProgress(dom.window,{getProject:()=>({id:'a'}),requestProgress:async()=>{if(fail)throw new Error('unknown tool');return {project:{id:'a'},tasks:{total:0,done:0,doing:[]},handoffs:[]};}});
 await controller.refresh();assert.match(dom.window.document.body.textContent,/重连|刷新.*连接/);
 fail=false;await controller.refresh();assert.match(dom.window.document.body.textContent,/0\s*\/\s*0/);assert.doesNotMatch(dom.window.document.body.textContent,/unknown tool/);
});
