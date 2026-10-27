import {STAGES} from '../src/stages.mjs';
import {connectWorkbenchBridge} from './bridge.mjs';
import {shouldReplaceTask} from './flow.mjs';
import {STAGE_LABELS,taskStages,tasksForStage,taskProgress,stageProgress,taskStatus,normalizeSnapshot} from './dashboard-model.mjs';
import {createPresentation} from './presentation.mjs';
const root=document.querySelector('#kg-workbench [data-app-root]'),seed=window.__KG_PREVIEW__;
const catalog=__KG_METHOD_CATALOG__;
const state={snapshot:normalizeSnapshot(seed),mode:seed?'snapshot':'connecting',bridge:null,error:'',busy:false,stageId:seed?.selected_task?taskStages(seed.selected_task)[0]:'all',topicId:null,taskId:seed?.selected_task?.id||null,menuOpen:Boolean(seed?.selected_task),navCollapsed:false,projectsOpen:false,creating:false,projectDraft:{name:'',summary:''},createRequest:null};
function h(tag,props={},...children){
  const node=document.createElement(tag);
  for(const [key,value] of Object.entries(props)){
    if(key==='text')node.textContent=value??'';
    else if(key==='class')node.className=value;
    else if(key.startsWith('on'))node.addEventListener(key.slice(2).toLowerCase(),value);
    else if(key==='disabled')node.disabled=Boolean(value);
    else if(value!==null&&value!==undefined&&value!==false)node.setAttribute(key,String(value));
  }
  for(const child of children.flat(Infinity))if(child!==null&&child!==undefined&&child!==false)node.append(child instanceof Node?child:document.createTextNode(String(child)));
  return node;
}
const button=(label,onClick,props={})=>h('button',{type:'button',onClick,...props},label);
const pill=(label,tone)=>h('span',{class:`kg-pill kg-${tone}`,text:label});
const paragraphs=text=>String(text||'').split(/\n\s*\n/).filter(Boolean).map(value=>h('p',{text:value}));
const presentation=createPresentation({catalog,h,button,paragraphs,pill,rerender:render,getSnapshot:()=>state.snapshot,getMode:()=>state.mode,
  onFormat:format=>{if(state.stageId==='delivery')state.topicId=format==='text'?'07.1':'07.2';},
  navigate:id=>{const stage=Object.entries(catalog.chapters).find(([,chapter])=>chapter.topics.some(topic=>topic.id===id));if(!stage)return;chooseStage(stage[0]);chooseTopic(id);}});
