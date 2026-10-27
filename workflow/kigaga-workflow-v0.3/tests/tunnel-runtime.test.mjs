import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('Windows tunnel credentials, startup and process lifecycle', {skip:process.platform !== 'win32'}, () => {
  const script=fileURLToPath(new URL('./tunnel-runtime.test.ps1',import.meta.url));
  const result=spawnSync('powershell.exe',['-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',script],{encoding:'utf8',windowsHide:true,timeout:60000});
  assert.equal(result.error,undefined,result.error?.message);
  assert.equal(result.status,0,result.stdout+result.stderr);
});
