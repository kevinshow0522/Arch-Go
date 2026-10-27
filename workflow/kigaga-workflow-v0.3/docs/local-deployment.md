# 本地部署

## 保持同一个项目库

先确定程序、现有数据库和长期项目目录。用 `KIGAGA_DB_PATH` 指向实际数据库，`KIGAGA_PROJECTS_ROOT` 指向授权的项目根目录；不要在其他磁盘建立平行项目库。参考库默认没有目录，可在仅保存在本机的 `storage-location.json` 中配置 `referenceRoots`，每项为 `label` 与绝对 `path`。

在本目录运行 `npm ci`、`npm run build`、`npm test`。配置 `KIGAGA_DB_PATH` 后运行 `node scripts/configure.mjs` 生成本机 `.mcp.json`；原有配置不一致时拒绝覆盖。`node scripts/doctor.mjs` 检查安装与临时数据库保存重开，不证明真实宿主已连接。

## 接入当前 GPT 对话

在 MCP 客户端中使用本机 Node 可执行文件作为命令、`src/server.mjs` 的绝对路径作为参数，并传入同一个 `KIGAGA_DB_PATH`。已有共享库可分别使用 `src/server-gpt.mjs` 与 `src/server-claude.mjs`，连接报告将区分接口身份。独立接口在库不存在时停止，避免误建空库。

重连后实际调用 `kg_get_connection` 核对 `interface_id`、`data_source_id`、方法版本，再用 `kg_find_projects` 和 `kg_get_context` 续接。仅配置文件存在不等于宿主已连接；不为检查而创建真实项目或写入测试成果。

只使用已配置的云端侧栏工作台。本机 `kg_open_workbench` 为数据兼容接口，不能打开页面。所有设计修改、问题回复和确认继续在对话中执行。

## 保存边界

数据库、账号配置、原始资料、导出进度、成果文件与诊断日志不纳入 Git。公开仓库只提供程序和方法；真实项目的目录范围与写入用途须另有用户授权。需要迁移时先备份并验证，不能将安装命令当作迁移授权。
