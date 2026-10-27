import {env} from 'cloudflare:workers';
import {mcp} from '../../lib/mcp.mjs';
import html from '../../workbench/page.html?raw';
import method from '../../public/workbench-method.js?raw';
import runtime from '../../public/workbench-runtime.js?raw';
import client from '../../public/cloud-client.js?raw';
import host from '../../public/workbench-host.js?raw';
export const dynamic='force-dynamic';
export function POST(request:Request){return mcp(request,env.DB,env.BUCKET,{html,method,runtime,client,host});}
