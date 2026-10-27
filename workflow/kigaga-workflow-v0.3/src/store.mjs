import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {inputs} from './contracts.mjs';
import {STAGES} from './stages.mjs';

const now=()=>new Date().toISOString();
const decode=row=>row?JSON.parse(row.payload):null;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

export class ProjectStore {
  constructor(path) {
    if(path!==':memory:') mkdirSync(dirname(path),{recursive:true});
    this.db=new DatabaseSync(path);
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    const version=this.db.prepare('PRAGMA user_version').get().user_version;
    if(version!==0&&version!==2&&version!==3) {this.close();throw new Error('不支持该数据库版本，请先保留备份。');}
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, request_id TEXT UNIQUE NOT NULL, input TEXT NOT NULL, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS materials (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), request_id TEXT UNIQUE NOT NULL, input TEXT NOT NULL, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS material_versions (material_id TEXT REFERENCES materials(id), version INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(material_id,version));
      CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), request_id TEXT UNIQUE NOT NULL, input TEXT NOT NULL, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS result_versions (task_id TEXT REFERENCES tasks(id), version INTEGER NOT NULL, payload TEXT NOT NULL, saved_at TEXT NOT NULL, PRIMARY KEY(task_id,version));
      CREATE INDEX IF NOT EXISTS materials_project ON materials(project_id);
      CREATE INDEX IF NOT EXISTS tasks_project ON tasks(project_id);

