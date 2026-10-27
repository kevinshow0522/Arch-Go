export function briefTask(t){
 return {id:t.id,project_id:t.project_id,subproject_id:t.subproject_id??null,stage_ids:t.stage_ids??(t.stage_id?[t.stage_id]:[]),tags:t.tags??[],method_version:t.method_version??null,executor:t.executor??null,work_package:t.work_package??null,credibility:t.credibility??null,instruction:t.instruction,output:t.output,status:t.status,state_version:t.state_version??1,result_revision:t.revision,checkpoint:t.checkpoint??null,review_reasons:t.review_reasons??[]};
}
export function boundedContext(value,maxChars){
 const complete={ready:true,...value};
 if(JSON.stringify(complete).length<=maxChars)return complete;
 // Never silently omit constraints while reporting that the context is ready.
 const fallback={ready:false,project:{id:value.project.id,name:value.project.name},context_version:value.context_version,task_id:value.task?.id??null,subproject_id:value.scope?.id??null,omitted_details:true,reason:'上下文超过本次字符预算。请按下列入口分页读取有效条件和决策，再读取任务详情中的dependencies和record_refs，按编号与版本补读上游成果及引用记录；不可把本返回视为完整设计依据。',required_reads:[{tool:'kg_list_records',arguments:{project_id:value.project.id,kind:'condition',offset:0,limit:10}},{tool:'kg_list_records',arguments:{project_id:value.project.id,kind:'decision',offset:0,limit:10}},{tool:'kg_get_project',arguments:{project_id:value.project.id}},{tool:'kg_list_materials',arguments:{project_id:value.project.id,offset:0,limit:20}}],max_chars:maxChars};
 if(value.task)fallback.required_reads.push({tool:'kg_get_task',arguments:{task_id:value.task.id}});
 if(value.scope)fallback.required_reads.push({tool:'kg_get_record',arguments:{project_id:value.project.id,record_id:value.scope.id,offset:0,limit:1000}});
 return fallback;
}
