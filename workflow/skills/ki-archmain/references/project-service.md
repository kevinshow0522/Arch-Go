# 本机项目服务 · 方法1.30适配

## 当前执行补充（2026-10-27）

实际连接返回execution_policy_version=1后，遵循[工作包执行检查](work-package-execution.md)。开工用kg_checkpoint_task传authorization_record_id，得到execution.id；续接和kg_save_result都传execution_id，保存另传最新任务及项目版本。kg_bind_task_context按真实用户授权补已有任务的工作包、章节和输入，保留历史。ready/context_complete只说明上下文完整，execution_readiness判断能否开工。开工授权purpose=work_authorization，与成果确认分开；已授权同包续接无需重复询问。后文仍适用，但不得沿旧调用直接从prepared写成果。

## 分段连续推进补充（2026-11-25）

下面的规则要求项目服务已更新到含分段连续推进规则的版本（对应测试 `tests/chapter-flow.test.mjs`）并重新连接；旧版服务仍按旧规则拦下游、打回任务，那时照服务返回的阻塞原因处理，不绕过。细则见[工作包执行检查](work-package-execution.md)。

- 包做完默认结案：开工授权一次带齐analyze、save_draft、complete，不另存结案授权。用户确认集中在确认点问一次（05.1由概念方案段总控在段内问，其余由主总控问）。
- 五段：立项与任务书（01–02）、场地与案例（03–04）、概念方案（05）、深化（06）、展示与交付（07–08）。同段上游已结案（不是条件性讨论稿）就能开下包；跨段上游要有该包当前成果的用户确认，或该章章末摘要已确认。条件性开工只在跨段上游未确认时用。
- 各包默认要已确认的上游章末：W2.x不要求；W3.x和W4.x都只要02.7；W5.1要02.7、03.8、04.7；W5.2起要02.7、03.8、05.1；W6.x要05.9。
- note（标题不含“主线卡”）和handoff是参考类记录，升版、退役不打回任务、不卡开工；主线卡新建或升版也不自动打回。要打回时在content的JSON里写affects.task_ids或affects.items。
- 旧成果确认被新确认接替：未结案的引用任务自动改引用新确认；已结案的待复核，续做时kg_checkpoint_task传refresh_evidence=true自动换成新确认。内容没变的复核重存，原确认继续有效。
- 换对话续做同一个包：新对话读kg_get_task拿execution.id即可续存。每步存续接点；一个包只存一版成果。

## 测试项目跑完后的补充（2026-11-26）

下面几条同样是更新后的项目服务的行为，旧版服务没有；细则见[工作包执行检查](work-package-execution.md)。

- 章末摘要由“待确认”改成“已确认”：只改确认信息（status、decision_ref、confirmed_at、mainline_ref等）不打回任何包。确认时改了正文的，在摘要content里写affects（有受影响的写task_ids或items，没有就写空对象{}），服务只打回写明的；不写affects而正文有改动，引用它的包照常被打回。
- 复核重存：成果原样传，说明写在kg_save_result的review_note参数里（最多1000字）。成果内容完全相同、只有上游引用版本不同时，原版本上的用户确认继续有效；在标题或正文里加“复核重存”之类的字，服务当成内容变了，旧确认作废。
- 记录长度：主线卡和指标表的content上限40000字，其他记录12000字。读长记录按next_offset翻页。
- kg_get_context在字符预算不够时返回ready=false，这时execution_readiness里的false只表示上下文没读全；任务本身的开工检查结果在task_readiness里。
- “任务或项目上下文版本已变化”的报错带当前任务版本和项目版本。并行的其他包写库也会让项目版本加一：核对与本包无关后用最新版本重试，有关才重读合并。
- 成果漏列必要的上游章末引用时，报错列出缺哪几条；upstream_record_ids和任务的引用都写完整记录编号，不能写前8位。
- 条件性开工（draft_only）只在用户明确只要讨论稿时用：能开工、能存稿，但结案被拒，之后用户确认了标记也不清除，下游正式开工照样被拦。
- 章末结论要修订时，另开一个同包号的修订任务，存修订版成果，用户确认后章末摘要绑这个新任务；不绑任务的摘要转不成“已确认”。

2026-10-26 用户要求：工作台只查看工作流程；取消工作台地图、定位、配准、地图绘制与导出。位置、方位、现状图或坐标由用户在对话中提供，AI按已确认范围判断和画图。不要要求用户先在工作台操作地图。

