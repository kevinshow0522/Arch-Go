import {z} from 'zod';
import {STAGES} from './stages.mjs';
const id=z.string().uuid();
const required=max=>z.string().trim().min(1).max(max);
const materialContent=z.string().max(50000).refine(value=>value.trim().length>0,'资料内容不能为空');
export const resultSchema=z.object({title:required(200),narrative:z.string().max(24000),facts:z.array(required(4000)).max(60),assumptions:z.array(required(4000)).max(60),questions:z.array(required(4000)).max(60),actions:z.array(required(4000)).max(60),mainline_ref:required(500).optional(),upstream_record_ids:z.array(id).max(40).optional(),upstream_record_refs:z.array(z.object({id,version:z.number().int().positive()}).strict()).max(40).optional(),credibility:z.enum(['✔','●','◐','○']).optional()}).strict();
export const inputs={
  createProject:z.object({method_version:required(40).optional(),request_id:id,name:required(120),summary:z.string().trim().max(4000).default('')}).strict(),
  addMaterial:z.object({request_id:id,project_id:id,title:required(200),content:materialContent,source:z.string().trim().max(2000).default('')}).strict(),
  updateMaterial:z.object({material_id:id,expected_version:z.number().int().positive(),title:required(200),content:materialContent,source:z.string().trim().max(2000).default('')}).strict(),
  prepareTask:z.object({request_id:id,project_id:id,stage_id:z.enum(STAGES.map(x=>x.id)),material_ids:z.array(id).max(20).refine(a=>new Set(a).size===a.length,'资料不能重复选择'),instruction:required(6000),output:required(3000)}).strict(),
  saveResult:z.object({task_id:id,expected_revision:z.number().int().nonnegative(),result:resultSchema}).strict(),
  markAccepted:z.object({task_id:id}).strict(),
  getTask:z.object({task_id:id}).strict(),
  getProject:z.object({project_id:id}).strict(),
  open:z.object({project_id:id.optional(),task_id:id.optional()}).strict(),
};
