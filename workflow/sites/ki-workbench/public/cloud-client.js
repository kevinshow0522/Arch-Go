(function(){
'use strict';
var wb=window.KiGAGAWorkbench,selected=null,turn=0,busy=false,closed=false,bridge=null;
var embed=!!window.KIGAGA_MCP_UI,readTools=['ki_cloud_list_projects','ki_cloud_get_project'];
function unwrap(result){if(result?.isError)throw Error(result.content?.find(function(c){return c.type==='text';})?.text||'云端读取失败');return result?.structuredContent??result;}
async function connect(){
 function compatibility(){
  if(typeof window.openai?.callTool!=='function')throw Error('请从已连接的工作台插件打开此界面。');
  selected=window.openai.toolInput?.source_key??null;
  return {call:async function(name,args){if(!readTools.includes(name))throw Error('工作台只查看流程。');return unwrap(await window.openai.callTool(name,args));},close:function(){}};
 }
 if(window.parent===window)return compatibility();
 try{
  if(typeof window.KI_CLOUD_CONNECT!=='function')throw Error('工作台连接组件尚未加载，请重新打开。');
  return await window.KI_CLOUD_CONNECT(function(input){if(typeof input.source_key==='string'){selected=input.source_key;if(bridge)void load(selected).catch(function(error){wb.setStatus('error',error.message);});}});
 }catch(error){if(typeof window.openai?.callTool==='function')return compatibility();throw error;}
}
async function json(url){var r=await fetch(url,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});if(!r.ok)throw Error('云端暂时无法读取，仍显示上次已读内容。');return r.json();}
async function indexData(){
 if(!embed)return json('/api/projects');
 var projects=[],offset=0;
 do{var page=await bridge.call('ki_cloud_list_projects',{offset:offset});projects.push.apply(projects,page.projects);var next=page.next_offset;if(next!==null&&next!==undefined&&(!Number.isSafeInteger(next)||next<=offset))throw Error('云端项目分页异常');offset=next;}while(offset!==null&&offset!==undefined);
 return {projects:projects};
}
async function projectData(key){
 if(!embed)return json('/api/projects/'+encodeURIComponent(key));
 var project=await bridge.call('ki_cloud_get_project',{source_key:key}),offset=project.next_task_offset,tasks=(project.snapshot.tasks??[]).slice();
 while(offset!==null&&offset!==undefined){
  var page=await bridge.call('ki_cloud_get_project',{source_key:key,task_offset:offset});if(page.publication.revision!==project.publication.revision)throw Error('项目刚有更新，正在重新读取。');
  tasks.push.apply(tasks,page.snapshot.tasks??[]);var next=page.next_task_offset;if(next!==null&&next!==undefined&&(!Number.isSafeInteger(next)||next<=offset))throw Error('云端任务分页异常');offset=next;
 }
 project.snapshot.tasks=tasks;return project;
}
async function load(key){var token=++turn;if(key)selected=key;var index=await indexData();if(token!==turn||closed)return;
 if(!key&&index.projects.length)key=index.projects[0].source_key;
 var project=key?await projectData(key):null;if(token!==turn||closed)return;
 if(!project){wb.setStatus('ready');return;}
 selected=key;
 var snapshot=Object.assign({},project.snapshot,{publication:project.publication,artifacts:project.artifacts,projects:index.projects.map(function(p){return{id:p.source_key,name:p.name,source_key:p.source_key};})});
 wb.setSnapshot(snapshot,{origin:'cloud'});
}
wb.setHandlers({selectProject:function(key){return load(key);}});
function refresh(){if(busy||closed||document.hidden||embed&&!bridge)return;busy=true;return load(selected).catch(function(error){if(!closed)wb.setStatus('error',error.message);}).finally(function(){busy=false;});}
if(embed)connect().then(function(value){if(closed){value.close();return;}bridge=value;refresh();}).catch(function(error){if(!closed)wb.setStatus('error',error.message);});else refresh();
var poll=setInterval(refresh,20000);function visible(){if(!document.hidden)refresh();}document.addEventListener('visibilitychange',visible);window.addEventListener('focus',refresh);
window.addEventListener('pagehide',function(){closed=true;turn++;clearInterval(poll);document.removeEventListener('visibilitychange',visible);window.removeEventListener('focus',refresh);bridge?.close();},{once:true});
})();
