import {DatabaseSync} from 'node:sqlite';
import {z} from 'zod';
import {workflowInputs as schema} from './workflow-contracts.mjs';
import {getProjectProgress,ProjectReadError} from './project-progress.mjs';
import {listProjectFiles,readProjectFile} from './project-files.mjs';

// Returns true when handled; false lets the preview server serve its other routes.
// A database is opened lazily, with SQLite's read-only flag, and is never created.
export function createProjectReadApiHandler({dbPath,referenceRoots}={}){
 let db=null;
 function source(){if(!db){if(!dbPath)throw new ProjectReadError('未配置只读项目库。',503,'database_unavailable');try{db=new DatabaseSync(dbPath,{readOnly:true});}catch{throw new ProjectReadError('只读项目库不可用。',503,'database_unavailable');}}return db;}
 const send=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
 const handler=async(req,res)=>{
  const pathname=(req.url??'').split('?',1)[0];
  if(!['/api/project-progress','/api/project-files','/api/project-file'].includes(pathname))return false;
  const expectedHost=`127.0.0.1:${req.socket.localPort}`,remote=req.socket.remoteAddress;
  if(req.headers.host!==expectedHost||!['127.0.0.1','::ffff:127.0.0.1'].includes(remote)||req.headers['sec-fetch-site']==='cross-site'||(req.headers.origin&&req.headers.origin!==`http://${expectedHost}`)){send(res,403,{error:'只允许同源本机读取。',code:'forbidden'});return true;}
  if(req.method!=='GET'){send(res,405,{error:'只允许GET读取。',code:'method_not_allowed'});return true;}
  try{
   const params=new URL(req.url,`http://${expectedHost}`).searchParams,args={};
   for(const [key,value] of params){if(key in args)throw new ProjectReadError('查询参数不能重复。');args[key]=value;}
   if(pathname==='/api/project-files'){
    for(const key of ['offset','limit'])if(key in args)args[key]=Number(args[key]);
    if('hash' in args){if(!['true','false'].includes(args.hash))throw new ProjectReadError('hash参数须为true或false。');args.hash=args.hash==='true';}
   }
   let result;
   // Validate required project_id and all arguments before opening the database.
   if(pathname==='/api/project-progress'){const input=schema.projectProgress.parse(args);result=getProjectProgress(source(),input);}
   else if(pathname==='/api/project-files'){const input=schema.listProjectFiles.parse(args);result=await listProjectFiles({db:source(),referenceRoots},input);}
   else if(pathname==='/api/project-file'){const input=schema.readProjectFile.parse(args);result=await readProjectFile({db:source(),referenceRoots},input);}
   send(res,200,result);
  }catch(error){const known=error instanceof ProjectReadError||Number.isInteger(error?.status),status=known&&error.status>=400&&error.status<=599?error.status:400;send(res,status,{error:error instanceof z.ZodError?'输入格式不正确，请核对必填参数与取值。':known?error.message:'项目读取失败，请核对项目库和参数。',code:known?error.code??'read_failed':'invalid_request'});}
  return true;
 };
 handler.close=()=>{db?.close();db=null;};return handler;
}
