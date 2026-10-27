const list=value=>Array.isArray(value)?value:[];

export function installProjectProgress(win,{getProject,requestProgress}){
 const doc=win.document;
 let state={projectId:null,data:null,error:null,loading:false},requestId=0,revision=0,paintedRevision=-1,closed=false;
 function render(){
  if(closed)return;
  if(win.KiGAGAWorkbench?.setProgress){if(paintedRevision===revision)return;paintedRevision=revision;win.KiGAGAWorkbench.setProgress(state);return;}
  const side=doc.querySelector('#app .col-side');if(!side)return;
  let card=side.querySelector('[data-project-progress]');
  if(!card){card=doc.createElement('section');card.className='sec r-lg ki-project-progress';card.dataset.projectProgress='';card.setAttribute('aria-label','项目进度');side.prepend(card);}
  if(card.dataset.revision===String(revision))return;
  card.dataset.revision=String(revision);card.replaceChildren();
  const add=(tag,text,cls)=>{const node=doc.createElement(tag);node.textContent=text;if(cls)node.className=cls;card.append(node);return node;};
  add('h2','项目进度','t-h2');
  if(!state.projectId){add('p','尚未关联项目','t-meta');return;}
  if(state.loading&&!state.data){add('p','正在读取项目进度…','t-meta');return;}
  if(state.error)add('p',state.error,'t-meta');
  const progress=state.data;if(!progress)return;
  add('p',progress.stage?.name||progress.stage?.code||'当前阶段尚未明确','t-key');
  const tasks=progress.tasks||{};add('p',`${Number(tasks.done)||0} / ${Number(tasks.total)||0} 项任务已完成`,'t-meta');
  for(const task of list(tasks.doing).slice(0,5))add('p',`${task.owner?task.owner+' · ':''}${task.title||'进行中任务'}`);
  const handoffs=list(progress.handoffs).slice(0,3);
  if(handoffs.length){add('h3','最近交接','t-key');for(const item of handoffs)add('p',item.summary||'交接记录');}
  else add('p','尚无交接记录','t-meta');
 }
 async function refresh(){
  if(closed)return;
  const projectId=getProject?.()?.id||null,own=++requestId;
  if(projectId!==state.projectId)state={projectId,data:null,error:null,loading:false};
  state.loading=!!projectId;revision++;render();if(!projectId)return;
  try{
   const progress=await requestProgress({project_id:projectId});
   if(closed||own!==requestId||getProject?.()?.id!==projectId)return;
   if(progress?.project?.id!==projectId||!progress.tasks)throw new Error('进度返回的项目不匹配');
   state.data=progress;state.error=null;
  }catch{
   if(closed||own!==requestId||getProject?.()?.id!==projectId)return;
   state.error=win.KIGAGA_OFFLINE?'离线快照不含实时项目进度，请在已连接的工作台查看。':'项目进度暂不可用；新增协作工具需重连项目服务后加载。';
  }finally{if(!closed&&own===requestId&&getProject?.()?.id===projectId){state.loading=false;revision++;render();}}
 }
 const observer=new win.MutationObserver(()=>render());
 const app=doc.querySelector('#app');if(app)observer.observe(app,{childList:true,subtree:true});
 const close=()=>{closed=true;requestId++;observer.disconnect();};
 win.addEventListener('pagehide',close,{once:true});
 return {refresh,render,close,getState:()=>structuredClone(state)};
}
