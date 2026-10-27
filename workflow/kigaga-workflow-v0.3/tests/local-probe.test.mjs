import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {probeLocalService} from '../scripts/local-probe.mjs';

test('安装诊断核验只读入口边界和临时资料保存重开',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'ki-public-probe-'));
  t.after(()=>{assert.ok(resolve(dir).startsWith(resolve(tmpdir())+sep));rmSync(dir,{recursive:true,force:true});});
  const result=await probeLocalService({entry:fileURLToPath(new URL('../src/server.mjs',import.meta.url)),nodePath:process.execPath,dbPath:join(dir,'probe.db'),cwd:fileURLToPath(new URL('../',import.meta.url))});
  assert.equal(result.revisions,2);
  assert.ok(result.toolCount>10);
});
