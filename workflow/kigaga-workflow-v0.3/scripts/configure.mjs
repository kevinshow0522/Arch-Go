import {fileURLToPath} from 'node:url';
import {configureLocal,readLocalConnection} from './local-config.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
try {
  if(Number(process.versions.node.split('.')[0])<24)throw new Error('本版需要 Node.js 24 或更新版本。');
  const {defaultDbPath}=await import('../src/server.mjs');
  const existing=readLocalConnection(root);
  // Keep a previously selected data location when no new location was explicitly requested.
  const dbPath=process.env.KIGAGA_DB_PATH||existing?.env?.KIGAGA_DB_PATH||defaultDbPath();
  const result=configureLocal({root,nodePath:process.execPath,dbPath});
  console.log(result.created?'已生成本机配置。':'本机配置一致，已保留。');
  console.log('连接参数见 connection-settings.txt；ChatGPT 联动尚未验证。');
} catch(error) {
  console.error(error.message);
  process.exitCode=1;
}
