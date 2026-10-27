#!/usr/bin/env node
// Synchronize canonical Skills, verified local packages and independent interface blocks.
// Default: inspect only. --apply backs up replaced files and preserves all extras.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const skills = [
  'ki-archmain', 'brief-and-metrics', 'site-study', 'case-study',
  'concept-scheme', 'architecture-analysis-diagrams', 'urban-design-analysis',
];
const options = {
  source: fs.existsSync(path.join(workspace, '..', 'SHA256SUMS.txt'))
    ? path.resolve(workspace, '..') : path.join(workspace, 'Arch-Go'),
  mirror: path.join(workspace, 'skills'),
  dest: path.join(os.homedir(), '.codex', 'skills'),
  'local-source': path.join(workspace, 'skills'),
  apply: false,
};
for (let i = 2; i < process.argv.length; i += 1) {
  const flag = process.argv[i];
  if (flag === '--apply') options.apply = true;
  else if (['--source', '--mirror', '--dest', '--backup', '--report', '--local-source'].includes(flag)) {
    const value = process.argv[++i];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    options[flag.slice(2)] = path.resolve(value);
  } else if (flag === '--help') {
    console.log('node scripts/sync-skills.mjs [--apply] [--source PATH] [--local-source PATH] [--mirror PATH] [--dest PATH] [--backup NEW_PATH] [--report PATH]');
    process.exit(0);
  } else throw new Error(`Unknown argument: ${flag}`);
}

