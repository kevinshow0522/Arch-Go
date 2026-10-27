import {env} from 'cloudflare:workers';
import {publicationService} from '../../../lib/publication-service.mjs';
export const dynamic='force-dynamic';
export function POST(request:Request){return publicationService(request,env.DB,env.BUCKET);}
