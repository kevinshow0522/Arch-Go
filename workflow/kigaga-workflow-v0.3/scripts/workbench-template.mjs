import {readFileSync} from 'node:fs';
import {join} from 'node:path';

// Both the local build and cloud import consume this same visual source.
export function readWorkbenchTemplate(root){
 const html=readFileSync(join(root,'web/workbench-v04.html'),'utf8');
 if(!/<meta name="ki-workbench-visual" content="neumorphic-0\.6\.1">/.test(html))throw new Error('Missing the user-confirmed workbench visual source');
 if(!html.includes('/* KI_WORKBENCH_VISUAL */'))throw new Error('Missing workbench visual insertion point');
 const css=readFileSync(join(root,'web/workbench-visual.css'),'utf8');
 if(!css.trim())throw new Error('Empty workbench visual stylesheet');
 return html.replace('/* KI_WORKBENCH_VISUAL */',()=>css);
}
