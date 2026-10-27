import {listProjects,readProject,publishProgress,publishArtifact,PublicationError} from './publication.mjs';
import {workbenchUri,workbenchMime,workbenchResource} from './workbench-ui.mjs';
import {workbenchIcons} from './workbench-icons.mjs';
const string={type:'string'},int={type:'integer',minimum:0};
export const toolList=[
 {name:'ki_cloud_open_workbench',title:'KI建筑设计工作台',icons:workbenchIcons,description:'仅从左侧唯一入口打开云端只读工作台，查看AI工作进度、主线、交接和已发布成果。页面使用云端数据，不依赖本机电脑；对话中使用数据工具，不另外打开预览。',annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true},inputSchema:{type:'object',properties:{source_key:string},additionalProperties:false},_meta:{ui:{resourceUri:workbenchUri,visibility:['app']},'openai/outputTemplate':workbenchUri,'openai/widgetAccessible':true,'openai/ui':{entrypoints:[{type:'global'}]}}},
 {name:'ki_cloud_list_projects',description:'只读列出云端已发布的项目、来源版本与更新时间。云端是展示副本，不能将发布视为设计确认。',annotations:{readOnlyHint:true,idempotentHint:true},inputSchema:{type:'object',properties:{offset:int},additionalProperties:false}},
 {name:'ki_cloud_get_project',description:'只读取得已发布进度、文字成果与附件目录。修改发布前先读revision；以来源项目库或当前授权对话为事实依据。',annotations:{readOnlyHint:true,idempotentHint:true},inputSchema:{type:'object',properties:{source_key:string,task_offset:int},required:['source_key'],additionalProperties:false}},
 {name:'ki_cloud_publish_progress',description:'在用户授权后，发布当前项目的只读进度与成果快照。保留source_id/project_id、真实source_version与来源更新时间；expected_publication_revision取刚读到的云端revision，首次为0。快照project.id必须等于project_id。任务状态、确认与作者必须来自真实记录，不得为展示补造。此操作不回写项目库、不执行本地软件，也不代表设计验收。',annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true},inputSchema:{type:'object',properties:{request_id:string,source_id:string,project_id:string,source_version:int,source_updated_at:{type:'string',format:'date-time'},expected_publication_revision:int,snapshot:{type:'object',description:'project、tasks、records、chapter_summaries、handoffs，沿用项目服务的只读快照结构。不得包含凭据或绝对文件路径。'}},required:['request_id','source_id','project_id','source_version','source_updated_at','expected_publication_revision','snapshot'],additionalProperties:false}},
 {name:'ki_cloud_publish_artifact',description:'将用户选定的展示成果保存到云端，最多6MB。仅上传本次授权的成果文件。先发布项目进度，传原始文件Base64与准确类型，保留任务和成果版本；同一请求编号可安全重试。图片/PDF可查看，其他类型下载。不改本地文件、不作设计确认。',annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true},inputSchema:{type:'object',properties:{request_id:string,source_id:string,project_id:string,task_id:string,result_revision:int,title:string,file_name:string,mime_type:string,content_base64:string},required:['request_id','source_id','project_id','title','file_name','mime_type','content_base64'],additionalProperties:false}}
];
for(const tool of toolList)tool._meta={...tool._meta,'openai/widgetAccessible':tool.annotations.readOnlyHint,ui:{...tool._meta?.ui,visibility:tool._meta?.ui?.visibility??(tool.annotations.readOnlyHint?['model','app']:['model'])}};
export async function mcp(request,db,bucket,assets){
 const origin=request.headers.get('Origin');if(origin&&origin!==new URL(request.url).origin)return new Response('Origin not allowed',{status:403});
 if(!/application\/json/i.test(request.headers.get('Content-Type')||''))return new Response('JSON required',{status:415});
 if(Number(request.headers.get('Content-Length'))>10*1024*1024)return new Response('Request too large',{status:413});
 let rpc;try{const raw=await request.text();if(new TextEncoder().encode(raw).length>10*1024*1024)return new Response('Request too large',{status:413});rpc=JSON.parse(raw);}catch{return Response.json({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Invalid JSON'}},{status:400});}
 if(!rpc||typeof rpc!=='object'||Array.isArray(rpc)||rpc.jsonrpc!=='2.0'||typeof rpc.method!=='string')return Response.json({jsonrpc:'2.0',id:null,error:{code:-32600,message:'Invalid request'}},{status:400});
 const modern=rpc.method==='server/discover'||request.headers.get('mcp-protocol-version')==='2026-07-28'||rpc.params?._meta?.['io.modelcontextprotocol/protocolVersion']==='2026-07-28';
 // The 2026 app loader validates the response envelope before creating a frame.
 const reply=result=>Response.json({jsonrpc:'2.0',id:rpc.id??null,result:modern?{...result,resultType:'complete',...(['server/discover','tools/list','resources/list','resources/read'].includes(rpc.method)?{ttlMs:0,cacheScope:'private'}:{})}:result},{headers:{'Cache-Control':'no-store'}});
 if(rpc.method?.startsWith('notifications/'))return new Response(null,{status:202});
 if(rpc.method==='server/discover')return reply({supportedVersions:['2026-07-28'],capabilities:{tools:{},resources:{}},serverInfo:{name:'ki-arch-cloud-workbench',version:'0.2.1'},_meta:{'io.modelcontextprotocol/serverInfo':{name:'ki-arch-cloud-workbench',version:'0.2.1'}}});
 if(rpc.method==='initialize')return reply({protocolVersion:['2026-07-28','2025-11-25','2025-06-18','2025-03-26','2024-11-05'].includes(rpc.params?.protocolVersion)?rpc.params.protocolVersion:'2026-07-28',serverInfo:{name:'ki-arch-cloud-workbench',version:'0.2.1'},capabilities:{tools:{},resources:{}}});
 if(rpc.method==='ping')return reply({});
 if(rpc.method==='tools/list')return reply({tools:toolList});
 if(rpc.method==='resources/list')return reply({resources:[{uri:workbenchUri,name:'KI建筑设计工作台',mimeType:workbenchMime}]});
 if(rpc.method==='resources/read'){
  if(rpc.params?.uri!==workbenchUri)return Response.json({jsonrpc:'2.0',id:rpc.id??null,error:{code:-32002,message:'Resource not found'}});
  try{return reply({contents:[workbenchResource(new URL(request.url).origin,assets)]});}
  catch(error){console.error('KI_UI_RESOURCE',error.message);return Response.json({jsonrpc:'2.0',id:rpc.id??null,error:{code:-32603,message:'工作台界面暂时不可用'}});}
 }
 if(rpc.method!=='tools/call')return Response.json({jsonrpc:'2.0',id:rpc.id??null,error:{code:-32601,message:'Method not found'}},{status:200});
 try{
  const a=rpc.params?.arguments??{};let result;
  switch(rpc.params?.name){
   case 'ki_cloud_open_workbench':{const index=await listProjects(db);if(a.source_key)await readProject(db,a.source_key);result={read_only:true,project_count:index.projects.length,...(a.source_key?{source_key:a.source_key}:{})};break;}
   case 'ki_cloud_list_projects':result=await listProjects(db,a.offset??0);break;
   case 'ki_cloud_get_project':{const project=await readProject(db,a.source_key);const offset=a.task_offset??0;if(!Number.isSafeInteger(offset)||offset<0)throw new PublicationError('分页位置不正确');const tasks=project.snapshot.tasks??[];result={...project,snapshot:{...project.snapshot,tasks:tasks.slice(offset,offset+50)},next_task_offset:tasks.length>offset+50?offset+50:null};break;}
   case 'ki_cloud_publish_progress':result=await publishProgress(db,a);break;
   case 'ki_cloud_publish_artifact':result=await publishArtifact(db,bucket,a);break;
   default:throw new PublicationError('未知工具');
  }
  return reply({content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result,isError:false});
 }catch(error){console.error('KI_MCP_TOOL',JSON.stringify({tool:rpc.params?.name,error:error instanceof PublicationError?error.message:'internal_error'}));return reply({content:[{type:'text',text:error instanceof PublicationError?error.message:'云端暂时不可用，请稍后读取当前版本再重试。'}],isError:true});}
}
