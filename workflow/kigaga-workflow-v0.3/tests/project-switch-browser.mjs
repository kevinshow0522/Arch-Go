// Real compiled UI + MCP + isolated database; the host bridge is simulated.
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,relative} from 'node:path';
import {randomUUID} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createWorkbenchServer} from '../src/server.mjs';
const {chromium}=await import(process.env.KG_PLAYWRIGHT_PATH||'playwright');
const dir=mkdtempSync(join(tmpdir(),'kg-project-switch-'));
mkdirSync(join(dir,'artifacts'));
const projectsRoot=join(dir,'projects');mkdirSync(projectsRoot);
const {server,store}=createWorkbenchServer({dbPath:join(dir,'test.db'),projectsRoot});
const client=new Client({name:'project-switch-browser-test',version:'1'});
const [a,b]=InMemoryTransport.createLinkedPair();
await server.connect(a);await client.connect(b);
const call=(name,args)=>client.callTool({name,arguments:args});
const create=async name=>(await call('kg_create_project',{name,request_id:randomUUID()})).structuredContent.project;
const browser=await chromium.launch({channel:'chrome',headless:true});
const output=resolve('test-output/project-switch');mkdirSync(output,{recursive:true});
try{
  const alpha=await create('入口改造'),beta=await create('庭院更新');
  for(const [p,title] of [[alpha,'入口分析成果'],[beta,'庭院分析成果']]){
    const task=(await call('kg_prepare_task',{request_id:randomUUID(),project_id:p.id,stage_ids:['concept'],material_ids:[],instruction:title,output:title})).structuredContent.task;
    await call('kg_save_result',{task_id:task.id,expected_revision:0,result:{title,narrative:`${p.name}的独立成果`,facts:[],assumptions:[],questions:[],actions:[]}});
    const path=join(p.storage.output_directory,`${p.id}.md`);writeFileSync(path,title);
    await call('kg_register_artifact',{request_id:randomUUID(),project_id:p.id,title:`${p.name}文件`,path});
  }
  let failSwitch=false,loseCreateResponse=false;
  const page=await browser.newPage({viewport:{width:1440,height:1050}});
  page.setDefaultTimeout(5000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('download',()=>errors.push('Unexpected browser download'));
  await page.exposeFunction('testCall',async(name,args)=>{
    if(failSwitch&&name==='kg_open_workbench'&&args.project_id===alpha.id){failSwitch=false;throw new Error('切换暂时失败');}
    const result=await call(name,args);
    if(loseCreateResponse&&name==='kg_create_project'){loseCreateResponse=false;throw new Error('保存回执暂未收到，请重试');}
    return result;
  });
  await page.addInitScript(()=>{window.openai={callTool:(name,args)=>window.testCall(name,args),sendFollowUpMessage:async()=>{throw new Error('This test must not send messages');}};});
  const html=readFileSync(new URL('../assets/workbench.html',import.meta.url),'utf8');
  await page.route('**/*',route=>route.request().url()==='https://kigaga.test/'?route.fulfill({contentType:'text/html; charset=utf-8',body:html}):route.abort());
  await page.goto('https://kigaga.test/');
  await page.getByText('项目已连接',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'项目',exact:true}).count(),1,'The project entry must be visible even with one current project');
  await page.getByRole('button',{name:'项目',exact:true}).click();
  await page.getByRole('button',{name:'切换到 庭院更新',exact:true}).click();
  await page.getByRole('heading',{name:'庭院更新',exact:true}).waitFor();
  assert.ok((await page.locator('[data-result-panel]').innerText()).includes('庭院分析成果'));
  assert.ok(!(await page.locator('main').innerText()).includes('入口分析成果'));
  assert.ok(!(await page.locator('main').innerText()).includes('入口改造文件'));
  await page.getByRole('button',{name:'保存到项目文件夹',exact:true}).click();
  await page.getByRole('status').filter({hasText:'已保存：'}).waitFor();
  const savedPath=(await page.getByRole('status').filter({hasText:'已保存：'}).innerText()).replace('已保存：','');
  assert.ok(savedPath.startsWith(beta.storage.output_directory));
  assert.ok(readFileSync(savedPath,'utf8').includes('庭院分析成果'));
  await page.locator('[data-stage-id="concept"]').click();
  failSwitch=true;
  await page.getByRole('button',{name:'项目',exact:true}).click();
  await page.getByRole('button',{name:'切换到 入口改造',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'切换暂时失败'}).waitFor();
  assert.equal(await page.getByRole('heading',{name:'庭院更新',exact:true}).count(),1);
  await page.getByRole('button',{name:'切换到 入口改造',exact:true}).click();
  await page.getByRole('heading',{name:'入口改造',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'查看全部',exact:true}).getAttribute('aria-pressed'),'true');
  assert.ok((await page.locator('[data-result-panel]').innerText()).includes('入口分析成果'));
  await page.getByRole('button',{name:'项目',exact:true}).click();
  await page.getByRole('button',{name:'新建项目',exact:true}).click();
  await page.getByLabel('项目名称',{exact:true}).fill('社区公共空间改造');
  await page.getByLabel('项目简介（选填）',{exact:true}).fill('新项目的独立范围');
  loseCreateResponse=true;
  await page.getByRole('button',{name:'创建并进入',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'保存回执暂未收到'}).waitFor();
  assert.equal(await page.getByLabel('项目名称',{exact:true}).inputValue(),'社区公共空间改造');
  await page.getByRole('button',{name:'创建并进入',exact:true}).click();
  await page.getByRole('heading',{name:'社区公共空间改造',exact:true}).waitFor();
  const projects=(await call('kg_find_projects',{limit:50})).structuredContent;
  assert.equal(projects.items.filter(p=>p.name==='社区公共空间改造').length,1,'Lost responses must not duplicate a project');
  assert.ok(!(await page.locator('main').innerText()).includes('入口分析成果'));
  await create('另一会话新建的项目');
  await page.getByRole('button',{name:'项目',exact:true}).click();
  await page.getByRole('button',{name:'切换到 另一会话新建的项目',exact:true}).waitFor();
  await page.screenshot({path:join(output,'projects-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:join(output,'projects-mobile.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  const checks=['visible project entry','switch results and file scope','save output into selected project without browser download','failed switch preserves selection','switch resets stage selection','create and enter','lost response retry does not duplicate','refresh discovers externally created project','390px layout','no page exceptions'];
  writeFileSync(join(output,'results.json'),JSON.stringify({checks,errors,nativeHostVerified:false},null,2));
  console.log(checks.join('\n'));
}finally{
  await browser.close();await client.close();await server.close();store.close();
  const rel=relative(resolve(tmpdir()),resolve(dir));
  if(rel&&!rel.startsWith('..')&&!rel.includes(':'))rmSync(dir,{recursive:true,force:true});
}
