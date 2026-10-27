import {env} from 'cloudflare:workers';
import {listProjects} from '../../../lib/publication.mjs';
export const dynamic='force-dynamic';
export async function GET(){return Response.json(await listProjects(env.DB),{headers:{'Cache-Control':'private, no-store'}});}