    `);
    if(version===0)this.db.exec('PRAGMA user_version=2;');
  }
  close(){if(this.db){this.db.close();this.db=null;}}
  transaction(fn){
    if(this.transactionDepth)return fn();
    this.db.exec('BEGIN IMMEDIATE');this.transactionDepth=1;
    try{const value=fn();this.db.exec('COMMIT');return value;}
    catch(e){this.db.exec('ROLLBACK');throw e;}
    finally{this.transactionDepth=0;}
  }
  record(table,id){
    const value=decode(this.db.prepare(`SELECT payload FROM ${table} WHERE id=?`).get(id));
    if(!value)throw new Error('记录不存在，请重新读取项目或任务。');
    return value;
  }
  retry(table,input){
    const row=this.db.prepare(`SELECT input,payload FROM ${table} WHERE request_id=?`).get(input.request_id);
    if(!row)return null;
    if(row.input!==JSON.stringify(input))throw new Error('相同请求编号对应不同内容，请创建新请求。');
    return decode(row);
  }
  createProject(raw){
    const input=inputs.createProject.parse(raw);
    const project=this.transaction(()=>{
      const old=this.retry('projects',input);if(old)return old;
      const p={id:randomUUID(),name:input.name,summary:input.summary,created_at:now(),...(input.method_version?{method_version:input.method_version}:{})};
      this.db.prepare('INSERT INTO projects VALUES (?,?,?,?)').run(p.id,input.request_id,JSON.stringify(input),JSON.stringify(p));return p;
    });
    return this.snapshot(project.id);
  }
  addMaterial(raw){
    const input=inputs.addMaterial.parse(raw);
    this.transaction(()=>{
      this.record('projects',input.project_id);
      if(this.retry('materials',input))return;
      const m={id:randomUUID(),project_id:input.project_id,title:input.title,content:input.content,source:input.source,version:1,created_at:now()};
      this.db.prepare('INSERT INTO materials VALUES (?,?,?,?,?)').run(m.id,m.project_id,input.request_id,JSON.stringify(input),JSON.stringify(m));
      this.db.prepare('INSERT INTO material_versions VALUES (?,?,?)').run(m.id,1,JSON.stringify(m));
    });
    return this.snapshot(input.project_id);
  }
  updateMaterial(raw){
    const input=inputs.updateMaterial.parse(raw);
    const m=this.transaction(()=>{
      const current=this.record('materials',input.material_id);
      const matches=['title','content','source'].every(k=>input[k]===current[k]);
      if(current.version===input.expected_version+1&&matches)return current;
      if(current.version!==input.expected_version)throw new Error('资料版本已变化，请重新读取后修改。');
      const next={...current,title:input.title,content:input.content,source:input.source,version:current.version+1,updated_at:now()};
      this.db.prepare('UPDATE materials SET payload=? WHERE id=?').run(JSON.stringify(next),current.id);
      this.db.prepare('INSERT INTO material_versions VALUES (?,?,?)').run(current.id,next.version,JSON.stringify(next));return next;
    });return this.snapshot(m.project_id);
  }
  prepareTask(raw){
    const input=inputs.prepareTask.parse(raw);
    return this.transaction(()=>{
      const old=this.retry('tasks',input);if(old)return this.getTask(old.id);
      const project=this.record('projects',input.project_id);
      const materials=input.material_ids.map(id=>{
        const m=this.record('materials',id);
        if(m.project_id!==project.id)throw new Error('所选资料不属于当前项目。');
        return {id:m.id,title:m.title,content:m.content,source:m.source,version:m.version};
      });
      if(materials.reduce((n,m)=>n+m.content.length,0)>120000)throw new Error('本次所选文字资料过多，请拆分任务。');
      const stage=STAGES.find(s=>s.id===input.stage_id);
      const task={id:randomUUID(),request_id:input.request_id,project_id:project.id,project_name:project.name,stage_id:stage.id,stage_name:stage.name,instruction:input.instruction,output:input.output,materials,status:'prepared',revision:0,created_at:now(),result:null};
      this.db.prepare('INSERT INTO tasks VALUES (?,?,?,?,?)').run(task.id,project.id,input.request_id,JSON.stringify(input),JSON.stringify(task));
      return {...task,history:[]};
    });
  }
  getTask(id){
    inputs.getTask.parse({task_id:id});
    const task=this.record('tasks',id);
    const history=this.db.prepare('SELECT version,payload,saved_at FROM result_versions WHERE task_id=? ORDER BY version').all(id).map(r=>({revision:r.version,result:JSON.parse(r.payload),saved_at:r.saved_at}));
    return {...task,history};
  }
  saveResult(raw){
    const input=inputs.saveResult.parse(raw);
    return this.transaction(()=>{
      const task=this.record('tasks',input.task_id);
      if(task.revision===input.expected_revision+1&&same(task.result,input.result))return this.getTask(task.id);
      if(task.revision!==input.expected_revision)throw new Error('成果版本已变化，请重新读取任务，不能覆盖较新的结果。');
      const next={...task,revision:task.revision+1,result:input.result,status:'completed'};
      this.db.prepare('INSERT INTO result_versions VALUES (?,?,?,?)').run(task.id,next.revision,JSON.stringify(input.result),now());
      this.db.prepare('UPDATE tasks SET payload=? WHERE id=?').run(JSON.stringify(next),task.id);
      return this.getTask(task.id);
    });
  }
  markAccepted(raw){
    const input=inputs.markAccepted.parse(raw);
    return this.transaction(()=>{
      const task=this.record('tasks',input.task_id);
      if(task.status==='prepared')this.db.prepare('UPDATE tasks SET payload=? WHERE id=?').run(JSON.stringify({...task,status:'message_accepted',accepted_at:now()}),task.id);
      return this.getTask(task.id);
    });
  }
  snapshot(projectId,taskId){
    const selected_task=taskId?this.getTask(taskId):null;
    if(selected_task&&projectId&&selected_task.project_id!==projectId)throw new Error('任务不属于所选项目。');
    const projects=this.db.prepare('SELECT payload FROM projects ORDER BY rowid').all().map(decode);
    const selectedId=projectId||selected_task?.project_id||projects[0]?.id;
    const project=selectedId?this.record('projects',selectedId):null;
    const materials=project?this.db.prepare('SELECT payload FROM materials WHERE project_id=? ORDER BY rowid').all(project.id).map(decode):[];
    const tasks=project?this.db.prepare('SELECT id FROM tasks WHERE project_id=? ORDER BY rowid DESC').all(project.id).map(row=>this.getTask(row.id)):[];
    return {schema_version:2,stages:STAGES,projects,project,materials,tasks,selected_task};
  }
}
