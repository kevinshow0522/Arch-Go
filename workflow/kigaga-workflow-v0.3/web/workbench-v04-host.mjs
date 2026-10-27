import {connectWorkbenchBridge} from './bridge.mjs';
import {installProjectProgress} from './project-progress.mjs';

const wb=window.KiGAGAWorkbench;
let bridge, fallbackTimer, pollTimer, lastSnapshot, signature, generation=0, closed=false, inFlight=false, failed=false;
const progress=installProjectProgress(window,{
 getProject:()=>lastSnapshot?.project||null,
 requestProgress:async args=>{
  if(!closed&&bridge)return bridge.callTool('kg_get_project_progress',args);
  if(window.location.hostname==='127.0.0.1'){
   const response=await fetch('/api/project-progress?'+new URLSearchParams(args));const result=await response.json();if(!response.ok)throw new Error(result.error||'进度获取失败');return result;
  }
  throw new Error('当前宿主尚未加载协作接口');
 }
});
const args=()=>{
 if(lastSnapshot?.project?.id)return {project_id:lastSnapshot.project.id,...(lastSnapshot.selected_task?.id?{task_id:lastSnapshot.selected_task.id}:{})};
 const input=window.openai?.toolInput??{};
 return Object.fromEntries(['project_id','task_id'].filter(k=>typeof input[k]==='string'&&input[k]).map(k=>[k,input[k]]));
};
function receive(snapshot){
 if(closed)return;
 if(snapshot?.bridge_error){failed=true;wb.setStatus('error',snapshot.bridge_error);return;}
 if(!Array.isArray(snapshot?.tasks))return;
 generation++;
 clearTimeout(fallbackTimer);
 lastSnapshot=snapshot;
 const nextSignature=JSON.stringify(snapshot);
 if(nextSignature!==signature){signature=nextSignature;wb.setSnapshot(snapshot,{origin:'live'});}
 else if(failed)wb.setStatus('ready');
 failed=false;
 if(!window.KIGAGA_OFFLINE)void progress.refresh();
}
async function fetchSnapshot(background=false){
 if(closed||!bridge||inFlight||(background&&document.visibilityState==='hidden'))return;
 inFlight=true;
 const requestGeneration=generation;
 try{
  const snapshot=await bridge.callTool('kg_open_workbench',args());
  if(closed||requestGeneration!==generation)return;
  if(!Array.isArray(snapshot?.tasks))throw new Error('项目服务未返回完整工作台快照');
  receive(snapshot);
 }catch(error){
  if(!closed&&requestGeneration===generation){failed=true;wb.setStatus('error',error instanceof Error?error.message:'项目服务连接失败');}
 }finally{inFlight=false;}
}
wb.setHandlers({selectProject:async projectId=>{
 if(window.KIGAGA_OFFLINE)throw new Error('离线快照只包含当前项目。');
 if(!bridge||closed)throw new Error('项目服务尚未连接。');
 const own=++generation;
 try{const snapshot=await bridge.callTool('kg_open_workbench',{project_id:projectId});if(own!==generation||closed)return;if(snapshot?.project?.id!==projectId)throw new Error('读取结果与所选项目不符。');receive(snapshot);}
 catch(error){if(own===generation)wb.setStatus('error',error.message||'项目读取失败');}
}});
const refreshVisible=()=>fetchSnapshot(true);
async function start(){
 try{
  bridge=await connectWorkbenchBridge({onToolResult:receive});
   if(closed){bridge.close();return;}
  if(bridge.initial)receive(bridge.initial);
  pollTimer=setInterval(refreshVisible,15000);
  if(generation)return;
  if(bridge.kind==='standard'){
   // The host sends the originating tool result after initialization.
   // Fetch only if it never arrives, preserving an explicitly selected project.
   fallbackTimer=setTimeout(()=>fetchSnapshot(),5000);
  }else await fetchSnapshot();
 }catch(error){
  if(!closed)wb.setStatus('error',error instanceof Error?error.message:'项目服务连接失败');
 }
}
window.addEventListener('focus',refreshVisible);
document.addEventListener('visibilitychange',refreshVisible);
window.addEventListener('pagehide',()=>{
 closed=true;clearTimeout(fallbackTimer);clearInterval(pollTimer);
 progress.close();
 window.removeEventListener('focus',refreshVisible);document.removeEventListener('visibilitychange',refreshVisible);bridge?.close();
},{once:true});
start();
