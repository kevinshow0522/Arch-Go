import {lstat,realpath,readdir,open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,relative,isAbsolute,win32,join,extname} from 'node:path';
import {workflowInputs as schema} from './workflow-contracts.mjs';
import {readStoredProject,ProjectReadError} from './project-progress.mjs';
import {defaultReferenceRoots} from './storage-location.mjs';

const areas={'项目资料':'materials_directory','工作文件':'working_directory','成果输出':'output_directory'};
const textTypes={'.txt':'text/plain','.md':'text/markdown','.json':'application/json','.geojson':'application/geo+json','.csv':'text/csv','.tsv':'text/tab-separated-values','.xml':'application/xml','.kml':'application/vnd.google-earth.kml+xml','.svg':'image/svg+xml','.html':'text/html','.htm':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.yaml':'text/yaml','.yml':'text/yaml','.log':'text/plain','.ini':'text/plain','.dxf':'application/dxf'};
const binaryTypes={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.bmp':'image/bmp','.pdf':'application/pdf','.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation','.zip':'application/zip'};
const inside=(root,target)=>{const rel=relative(root,target);return !isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..\\')&&!rel.startsWith('../');};
function safePath(value){
 if(typeof value!=='string'||isAbsolute(value)||win32.isAbsolute(value)||/[:\x00-\x1f]/.test(value))throw new ProjectReadError('文件路径必须为区内相对路径。');
 const parts=value.replaceAll('\\','/').split('/');
 if(parts.some(part=>part==='..'||part==='.'||/[. ]$/.test(part)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)))throw new ProjectReadError('文件路径包含不允许的路径段。');
 return parts.filter(Boolean).join('/');
}
function fileError(error){if(error instanceof ProjectReadError)return error;return new ProjectReadError(error?.code==='ENOENT'?'项目文件或目录不存在。':'无法读取项目文件或目录。',error?.code==='ENOENT'?404:400,'file_unavailable');}
async function checked(root,path){
 const target=resolve(root,path);if(!inside(root,target))throw new ProjectReadError('文件超出所选项目区。');
 let current=root;
 for(const part of ['',...safePath(path).split('/').filter(Boolean)]){
  if(part)current=join(current,part);const stat=await lstat(current);
  if(stat.isSymbolicLink())throw new ProjectReadError('不读取符号链接或目录链接。');
 }
 if(!inside(root,await realpath(target)))throw new ProjectReadError('文件链接超出所选项目区。');
 return target;
}
async function areaRoot(project,area,source,library){
 if(area==='参考库'){
  const roots=source.referenceRoots??defaultReferenceRoots;
  const root=library?roots.find(root=>root.label===library):roots.length===1?roots[0]:null;
  if(!root)throw new ProjectReadError('请选择已配置的参考库library。');
  if((await lstat(root.path)).isSymbolicLink())throw new ProjectReadError('参考库根目录不能为链接。');
  const actual=await realpath(root.path);if(!(await lstat(actual)).isDirectory())throw new ProjectReadError('参考库不是目录。');return actual;
 }
 if(!project.storage)throw new ProjectReadError('项目尚未绑定文件目录。',409,'storage_unavailable');
 const bound=project.storage.directory;if((await lstat(bound)).isSymbolicLink())throw new ProjectReadError('项目绑定目录不能为链接。');
 const projectRoot=await realpath(bound),root=await checked(projectRoot,area);
 if(!(await lstat(root)).isDirectory())throw new ProjectReadError('项目区不是目录。');return root;
}
async function opened(root,path){
 const target=await checked(root,path),before=await lstat(target);if(!before.isFile())throw new ProjectReadError('只允许读取普通文件。');
 const handle=await open(target,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
 try{const stat=await handle.stat();await checked(root,path);if(!stat.isFile()||stat.dev!==before.dev||stat.ino!==before.ino)throw new ProjectReadError('文件在读取前已变化，请重试。');return {handle,stat};}catch(error){await handle.close();throw error;}
}
async function consume(handle,maxBytes,hashOnly=false){
 const digest=hashOnly?createHash('sha256'):null,chunks=[];let size=0;
 for(;;){const chunk=Buffer.allocUnsafe(Math.min(65536,maxBytes-size+1));const {bytesRead}=await handle.read(chunk,0,chunk.length,null);if(!bytesRead)break;size+=bytesRead;if(size>maxBytes)throw new ProjectReadError('文件过大。',413,'file_too_large');const data=chunk.subarray(0,bytesRead);if(digest)digest.update(data);else chunks.push(data);}
 return digest?digest.digest('hex'):Buffer.concat(chunks);
}
const kind=ext=>ext==='.dxf'?'dxf':ext==='.pdf'?'pdf':/^\.(png|jpe?g|gif|webp|bmp|svg|tiff?)$/.test(ext)?'image':/^\.(docx?|odt|pptx?)$/.test(ext)?'doc':/^\.(xlsx?|csv|tsv|ods)$/.test(ext)?'sheet':textTypes[ext]?'text':'other';

export async function listProjectFiles(source,raw){
 const args=schema.listProjectFiles.parse(raw),path=safePath(args.path),project=readStoredProject(source,args.project_id),items=[];let matched=0,more=false,visited=0;
 async function* walk(root,directory,prefix){
  for(const entry of (await readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
   if(++visited>100000)throw new ProjectReadError('目录过大，请缩小子目录范围。');
   const rel=prefix?`${prefix}/${entry.name}`:entry.name;
   try{safePath(rel);}catch{continue;}
   if(entry.isSymbolicLink())continue;
   const full=await checked(root,rel),stat=await lstat(full);
   if(stat.isDirectory())yield* walk(root,full,rel);else if(stat.isFile())yield {path:rel,stat};
  }
 }
 try{
  if(args.library&&args.area!=='参考库')throw new ProjectReadError('library只用于参考库。');
  const scopes=args.area==='参考库'?(source.referenceRoots??defaultReferenceRoots).filter(root=>!args.library||root.label===args.library).map(root=>({area:'参考库',library:root.label})):(args.area?[args.area]:Object.keys(areas)).map(area=>({area}));
  if(!scopes.length)throw new ProjectReadError('参考库未配置。');
  for(const {area,library} of scopes){
   const root=await areaRoot(project,area,source,library),directory=await checked(root,path);
   if(!(await lstat(directory)).isDirectory())throw new ProjectReadError('清单路径必须是目录。');
   for await(const file of walk(root,directory,path)){
    if(args.since&&file.stat.mtimeMs<=Date.parse(args.since))continue;
    if(matched++<args.offset)continue;if(items.length===args.limit){more=true;break;}
    let sha256=null;
    if(args.hash&&file.stat.size<=50*1024*1024){const {handle,stat}=await opened(root,file.path);try{if(stat.size<=50*1024*1024)sha256=await consume(handle,50*1024*1024,true);}finally{await handle.close();}}
    items.push({area,...(library?{library}:{}),path:file.path,name:file.path.split('/').at(-1),size:file.stat.size,modified_at:file.stat.mtime.toISOString(),kind:kind(extname(file.path).toLowerCase()),sha256});
   }
   if(more)break;
  }
  return {root_label:project.name,items,truncated:more,next_offset:more?args.offset+items.length:null};
 }catch(error){throw fileError(error);}
}

export async function readProjectFile(source,raw){
 const args=schema.readProjectFile.parse(raw),path=safePath(args.path),project=readStoredProject(source,args.project_id);
 if(!path)throw new ProjectReadError('请选择区内文件。');
 try{
  if(args.library&&args.area!=='参考库')throw new ProjectReadError('library只用于参考库。');
  const root=await areaRoot(project,args.area,source,args.library),{handle,stat}=await opened(root,path),ext=extname(path).toLowerCase(),textType=textTypes[ext],limit=(textType?1:10)*1024*1024;
  try{if(stat.size>limit)throw new ProjectReadError('文件过大。',413,'file_too_large');const data=await consume(handle,limit);return textType?{content_type:`${textType}; charset=utf-8`,text:data.toString('utf8')}:{content_type:binaryTypes[ext]??'application/octet-stream',data_base64:data.toString('base64')};}finally{await handle.close();}
 }catch(error){throw fileError(error);}
}
