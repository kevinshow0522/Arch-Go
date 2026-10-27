import {env} from 'cloudflare:workers';
import {readProject,PublicationError} from '../../../../lib/publication.mjs';
export const dynamic='force-dynamic';
export async function GET(_:Request,{params}:{params:Promise<{key:string}>}){try{return Response.json(await readProject(env.DB,(await params).key),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return Response.json({error:error instanceof PublicationError?error.message:'暂时无法读取进度'},{status:error instanceof PublicationError?error.status:503});}}
