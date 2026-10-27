import {existsSync,readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
// Reference libraries are opt-in and configured in storage-location.json.
export const defaultReferenceRoots=[];
export function storageLocation({dbPath,projectsRoot}={}){
 const original=dbPath||process.env.KIGAGA_DB_PATH||join(process.env.LOCALAPPDATA||join(homedir(),'.local','share'),'KiGAGA','workflow-v03.db');
 const path=new URL('../storage-location.json',import.meta.url);
 const config=existsSync(path)?JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,'')):null;
 const matches=config&&[config.dbPath,config.legacyDbPath].filter(Boolean).some(p=>resolve(p).toLowerCase()===resolve(original).toLowerCase());
 return {dbPath:matches?config.dbPath:original,projectsRoot:projectsRoot??(matches?config.projectsRoot:undefined)??process.env.KIGAGA_PROJECTS_ROOT,referenceRoots:config?.referenceRoots??defaultReferenceRoots};
}
