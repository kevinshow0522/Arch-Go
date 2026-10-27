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
  const root=mkdtempSync(join(tmpdir(),'sketchup-skill-sync-'));
  t.after(()=>{assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep));rmSync(root,{recursive:true,force:true});});
  const source=join(root,'source'),local=join(root,'local'),mirror=join(root,'mirror'),dest=join(root,'installed');
  const write=(base,rel,data)=>{const p=join(base,rel);mkdirSync(join(p,'..'),{recursive:true});writeFileSync(p,data);};
  const original=new Map(names.map(n=>[`${n}/SKILL.md`,`---\nname: ${n}\n---\n# ${n}\nCanonical body\n`]));
  const canonical=()=>{
    for(const [p,data] of original)write(source,p,data);
    write(source,'SHA256SUMS.txt',[...original].map(([p,data])=>`${hash(data)}  ${p}`).join('\n')+'\n');
  };
  canonical();
  const files=new Map();
  const ki='---\nname: ki-design\n---\n# KI-design\n';
  files.set('ki-design/SKILL.md',ki);
  files.set('ki-design/manifest.json',JSON.stringify({files:[{path:'SKILL.md',bytes:Buffer.byteLength(ki),sha256:hash(ki)}]}));
  const prefix='professional-sketchup-modeling/';
  files.set(prefix+'SKILL.md','---\nname: professional-sketchup-modeling\n---\n# Modeling\n');
  for(const p of ['BUILD.json','LOCAL-ADAPTATION.json'])files.set(prefix+p,'{}');
  for(const p of ['LICENSE','NOTICE','agents/openai.yaml','references/workflow-integration.md','references/runtime-compatibility.md','scripts/managed_project.rb'])files.set(prefix+p,`fixture ${p}\n`);
  const release={schema_version:1,skill:'professional-sketchup-modeling',files:[...files].filter(([p])=>p.startsWith(prefix)).map(([p,data])=>({path:p.slice(prefix.length),bytes:Buffer.byteLength(data),sha256:hash(data)}))};
  const adapter={schema_version:2,adapters:[
    {interface:'ki-design',target:'concept-scheme/SKILL.md',base_sha256:hash(original.get('concept-scheme/SKILL.md')),anchor:'# concept-scheme',source:'ki-archmain/references/ki-design-interfaces/concept.txt'},
    {interface:'sketchup-modeling',target:'concept-scheme/SKILL.md',base_sha256:hash(original.get('concept-scheme/SKILL.md')),anchor:'# concept-scheme',source:'ki-archmain/references/sketchup-modeling-interfaces/concept.txt'},
  ]};
  files.set(adapter.adapters[0].source,'Design guidance.');
  files.set(adapter.adapters[1].source,'Use the modeling Skill.');
  const refresh=()=>{
    files.set(prefix+'LOCAL-PACKAGE.json',JSON.stringify(release));
    files.set('ki-archmain/references/local-skill-adapters.json',JSON.stringify(adapter));
    for(const [p,data] of files)write(local,p,data);
    write(local,'ki-archmain/LOCAL-SHA256SUMS.txt',[...files].map(([p,data])=>`${hash(data)}  ${p}`).join('\n')+'\n');
  };
  refresh();
  const run=(apply=true)=>spawnSync(process.execPath,[script,'--source',source,'--local-source',local,'--mirror',mirror,'--dest',dest,'--backup',join(root,'backup'),...(apply?['--apply']:[])],{encoding:'utf8'});
  return {root,source,local,mirror,dest,files,release,adapter,original,prefix,write,refresh,canonical,run};
}

test('two interfaces coexist in stable order, preserve canonical content and repeat with zero changes',t=>{
  const f=fixture(t);f.write(f.dest,'professional-sketchup-modeling/personal.md','user note');
  const result=f.run();assert.equal(result.status,0,result.stderr);
  const text=readFileSync(join(f.dest,'concept-scheme/SKILL.md'),'utf8');
  assert.ok(text.indexOf('Design guidance.')<text.indexOf('Use the modeling Skill.'));
  for(const marker of ['KI-DESIGN-INTERFACE','SKETCHUP-MODELING-INTERFACE'])assert.equal(text.split(`<!-- ${marker} -->`).length-1,1);
  const stripped=text.replace(/\n\n<!-- (KI-DESIGN-INTERFACE|SKETCHUP-MODELING-INTERFACE) -->[\s\S]*?<!-- \/\1 -->/g,'');
  assert.equal(stripped,f.original.get('concept-scheme/SKILL.md'));
  assert.equal(readFileSync(join(f.source,'concept-scheme/SKILL.md'),'utf8'),stripped);
  assert.equal(readFileSync(join(f.dest,'professional-sketchup-modeling/personal.md'),'utf8'),'user note');
  assert.equal(readFileSync(join(f.dest,f.prefix+'NOTICE'),'utf8'),f.files.get(f.prefix+'NOTICE'));
  const again=f.run();assert.equal(again.status,0,again.stderr);assert.equal(JSON.parse(again.stdout).changed_files,0);
});

