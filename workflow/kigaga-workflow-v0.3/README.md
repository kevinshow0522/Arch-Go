# KI 项目服务

当前方法 1.30；工作台功能 0.6、视觉 0.6.1。完整目录、Skill 安装与 UI 构建说明见 [工作流入口](../README.md)。

本服务通过 GPT / Claude 的对话工具共同维护一个项目库。状态、证据、成果版本、用户确认、交接与章末分别记录；工作台仅查看。`kg_open_workbench` 只返回兼容快照，本地不注册页面或侧栏入口。

运行环境：Node.js 24+。在本目录运行 `npm ci`、`npm run build`、`npm test`。配置说明见 [本地部署](docs/local-deployment.md)。

`src/` 是服务与流程规则，`web/workbench-v04.html` 和 `web/workbench-visual.css` 是当前视觉源，`scripts/build-v04.mjs` 编译共享资产；`tests/` 使用隔离测试数据。其他历史渲染模块为已有兼容测试保留，不作为当前入口。

迁移、隧道和 Windows 辅助脚本按明确配置执行；公开包不含任何隧道客户端二进制、运行凭据、个人迁移脚本或既有项目备份。默认采用本机 STDIO 连接。
