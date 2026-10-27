import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

const script=fileURLToPath(new URL('../scripts/sync-skills.mjs',import.meta.url));
const hash=data=>createHash('sha256').update(data).digest('hex');
const names=['ki-archmain','brief-and-metrics','site-study','case-study','concept-scheme','architecture-analysis-diagrams','urban-design-analysis'];
function fixture(t){
  const root=mkdtempSync(join(tmpdir(),'ki-design-sync-'));
  t.after(()=>{assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep));rmSync(root,{recursive:true,force:true});});
  const source=join(root,'upstream'),local=join(root,'local'),mirror=join(root,'mirror'),dest=join(root,'installed');
  const write=(base,relative,data)=>{const p=join(base,relative);mkdirSync(join(p,'..'),{recursive:true});writeFileSync(p,data);};
  const originals=new Map(names.map(name=>[`${name}/SKILL.md`,`---\nname: ${name}\n---\n# ${name}\nOriginal body\n`]));
  for(const [p,data] of originals)write(source,p,data);
  const canonical=()=>write(source,'SHA256SUMS.txt',[...originals].map(([p,data])=>`${hash(data)}  ${p}`).join('\n')+'\n');
  canonical();
  const content='---\nname: ki-design\n---\n# KI-design\n';
  const files=new Map([
    ['ki-design/SKILL.md',content],
    ['ki-design/manifest.json',JSON.stringify({files:[{path:'SKILL.md',bytes:Buffer.byteLength(content),sha256:hash(content)}]})],
    ['ki-archmain/references/ki-design-interfaces/concept.md','Read [KI-design](../ki-design/SKILL.md).'],
  ]);
  const adapter={schema_version:1,adapters:[{target:'concept-scheme/SKILL.md',base_sha256:hash(originals.get('concept-scheme/SKILL.md')),anchor:'# concept-scheme',source:'ki-archmain/references/ki-design-interfaces/concept.md'}]};
  const refresh=()=>{
    files.set('ki-archmain/references/local-skill-adapters.json',JSON.stringify(adapter));
    for(const [p,data] of files)write(local,p,data);
    write(local,'ki-archmain/LOCAL-SHA256SUMS.txt',[...files].map(([p,data])=>`${hash(data)}  ${p}`).join('\n')+'\n');
  };
  refresh();
  const run=(apply=true)=>spawnSync(process.execPath,[script,'--source',source,'--local-source',local,'--mirror',mirror,'--dest',dest,'--backup',join(root,'backup'),...(apply?['--apply']:[])],{encoding:'utf8'});
  return {root,source,local,mirror,dest,originals,files,adapter,refresh,run,write,canonical};
}

test('verified local interfaces install with KI-design, preserve upstream and are idempotent',t=>{
  const f=fixture(t);f.write(f.dest,'concept-scheme/personal-note.md','preserve me');
  const first=f.run();assert.equal(first.status,0,first.stderr);
  const text=readFileSync(join(f.dest,'concept-scheme/SKILL.md'),'utf8');
  assert.ok(text.includes('Read [KI-design]'));
  assert.equal(text.replace(/\n\n<!-- KI-DESIGN-INTERFACE -->[\s\S]*?<!-- \/KI-DESIGN-INTERFACE -->/,''),f.originals.get('concept-scheme/SKILL.md'));
  assert.equal(readFileSync(join(f.source,'concept-scheme/SKILL.md'),'utf8'),f.originals.get('concept-scheme/SKILL.md'));
  assert.equal(readFileSync(join(f.dest,'concept-scheme/personal-note.md'),'utf8'),'preserve me');
  assert.equal(readFileSync(join(f.dest,'ki-design/SKILL.md'),'utf8'),f.files.get('ki-design/SKILL.md'));
  const second=f.run();assert.equal(second.status,0,second.stderr);assert.equal(JSON.parse(second.stdout).changed_files,0);
  assert.equal((text.match(/<!-- KI-DESIGN-INTERFACE -->/g)||[]).length,1);
});

test('changed canonical hash rejects before replacing any installed file',t=>{
  const f=fixture(t);f.write(f.dest,'concept-scheme/SKILL.md','sentinel');
  f.originals.set('concept-scheme/SKILL.md',f.originals.get('concept-scheme/SKILL.md')+'upstream change\n');
  f.write(f.source,'concept-scheme/SKILL.md',f.originals.get('concept-scheme/SKILL.md'));f.canonical();
  const result=f.run();assert.notEqual(result.status,0);assert.match(result.stderr,/Canonical source changed/);
  assert.equal(readFileSync(join(f.dest,'concept-scheme/SKILL.md'),'utf8'),'sentinel');assert.equal(existsSync(join(f.dest,'ki-design')),false);
});

test('missing or duplicate anchor is rejected before writing',t=>{
  for(const anchor of ['missing','\n']){
    const f=fixture(t);f.adapter.adapters[0].anchor=anchor;f.refresh();
    const result=f.run();assert.notEqual(result.status,0);assert.match(result.stderr,/anchor must occur once/);assert.equal(existsSync(f.dest),false);
  }
});

test('package inventory omission and tampering are rejected',t=>{
  const f=fixture(t);f.files.set('ki-design/SKILL.md','---\nname: ki-design\n---\nchanged');f.refresh();
  const result=f.run();assert.notEqual(result.status,0);assert.match(result.stderr,/release mismatch/);assert.equal(existsSync(f.dest),false);
});

test('interfaces cannot install without their referenced skill package',t=>{
  const f=fixture(t);f.files.delete('ki-design/SKILL.md');f.files.delete('ki-design/manifest.json');f.refresh();
  const result=f.run();assert.notEqual(result.status,0);assert.match(result.stderr,/require a complete KI-design package/);assert.equal(existsSync(f.dest),false);
});

test('dry run computes plan without changing destination',t=>{
  const f=fixture(t);const result=f.run(false);assert.equal(result.status,0,result.stderr);
  assert.equal(JSON.parse(result.stdout).local_adapters,1);assert.equal(existsSync(f.dest),false);assert.equal(existsSync(f.mirror),false);
});