const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
function safeFile(root, relative) {
  if (relative.includes('\\') || path.posix.isAbsolute(relative)
      || relative.split('/').some((part) => !part || part === '.' || part === '..' || part.includes(':'))) {
    throw new Error(`Unsafe manifest path: ${relative}`);
  }
  const target = path.resolve(root, relative);
  if (!target.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error('Path escaped target root');
  // Check ancestors too: never follow a junction/symlink into another directory.
  let current = target;
  while (true) {
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) {
      throw new Error(`Refusing symbolic link or junction: ${current}`);
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return target;
}

const manifestPath = safeFile(options.source, 'SHA256SUMS.txt');
const manifest = fs.readFileSync(manifestPath, 'utf8');
const entries = [];
const seen = new Set();
for (const line of manifest.replace(/^\uFEFF/, '').split(/\r?\n/)) {
  if (!line.trim()) continue;
  const match = /^([a-fA-F0-9]{64})\s+\*?(.+)$/.exec(line);
  if (!match) throw new Error('Malformed SHA256SUMS.txt');
  const [, expected, relative] = match;
  const sourceFile = safeFile(options.source, relative);
  if (!skills.includes(relative.split('/')[0])) continue;
  if (seen.has(relative)) throw new Error(`Duplicate manifest path: ${relative}`);
  seen.add(relative);
  if (!fs.statSync(sourceFile).isFile()) throw new Error(`Not a regular file: ${relative}`);
  const content = fs.readFileSync(sourceFile);
  if (sha(content) !== expected.toLowerCase()) throw new Error(`SHA256 mismatch: ${relative}`);
  entries.push({ relative, sha256: expected.toLowerCase(), content });
}
for (const skill of skills) {
  if (!seen.has(`${skill}/SKILL.md`)) throw new Error(`Skill missing from manifest: ${skill}`);
}
const canonicalCount=entries.length;
const localRoot=options['local-source'];
const localManifest=safeFile(localRoot,'ki-archmain/LOCAL-SHA256SUMS.txt');
if(fs.existsSync(localManifest)){
  const content=fs.readFileSync(localManifest);
  for(const line of content.toString('utf8').split(/\r?\n/)){
    if(!line.trim())continue;
    const match=/^([a-fA-F0-9]{64})\s+\*?(.+)$/.exec(line);
    if(!match)throw new Error('Malformed local supplement manifest');
    const [,expected,relative]=match;
    const allowed=/^ki-archmain\/(references|legacy)\//.test(relative)||/^(ki-design|professional-sketchup-modeling|architecture-expert-library)\//.test(relative);
    if(!allowed||seen.has(relative))throw new Error('Local supplements cannot replace canonical Skill files');
    if(relative.startsWith('ki-design/private_corpus/')&&relative!=='ki-design/private_corpus/README_不公开分发.md')throw new Error('Private corpus cannot be synchronized as a public Skill');
    const bytes=fs.readFileSync(safeFile(localRoot,relative));
    if(sha(bytes)!==expected.toLowerCase())throw new Error(`SHA256 mismatch: ${relative}`);
    seen.add(relative);entries.push({relative,sha256:expected.toLowerCase(),content:bytes});
  }
  entries.push({relative:'ki-archmain/LOCAL-SHA256SUMS.txt',sha256:sha(content),content});
}

// Local Skill packages and interface blocks have their own verified source.
// Canonical upstream bytes are never edited; a changed upstream hash stops the merge.
const localSkills=[];
const kiDesign=entries.filter(entry=>entry.relative.startsWith('ki-design/'));
if(kiDesign.length){
  const packageEntry=kiDesign.find(entry=>entry.relative==='ki-design/manifest.json');
  const skillEntry=kiDesign.find(entry=>entry.relative==='ki-design/SKILL.md');
  if(!packageEntry||!skillEntry||!/^name:\s*ki-design\s*$/m.test(skillEntry.content.toString('utf8')))throw new Error('Incomplete KI-design package');
  const release=JSON.parse(packageEntry.content.toString('utf8'));
  if(!Array.isArray(release.files))throw new Error('Invalid KI-design release manifest');
  const packagePaths=new Set();
  for(const record of release.files){
    const relative=`ki-design/${record.path}`;
    safeFile(localRoot,relative);
    const entry=kiDesign.find(item=>item.relative===relative);
    if(packagePaths.has(relative)||!entry||entry.sha256!==record.sha256||entry.content.length!==record.bytes)throw new Error(`KI-design release mismatch: ${relative}`);
    packagePaths.add(relative);
  }
  if(packagePaths.size!==kiDesign.length-1)throw new Error('KI-design release inventory mismatch');
  localSkills.push('ki-design');
}
const modeling=entries.filter(entry=>entry.relative.startsWith('professional-sketchup-modeling/'));
if(modeling.length){
  const prefix='professional-sketchup-modeling/';
  const manifestEntry=modeling.find(entry=>entry.relative===`${prefix}LOCAL-PACKAGE.json`);
  const required=['SKILL.md','BUILD.json','LOCAL-ADAPTATION.json','LICENSE','NOTICE',
    'agents/openai.yaml','references/workflow-integration.md','references/runtime-compatibility.md','scripts/managed_project.rb'];
  if(!manifestEntry||required.some(name=>!modeling.some(entry=>entry.relative===prefix+name)))throw new Error('Incomplete SketchUp modeling package');
  const skill=modeling.find(entry=>entry.relative===`${prefix}SKILL.md`);
  if(!/^name:\s*professional-sketchup-modeling\s*$/m.test(skill.content.toString('utf8')))throw new Error('Invalid SketchUp modeling Skill name');
  const release=JSON.parse(manifestEntry.content.toString('utf8'));
  if(release.schema_version!==1||release.skill!=='professional-sketchup-modeling'||!Array.isArray(release.files))throw new Error('Invalid SketchUp modeling package manifest');
  const packagePaths=new Set();
  for(const record of release.files){
    if(typeof record.path!=='string')throw new Error('Invalid SketchUp modeling package path');
    const relative=prefix+record.path;
    safeFile(localRoot,relative);
    const entry=modeling.find(item=>item.relative===relative);
    if(record.path==='LOCAL-PACKAGE.json'||packagePaths.has(relative)||!entry||entry.sha256!==record.sha256||entry.content.length!==record.bytes)throw new Error(`SketchUp modeling package mismatch: ${relative}`);
    packagePaths.add(relative);
  }
  if(packagePaths.size!==modeling.length-1)throw new Error('SketchUp modeling package inventory mismatch');
  localSkills.push('professional-sketchup-modeling');
}

const interfaceKinds={
  'ki-design':{marker:'KI-DESIGN-INTERFACE',prefix:'ki-archmain/references/ki-design-interfaces/',skill:'ki-design'},
  'sketchup-modeling':{marker:'SKETCHUP-MODELING-INTERFACE',prefix:'ki-archmain/references/sketchup-modeling-interfaces/',skill:'professional-sketchup-modeling'},
};
const adapterEntry=entries.find(entry=>entry.relative==='ki-archmain/references/local-skill-adapters.json');
const adapters=adapterEntry?JSON.parse(adapterEntry.content.toString('utf8')):null;
const adaptedTargets=new Set();
const appliedInterfaces=[];
if(adapters){
  if(![1,2].includes(adapters.schema_version)||!Array.isArray(adapters.adapters))throw new Error('Invalid local adapter manifest');
  const originals=new Map(entries.slice(0,canonicalCount).map(entry=>[entry.relative,{content:entry.content,sha256:entry.sha256}]));
  const groups=new Map();
  const identities=new Set();
  for(const adapter of adapters.adapters){
    const kindName=adapters.schema_version===1?'ki-design':adapter.interface;
    const kind=Object.hasOwn(interfaceKinds,kindName)?interfaceKinds[kindName]:null;
    if(!kind)throw new Error('Invalid local interface kind');
    if(!localSkills.includes(kind.skill))throw new Error(kindName==='ki-design'?'KI-design interfaces require a complete KI-design package':'SketchUp interfaces require a complete SketchUp modeling package');
    const entry=entries.slice(0,canonicalCount).find(item=>item.relative===adapter.target);
    const identity=`${adapter.target}:${kindName}`;
    if(!entry||!skills.some(name=>adapter.target===`${name}/SKILL.md`)||identities.has(identity))throw new Error('Invalid or duplicate canonical adapter target/interface');
    const baseline=originals.get(adapter.target);
    if(baseline.sha256!==adapter.base_sha256)throw new Error(`Canonical source changed; review local adapter: ${adapter.target}`);
    if(typeof adapter.source!=='string'||!adapter.source.startsWith(kind.prefix))throw new Error('Invalid local interface source');
    const block=entries.find(item=>item.relative===adapter.source);
    if(!block)throw new Error(`Missing verified local interface: ${adapter.source}`);
    const original=baseline.content.toString('utf8');
    if(typeof adapter.anchor!=='string'||!adapter.anchor||original.split(adapter.anchor).length!==2)throw new Error(`Local interface anchor must occur once: ${adapter.target}`);
    if(Object.values(interfaceKinds).some(item=>original.includes(`<!-- ${item.marker} -->`)))throw new Error('Canonical source already contains a local interface');
    const text=block.content.toString('utf8').trim();
    if(!text||Object.values(interfaceKinds).some(item=>text.includes(item.marker)))throw new Error('Invalid nested or empty local interface');
    const group=groups.get(adapter.target)||{entry,baseline,anchor:adapter.anchor,blocks:[]};
    if(group.anchor!==adapter.anchor)throw new Error(`Local interfaces must share one anchor: ${adapter.target}`);
    group.blocks.push(`<!-- ${kind.marker} -->\n${text}\n<!-- /${kind.marker} -->`);
    groups.set(adapter.target,group);
    identities.add(identity);
    appliedInterfaces.push({target:adapter.target,interface:kindName});
  }
  for(const [target,{entry,baseline,anchor,blocks}] of groups){
    entry.canonical_sha256=baseline.sha256;
    entry.content=Buffer.from(baseline.content.toString('utf8').replace(anchor,`${anchor}\n\n${blocks.join('\n\n')}`));
    entry.sha256=sha(entry.content);
    adaptedTargets.add(target);
  }
}

const targets = [
  { name: 'workspace-skills', root: options.mirror },
  { name: 'codex-skills', root: options.dest },
];
if (new Set([options.source, ...targets.map((t) => t.root)].map((p) => p.toLowerCase())).size !== 3) {
  throw new Error('Source, mirror and installation roots must be different');
}
const plan = [];
for (const target of targets) {
  for (const entry of entries) {
    const filename = safeFile(target.root, entry.relative);
    if (fs.existsSync(filename) && !fs.statSync(filename).isFile()) {
      throw new Error(`Destination is not a regular file: ${filename}`);
    }
    const before = fs.existsSync(filename) ? sha(fs.readFileSync(filename)) : null;
    plan.push({ target: target.name, path: filename, relative: entry.relative,
      sha256: entry.sha256, canonical_sha256: entry.canonical_sha256 ?? null, before_sha256: before,
      action: before === entry.sha256 ? 'unchanged' : before ? 'replace' : 'create' });
  }
}

const changes = plan.filter((item) => item.action !== 'unchanged');
let backup = null;
if (options.apply && changes.length) {
  // Complete every replacement backup before changing either installation.
  if (options.backup) {
    safeFile(path.dirname(options.backup), path.basename(options.backup));
    if (fs.existsSync(options.backup)) throw new Error('Backup directory already exists; use a new path');
    fs.mkdirSync(options.backup, { recursive: true });
    backup = options.backup;
  } else {
    const parent = path.join(workspace, 'tmp');
    safeFile(workspace, 'tmp');
    fs.mkdirSync(parent, { recursive: true });
    backup = fs.mkdtempSync(path.join(parent, 'skill-sync-before-'));
  }
  for (const item of changes.filter((item) => item.before_sha256)) {
    const filename = safeFile(backup, `${item.target}/${item.relative}`);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.copyFileSync(item.path, filename, fs.constants.COPYFILE_EXCL);
    if (sha(fs.readFileSync(filename)) !== item.before_sha256) throw new Error('Backup verification failed');
  }
  fs.writeFileSync(path.join(backup, 'plan.json'), `${JSON.stringify(plan, null, 2)}\n`, { flag: 'wx' });
  for (const item of changes) {
    const target = targets.find((target) => target.name === item.target);
    safeFile(target.root, item.relative);
    const current = fs.existsSync(item.path) ? sha(fs.readFileSync(item.path)) : null;
    if (current !== item.before_sha256) throw new Error(`Destination changed since inspection: ${item.path}`);
    fs.mkdirSync(path.dirname(item.path), { recursive: true });
    const temporary = `${item.path}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(temporary, entries.find((entry) => entry.relative === item.relative).content, { flag: 'wx' });
    fs.renameSync(temporary, item.path);
  }
}
if (options.apply) {
  for (const item of plan) {
    if (sha(fs.readFileSync(item.path)) !== item.sha256) throw new Error(`Readback failed: ${item.path}`);
  }
}
let sourceCommit = null;
try { sourceCommit = execFileSync('git', ['-C', options.source, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
catch { /* A verified source archive is also supported. */ }
const report = {
  created_at: new Date().toISOString(), mode: options.apply ? 'apply' : 'dry-run',
  source: options.source, source_commit: sourceCommit, manifest_sha256: sha(Buffer.from(manifest)),
  skills:[...new Set(entries.map(entry=>entry.relative.split('/')[0]))], canonical_skills:skills, local_adapters:[...adaptedTargets], local_interfaces:appliedInterfaces, manifest_files: canonicalCount, supplemental_files:entries.length-canonicalCount, destinations: targets, backup,
  changed_files: changes.length, verified_files: options.apply ? plan.length : 0,
  preserves_unlisted_files: true, files: plan,
};
if (options.report) {
  safeFile(path.dirname(options.report), path.basename(options.report));
  fs.mkdirSync(path.dirname(options.report), { recursive: true });
  fs.writeFileSync(options.report, `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify({ mode: report.mode, source_commit: sourceCommit,
  skills: report.skills.length, local_adapters: adaptedTargets.size, local_interfaces:appliedInterfaces.length, manifest_files: canonicalCount, supplemental_files:entries.length-canonicalCount, changed_files: changes.length,
  verified_files: report.verified_files, backup, report: options.report ?? null }, null, 2));
