// Presentation drafts belong to this browser, not to task completion or the project database.
const FORMATS={text:'文本展示',interactive:'交互界面展示'};
const PURPOSES=['个人学习整理','内部讨论','对外沟通'];
const blankDraft=()=>({purpose:PURPOSES[0],topics:{}});
const blank=()=>({schema:1,active:'text',drafts:{text:blankDraft(),interactive:blankDraft()}});

export function createPresentation({catalog,h,button,paragraphs,pill,rerender,navigate,onFormat,getSnapshot,getMode}){
  const topics=Object.values(catalog.chapters).flatMap(chapter=>chapter.topics);
  let key='',data=blank(),storageNote='',preview=false,returnFocus=null;
  const sourceOpen=new Map();
  const draft=()=>data.drafts[data.active];
  const entry=id=>draft().topics[id]||{selected:false,refs:[]};
  const selected=()=>topics.filter(topic=>entry(topic.id).selected);
  function restore(raw){
    const value=JSON.parse(raw),next=blank();
    if(value?.schema!==1)throw new Error('Unknown draft version');
    if(Object.hasOwn(FORMATS,value.active))next.active=value.active;
    for(const format of Object.keys(FORMATS)){
      const saved=value.drafts?.[format];
      if(PURPOSES.includes(saved?.purpose))next.drafts[format].purpose=saved.purpose;
      for(const topic of topics){
        const item=saved?.topics?.[topic.id];
        if(!item)continue;
        next.drafts[format].topics[topic.id]={selected:item.selected===true,refs:Array.isArray(item.refs)?item.refs.filter(ref=>typeof ref?.key==='string'&&typeof ref.signature==='string'&&typeof ref.title==='string').slice(0,500):[]};
      }
    }
    return next;
  }
  function sync(){
    const project=getSnapshot().project?.id||'catalog';
    const nextKey=`kigaga.presentation.v1:${getMode()==='snapshot'?'preview':'connected'}:${encodeURIComponent(project)}`;
    if(key===nextKey)return;
    key=nextKey;data=blank();preview=false;sourceOpen.clear();storageNote='选择保存在此浏览器';
    try{const saved=window.localStorage.getItem(key);if(saved){data=restore(saved);storageNote='已恢复此浏览器的选择';}}
    catch{storageNote='本地选择无法读取；本次可继续选择，请勿依赖刷新恢复';}
  }
  function save(){
    try{window.localStorage.setItem(key,JSON.stringify(data));storageNote='已保存到此浏览器';}
    catch{storageNote='本地保存失败；当前选择仅在本次页面有效';}
  }
  function focus(id){if(id)document.getElementById(id)?.focus({preventScroll:true});}
  function change(action){const id=document.activeElement?.id;action();save();rerender();focus(id);}
  function checkbox({id,label,checked,mixed=false,onChange,...props}){
    const input=h('input',{type:'checkbox',id,'aria-label':label,onChange,...props});
    input.checked=checked;input.indeterminate=mixed;
    return input;
  }
  function setFormat(format){
    if(!Object.hasOwn(FORMATS,format)||data.active===format)return;
    data.active=format;preview=false;onFormat(format);save();
  }
  function setTopic(id,checked){draft().topics[id]={...entry(id),selected:checked};}
  function stageControl(stage){
    const chapter=catalog.chapters[stage.id];if(!chapter)return null;
    const count=chapter.topics.filter(topic=>entry(topic.id).selected).length;
    return h('label',{class:'kg-select-control',title:`选入${FORMATS[data.active]}：${chapter.title}`},checkbox({id:`kg-select-${stage.id}`,label:`选入${FORMATS[data.active]}：${chapter.title}`,'data-select-stage':stage.id,checked:count===chapter.topics.length,mixed:count>0&&count<chapter.topics.length,onChange:event=>change(()=>chapter.topics.forEach(topic=>setTopic(topic.id,event.target.checked)))}));
  }
  function topicControl(topic){
    return h('label',{class:'kg-select-control',title:`选入${FORMATS[data.active]}：${topic.id} ${topic.title}`},checkbox({id:`kg-select-${topic.id}`,label:`选入${FORMATS[data.active]}：${topic.id} ${topic.title}`,'data-select-topic':topic.id,checked:entry(topic.id).selected,onChange:event=>change(()=>setTopic(topic.id,event.target.checked))}));
  }
  function sources(){
    const snapshot=getSnapshot(),projectId=snapshot.project?.id;
    const belongs=item=>!item.project_id||item.project_id===projectId;
    return [
      ...snapshot.tasks.filter(task=>belongs(task)&&task.result&&task.status!=='cancelled').map(task=>({
        key:`task:${task.id}`,title:task.result.title||'未命名成果',revision:task.revision??task.result_revision??1,
        kind:'task',payload:task.result,needsReview:task.status==='needs_review',
        // Exact content comparison also catches unversioned snapshot edits. Never substitute a changed result.
        signature:JSON.stringify([task.revision??task.result_revision??1,task.result])
      })),
      ...snapshot.artifacts.filter(file=>belongs(file)&&file.artifact?.path).map(file=>({
        key:`file:${file.id}`,title:file.title||'已登记文件',revision:file.revision??1,kind:'file',
        payload:{path:file.artifact.path},signature:JSON.stringify([file.revision??1,file.title,file.artifact])
      }))
    ];
  }
  function resolveRef(ref,available){
    const source=available.find(item=>item.key===ref.key);
    return {ref,source,status:!source?'missing':source.signature!==ref.signature?'stale':'ready'};
  }
  const statusText=status=>({missing:'来源暂不可用',stale:'版本已变化，请核对后重新选入',ready:'已选入'}[status]);
  function selectSource(topic,source,checked){
    const item=entry(topic.id),refs=item.refs.filter(ref=>ref.key!==source.key);
    if(checked)refs.push({key:source.key,title:source.title,revision:source.revision,signature:source.signature});
    draft().topics[topic.id]={selected:checked||item.selected,refs};
  }
  function sourcePicker(topic){
    const available=sources(),refs=entry(topic.id).refs;
    const disclosureKey=`${data.active}:${topic.id}`;
    const missing=refs.filter(ref=>!available.some(source=>source.key===ref.key));
    return h('details',{class:'kg-source-picker',open:sourceOpen.get(disclosureKey)},h('summary',{onClick:event=>{sourceOpen.set(disclosureKey,!event.currentTarget.parentElement.open);}},'选择本条目成果',h('span',{text:`已关联 ${refs.length} 项`})),
      h('p',{class:'kg-muted',text:'从已有成果中明确选择；选中整份成果后，本条目会加入当前展示。图纸和图像暂作为文件引用。'}),
      available.length?h('div',{class:'kg-source-options'},available.map((source,index)=>{
        const ref=refs.find(item=>item.key===source.key),stale=ref&&ref.signature!==source.signature;
        return h('label',{class:'kg-source-option'},checkbox({id:`kg-source-${topic.id}-${index}`,label:`选入成果：${source.title}`,'data-source-key':source.key,checked:Boolean(ref)&&!stale,onChange:event=>change(()=>selectSource(topic,source,event.target.checked))}),
          h('span',{},h('strong',{text:source.title}),h('small',{text:`${source.kind==='file'?'文件引用':'文字成果'} · 版本 ${source.revision}${source.needsReview?' · 待复核':''}${stale?' · 版本已变化，勾选以采用当前版本':''}`})));
      })):h('p',{class:'kg-muted',text:'当前尚无可选择的实际成果，可先选择目录范围。'}),
      missing.map(ref=>h('div',{class:'kg-missing-source'},h('span',{text:`${ref.title} · 来源暂不可用`}),button('移出清单',()=>change(()=>{draft().topics[topic.id]={...entry(topic.id),refs:entry(topic.id).refs.filter(item=>item.key!==ref.key)};}),{class:'kg-text-button'}))));
  }
  function manifest(){
    const available=sources(),unique=new Map();
    const groups=selected().map(topic=>{
      const refs=entry(topic.id).refs.map(ref=>resolveRef(ref,available));
      for(const {source,status} of refs){
        if(status!=='ready')continue;
        if(!unique.has(source.key))unique.set(source.key,{...source,topics:[]});
        unique.get(source.key).topics.push(`${topic.id} ${topic.title}`);
      }
      return {topic,refs};
    });
    return {groups,ready:[...unique.values()],unresolved:groups.filter(group=>!group.refs.length).length+groups.flatMap(group=>group.refs).filter(ref=>ref.status!=='ready').length};
  }
  function openAssembly(){navigate(data.active==='text'?'07.1':'07.2');}
  function toolbar(){
    const summary=manifest();
    const format=h('select',{id:'kg-presentation-format','aria-label':'展示去向',onChange:event=>{change(()=>setFormat(event.target.value));}} ,Object.entries(FORMATS).map(([value,label])=>h('option',{value,text:label})));
    format.value=data.active;
    const purpose=h('select',{id:'kg-presentation-purpose','aria-label':'本次展示用途',onChange:event=>change(()=>{draft().purpose=event.target.value;})},PURPOSES.map(value=>h('option',{value,text:value})));
    purpose.value=draft().purpose;
    return h('section',{class:'kg-selection-bar','aria-label':'本次展示选择'},
      h('div',{class:'kg-selection-intro'},h('strong',{text:'本次展示'}),h('p',{text:'按需选择，完整研究资料继续保留'})),
      h('div',{class:'kg-selection-actions'},h('label',{},h('span',{text:'选入'}),format),h('label',{},h('span',{text:'用途'}),purpose),
        button(`查看清单 · ${summary.groups.length} 项`,openAssembly,{id:'kg-open-assembly',class:'kg-button','data-open-assembly':''})),
      h('p',{class:'kg-selection-status',role:'status',text:`${storageNote} · ${getMode()==='snapshot'?'预览选择，与正式项目分开':'当前项目的本地展示草稿'} · ${summary.ready.length} 份可预览成果`})
    );
  }
  function assembly(){
    const {groups,ready,unresolved}=manifest();
    return h('section',{class:'kg-assembly','data-assembly':'','aria-label':'选中成果清单'},
      h('div',{class:'kg-assembly-heading'},h('div',{},h('div',{class:'kg-eyebrow',text:`${FORMATS[data.active]} / ${draft().purpose}`}),h('h2',{text:'选中成果清单'})),pill(`${ready.length} 份可预览`,'green')),
      h('p',{class:'kg-muted',text:'仅汇集勾选条目下明确选入的成果。同一成果重复选中时合并展示，未选资料保留在原处。'}),
      groups.length?h('ol',{class:'kg-assembly-list'},groups.map(({topic,refs})=>h('li',{},
        h('div',{class:'kg-assembly-topic'},button(`${topic.id} ${topic.title}`,()=>navigate(topic.id),{class:'kg-text-button'}),button('取消选择',()=>change(()=>setTopic(topic.id,false)),{class:'kg-text-button','aria-label':`取消选择 ${topic.id}`})),
        refs.length?h('ul',{},refs.map(({ref,source,status})=>h('li',{},h('span',{text:`${ref.title} · 所选版本 ${ref.revision??'待核对'}`}),h('small',{class:status==='ready'?'kg-muted':'kg-warning',text:status==='ready'?`${source.kind==='file'?'文件引用，未嵌入':'可预览'}${source.needsReview?' · 待复核':''}`:statusText(status)})))):h('p',{class:'kg-warning',text:'尚未选择实际成果；点击条目补充。'})))):
        h('div',{class:'kg-selection-empty'},h('strong',{text:'还没有选入内容'}),h('p',{text:'在左侧一级或二级目录旁勾选，再为条目选择需要展示的成果。'})),
      unresolved?h('p',{class:'kg-warning',text:`${unresolved} 处尚需补充或核对，暂不进入预览。`}):null,
      h('div',{class:'kg-assembly-actions'},button(`预览${FORMATS[data.active]}`,()=>{returnFocus=document.activeElement?.id;preview=true;rerender();focus('kg-close-preview');},{id:'kg-preview-presentation',class:'kg-button kg-primary-button','data-preview-presentation':'',disabled:!ready.length}),h('span',{class:'kg-muted',text:'本地草稿预览 · 具体版式及外置链接后续讨论'})));
  }
  function closePreview(){preview=false;rerender();focus(returnFocus);}
  function previewPanel(){
    if(!preview)return null;
    const {ready,unresolved}=manifest();
    function body(source){
      if(source.kind==='file')return h('div',{class:'kg-preview-file'},h('p',{text:source.payload.path}),h('small',{text:'已登记文件引用，文件内容未嵌入此预览。请在原文件中核对。'}));
      const result=source.payload;
      const lists=Object.entries({facts:'已知条件',assumptions:'假定条件',questions:'待确认事项',actions:'下一步'})
        .filter(([key])=>result[key]?.length)
        .map(([key,label])=>h('section',{class:'kg-preview-facts'},h('h4',{text:label}),h('ul',{},result[key].map(text=>h('li',{text})))));
      return [h('div',{class:'kg-narrative'},...paragraphs(result.narrative)),...lists];
    }
    return h('div',{class:'kg-preview-backdrop'},h('section',{role:'dialog','aria-modal':'true','aria-labelledby':'kg-preview-title',class:'kg-presentation-preview','data-presentation-preview':'',onKeyDown:event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closePreview();}
      if(event.key==='Tab'){
        const nodes=[...event.currentTarget.querySelectorAll('button,summary,[href],select,input')].filter(node=>!node.disabled),first=nodes[0],last=nodes.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    }},
      h('header',{},h('div',{},h('p',{class:'kg-eyebrow',text:`${FORMATS[data.active]} · 本地草稿预览`}),h('h2',{id:'kg-preview-title',text:getSnapshot().project?.name||'选定成果'}),h('p',{class:'kg-muted',text:`${draft().purpose} · ${ready.length} 份成果${unresolved?` · ${unresolved} 处缺项未纳入`:''}`})),button('关闭预览',closePreview,{id:'kg-close-preview',class:'kg-button','data-close-preview':''})),
      h('div',{class:'kg-preview-content'},ready.map(source=>{
        const meta=h('p',{class:'kg-preview-source-meta',text:`${source.topics.join(' / ')} · 版本 ${source.revision}${source.needsReview?' · 待复核':''}`});
        return data.active==='interactive'?h('details',{'data-preview-source':source.key,class:'kg-preview-document'},h('summary',{text:source.title}),meta,body(source)):
          h('article',{'data-preview-source':source.key,class:'kg-preview-document'},h('h3',{text:source.title}),meta,body(source));
      }))));
  }
  return {sync,setFormat,format:()=>data.active,stageControl,topicControl,sourcePicker,toolbar,assembly,previewPanel};
}
