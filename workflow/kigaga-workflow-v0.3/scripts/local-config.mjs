import {existsSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {isAbsolute,join,dirname} from 'node:path';
import {isDeepStrictEqual} from 'node:util';

export const serverKey='kigaga-workflow-v03';

export function connectionFor({root,nodePath,dbPath}) {
  if(!isAbsolute(root)||!isAbsolute(nodePath)||!isAbsolute(dbPath)) {
    throw new Error('程序、Node 和数据库都需要固定的绝对路径。');
  }
  return {command:nodePath,args:[join(root,'src','server.mjs')],env:{KIGAGA_DB_PATH:dbPath}};
}

export function readLocalConnection(root) {
  const path=join(root,'.mcp.json');
  if(!existsSync(path))return null;
  let parsed;
  try {parsed=JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''));}
  catch {throw new Error('本目录 .mcp.json 格式无效；请保留原文件后修正。');}
  const entry=parsed.mcpServers?.[serverKey];
  if(!entry)throw new Error('已有 .mcp.json 不包含本版连接；未修改原配置。请使用独立目录。');
  return entry;
}

export function configureLocal({root,nodePath,dbPath}) {
  const entry=connectionFor({root,nodePath,dbPath});
  const existing=readLocalConnection(root);
  if(existing&&!isDeepStrictEqual(existing,entry)) {
    throw new Error('现有连接配置与本机路径或数据库不一致，未覆盖。请先核对 connection-settings.txt 和原配置；保留原文件后再重新配置。');
  }
  if(!existing)writeFileSync(join(root,'.mcp.json'),JSON.stringify({mcpServers:{[serverKey]:entry}},null,2)+'\n',{flag:'wx',mode:0o600});
  mkdirSync(join(dirname(dbPath),'artifacts'),{recursive:true});
  const lines=[
    'KiGAGA v0.3 本机连接参数',
    '',
    `程序目录：${root}`,
    `Node：${nodePath}`,
    `MCP 脚本：${entry.args[0]}`,
    `数据库：${dbPath}`,
    '',
    '本地参数已准备，不代表 ChatGPT 或安全隧道已经连接。',
    '先在原生对话检查 kg_find_projects、kg_get_context、kg_checkpoint_task。',
    '工作台仅使用已配置的云端侧栏入口；本地服务不提供页面入口。',
    'kg_open_workbench 仅返回兼容数据快照。',
    '',
    '下一步：阅读 docs/local-deployment.md 的「接入当前 GPT 对话」。',
    '安全隧道需要自己的运行凭据；不要把密钥发到对话或写入本文件。',
    '备份：停止本版服务后，复制数据库所在 KiGAGA 目录。',
  ];
  writeFileSync(join(root,'connection-settings.txt'),'\uFEFF'+lines.join('\r\n')+'\r\n');
  return {created:!existing,connection:entry};
}