test('modeling interface does not require KI-design when no KI-design interface is requested',t=>{
  const f=fixture(t);f.adapter.adapters.shift();
  f.files.delete('ki-design/SKILL.md');f.files.delete('ki-design/manifest.json');f.refresh();
  const result=f.run();assert.equal(result.status,0,result.stderr);
  assert.ok(readFileSync(join(f.dest,'concept-scheme/SKILL.md'),'utf8').includes('Use the modeling Skill.'));
});

test('missing required modeling resource rejects before replacing installed files',t=>{
  const f=fixture(t);f.write(f.dest,'concept-scheme/SKILL.md','sentinel');
  f.files.delete(f.prefix+'references/workflow-integration.md');f.refresh();
  const result=f.run();assert.notEqual(result.status,0);assert.match(result.stderr,/Incomplete SketchUp modeling package/);
  assert.equal(readFileSync(join(f.dest,'concept-scheme/SKILL.md'),'utf8'),'sentinel');assert.equal(existsSync(f.mirror),false);
});

test('missing modeling dependency, altered payload and omitted inventory entry reject before writes',t=>{
  for(const mode of ['missing','altered','omitted']){
    const f=fixture(t);
    if(mode==='missing'){
      // refresh creates the manifest; a manifest without its package remains incomplete.
      for(const p of [...f.files.keys()])if(p.startsWith(f.prefix))f.files.delete(p);
    }else if(mode==='altered')f.files.set(f.prefix+'scripts/managed_project.rb','altered bytes');
    else f.release.files=f.release.files.filter(r=>r.path!=='NOTICE');
    f.refresh();const result=f.run();assert.notEqual(result.status,0);assert.match(result.stderr,/Incomplete SketchUp|package mismatch|inventory mismatch/);
    assert.equal(existsSync(f.dest),false);
  }
});

test('duplicate interface identity and wrong source family are rejected',t=>{
  for(const mode of ['duplicate','wrong_source','unknown_kind','nested']){
    const f=fixture(t);
    if(mode==='duplicate')f.adapter.adapters.push({...f.adapter.adapters[1]});
    if(mode==='wrong_source')f.adapter.adapters[1].source=f.adapter.adapters[0].source;
    if(mode==='unknown_kind')f.adapter.adapters[1].interface='constructor';
    if(mode==='nested')f.files.set(f.adapter.adapters[1].source,'<!-- KI-DESIGN-INTERFACE -->');
    f.refresh();const result=f.run();assert.notEqual(result.status,0);assert.match(result.stderr,/duplicate|Invalid local interface|Invalid nested/);
    assert.equal(existsSync(f.dest),false);
  }
});

test('upstream change rejects the combined overlay before any destination write',t=>{
  const f=fixture(t);f.write(f.dest,'concept-scheme/SKILL.md','sentinel');
  f.original.set('concept-scheme/SKILL.md',f.original.get('concept-scheme/SKILL.md')+'new upstream\n');f.canonical();
  const result=f.run();assert.notEqual(result.status,0);assert.match(result.stderr,/Canonical source changed/);
  assert.equal(readFileSync(join(f.dest,'concept-scheme/SKILL.md'),'utf8'),'sentinel');assert.equal(existsSync(f.mirror),false);
});

test('unsafe package inventory paths cannot escape their source root',t=>{
  const f=fixture(t);f.release.files.push({path:'../outside.md',bytes:0,sha256:hash('')});f.refresh();
  const result=f.run();assert.notEqual(result.status,0);assert.match(result.stderr,/Unsafe manifest path/);assert.equal(existsSync(f.dest),false);
});

test('combined dry run is read-only and reports both independent interfaces',t=>{
  const f=fixture(t);const result=f.run(false);assert.equal(result.status,0,result.stderr);
  const report=JSON.parse(result.stdout);assert.equal(report.local_interfaces,2);assert.equal(report.local_adapters,1);
  assert.equal(existsSync(f.dest),false);assert.equal(existsSync(f.mirror),false);assert.equal(existsSync(join(f.root,'backup')),false);
});
