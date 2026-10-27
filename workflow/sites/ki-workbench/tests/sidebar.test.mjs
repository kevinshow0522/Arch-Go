import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script,createContext} from 'node:vm';
import {mcp,toolList} from '../lib/mcp.mjs';
import {workbenchUri} from '../lib/workbench-ui.mjs';

const assets={html:readFileSync('workbench/page.html','utf8'),host:readFileSync('public/workbench-host.js','utf8'),...Object.fromEntries(['method','runtime','client'].map(key=>[key,readFileSync('public/'+(key==='client'?'cloud-client':'workbench-'+key)+'.js','utf8')]))};
const rpc=(method,params)=>new Request('https://workbench.test/mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});

test('only the sidebar launches the readonly cloud UI; conversations retain data tools only',async()=>{
 const initialize=await(await mcp(rpc('initialize',{}),null,null,assets)).json();assert.ok(initialize.result.capabilities.resources);
 const open=toolList.find(t=>t.name==='ki_cloud_open_workbench');assert.equal(open.annotations.readOnlyHint,true);assert.deepEqual(open._meta['openai/ui'].entrypoints,[{type:'global'}]);assert.equal(open._meta.ui.resourceUri,workbenchUri);assert.deepEqual(open._meta.ui.visibility,['app']);
 assert.equal(toolList.filter(t=>t._meta?.['openai/ui']?.entrypoints?.length).length,1);
 assert.ok(toolList.filter(t=>t.name.includes('publish')).every(t=>JSON.stringify(t._meta.ui.visibility)==='["model"]'));
 assert.ok(toolList.every(t=>t._meta['openai/widgetAccessible']===t.annotations.readOnlyHint));
 const result=await(await mcp(rpc('resources/read',{uri:workbenchUri}),null,null,assets)).json();
 const resource=result.result.contents[0],html=resource.text;
 assert.equal(resource.mimeType,'text/html;profile=mcp-app');assert.deepEqual(resource._meta.ui.csp.connectDomains,[]);
 assert.deepEqual(resource._meta['openai/ui'].availableDisplayModes,['fullscreen']);
 assert.equal(resource._meta.ui.domain,undefined,'use the platform sandbox instead of the private website origin');
 assert.doesNotMatch(html,/<base /);assert.match(html,/var url='https:\/\/workbench.test\/api\/artifacts\//);assert.match(html,/neumorphic-0.6.1/);assert.match(html,/window.KIGAGA_MCP_UI=true/);assert.doesNotMatch(html,/<script src=/);
 assert.match(html,/image=!W.KIGAGA_MCP_UI/);assert.match(html,/!W.KIGAGA_MCP_UI&&f.mime_type==='application\/pdf'\?'<object/);
 for(const script of html.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g))new Script(script[1]);
 const missing=await(await mcp(rpc('resources/read',{uri:'ui://other'}),null,null,assets)).json();assert.equal(missing.error.code,-32002);
});

test('2026 resource responses carry the required complete-result and private cache envelope',async()=>{
 for(const method of ['server/discover','tools/list','resources/list','resources/read']){
  const request=rpc(method,{uri:workbenchUri});request.headers.set('mcp-protocol-version','2026-07-28');
  const result=(await(await mcp(request,null,null,assets)).json()).result;
  assert.equal(result.resultType,'complete',method);assert.equal(result.cacheScope,'private',method);assert.equal(result.ttlMs,0,method);
 }
 const metaRequest=rpc('resources/read',{uri:workbenchUri,_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28'}});
 assert.equal((await(await mcp(metaRequest,null,null,assets)).json()).result.resultType,'complete');
 const legacy=rpc('resources/read',{uri:workbenchUri});legacy.headers.set('mcp-protocol-version','2025-11-25');
 assert.equal((await(await mcp(legacy,null,null,assets)).json()).result.resultType,undefined);
});

function harness({embed=true,delayProject=false}={}){
 const listeners=new Map(),docListeners=new Map(),calls=[],snapshots=[],errors=[],waiting=[],projectPages=[];let sdkConnections=0;
 const tasks=Array.from({length:73},(_,i)=>({id:'task-'+i}));
 const index={projects:[{source_key:'test:p1',name:'隔离预览'}],next_offset:null};
 async function tool(name,args){calls.push({name,args});
  if(name==='ki_cloud_list_projects')return index;
  if(name==='ki_cloud_get_project'){if(delayProject&&args.source_key==='test:p1')await new Promise(resolve=>waiting.push(resolve));projectPages.push(args.task_offset??0);const offset=args.task_offset??0;return {publication:{revision:1,source_key:args.source_key},snapshot:{project:{id:args.source_key,name:'隔离预览'},tasks:tasks.slice(offset,offset+50)},artifacts:[],next_task_offset:offset+50<tasks.length?offset+50:null};}
  throw Error('Unexpected write tool');
 }
 const parent={postMessage(value){if(value.method==='ui/notifications/initialized'||!value.method)return;
  const result=value.method==='ui/initialize'?Promise.resolve({protocolVersion:'2026-01-26',hostInfo:{name:'test-host',version:'1'},hostCapabilities:{serverTools:{}},hostContext:{theme:'light',displayMode:'fullscreen',availableDisplayModes:['inline','fullscreen']}}):tool(value.params.name,value.params.arguments).then(data=>({structuredContent:data}));
  result.then(data=>queueMicrotask(()=>listeners.get('message')?.({source:parent,origin:'https://host.test',data:{jsonrpc:'2.0',id:value.id,result:data}})));
 }};
 const wb={setHandlers(value){this.handlers=value;},setSnapshot(value){snapshots.push(value);},setStatus(status,message){if(status==='error')errors.push(message);}};
 const window={KIGAGA_MCP_UI:embed,KiGAGAWorkbench:wb,parent,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name)=>listeners.delete(name)};
 if(!embed)window.parent=window;
 const document={hidden:false,addEventListener:(name,fn)=>docListeners.set(name,fn),removeEventListener:(name)=>docListeners.delete(name)};
 const context=createContext({window,document,parent,TextEncoder,TextDecoder,AbortController,AbortSignal,Headers,Request,Response,URL,crypto,queueMicrotask,console:{...console,debug(){}},setTimeout,clearTimeout,setInterval,clearInterval,fetch:async(url,options)=>{calls.push({url,options});assert.equal(embed,false);return {ok:true,json:async()=>url==='/api/projects'?index:{publication:{revision:1},snapshot:{project:{id:'p1'},tasks},artifacts:[]}};}});
 new Script(assets.host).runInContext(context);const sdkConnect=window.KI_CLOUD_CONNECT;window.KI_CLOUD_CONNECT=function(...args){sdkConnections++;return sdkConnect(...args);};
 new Script(assets.client).runInContext(context);
 return {calls,snapshots,errors,projectPages,wb,listeners,waiting,get sdkConnections(){return sdkConnections;},close:()=>listeners.get('pagehide')?.()};
}
async function until(condition){for(let i=0;i<100;i++){if(condition())return;await new Promise(resolve=>setImmediate(resolve));}assert.fail('Client did not finish loading');}

test('sidebar bridge reads all task pages without making browser requests or writes',async t=>{
 const h=harness();t.after(h.close);await until(()=>h.snapshots.length);
 assert.equal(h.sdkConnections,1,'the sidebar must use the official MCP Apps transport');
 assert.equal(h.snapshots[0].tasks.length,73);assert.deepEqual(h.projectPages,[0,50]);assert.equal(h.errors.length,0);
 assert.ok(h.calls.every(c=>['ki_cloud_list_projects','ki_cloud_get_project'].includes(c.name)));
 // Messages from a different window cannot switch the project.
 h.listeners.get('message')({source:{},origin:'https://host.test',data:{jsonrpc:'2.0',method:'ui/notifications/tool-input',params:{arguments:{source_key:'bad'}}}});
 assert.equal(h.calls.length,3);
});

test('website continues to read through its existing signed-in GET routes',async t=>{
 const h=harness({embed:false});t.after(h.close);await until(()=>h.snapshots.length);
 assert.equal(h.snapshots[0].tasks.length,73);assert.deepEqual(h.calls.map(c=>c.url),['/api/projects','/api/projects/test%3Ap1']);assert.ok(h.calls.every(c=>c.options.credentials==='same-origin'&&!c.options.method));assert.equal(h.errors.length,0);
});

test('a late project response cannot overwrite the user selection',async t=>{
 const h=harness({delayProject:true});t.after(h.close);await until(()=>h.waiting.length);
 await h.wb.handlers.selectProject('test:p2');assert.equal(h.snapshots.at(-1).project.id,'test:p2');
 h.waiting.shift()();await until(()=>h.waiting.length);h.waiting.shift()();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.snapshots.at(-1).project.id,'test:p2');assert.equal(h.errors.length,0);
});
