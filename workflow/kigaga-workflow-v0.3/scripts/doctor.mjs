import {existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {connectionFor,readLocalConnection} from './local-config.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const report=['KiGAGA 本地检查',`检查时间：${new Date().toISOString()}`,`系统：${process.platform} ${process.arch}`,`Node：${process.version}`,`程序目录：${root}`,''];
let failed=false;
function record(status,label,detail='') {
  const line=`[${status}] ${label}${detail?`：${detail}`:''}`;
  report.push(line);console.log(line);
}
async function check(label,fn) {
  try {record('通过',label,await fn()||'');return true;}
  catch(error) {failed=true;record('失败',label,error.message);return false;}
}
const runtimeOk=await check('运行环境',async()=>{
  if(Number(process.versions.node.split('.')[0])<24)throw new Error('需要 Node.js 24 或更新版本。安装后重新打开本程序。');
  await import('node:sqlite');return 'Node.js 与 SQLite 可用';
});
let connection;
if(runtimeOk) {
  await check('已编译界面',()=>{
    for(const name of ['workbench.html']) {
      if(!readFileSync(join(root,'assets',name),'utf8').includes('id="kg-workbench"'))throw new Error(`${name} 内容不完整，请重新解压部署包。`);
    }
  });
  const depsOk=await check('程序依赖',async()=>{
    await import('../src/server.mjs');await import('./local-probe.mjs');
  });
  const configOk=await check('本机配置',()=>{
    connection=readLocalConnection(root);
    if(!connection)throw new Error('未找到本机配置，请先运行 setup-windows.cmd。');
    const expected=connectionFor({root,nodePath:process.execPath,dbPath:connection.env?.KIGAGA_DB_PATH||''});
    if(!isDeepStrictEqual(connection,expected))throw new Error('连接路径与本目录不一致，请核对本机配置。');
    if(process.env.KIGAGA_DB_PATH&&process.env.KIGAGA_DB_PATH!==connection.env.KIGAGA_DB_PATH)throw new Error('环境变量与连接配置指向不同数据库，请统一路径后重试。');
    report.push(`数据库：${connection.env.KIGAGA_DB_PATH}`);
  });
  if(configOk) {
    const dbPath=connection.env.KIGAGA_DB_PATH;
    const directory=dirname(dbPath);
    await check('现有数据库（只读）',async()=>{
      if(!existsSync(dbPath))return '尚未创建；正式建立项目时创建';
      const {DatabaseSync}=await import('node:sqlite');
      const db=new DatabaseSync(dbPath,{readOnly:true});
      try {
        const version=db.prepare('PRAGMA user_version').get().user_version;
        if(version!==2&&version!==3)throw new Error('数据库不是本版格式，请保留原文件，不要覆盖。');
        const checks=db.prepare('PRAGMA quick_check').all();
        if(checks.some(row=>row.quick_check!=='ok'))throw new Error('数据库完整性检查未通过，请先备份。');
        return '格式与完整性正常；未读取项目正文';
      } finally {db.close();}
    });
    if(depsOk)await check('保存与重开恢复',async()=>{
      mkdirSync(directory,{recursive:true});
      const temporary=mkdtempSync(join(directory,'kigaga-check-'));
      try {
        const {probeLocalService}=await import('./local-probe.mjs');
        const result=await probeLocalService({entry:connection.args[0],nodePath:connection.command,dbPath:join(temporary,'diagnostic.db'),cwd:root});
        return `临时数据库，${result.toolCount} 个工具，资料、任务与 ${result.revisions} 版成果恢复成功`;
      } finally {rmSync(temporary,{recursive:true,force:true});}
    });
  }
}
record('待验证','ChatGPT 真实联动','本检查不登录账号、不启动隧道、不调用模型。');
report.push('',failed?'本地检查未通过，请处理上面的失败项。':'本地检查通过；下一步接入 ChatGPT。','恢复检查使用独立临时数据库，不向真实项目写入测试任务。','报告只含本机路径和检查结果，不包含密钥或项目正文。');
try {
  mkdirSync(join(root,'diagnostics'),{recursive:true});
  const path=join(root,'diagnostics','local-check.txt');
  writeFileSync(path,'\uFEFF'+report.join('\r\n')+'\r\n');
  console.log(`\n${report[report.length-3]}\n检查报告：${path}`);
} catch(error) {failed=true;console.error(`无法保存检查报告：${error.message}`);}
process.exitCode=failed?1:0;
