import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const root=fileURLToPath(new URL('../',import.meta.url));
const manifest=path.join(root,'SOURCE-MANIFEST.json');
const sha=data=>createHash('sha256').update(data).digest('hex');
const write=process.argv.includes('--write');
if(process.argv.slice(2).some(arg=>arg!=='--write'))throw Error('Use no arguments to verify, or --write after reviewing and testing changes.');
let inventory;
try{
  inventory=[...new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z','--','workflow'],{cwd:path.join(root,'..'),encoding:'utf8'}).split('\0').filter(Boolean))]
    .map(p=>p.slice('workflow/'.length)).filter(p=>p!=='SOURCE-MANIFEST.json').sort();
}catch(error){if(write)throw error;}
const read=relative=>{
  if(relative.includes('\\')||path.posix.isAbsolute(relative)||relative.split('/').some(p=>!p||p==='.'||p==='..'||p.includes(':')))throw Error('Unsafe path in manifest');
  const target=path.join(root,relative);
  if(fs.lstatSync(target).isSymbolicLink()||!fs.statSync(target).isFile())throw Error('Expected regular source file: '+relative);
  return fs.readFileSync(target);
};
if(write){
  const files=inventory.map(relative=>{const content=read(relative);return{path:relative,bytes:content.length,sha256:sha(content)};});
  fs.writeFileSync(manifest,JSON.stringify({schema_version:1,snapshot_date:'2026-10-27',scope:'Public workflow source only; excludes this manifest and ignored runtime data.',files},null,2)+'\n');
}
const data=JSON.parse(fs.readFileSync(manifest,'utf8'));
const names=data.files.map(file=>file.path).sort();
if(new Set(names).size!==names.length)throw Error('Duplicate source paths');
if(inventory&&JSON.stringify(names)!==JSON.stringify(inventory))throw Error('Source inventory changed; review changes before updating the manifest.');
for(const file of data.files){const bytes=read(file.path);if(bytes.length!==file.bytes||sha(bytes)!==file.sha256)throw Error('Source checksum mismatch: '+file.path);}
console.log(JSON.stringify({verified_files:data.files.length,mode:write?'write-and-verify':'verify'}));
