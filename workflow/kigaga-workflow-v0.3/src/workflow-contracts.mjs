import {z} from 'zod';
import {inputs} from './contracts.mjs';
import {STAGES} from './stages.mjs';
const id=z.string().uuid();
const text=max=>z.string().trim().min(1).max(max);
const ids=z.array(id).max(40).refine(a=>new Set(a).size===a.length,'标识不能重复');
const paging={offset:z.number().int().min(0).default(0),limit:z.number().int().min(1).max(50).default(20)};
const pageText={offset:z.number().int().min(0).default(0),limit:z.number().int().min(1).max(12000).default(6000)};
export const taskStatuses=['prepared','message_accepted','in_progress','waiting_material','waiting_decision','needs_review','completed','paused','cancelled'];
const recordKinds=['condition','decision','note','subproject','artifact','handoff','chapter_summary','mainline','metrics'];
const method={method_version:text(40).optional()};
const execution={executor:z.enum(['gpt','claude','user','codex','用户']).optional()};
const checkpoint=z.object({summary:z.string().max(2000),done:z.array(text(500)).max(20),next:z.string().max(1000),blockers:z.array(text(500)).max(20),checks:z.array(text(500)).max(20)}).strict();
export const workflowInputs={
 projectProgress:z.object({project_id:id}).strict(),
 listProjectFiles:z.object({project_id:id,area:z.enum(['项目资料','工作文件','成果输出','参考库']).optional(),library:text(120).optional(),path:z.string().max(4000).default(''),since:z.iso.datetime({offset:true}).optional(),hash:z.boolean().default(false),offset:z.number().int().min(0).max(100000).default(0),limit:z.number().int().min(1).max(500).default(500)}).strict(),
 readProjectFile:z.object({project_id:id,area:z.enum(['项目资料','工作文件','成果输出','参考库']),library:text(120).optional(),path:z.string().min(1).max(4000)}).strict(),
 updateProject:z.object({request_id:id,project_id:id,expected_context_version:z.number().int().nonnegative(),name:text(120),summary:z.string().trim().max(4000)}).strict(),
 readResult:z.object({project_id:id,task_id:id,revision:z.number().int().positive().optional(),...pageText}).strict(),
 findProjects:z.object({query:z.string().trim().max(200).default(''),...paging}).strict(),
 prepareTask:inputs.prepareTask.omit({stage_id:true}).extend({...method,...execution,work_package:text(40).optional(),credibility:z.enum(['✔','●','◐','○']).optional(),stage_id:z.enum(STAGES.map(s=>s.id)).optional(),stage_ids:z.array(z.enum(STAGES.map(s=>s.id))).max(7).default([]),tags:z.array(text(80)).max(10).default([]),subproject_id:id.nullable().default(null),dependency_ids:ids.default([]),record_ids:ids.default([])}).strict(),
 saveResult:inputs.saveResult.extend({...method,...execution,mainline_ref:text(500).optional(),upstream_record_ids:ids.optional()}).strict(),
 addDependency:z.object({...method,request_id:id.optional(),task_id:id,dependency_id:id,expected_state_version:z.number().int().positive().optional()}).strict(),
 saveRecord:z.object({...method,request_id:id,project_id:id,record_id:id.optional(),expected_version:z.number().int().positive().optional(),kind:z.enum(recordKinds.filter(k=>k!=='artifact')),title:text(200),content:text(12000),status:z.enum(['confirmed','proposed','pending','conflict','retired','rejected','active','completed','paused']),source:z.string().trim().max(2000).default(''),subproject_id:id.nullable().default(null)}).strict(),
 getRecord:z.object({project_id:id,record_id:id,version:z.number().int().positive().optional(),...pageText}).strict(),
 listRecords:z.object({project_id:id,kind:z.enum(recordKinds).optional(),subproject_id:id.nullable().optional(),...paging}).strict(),
 listMaterials:z.object({project_id:id,...paging}).strict(),
 listTasks:z.object({project_id:id,subproject_id:id.nullable().optional(),...paging}).strict(),
 context:z.object({project_id:id,task_id:id.optional(),subproject_id:id.optional(),max_chars:z.number().int().min(2000).max(30000).default(14000)}).strict(),
 checkpointTask:z.object({...method,...execution,handoff_record_id:id.optional(),request_id:id,task_id:id,expected_state_version:z.number().int().positive(),expected_context_version:z.number().int().nonnegative(),status:z.enum(taskStatuses),checkpoint,acknowledge_changes:z.boolean().default(false),refresh_evidence:z.boolean().default(false)}).strict(),
 readMaterial:z.object({project_id:id,material_id:id,version:z.number().int().positive().optional(),...pageText}).strict(),
 registerArtifact:z.object({request_id:id,project_id:id,artifact_id:id.optional(),expected_version:z.number().int().positive().optional(),title:text(200),path:text(4000),subproject_id:id.nullable().default(null),source:z.string().max(2000).default('')} ).strict(),
 checkArtifact:z.object({project_id:id,artifact_id:id}).strict(),
};