function date(value){const d=new Date(value);return value&&!Number.isNaN(d.getTime())?new Intl.DateTimeFormat('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(d):'时间未记录';}
function group(title,items,open=false){return items?.length?h('details',{class:'kg-detail',open},h('summary',{},title,h('span',{text:String(items.length)})),h('ul',{},items.map(item=>h('li',{text:item})))):null;}
function bar(value,props={}){return h('div',{class:'kg-progress',role:'progressbar','aria-label':'已登记任务完成率','aria-valuemin':0,'aria-valuemax':100,'aria-valuenow':value,...props},h('span',{style:`width:${value}%`}));}
function stages(){return [...STAGES.map(stage=>({...stage,name:catalog.chapters[stage.id]?.title||stage.name})),...(state.snapshot.tasks.some(t=>taskStages(t).includes('general'))?[{id:'general',name:'项目事务',questions:['项目条件、记录与续接点是否一致？']}]:[])];}
function chapter(){return catalog.chapters[state.stageId];}
function selectedTopic(){return chapter()?.topics.find(topic=>topic.id===state.topicId)||chapter()?.topics[0];}
function chooseTopic(id){state.topicId=id;if(state.stageId==='delivery')presentation.setFormat(id==='07.2'?'interactive':'text');render();root.querySelector(`[data-topic-id="${id}"]`)?.focus({preventScroll:true});}
function scopedTasks(){return state.stageId==='all'?state.snapshot.tasks:tasksForStage(state.snapshot.tasks,state.stageId);}
function selectedTask(){return scopedTasks().find(t=>t.id===state.taskId)||scopedTasks().find(t=>t.result)||scopedTasks()[0]||null;}
function chooseStage(id){
  if(state.stageId!==id){state.taskId=null;state.topicId=null;}
  state.stageId=id;state.menuOpen=id!=='all';state.navCollapsed=false;render();
  root.querySelector(`[data-stage-id="${id}"]`)?.focus({preventScroll:true});
}
function chooseTask(id){
  state.taskId=id;render();[...root.querySelectorAll('[data-task-id]')].find(node=>node.dataset.taskId===id)?.focus({preventScroll:true});
}
function setSnapshot(value,keepSelection=true){if(value.project?.id!==state.snapshot.project?.id)state.exportedPath='';state.snapshot=normalizeSnapshot(value);if(!keepSelection){state.stageId='all';state.taskId=null;state.menuOpen=false;}if(state.taskId&&!state.snapshot.tasks.some(t=>t.id===state.taskId))state.taskId=null;}
function receive(payload){
  if(payload?.bridge_error){state.error=payload.bridge_error;render();return;}
  if(payload?.project!==undefined&&Array.isArray(payload.projects)){
    if(state.snapshot.project&&payload.project?.id!==state.snapshot.project.id)return;
    setSnapshot(payload);
  }else if(payload?.task?.id&&payload.task.project_id===state.snapshot.project?.id){
    const tasks=state.snapshot.tasks,index=tasks.findIndex(t=>t.id===payload.task.id);
    if(index<0)tasks.unshift(payload.task);else if(shouldReplaceTask(tasks[index],payload.task))tasks[index]=payload.task;
  }
  render();
}
async function refresh(projectId=state.snapshot.project?.id){
  if(!state.bridge||state.busy)return;
  state.busy=true;state.error='';render();
  try{const changed=projectId!==state.snapshot.project?.id;const snapshot=await state.bridge.callTool('kg_open_workbench',{...(projectId?{project_id:projectId}:{}),...(!changed&&state.taskId?{task_id:state.taskId}:{})});setSnapshot(snapshot,!changed);state.mode='ready';if(changed){state.projectsOpen=false;state.creating=false;}}
  catch(error){state.error=error.message||'刷新未完成，保留上一次内容。';}
  finally{state.busy=false;render();}
}
async function toggleProjects(){
  state.projectsOpen=!state.projectsOpen;render();
  if(state.projectsOpen&&state.mode==='ready')await refresh();
}
async function createProject(event){
  event.preventDefault();
  if(state.mode!=='ready'||!state.bridge||state.busy)return;
  const payload={name:state.projectDraft.name.trim(),summary:state.projectDraft.summary.trim()};
  if(!payload.name){state.error='请输入项目名称';render();return;}
  const signature=JSON.stringify(payload);
  if(state.createRequest?.signature!==signature)state.createRequest={signature,id:crypto.randomUUID()};
  state.busy=true;state.error='';render();
  try{
    const snapshot=await state.bridge.callTool('kg_create_project',{...payload,request_id:state.createRequest.id});
    setSnapshot(snapshot,false);state.projectsOpen=false;state.creating=false;
    state.projectDraft={name:'',summary:''};state.createRequest=null;
  }catch(error){state.error=error.message||'创建未完成，请重试。';}
  finally{state.busy=false;render();}
}
function renderProjects(){
  if(!state.projectsOpen)return null;
  const disabled=state.mode!=='ready'||state.busy;
  return h('section',{id:'kg-projects',class:'kg-projects','aria-label':'项目列表'},
    h('div',{class:'kg-projects-heading'},h('h2',{text:'我的项目'}),
      button('新建项目',()=>{state.creating=true;state.error='';render();root.querySelector('#kg-project-name')?.focus();},{class:'kg-button',disabled}),
      button('关闭',()=>{state.projectsOpen=false;render();root.querySelector('[aria-controls="kg-projects"]')?.focus();},{class:'kg-text-button',disabled:state.busy})),
    state.mode!=='ready'?h('p',{class:'kg-muted',text:'当前为只读页面。连接项目服务后可切换或新建项目。'}):null,
    h('div',{class:'kg-project-list'},state.snapshot.projects.length?state.snapshot.projects.map(p=>{
      const current=p.id===state.snapshot.project?.id;
      return button([h('span',{class:'kg-project-item-title'},h('strong',{text:p.name}),current?pill('当前项目','green'):null),
        h('span',{class:'kg-project-item-summary',text:p.summary||'尚未填写项目简介'}),
        h('small',{class:'kg-muted',text:`编号 ${p.id.slice(0,8)}`})],()=>refresh(p.id),{class:`kg-project-item ${current?'is-current':''}`,'aria-label':`切换到 ${p.name}`,'aria-current':current?'true':null,disabled:disabled||current});
    }):h('p',{class:'kg-muted',text:'暂无项目，点击“新建项目”开始。'})),
    state.creating?h('form',{class:'kg-project-form',onSubmit:createProject},
      h('label',{for:'kg-project-name',text:'项目名称'}),
      h('input',{id:'kg-project-name',name:'name',required:true,maxlength:120,value:state.projectDraft.name,disabled,placeholder:'例如：办公空间改造',onInput:event=>{state.projectDraft.name=event.target.value;}}),
      h('label',{for:'kg-project-summary',text:'项目简介（选填）'}),
      h('textarea',{id:'kg-project-summary',name:'summary',maxlength:4000,rows:3,disabled,onInput:event=>{state.projectDraft.summary=event.target.value;}},state.projectDraft.summary),
      h('div',{class:'kg-project-form-actions'},button('取消',()=>{state.creating=false;render();},{class:'kg-text-button',disabled}),
        h('button',{type:'submit',class:'kg-button',disabled,text:state.busy?'正在创建…':'创建并进入'}))):null);
}
function renderHeader(){
  const mode={snapshot:['只读快照','neutral'],connecting:['正在连接项目服务','neutral'],disconnected:['项目服务未连接','red'],ready:['项目已连接','green']}[state.mode];
  return h('header',{class:'kg-header'},h('div',{class:'kg-brand'},'KiGAGA',h('span',{text:'设计工作台'})),h('div',{class:'kg-header-actions'},button('项目',toggleProjects,{class:'kg-button','aria-expanded':String(state.projectsOpen),'aria-controls':'kg-projects',disabled:state.busy}),pill(...mode),state.mode==='ready'?button(state.busy?'更新中…':'刷新',()=>refresh(),{class:'kg-button',disabled:state.busy}):null));
}
function renderOverview(){
  const p=taskProgress(state.snapshot.tasks),outputs=state.snapshot.tasks.filter(t=>t.result).length;
  return h('section',{class:'kg-overview'},h('div',{class:'kg-project-title'},h('div',{class:'kg-eyebrow',text:'项目进展 / PROJECT OVERVIEW'}),h('h1',{text:state.snapshot.project?.name||'等待项目接入'}),state.snapshot.project?.summary?h('details',{class:'kg-project-brief'},h('summary',{text:'项目概况与当前方向'}),...paragraphs(state.snapshot.project.summary)):h('p',{text:'在对话中交代目标，AI 推进工作；这里查看进度、注意事项与成果。'})),h('div',{class:'kg-overview-numbers'},h('div',{},h('strong',{},String(p.completed),h('small',{text:` / ${p.total}`})),h('span',{text:'已完成登记任务'})),h('div',{},h('strong',{text:String(p.remaining)}),h('span',{text:'待完成任务'})),h('div',{},h('strong',{text:String(outputs)}),h('span',{text:'已有成果'}))),h('div',{class:'kg-overall-progress'},bar(p.percent,{'data-project-progress':'','aria-label':'项目已登记任务完成率'}),h('div',{class:'kg-progress-caption'},h('span',{text:p.total?`已登记任务完成率 ${p.percent}%${p.cancelled?` · ${p.cancelled} 项已取消，不计入`:''}`:'尚未登记任务'}),h('span',{text:'任务完成率不代表整个项目或阶段已验收'}))));
}
function stageCard(stage,index){
  const p=stageProgress(state.snapshot.tasks,stage.id);
  const active=state.stageId===stage.id,hasTasks=Boolean(catalog.chapters[stage.id])||tasksForStage(state.snapshot.tasks,stage.id).length>0;
  return button([h('div',{class:'kg-stage-top'},h('span',{class:'kg-stage-index',text:stage.id==='general'?'08':String(index+1).padStart(2,'0')}),h('strong',{text:STAGE_LABELS[stage.id]||stage.name})),h('div',{class:'kg-stage-bottom'},pill(p.status,p.tone),h('span',{text:p.total?`${p.completed} / ${p.total}`:'未安排'})),bar(p.percent,{'aria-label':`${stage.name}已登记任务完成率`})],()=>chooseStage(stage.id),{class:`kg-stage-card ${active?'is-active':''}`,'data-stage-id':stage.id,'data-tone':p.tone,'aria-label':`${STAGE_LABELS[stage.id]||stage.name}，${p.status}${hasTasks?'，展开目录与任务':''}`,'aria-pressed':String(active),'aria-expanded':hasTasks?String(active&&state.menuOpen&&!state.navCollapsed):null,'aria-controls':hasTasks&&active&&state.menuOpen&&!state.navCollapsed?'kg-task-menu':null,title:stage.name});
}
function renderTasks(){
  const tasks=scopedTasks();
  const method=chapter(),topic=selectedTopic();
  if(!state.menuOpen||state.stageId==='all'||(!tasks.length&&!method)||state.navCollapsed)return null;
  const selected=selectedTask();
  return h('section',{id:'kg-task-menu',class:'kg-task-menu','data-task-menu':'','aria-label':'章节目录与任务'},
    h('div',{class:'kg-task-menu-heading'},h('div',{},h('div',{class:'kg-eyebrow',text:'章节目录'}),h('h2',{text:STAGE_LABELS[state.stageId]})),button('收起',()=>{state.menuOpen=false;render();root.querySelector(`[data-stage-id="${state.stageId}"]`)?.focus({preventScroll:true});},{class:'kg-text-button','data-close-tasks':'','aria-label':'收起二级菜单'})),
    method?h('nav',{class:'kg-topic-nav','aria-label':'二级内容'},method.topics.map(item=>h('div',{class:'kg-topic-row'},button([h('span',{text:item.id}),h('strong',{text:item.title})],()=>chooseTopic(item.id),{class:`kg-topic-link ${item.id===topic?.id?'is-active':''}`,'data-topic-id':item.id,'aria-pressed':String(item.id===topic?.id),'aria-controls':'kg-topic-panel'}),presentation.topicControl(item)))):null,
    h('h3',{class:'kg-task-section-title',text:'已登记任务'}),
    h('p',{class:'kg-menu-note',text:`${tasks.length} 项已登记任务`}),
    h('nav',{'aria-label':'阶段任务'},tasks.map(t=>{
      const p=taskProgress([t]),title=t.result?.title||t.output||t.instruction||'项目任务';
      return button([pill(...taskStatus(t.status)),h('strong',{text:title}),h('span',{class:'kg-task-caption',text:t.status==='cancelled'?'已取消 · 不计入进度':p.completed?'任务已完成':'任务尚未完成'}),bar(p.percent,{'aria-label':`${title}完成状态`})],()=>chooseTask(t.id),{class:`kg-task-card ${t.id===selected?.id?'is-active':''}`,'data-task-id':t.id,'aria-pressed':String(t.id===selected?.id)});
    })),h('p',{class:'kg-menu-footnote',text:'任务随设计工作逐步补充'}));
}
function renderTopic(){
  const method=chapter(),topic=selectedTopic();
  if(!topic)return null;
  return h('section',{id:'kg-topic-panel',class:'kg-topic-panel','data-topic-panel':'','aria-label':'章节内容说明'},
    h('div',{class:'kg-topic-heading'},h('div',{},h('div',{class:'kg-eyebrow',text:`方法 ${catalog.version} / ${method.title}`}),h('h2',{text:`${topic.id} ${topic.title}`})),h('span',{class:'kg-method-status',text:method.status})),
    h('div',{class:'kg-topic-summary'},...paragraphs(topic.summary)),
    topic.sections.length?h('details',{class:'kg-topic-details'},h('summary',{text:'查看内容与检查要点'}),topic.sections.map(section=>h('section',{},h('h3',{text:section.title}),...paragraphs(section.text)))):null,
    state.stageId==='delivery'?h('div',{class:'kg-presentation-note'},h('strong',{text:'可通过外置链接展示'}),h('p',{text:'下方可预览选定成果。具体展示界面及文本设计后续讨论，展示链接尚未配置。'})):null,
    presentation.sourcePicker(topic));
}
function renderCurrentWork(){
  const task=selectedTask(),p=taskProgress(task?[task]:[]),stage=state.stageId==='all'?'全部阶段':STAGE_LABELS[state.stageId];
  return h('section',{class:'kg-current-work','data-current-work':'','aria-label':'当前工作'},
    h('div',{class:'kg-current-top'},h('span',{class:'kg-eyebrow',text:`当前工作 / ${stage}`}),task?pill(...taskStatus(task.status)):pill('待安排','neutral')),
    h('h2',{text:task?.result?.title||task?.output||task?.instruction||'从当前目标开始'}),
    h('p',{class:'kg-current-next',text:task?.checkpoint?.next?`下一步：${task.checkpoint.next}`:task?'在对话中继续推进，工作进度在这里更新。':'此阶段尚未登记任务，可随设计工作逐步补充。'}),
    task?bar(p.percent,{'aria-label':'当前任务完成状态'}):null,
    task?h('p',{class:'kg-task-caption',text:task.status==='cancelled'?'任务已取消，不计入项目进度':p.completed?'任务已完成 · 阶段确认另行记录':'尚未完成 · 进度以任务检查记录为准'}):null);
}
function renderAttention(){
  const task=selectedTask(),stage=stages().find(s=>s.id===state.stageId),attention=[...(task?.checkpoint?.blockers||[]),...(task?.result?.questions||[]),...(task?.result?.assumptions||[])];
  return h('section',{class:'kg-attention','data-attention':''},h('div',{class:'kg-section-label'},h('h2',{text:'设计中需要注意'}),pill(attention.length?`${new Set(attention).size} 项`:'暂无待确认','neutral')),attention.length?h('ul',{class:'kg-attention-list'},[...new Set(attention)].map(text=>h('li',{text}))):h('p',{class:'kg-muted',text:'当前没有登记项目特定的待确认问题。'}),h('details',{class:'kg-method'},h('summary',{text:'本阶段设计提醒'}),h('ul',{},(stage?.questions||['先核对目标与关键条件，再推进相关设计。','区分假设、建议、已确认决定和已检查成果。']).map(text=>h('li',{text})))));
}
async function exportResult(task){
  if(!task?.result||state.mode!=='ready'||!state.bridge||state.busy)return;
  state.busy=true;state.error='';state.exportedPath='';render();
  try{
    const result=await state.bridge.callTool('kg_export_result',{project_id:state.snapshot.project.id,task_id:task.id});
    if(!result.saved||!result.path)throw new Error('未收到文件保存确认，请核对项目成果目录。');
    state.exportedPath=result.path;
    try{setSnapshot(await state.bridge.callTool('kg_open_workbench',{project_id:state.snapshot.project.id,task_id:task.id}));}
    catch{state.error='文件已保存，但界面刷新未完成，请稍后刷新。';}
  }catch(error){state.error=error.message||'成果未导出，请重试。';}
  finally{state.busy=false;render();}
}
function renderArtifacts(){
  const task=selectedTask(),files=state.snapshot.artifacts.filter(a=>!a.artifact?.task_id||a.artifact.task_id===task?.id);
  return h('details',{class:'kg-artifact-list'},h('summary',{},'图纸、图像与文件',h('span',{text:String(files.length)})),files.length?files.map(file=>h('article',{class:'kg-file'},h('strong',{text:file.title}),h('p',{text:file.artifact?.path||file.content||'文件已登记'}),h('span',{class:'kg-muted',text:'已登记文件 · 在原文件中查看；登记不代表设计验收'}))):h('p',{class:'kg-muted',text:'当前尚无图纸或图像文件，已有文字成果展示在上方。'}));
}
function renderResult(){
  const task=selectedTask(),results=scopedTasks().filter(t=>t.result),r=task?.result;
  return h('section',{class:'kg-results','data-result-panel':'','aria-label':'设计成果展示'},h('div',{class:'kg-results-heading'},h('div',{},h('div',{class:'kg-eyebrow',text:'DESIGN OUTPUT'}),h('h2',{text:'设计成果'})),h('span',{class:'kg-muted',text:`${state.stageId==='all'?'全部阶段':STAGE_LABELS[state.stageId]||'当前阶段'} · ${results.length} 项`})),results.length>1?h('div',{class:'kg-result-tabs','aria-label':'成果切换'},results.map(t=>button(t.result.title,()=>{state.taskId=t.id;render();},{class:t.id===task?.id?'is-active':'','aria-pressed':t.id===task?.id}))):null,r?h('article',{class:'kg-result-document'},h('div',{class:'kg-document-top'},h('span',{class:'kg-document-type',text:'分析与设计记录'}),pill(...taskStatus(task.status))),h('h3',{text:r.title}),h('div',{class:'kg-document-meta'},h('span',{text:`版本 ${task.revision??task.result_revision??1}`}),h('span',{text:date(task.history?.at(-1)?.saved_at||task.checkpoint?.saved_at||task.created_at)}),button('保存到项目文件夹',()=>exportResult(task),{class:'kg-export',disabled:state.mode!=='ready'||state.busy})),h('div',{class:'kg-narrative'},...paragraphs(r.narrative)),group('已知条件',r.facts,true),group('假定条件',r.assumptions),group('待确认事项',r.questions),group('下一步',r.actions,true),group('已完成的检查',task.checkpoint?.checks),group('待复核原因',task.review_reasons,true)):h('div',{class:'kg-output-empty'},h('div',{class:'kg-empty-mark','aria-hidden':'true',text:'＋'}),h('h3',{text:'本阶段尚无成果'}),h('p',{text:'AI 形成并保存成果后，会在这里展示。'}),h('span',{text:'图纸 · 图像 · 模型文件 · 设计分析'})),renderArtifacts());
}
function render(){
  if(!root)return;
  presentation.sync();
  if(state.stageId==='delivery')state.topicId=presentation.format()==='text'?'07.1':'07.2';
  const navigationScroll=root.querySelector('.kg-navigation')?.scrollTop||0;
  const primaryScroll=root.querySelector('.kg-primary')?.scrollTop||0;
  const taskMenuScroll=root.querySelector('.kg-task-menu')?.scrollTop||0;
  const tasks=renderTasks();
  root.replaceChildren(h('div',{class:`kg-shell ${tasks?'has-tasks':''} ${state.navCollapsed?'is-collapsed':''}`},
    h('aside',{class:'kg-navigation','aria-label':'工作进程'},h('div',{class:'kg-primary'},renderHeader(),
      h('div',{class:'kg-process'},h('div',{class:'kg-process-title'},h('h2',{text:'工作进程'}),button('查看全部',()=>chooseStage('all'),{class:'kg-text-button','aria-pressed':String(state.stageId==='all')})),
        h('p',{class:'kg-process-note',text:`七阶段方法 · 勾选用于${presentation.format()==='text'?'文本':'交互'}展示`}),h('nav',{'aria-label':'设计阶段'},stages().map((stage,index)=>h('div',{class:'kg-stage-row'},stageCard(stage,index),presentation.stageControl(stage))))),
      button(state.navCollapsed?'展开导航':'收起导航',()=>{state.navCollapsed=!state.navCollapsed;render();root.querySelector('[data-toggle-nav]')?.focus({preventScroll:true});},{class:'kg-collapse','data-toggle-nav':'','aria-expanded':String(!state.navCollapsed)})),tasks),
    h('main',{},renderProjects(),state.exportedPath?h('div',{class:'kg-save-notice',role:'status',text:'已保存：'+state.exportedPath}):null,
      renderOverview(),presentation.toolbar(),renderTopic(),state.stageId==='delivery'?presentation.assembly():null,h('div',{class:'kg-work-context'},renderCurrentWork(),renderAttention()),renderResult(),
      state.error?h('div',{role:'alert',class:'kg-error',text:state.error}):h('div',{class:'kg-footer',text:state.mode==='snapshot'?`只读项目快照 · ${date(state.snapshot.snapshot_at)} · 展示选择保存在此浏览器，项目资料不会自动刷新。`:'AI 在对话中推进工作，工作台同步呈现进度与成果。'})),presentation.previewPanel()));
  root.querySelector('.kg-navigation').scrollTop=navigationScroll;
  root.querySelector('.kg-primary').scrollTop=primaryScroll;
  const taskMenu=root.querySelector('.kg-task-menu');
  if(taskMenu)taskMenu.scrollTop=taskMenuScroll;
}
root?.addEventListener('keydown',event=>{if(event.key==='Escape'&&state.projectsOpen&&!state.busy){state.projectsOpen=false;render();root.querySelector('[aria-controls="kg-projects"]')?.focus();}});
async function bootstrap(){
  render();if(seed)return;
  try{state.bridge=await connectWorkbenchBridge({onToolResult:receive});if(state.bridge.initial?.project!==undefined)setSnapshot(state.bridge.initial);await refresh();if(state.mode!=='ready')state.mode='disconnected';}
  catch(error){state.mode='disconnected';state.error=error.message||'项目服务未连接';}
  render();
}
bootstrap();
