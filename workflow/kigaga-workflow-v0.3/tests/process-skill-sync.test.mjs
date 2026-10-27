import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
test('同步本机适配资料时保留GitHub正本哈希，任何补充资料损坏都先拒绝再写入',t=>{
 const dir=mkdtempSync(join(tmpdir(),'ki-skill-sync-130-')),source=join(dir,'source'),local=join(dir,'local'),mirror=join(dir,'mirror'),dest=join(dir,'dest');
 t.after(()=>{assert.ok(resolve(dir).startsWith(resolve(tmpdir())+sep));rmSync(dir,{recursive:true,force:true});});
 const names=['ki-archmain','brief-and-metrics','site-study','case-study','concept-scheme','architecture-analysis-diagrams','urban-design-analysis'],sha=s=>createHash('sha256').update(s).digest('hex'),lines=[];
 for(const name of names){mkdirSync(join(source,name),{recursive:true});const text='canonical '+name;writeFileSync(join(source,name,'SKILL.md'),text);lines.push(sha(text)+'  '+name+'/SKILL.md');}
 writeFileSync(join(source,'SHA256SUMS.txt'),lines.join('\n')+'\n');
 const extra=join(local,'ki-archmain','references');mkdirSync(extra,{recursive:true});writeFileSync(join(extra,'service.md'),'local adapter');writeFileSync(join(local,'ki-archmain','LOCAL-SHA256SUMS.txt'),sha('local adapter')+'  ki-archmain/references/service.md\n');
 const script=fileURLToPath(new URL('../scripts/sync-skills.mjs',import.meta.url)),args=[script,'--source',source,'--local-source',local,'--mirror',mirror,'--dest',dest,'--backup',join(dir,'before'),'--apply'];
 const run=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(run.status,0,run.stderr);
 assert.equal(readFileSync(join(dest,'ki-archmain','references','service.md'),'utf8'),'local adapter');assert.equal(readFileSync(join(dest,'ki-archmain','SKILL.md'),'utf8'),'canonical ki-archmain');
 writeFileSync(join(extra,'service.md'),'damaged adapter');
 const rejected=spawnSync(process.execPath,[...args.slice(0,-1),'--apply'],{encoding:'utf8'});assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/SHA256 mismatch/);
 assert.equal(readFileSync(join(dest,'ki-archmain','references','service.md'),'utf8'),'local adapter');
});
