// Run with services stopped. Copies via SQLite backup; never edits the source database.
import {DatabaseSync,backup} from 'node:sqlite';
import {mkdirSync,existsSync,writeFileSync,copyFileSync} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {WorkflowStore} from '../src/workflow-store.mjs';
function fingerprint(db){
 const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>r.name);
 return Object.fromEntries(tables.map(name=>{if(!/^[a-z_]+$/.test(name))throw new Error('Unexpected table');const rows=db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all();return [name,{count:rows.length,sha256:createHash('sha256').update(JSON.stringify(rows)).digest('hex')}];}));
}
const [sourcePath,targetPath,projectsRoot,backupDirectory]=process.argv.slice(2).map(p=>resolve(p));
if(!sourcePath||!targetPath||!projectsRoot||!backupDirectory)throw new Error('source target projectsRoot backupDirectory are required');
if(existsSync(targetPath))throw new Error('目标数据库已存在，拒绝覆盖。');
mkdirSync(dirname(targetPath),{recursive:true});mkdirSync(backupDirectory,{recursive:true});
const source=new DatabaseSync(sourcePath,{readOnly:true});
let before;
try{
 before=fingerprint(source);
 const oldArtifacts=source.prepare("SELECT COUNT(*) AS n FROM workflow_records WHERE kind='artifact'").get().n;
 if(oldArtifacts)throw new Error('源库含已登记文件，需要逐文件迁移方案；未复制或改写原库。');
 await backup(source,targetPath);
}finally{source.close();}
const cloned=new DatabaseSync(targetPath,{readOnly:true});
try{
 if(JSON.stringify(fingerprint(cloned))!==JSON.stringify(before))throw new Error('复制后记录不一致，停止切换。');
 if(cloned.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw new Error('复制后完整性检查失败');
}finally{cloned.close();}
const archive=join(backupDirectory,'workflow-before-storage-migration.db');copyFileSync(targetPath,archive,1);
const store=new WorkflowStore(targetPath,{projectsRoot});
const projects=[],exports=[];
try{
 const ids=store.db.prepare('SELECT id FROM projects ORDER BY rowid').all().map(r=>r.id);
 for(const id of ids){const storage=store.prepareProjectStorage({project_id:id});projects.push({id,name:store.project(id).name,...storage});
  const tasks=store.db.prepare('SELECT id FROM tasks WHERE project_id=?').all(id);
  for(const {id:task_id} of tasks){if(store.getTask(task_id).result)exports.push(store.exportResult({project_id:id,task_id}));}
 }
 const after=fingerprint(store.db);
 for(const table of ['tasks','materials','material_versions','result_versions','task_checkpoints'])if(JSON.stringify(before[table])!==JSON.stringify(after[table]))throw new Error(`迁移后 ${table} 的原有内容或版本发生变化`);
 if(store.db.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw new Error('准备目录后完整性检查失败');
 const report={sourcePath,targetPath,projectsRoot,backup:archive,verifiedSourceTables:before,projects,exports,checkedAt:new Date().toISOString()};
 writeFileSync(join(backupDirectory,'migration-report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({targetPath,projectCount:projects.length,exportCount:exports.length,backup:archive,integrity:'ok'}));
}finally{store.close();}
