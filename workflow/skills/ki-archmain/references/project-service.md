# 本机项目服务 · 方法1.30适配

2026-10-26 用户要求：工作台只查看工作流程；取消工作台地图、定位、配准、地图绘制与导出。位置、方位、现状图或坐标由用户在对话中提供，AI按已确认范围判断和画图。不要要求用户先在工作台操作地图。

本文件是本机服务适配说明。主方法正本仍为上级 `SKILL.md`；工具字段以当前实际 schema 为准。本机补充文件由 `LOCAL-SHA256SUMS.txt` 单独校验，不改动 GitHub 十项正本的哈希。

## 连接与开工

1. 用本地 `kg_get_connection` 核对服务方法1.30和共享数据源；`kg_find_projects`定位唯一项目，`kg_get_context`读取有效条件、当前工作包、最近交接、章末摘要、主线及指标。`ready=false`按工具给出的分页入口补读，不能用摘要代替完整依据。
2. 写入时传 `method_version: "1.30"`；显式不同版本被拒绝。历史项目缺失版本保持未记录，不以服务版本代替项目事实。
3. 按本工作包实际需要说明项目文件范围和读写用途。当前任务已授权的范围持续执行，扩大项目、目录或用途时再确认。参考库只读，先用已有索引再按页读取。

## 任务与成果

- `kg_prepare_task` 使用 `work_package`（如W3.3）、`executor`（gpt／claude／user）、`tags`（条目:03.4 等）及实际记录/依赖。新协议任务记录 `method_version: "1.30"`。
- 进入 `in_progress`、写入成果和更新执行中任务时明确 `executor`。当前执行者负责本任务；其他执行者须先完成交接再接手，不能只改标签。
- 后加依赖用 `kg_add_dependency`。依赖必须同项目且不成环；依赖未完成或依据有变化时下游不能完成。
- 05／06及07成果写 `mainline_ref`，引用当前主线卡版本；05／06另传 `upstream_record_ids`，至少一条有效的本项目上游 `chapter_summary` 记录。保存草稿、检查完成和用户确认分别记录。
- 用户确认具体成果时保存 `decision, confirmed`，`source` 写实际用户确认依据；`content` JSON包含 `task_id`、当前 `revision`、`item`。同条目新版确认会退役旧确认，旧版本仍可读取。

## 交接与章末同步

`kg_save_record(kind: "handoff")` 的 content 写 JSON：from、to、work_package、task_ids、done、next、waiting_on_user、files、mainline_ref、method_version、created_at。`files`只写项目资料／工作文件／成果输出中的相对路径。

离开 `in_progress` 时，先保存本任务的新交接，再把返回的 `handoff_record_id` 传给 `kg_checkpoint_task`。交接须对应当前任务、工作包和执行者，不可重用已消费的交接。完成还要有真实成果、检查及已完成依赖。

章末保存 `chapter_summary` JSON，含chapter、item、summary、key_points、ids、open_questions、status、decision_ref、files、mainline_ref、method_version、created_at。已确认状态必须引用同条目当前成果的有效确认记录；未确认结论照样同步并标待确认。

主线用 `kind: "mainline"`，指标表用 `kind: "metrics"`，均为项目级记录，content JSON带版本。主线内容改变必须升版，无论更新原记录还是另存新记录，引用旧主线的成果都要复核。指标表使用rows，保留指标、数值/单位、口径、性质、来源等级、可信度/状态和影响条目。

## 文件和只读工作台

项目资料、工作文件、成果输出以项目storage的实际绑定为准；`kg_list_project_files`默认仅元数据，`hash:true`单独请求哈希。`kg_read_project_file`只读取指定区内相对路径。第四区 `area: "参考库"` 另写已配置的library；不支持向参考库写入或把参考原件登记为项目输出。

工作台只读项目快照和进度，显示项目目录、工作包、执行者、章末、主线、指标和交接。所有修改、回复、确认、文件处理和绘图在对话中完成。方法升级不自动确认设计成果，也不修改历史项目版本。

## 云端展示入口（2026-10-27）

工作台部署在用户自己的仅所有者可访问站点；地址以当前连接配置为准。云端保存已发布的进度副本与选定成果，查看无需本机开机；本地软件任务仍由实际执行环境运行，不因此自动在后台执行。

项目库仍是项目记录来源。云端的发布、来源更新、任务完成、成果检查和用户确认分别判断。仅发布用户指定项目的既有进度与选定成果，不扩至全部项目或原始文件夹。

配置并核实自己的连接后，可用工具为 `ki_cloud_list_projects`、`ki_cloud_get_project`、`ki_cloud_publish_progress`、`ki_cloud_publish_artifact`。续接先读云端版本和项目来源，再从项目库或当前授权对话核对真实记录。保存阶段性成果/交接后，按已授权的展示范围发布；不能仅凭旧展示副本补造状态、作者或确认。工具未出现在当前会话时先发现当前工具，不把“已安装”当作实际原生调用已验证。

发布须保留source_id、project_id、真实来源版本、来源更新时间和刚读到的expected_publication_revision；新项目发布从0开始。相同request_id可重试，冲突先重读合并。快照仅包含稳定的project、tasks、records、chapter_summaries与handoffs等展示字段，不含临时生成时间、凭据或绝对文件路径。成果仅上传用户选定的文件，单文件上限6MB；图片/PDF可查看，其他格式下载。

平台已有服务授权可用于该所有者私密Site的 `/api/publication`；平台验证授权后才转发，网页拒绝带Origin的发布请求。`/mcp`使用客户端OAuth，不能将已有服务授权误用为MCP OAuth；不为核对而创建、轮换访问凭据或改变站点受众。部署说明见工作流目录中的 `sites/ki-workbench/README.md`；源码与测试不证明某个账号已完成真实发布。
