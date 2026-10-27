import {publishProgress,publishArtifact,PublicationError} from './publication.mjs';
// This service is behind the unchanged owner-private Sites access boundary.
// Sites validates and consumes its service-access header before forwarding.
export async function publicationService(request,db,bucket){
 if(request.headers.has('Origin'))return new Response('Service access only',{status:403});
 if(!/application\/json/i.test(request.headers.get('Content-Type')||''))return new Response('JSON required',{status:415});
 if(Number(request.headers.get('Content-Length'))>10*1024*1024)return new Response('Request too large',{status:413});
 let body;try{const raw=await request.text();if(new TextEncoder().encode(raw).length>10*1024*1024)return new Response('Request too large',{status:413});body=JSON.parse(raw);}catch{return Response.json({error:'JSON格式无效'},{status:400});}
 try{
  if(!body?.arguments||typeof body.arguments!=='object'||Array.isArray(body.arguments))throw new PublicationError('缺少发布内容');
  const result=body.operation==='progress'?await publishProgress(db,body.arguments):body.operation==='artifact'?await publishArtifact(db,bucket,body.arguments):null;
  if(!result)throw new PublicationError('未知发布操作');
  return Response.json(result,{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){return Response.json({error:error instanceof PublicationError?error.message:'暂时无法发布，请重新读取当前云端版本后重试。'},{status:error instanceof PublicationError?error.status:503,headers:{'Cache-Control':'no-store'}});}
}
