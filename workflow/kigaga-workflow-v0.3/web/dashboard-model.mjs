export const STAGE_LABELS={general:'项目事务',opportunity:'机会判断',positioning:'项目定位',site:'场地研究',cases:'案例研究',concept:'概念方案',development:'方案深化',delivery:'成果交付'};
export function taskStages(task){
  return task.stage_ids?.length ? task.stage_ids : [task.stage_id || 'general'];
}
export function tasksForStage(tasks,stageId){return tasks.filter(task=>taskStages(task).includes(stageId));}
export function taskProgress(tasks){
  const unique=[...new Map(tasks.map(task=>[task.id,task])).values()];
  const active=unique.filter(task=>task.status!=='cancelled');
  const completed=active.filter(task=>task.status==='completed').length;
  return {total:active.length,completed,remaining:active.length-completed,cancelled:unique.length-active.length,percent:active.length?Math.round(completed/active.length*100):0};
}
export function stageProgress(tasks,id){
  const scoped=tasksForStage(tasks,id),progress=taskProgress(scoped);
  let status='未开始';
  if(progress.total){
    if(scoped.some(t=>t.status==='needs_review'))status='待复核';
    else if(scoped.some(t=>t.status==='waiting_decision'))status='待决定';
    else if(scoped.some(t=>t.status==='waiting_material'))status='待资料';
    else if(progress.remaining===0)status='阶段待确认';
    else if(scoped.every(t=>['paused','cancelled'].includes(t.status)))status='已暂停';
    else status='未完成';
  }else if(progress.cancelled)status='任务已取消';
  // Task checkpoints are not stage acceptance. The current service has no stage approval field.
  return {...progress,stageComplete:false,status,tone:progress.cancelled&&!progress.total?'neutral':'red'};
}
export function taskStatus(status){
  return {completed:['已完成','green'],prepared:['待开始','red'],message_accepted:['待执行','red'],in_progress:['进行中','red'],needs_review:['待复核','red'],waiting_material:['待资料','red'],waiting_decision:['待决定','red'],paused:['已暂停','red'],cancelled:['已取消','neutral']}[status]||['状态待核实','red'];
}
export function normalizeSnapshot(value){
  const tasks=Array.isArray(value?.tasks)?value.tasks:[];
  return {...value,projects:value?.projects||[],project:value?.project||null,tasks,materials:value?.materials||[],artifacts:value?.artifacts||[],selected_task:value?.selected_task||null};
}
