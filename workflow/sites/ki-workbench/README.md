# KI建筑设计工作流 · 云端只读工作台

仅所有者可访问，沿用 Sites 的登录和访问限制。独立网址通过 GET 读取；左侧工作台通过 MCP Apps 的只读工具读取。更新通过对话中的发布工具执行。无需本机电脑提供网页或保存已发布内容。

`ki_cloud_open_workbench` 仅声明一个 global 左侧入口，仅对 app 可见，显示模式仅为 fullscreen，返回 `ui://ki-arch/cloud-workbench-0.6.1.html`。对话保留项目数据工具，不生成工作台预览或对话侧栏入口。资源与云端网址共用当前页面、样式和渲染代码，资源中内联必要脚本，通过宿主桥读取全部项目与任务分页；不嵌套需要再次登录的整站 iframe。侧栏中的私密文件在原有受保护网址打开，云端网址仍为必要的受保护服务地址。页面桥仅允许 list/get 两个读取工具，发布工具的 UI visibility 仅为 model。资源发布与客户端实际显示入口分别验收。

侧栏连接采用官方 MCP Apps 2.0.0 的 App 组件，源文件为 `workbench/mcp-host.mjs`。`node scripts/build-mcp-host.mjs <现有本机程序目录>` 从现有方法维护工具链生成内联用的 `public/workbench-host.js` 并保留许可证；常规云端构建直接使用已跟踪的生成文件。MCP 2026 请求返回 complete 结果和私密缓存声明，旧协议保留原格式。

左侧唯一入口的工具声明包含浅色/深色建筑线稿图标，沿用原有KI橙色图形。`lib/workbench-icons.mjs` 内嵌两个SVG数据地址，避免私密网址登录影响图标加载；`public/favicon.svg` 和 `public/workbench-icon-dark.svg` 保存同源矢量文件。图标优先级依据官方[Entrypoint Icons](https://github.com/openai/mcp-extensions/blob/main/docs/spec.md#entrypoint-icons)，没有新增入口或改变页面布局。

Sites 的 `/mcp` 使用客户端OAuth；已有平台服务授权用于 `/api/publication`，通过 `OAI-Sites-Authorization` 进入原有的所有者私密访问边界，平台验证并消耗该头。服务端点只接受JSON发布、拒绝带Origin的浏览器写请求；页面没有写入控件或调用。该服务仅在当前所有者私密访问策略下使用，不能为发布改成公开访问。`POST`体为 `{operation:"progress"|"artifact",arguments:{...对应工具参数}}`，读取仍用GET接口。无需创建或轮换用于首次核对的授权。

云端 D1 仅保存项目服务或授权对话发布的进度副本与不可变发布历史，R2 保存明确选中的展示文件。发布不会回写项目库、创建设计确认、完成任务或运行本地软件。页面展示来源更新时间与发布时间，不能将旧快照当作实时执行。

`ki_cloud_list_projects` / `ki_cloud_get_project` 用于读取；发布者先读当前 revision，再以真实来源版本调用 `ki_cloud_publish_progress`，以同一 request_id 重试。旧来源、同版不同内容、并发覆盖被拒绝。文件用 `ki_cloud_publish_artifact` 发布，最多6MB，仅图片和PDF内联显示。网页没有写入操作。

本地测试使用独立预览数据库，真实项目不作为源码或数据库迁移种子。初始化时从本机方法维护目录导入的文件只有只读UI、目录及显示运行时，脚本为 `node scripts/import-workbench.mjs <程序目录>`。云端API和发布工具在本仓库维护，勿把凭据放入源码。
