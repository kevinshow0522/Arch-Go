import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {configureLocal,readLocalConnection,serverKey} from '../scripts/local-config.mjs';

function fixture(t) {
  const root=mkdtempSync(join(tmpdir(),'kg-local-setup-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  return {root,nodePath:process.execPath,dbPath:join(root,'data','项目 数据.db')};
}
test('重复配置保留同一数据库和无关连接，路径含中文与空格',t=>{
  const options=fixture(t);
  assert.equal(configureLocal(options).created,true);
  const path=join(options.root,'.mcp.json');
  const config=JSON.parse(readFileSync(path,'utf8'));
  config.mcpServers.other={command:'keep-me'};
  writeFileSync(path,JSON.stringify(config,null,2));
  const before=readFileSync(path);
  assert.equal(configureLocal(options).created,false);
  assert.deepEqual(readFileSync(path),before);
  assert.equal(readLocalConnection(options.root).env.KIGAGA_DB_PATH,options.dbPath);
});
test('现有配置路径不符时拒绝改写，不生成误导性参数',t=>{
  const options=fixture(t);configureLocal(options);
  const path=join(options.root,'.mcp.json');
  const settings=join(options.root,'connection-settings.txt');
  const before=readFileSync(path);const beforeSettings=readFileSync(settings);
  assert.throws(()=>configureLocal({...options,dbPath:join(options.root,'other.db')}),/未覆盖/);
  assert.deepEqual(readFileSync(path),before);
  assert.deepEqual(readFileSync(settings),beforeSettings);
});
test('拒绝相对数据库路径和损坏或其他版本的配置',t=>{
  const options=fixture(t);
  assert.throws(()=>configureLocal({...options,dbPath:'relative.db'}),/绝对路径/);
  const path=join(options.root,'.mcp.json');
  writeFileSync(path,'{broken');
  assert.throws(()=>configureLocal(options),/格式无效/);
  assert.equal(readFileSync(path,'utf8'),'{broken');
  writeFileSync(path,JSON.stringify({mcpServers:{old:{command:'old'}}}));
  assert.throws(()=>configureLocal(options),/不包含本版/);
  assert.equal(JSON.parse(readFileSync(path,'utf8')).mcpServers[serverKey],undefined);
});
