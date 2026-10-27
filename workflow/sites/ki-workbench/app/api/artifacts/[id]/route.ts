import {env} from 'cloudflare:workers';
import {readArtifact,PublicationError} from '../../../../lib/publication.mjs';
export const dynamic='force-dynamic';
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){try{return await readArtifact(env.DB,env.BUCKET,(await params).id);}catch(error){return Response.json({error:error instanceof PublicationError?error.message:'暂时无法读取成果'},{status:error instanceof PublicationError?error.status:503});}}
