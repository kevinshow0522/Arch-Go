# KI建筑设计工作流 · 可公开源码

本目录同步 2026-10-27 本机工作流的通用方法、项目服务和云端 UI。方法版本 **1.30**，KI-design **0.9.0**，工作台功能 **0.6**、视觉 **0.6.1**。不包含任何真实项目、数据库、参考库原文、账号配置或发布凭据。

## 目录与来源

| 目录 | 用途 |
| --- | --- |
| `skills/` | 10 个整合包：主流程、四个章节、两类分析图、KI-design、SketchUp 建模、建筑设计专家库入口 |
| `kigaga-workflow-v0.3/` | 对话项目服务、流程规则、共享 UI 视觉源、安装与校验脚本 |
| `sites/ki-workbench/` | 仅所有者可访问的云端只读工作台及侧栏入口源码 |

仓库根目录的 7 个方法 Skill 及 `SHA256SUMS.txt` 保留原正本，基线提交为 `0861311395dcf1a9be131167ea2c5d4ea6b80f27`。根目录 `map2model/` 保持原样，独立安装。当前完整工作流使用本目录的整合包：5 个入口加入 8 段 KI-design / SketchUp 接口；方法正本与补充规则分别校验。不要同时安装两份同名 Skill。

## 安装 Skill

需要 Node.js 24 或更新版本。从仓库根目录运行：

```sh
node workflow/kigaga-workflow-v0.3/scripts/sync-skills.mjs
node workflow/kigaga-workflow-v0.3/scripts/sync-skills.mjs --apply
```

第一条只检查；第二条备份将被替换的文件，然后逐文件安装并校验。默认目标为用户目录下 `.codex/skills`；Claude 可追加 `--dest <你的 .claude/skills 绝对路径>`。清单外的已有文件保留。源正本哈希变化时会拒绝套用旧接口，先复核 `local-skill-adapters.json`。专家库仅安装方法入口，需自行配置已授权资料位置；SketchUp 的 MCP 服务、扩展和宿主兼容性另按包内说明核实，不随 Skill 自动安装。

## 项目服务

```sh
cd workflow/kigaga-workflow-v0.3
npm ci
npm run build
npm test
```

本地构建只编译共享 UI 资产，既不创建离线预览，也不注册第二个工作台。日常操作在对话中完成。配置现有项目库与 MCP 客户端见 [本地部署](kigaga-workflow-v0.3/docs/local-deployment.md)。测试使用独立临时库；不要把真实项目目录用作测试目录。

## 云端 UI

从 `workflow/sites/ki-workbench` 运行：

```sh
npm ci
node scripts/import-workbench.mjs
node scripts/build-mcp-host.mjs
node --test tests/*.test.mjs
npm run build
```

前两个构建脚本读取本目录的项目服务依赖和同一视觉源。`.openai/hosting.json` 仅含通用 D1/R2 绑定名，没有账号或站点 ID。正式发布须在自己的 Sites 环境配置所有者权限、D1、R2 和平台认证；普通静态托管不提供这些访问控制。开发环境的模拟认证不能用于公开生产服务。详见 [云端说明](sites/ki-workbench/README.md)。

工作台只有一个全屏侧栏入口，只读查看流程、目录、主线、指标、交接及选定成果。没有地图和设计确认操作。云端保存已发布的副本，不替代本地项目库，也不代表 AI 后台持续执行。

## 核验与更新

运行 `node workflow/scripts/verify-source.mjs` 验证本次公开快照；修改源码后先测试，再用 `--write` 更新清单。具体检查与公开版适配见 [同步记录](PUBLIC-SYNC.md)。方法文件中的“已部署”“已安装”是原维护环境的记录，不能证明新电脑已完成安装或项目验收。

第三方组件的 `LICENSE`、`NOTICE` 与来源记录原样保留。建模包的 9 张历史案例参考图未纳入公开包，使用时需另行取得授权参考。项目源码公开不改变各自许可条件，也不授权分发用户的参考资料原文。