本文件是本机服务适配说明。主方法正本仍为上级 `SKILL.md`；工具字段以当前实际 schema 为准。本机补充文件由 `LOCAL-SHA256SUMS.txt` 单独校验，不改动 GitHub 十项正本的哈希。

## 连接与开工

1. 用本地 `kg_get_connection` 核对服务方法1.30和共享数据源；`kg_find_projects`定位唯一项目，`kg_get_context`读取有效条件、当前工作包、最近交接、章末摘要、主线及指标。`ready=false`按工具给出的分页入口补读，不能用摘要代替完整依据。
2. 写入时传 `method_version: "1.30"`；显式不同版本被拒绝。方法修订不改这个版本号，修订日期写进交接和章末摘要 content 的 `method_revision`（上级 `SKILL.md` 第 7 节），服务不校验它，有没有这个字段的记录都收。`kg_get_connection` 返回 `rules_revision` 时，它是服务放行和打回规则的日期，见[工作包执行检查](work-package-execution.md)。历史项目缺失版本保持未记录，不以服务版本代替项目事实。
3. 按本工作包实际需要说明项目文件范围和读写用途。当前任务已授权的范围持续执行，扩大项目、目录或用途时再确认。参考库只读，先用已有索引再按页读取。
4. 读取要窄：查状态用 `kg_get_task`、`kg_list_tasks`、`kg_list_records`（按 `kind` 筛），不用 `kg_get_project_progress`（一次返回几万字）。章节 skill 只读本包用到的那一节。
5. 项目运行规则存成一条 note 记录，新开的主总控、段总控开头先读；它是参考类记录，可以直接升版。

## 任务与成果

- `kg_prepare_task` 使用 `work_package`（如W3.2；停用的旧包号在老任务里照旧认，新任务用并入后的包号）、`executor`（gpt／claude／user）、`tags`（条目:03.4 等）及实际记录/依赖。新协议任务记录 `method_version: "1.30"`。
- 进入 `in_progress`、写入成果和更新执行中任务时明确 `executor`。当前执行者负责本任务；其他执行者须先完成交接再接手，不能只改标签。
- 后加依赖用 `kg_add_dependency`。依赖必须同项目且不成环；依赖未完成或依据有变化时下游不能完成。互不依赖的包可以同时开工。
- 段内的包由段总控派子代理执行，一个包只派一个子代理。子代理交回不超过约 15 行：结论、成果版本、记录编号、待用户决定的事；细节留在项目库。同一件事只由一个对话向用户汇报。
- 把关与对齐（2026-11-26 用户定）：做包的子代理只读简报、[子代理操作卡](subagent-card.md)和章节 skill 里本包那一节。验收清单逐条结果和对齐检查三行写进结案的 `checkpoint.checks`。确认点前的“复核意见｜<确认点>”和“偏离记录”都存成 note 记录，不另建任务。简报模板、复核子代理的简报、偏离记录和四组数的格式见[简报、复核与对齐](briefing-and-review.md)。
- 按任务选模型：策略与判断类（章末结论、主线卡、方向与比选、变更影响判断）用最强模型，其余建筑任务不低于次强一档，不用轻量模型做建筑任务；分档表见上级 `SKILL.md` 第 3 节。
- 05／06及07成果写 `mainline_ref`，引用当前主线卡版本；05／06另传 `upstream_record_ids`，至少一条有效的本项目上游 `chapter_summary` 记录。保存草稿、检查完成和用户确认分别记录。
- 用户确认具体成果时保存 `decision, confirmed`，`source` 写实际用户确认依据；`content` JSON包含 `task_id`、当前 `revision`、`item`。同条目新版确认会退役旧确认，旧版本仍可读取；还没结案的引用任务自动改引用新确认。确认不在每个包里各问，集中到确认点问一次：05.1连同挑方向由概念方案段总控在段内直接问用户；01.5和02.7、03.8和04.7、05.9、06.9、08.3由段总控交回主总控，主总控问。只做项目启动时01.5做完单独确认；策划深度的对标结论（04.7简版）随02.7确认。

## 交接与章末同步

`kg_save_record(kind: "handoff")` 的 content 写 JSON：from、to、to_role、work_package、task_ids、execution_id、done、next、waiting_on_user、files、mainline_ref、method_version、method_revision、created_at。from、to写执行者名（claude、gpt、user，to可以是any），角色另写在to_role；done是一个字符串，不是数组；task_ids写完整编号。`files`只写项目资料／工作文件／成果输出中的相对路径。完整模板和服务核对哪些字段见[工作包执行检查](work-package-execution.md)的“交接记录模板”。每段段末，段总控把本段各包交接里的正式图清单汇成一条标题为“正式图清单”的note记录，逐条编号、后面的段接着往下编，07只读这一条。

