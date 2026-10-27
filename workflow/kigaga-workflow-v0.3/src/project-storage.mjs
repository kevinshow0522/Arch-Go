import {existsSync,mkdirSync,realpathSync,readFileSync,writeFileSync,lstatSync} from 'node:fs';
import {isAbsolute,join,relative,resolve,dirname,sep} from 'node:path';
export class ProjectStorage {
 constructor(db,root){
  if(!isAbsolute(root)||!existsSync(root))throw new Error('项目存储盘不可用，请先连接存储盘；不会回退到 C 盘。');
  this.db=db;this.root=realpathSync(root);
  db.exec('CREATE TABLE IF NOT EXISTS project_storage(project_id TEXT PRIMARY KEY REFERENCES projects(id),directory TEXT UNIQUE COLLATE NOCASE NOT NULL)');
 }
 get(id){const row=this.db.prepare('SELECT directory FROM project_storage WHERE project_id=?').get(id);return row?{directory:row.directory,output_directory:join(row.directory,'成果输出'),materials_directory:join(row.directory,'项目资料'),working_directory:join(row.directory,'工作文件')}:null;}
 checked(path){
  const target=resolve(path),rel=relative(this.root,target);
  if(!rel||rel.startsWith('..')||isAbsolute(rel)||rel.split(sep)[0]==='_KiGAGA系统')throw new Error('项目目录必须位于配置的设计项目盘内，且不能使用系统目录。');
  let ancestor=target;while(!existsSync(ancestor)&&ancestor!==dirname(ancestor))ancestor=dirname(ancestor);
  const real=realpathSync(ancestor),actual=relative(this.root,real);
  if(actual.startsWith('..')||isAbsolute(actual))throw new Error('项目目录链接指向存储范围之外。');
  return target;
 }
 prepare(project,directory){
  const old=this.get(project.id);
  if(old){if(directory&&resolve(directory).toLowerCase()!==old.directory.toLowerCase())throw new Error('项目已绑定目录；更换目录须先迁移并核对已有成果，不能直接改绑定。');this.ensure(old);return old;}
  let name=project.name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/g,'').slice(0,90)||'未命名项目';
  if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)||name==='_KiGAGA系统')name=`项目_${name}`;
  let path=this.checked(directory||join(this.root,name));
  const owner=this.db.prepare('SELECT project_id FROM project_storage WHERE directory=? COLLATE NOCASE').get(path);
  if(owner){if(directory)throw new Error('目录已属于另一项目。');path=this.checked(join(this.root,`${name}__${project.id}`));}
  mkdirSync(path,{recursive:true});path=realpathSync(path);this.checked(path);
  this.db.prepare('INSERT INTO project_storage(project_id,directory) VALUES(?,?)').run(project.id,path);
  const storage=this.get(project.id);this.ensure(storage);return storage;
 }
 ensure(storage){for(const path of [storage.directory,storage.output_directory,storage.materials_directory,storage.working_directory]){this.checked(path);mkdirSync(path,{recursive:true});this.checked(realpathSync(path));}}
 export(task,storage){
  this.ensure(storage);
  const directory=this.checked(join(storage.output_directory,task.id));mkdirSync(directory,{recursive:true});
  const file=this.checked(join(directory,`成果-v${task.revision}-状态${task.state_version}.md`));
  const r=task.result;
  const body='\uFEFF'+[`# ${r.title}`,`项目：${task.project_name}\n任务：${task.id}\n成果版本：${task.revision}\n状态：${task.status}\n文件导出不代表专业验收通过。`,r.narrative,...[['已知条件',r.facts],['假定条件',r.assumptions],['待确认',r.questions],['下一步',r.actions]].flatMap(([title,items])=>items?.length?[`## ${title}`,items.map(x=>`- ${x}`).join('\n')]:[])].join('\n\n')+'\n';
  if(existsSync(file)){
   if(lstatSync(file).isSymbolicLink()||readFileSync(file,'utf8')!==body)throw new Error('已有导出文件被修改，未覆盖；请保留修改并保存新的成果版本。');
  }else writeFileSync(file,body,{flag:'wx'});
  return file;
 }
}
