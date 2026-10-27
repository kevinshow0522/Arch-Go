import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
test('Windows startup reads a UTF-8 Chinese database path without a BOM',{skip:process.platform!=='win32'},t=>{
 const dir=mkdtempSync(join(tmpdir(),'kg-config-')),root=join(dir,'app'),dbPath='D:\\0设计项目\\_KiGAGA系统\\数据库\\workflow-v03.db';
 t.after(()=>{const rel=relative(resolve(tmpdir()),resolve(dir));assert.ok(rel&&!rel.startsWith('..'));rmSync(dir,{recursive:true,force:true});});
 mkdirSync(join(root,'src'),{recursive:true});mkdirSync(join(dir,'kigaga-workbench-v0.2'));
 writeFileSync(join(root,'src','server.mjs'),'');writeFileSync(join(dir,'kigaga-workbench-v0.2','tunnel-client.exe'),'');
 writeFileSync(join(root,'tunnel-kigaga-v03.yaml'),'http_proxy: "http://127.0.0.1:7890"\ntunnel_id: tunnel_00000000000000000000000000000000\nlisten_addr: 127.0.0.1:18083\napi_key: env:CONTROL_PLANE_API_KEY\n');
 writeFileSync(join(root,'.mcp.json'),JSON.stringify({mcpServers:{'kigaga-workflow-v03':{env:{KIGAGA_DB_PATH:dbPath}}}}));
 const script="[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); Import-Module $env:KG_TEST_MODULE -Force -DisableNameChecking; (Get-KgTunnelSettings $env:KG_TEST_ROOT).DbPath";
 const result=spawnSync(join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command',script],{encoding:'utf8',env:{...process.env,KG_TEST_ROOT:root,KG_TEST_MODULE:fileURLToPath(new URL('../scripts/tunnel-runtime.psm1',import.meta.url))}});
 assert.equal(result.status,0,result.stderr);assert.equal(result.stdout.trim(),dbPath);
});