离开 `in_progress` 时，先保存本任务的新交接，再把返回的 `handoff_record_id` 传给 `kg_checkpoint_task`。交接须对应当前任务、工作包和执行者，不可重用已消费的交接。完成还要有真实成果、检查及已完成依赖。

章末保存 `chapter_summary` JSON，含chapter、item、summary、key_points、ids、open_questions、status、decision_ref、files、mainline_ref、method_version、method_revision、created_at。已确认状态必须引用同条目当前成果的有效确认记录；未确认结论照样同步并标待确认。07可以存一条章末摘要（选了哪些图、暂用风格、待用户看的事），item写07.1或07.2，不计入完成情况。

主线用 `kind: "mainline"`，指标表用 `kind: "metrics"`，均为项目级记录，content JSON带版本。主线内容改变必须升版。新建或升版不自动打回任务：确认点之后补写新栏不影响已做完的包；做变更判断时在content里写 `affects.task_ids` 或 `affects.items`，服务只打回写明的任务及其下游。05／06／07成果保存时 `mainline_ref` 仍须等于当前主线卡版本。主线卡只在回主线时由主总控更新，在各确认点之后一次写入对应的栏；05.1是例外，确认后先不写，第5、6、7栏留到05.9确认后和第8栏一起写入，05段内以05.1的章末摘要和确认记录为依据，`mainline_ref` 写的当前主线卡版本在段内不变。指标表使用rows，保留指标、数值/单位、口径、性质、来源等级、可信度/状态和影响条目。

## 文件和只读工作台

成果文件有两套：服务导出的 `成果输出/<任务编号>/` 是机器副本，按章的文件夹是给人读的版本。以项目库里的成果版本为准；人读版文件名带版本号；服务导出的文件夹不移动、不改名、不删除。

项目资料、工作文件、成果输出以项目storage的实际绑定为准；`kg_list_project_files`默认仅元数据，`hash:true`单独请求哈希。`kg_read_project_file`只读取指定区内相对路径。第四区 `area: "参考库"` 另写已配置的library；不支持向参考库写入或把参考原件登记为项目输出。

工作台只读项目快照和进度，显示项目目录、工作包、执行者、章末、主线、指标和交接。所有修改、回复、确认、文件处理和绘图在对话中完成。方法升级不自动确认设计成果，也不修改历史项目版本。

## 云端展示入口（2026-10-27）

工作台部署在用户自己的仅所有者可访问站点；地址以当前连接配置为准。云端保存已发布的进度副本与选定成果，查看无需本机开机；本地软件任务仍由实际执行环境运行，不因此自动在后台执行。

项目库仍是项目记录来源。云端的发布、来源更新、任务完成、成果检查和用户确认分别判断。仅发布用户指定项目的既有进度与选定成果，不扩至全部项目或原始文件夹。

配置并核实自己的连接后，可用工具为 `ki_cloud_list_projects`、`ki_cloud_get_project`、`ki_cloud_publish_progress`、`ki_cloud_publish_artifact`。续接先读云端版本和项目来源，再从项目库或当前授权对话核对真实记录。保存阶段性成果/交接后，按已授权的展示范围发布；不能仅凭旧展示副本补造状态、作者或确认。工具未出现在当前会话时先发现当前工具，不把“已安装”当作实际原生调用已验证。

发布须保留source_id、project_id、真实来源版本、来源更新时间和刚读到的expected_publication_revision；新项目发布从0开始。相同request_id可重试，冲突先重读合并。快照仅包含稳定的project、tasks、records、chapter_summaries与handoffs等展示字段，不含临时生成时间、凭据或绝对文件路径。成果仅上传用户选定的文件，单文件上限6MB；图片/PDF可查看，其他格式下载。

平台已有服务授权可用于该所有者私密Site的 `/api/publication`；平台验证授权后才转发，网页拒绝带Origin的发布请求。`/mcp`使用客户端OAuth，不能将已有服务授权误用为MCP OAuth；不为核对而创建、轮换访问凭据或改变站点受众。部署说明见工作流目录中的 `sites/ki-workbench/README.md`；源码与测试不证明某个账号已完成真实发布。
