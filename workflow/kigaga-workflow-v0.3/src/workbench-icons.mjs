import {readFileSync} from 'node:fs';

// Embed the vector icon so the host needs no additional network request.
export const workbenchIcons=[
 ['workbench-sidebar-icon.svg','light'],
 ['workbench-sidebar-icon-dark.svg','dark'],
].map(([file,theme])=>({
 src:'data:image/svg+xml;base64,'+readFileSync(new URL('../assets/'+file,import.meta.url)).toString('base64'),
 mimeType:'image/svg+xml',sizes:['any'],theme,
}));
