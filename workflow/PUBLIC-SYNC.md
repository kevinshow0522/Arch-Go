# 公开源码同步记录 · 2026-10-27

## 范围

新增完整工作流目录，保留仓库根目录 7 个方法 Skill 的 10 项正本文件、原 `SHA256SUMS.txt` 和既有 `map2model` 内容。本次不导入本机总仓库的历史，也不上传任何设计项目、学习资料库、数据库、账号配置、发布记录、截图、备份或临时产物。

整合包包括 KI-design 0.9.0、SketchUp 建模修复版、建筑设计专家库通用入口。主流程负责治理，章节负责工作包，KI-design 负责空间判断；SketchUp 负责已授权的可编辑建模与核验。主线、证据、指标、模型版本、保存和确认继续使用现有协议，8 段方法接口分布于 5 个入口。

## 公开版适配

- 去除专家库入口的个人目录、服务说明中的指定项目与私人站点地址；研究校验记录中的本机根目录改为占位符。参考库原文与续学记录不在此包内。根目录正本已经公开的历史示例保持原样。
- 云端配置只保留通用 D1/R2 绑定名和 MCP 能力；项目服务的参考库默认空列表，由使用者自行配置授权目录。
- 安装器兼容本仓库目录布局，增加专家库入口的清单同步和正确包计数。保留原有备份、差异更新、并发变更保护、上游哈希检查与回读逻辑。
- 方法目录的 `source_sha256` 对应加入接口后的实际主入口；原正本及接口基线仍由各自清单校验。解决整合 Skill 后旧哈希阻止 UI 构建的问题。
- Git 按字节保存校验文件，启动脚本保留原行尾，避免重新检出时 Windows 换行转换使清单失配。
- 安装说明与诊断按现行单一云端入口调整；本地诊断检查数据保存重开及无重复入口，不再请求已撤下的本地页面资源。
- 不包含旧离线预览生成入口、个人磁盘迁移脚本和真实对话预览数据；共享视觉源与云端 UI 保持米灰底、橙色强调、立体卡片及手机底部导航。
- 第三方许可证、NOTICE 和包内来源记录保留；9 张未明确再分发许可的历史案例 PNG 留在本机，公开包明确缺图边界并更新清单。SketchUp 的 MCP 程序与扩展运行包未在本次升级或发布。

这些适配发生在独立公开副本中，未覆盖本机已安装 Skill、现行服务、云端站点或任何项目库。以后回装到已有机器，应继续按哈希和差异合并，保留原配置。

## 检查

- 项目服务完整测试：145 项通过；随后对安装诊断、配置和 Skill 同步的 19 项针对性检查通过，包含新增的保存重开诊断测试。
- 云端工作台：12 项测试通过；单一侧栏入口、只读桥、分页读取、发布版本和跨站写入边界均有独立检查。
- 项目服务构建、云端共享 UI 导入、MCP Apps 桥构建及云端生产构建通过。
- 在隔离目录完成 Skill 安装：最终每处 300 个清单文件，两处共 600 次哈希回读；重复检查 0 项变化。10 个 Skill 的安装不包含根目录独立的 map2model。
- 本目录完整源码的文件数、大小与 SHA256 在 `SOURCE-MANIFEST.json` 记录，可用 `node workflow/scripts/verify-source.mjs` 复核。

构建和自动检查只证明公开源码及隔离流程通过验证；本次未重新发布云端站点、重启客户端，或执行真实建筑项目验收。

## 2026-11-16 收口修订

只改方法文字，不改项目服务和工作台代码。方法版本号仍为 1.30，服务端的版本校验不受影响。

- 根目录正本：`ki-archmain`（1.30 修订）、`brief-and-metrics` v0.3、`site-study` v0.3、`case-study` v0.2、`concept-scheme` v0.3。四个章节 Skill 按主流程第 5、6、7、9 节改齐可信度叫法、编号、主线卡栏目和授权节奏；主流程明确 ✔ 只由用户确认产生、符号只表示可信度、08.3 在 a、b 阶段做简版。
- 随之更新：根目录 `SHA256SUMS.txt`；`local-skill-adapters.json` 的正本哈希和三个章节的标题锚点；`framework-catalog.json` 的 `source_sha256`、W8.2 阶段说明；`LOCAL-SHA256SUMS.txt` 中这两个文件的哈希；用 `sync-skills.mjs` 重新生成 `skills/` 下 5 个整合入口；重新构建 `assets/workbench.html` 和云端 `public/workbench-method.js`（两处只有方法目录的三处文字变化）；`SOURCE-MANIFEST.json`。
- 检查（Node 24，隔离环境）：项目服务测试 146 项中 144 项通过、2 项跳过、0 项失败；云端工作台 12 项通过；`sync-skills` 在隔离目录安装并回读 600 次哈希；`sha256sum -c SHA256SUMS.txt` 与 `verify-source.mjs` 通过。

本次没有回装到任何已安装的 Skill 目录，没有重启服务或重新发布云端站点，也没有做真实项目验收。类型参考卡里原来的“已核”改成了“● 已对照原文”，是否升 ✔ 由用户逐条确认。

## 2026-11-16 第二次修订：中途进场

仍只改方法文字，方法版本号 1.30 不变。

- `ki-archmain` 第 2 节加“中途进场”：带着已有文档（多是 PDF、PPT）直接出效果图或平面图时，接收文档、写进场卡（主线卡进场版 v0.1 加简版 01.5 章末摘要）、按目标成果查最小输入。进场卡和简版 01.5 满足项目服务对 05／06／07 成果引用主线卡和上游章末摘要的现有要求，服务代码不用改。
- `concept-scheme` v0.4：W5.4 加效果图提示词任务单；有数据依据才叫效果图，否则只能列为意向图。
- 随之更新的清单、整合入口和工作台资产与上一次相同；重建后的资产只有 `source_sha256` 变化。
- 检查（Node 24，隔离环境）：项目服务测试 146 项中 144 项通过、2 项跳过、0 项失败；云端工作台 12 项通过；哈希清单与源码清单校验通过。

“中途进场”还没有在真实项目上试过；进场卡按主线卡记录保存的做法只核对了服务代码里的规则，没有连真实项目库验证。

## 2026-11-18 修订：旧版文档坏链

- `skills/ki-archmain/legacy/references/subprojects.md` 第 53 行“框架与服务深度”原指向 `framework-v04.md`，该文件在仓库历史中从未存在；改为指向 `../../references/framework-catalog.json`。
- 随之更新：`LOCAL-SHA256SUMS.txt` 中该文件的哈希；`SOURCE-MANIFEST.json` 中该文件、`LOCAL-SHA256SUMS.txt` 和本文件的大小与哈希。只改 1.20 旧版参考文字，方法版本号 1.30、主入口、整合入口和工作台资产均不变。

## 2026-11-19 修订：工作包执行检查接口

把本机 2026-10-27 起随项目服务“执行规则1”使用的 `ki-archmain` 接口并入公开源码。方法版本号仍为 1.30，根目录正本不变。

- `skills/ki-archmain`：新增接口片段 `references/execution-interfaces/ki-archmain.txt` 和说明 `references/work-package-execution.md`；`local-skill-adapters.json` 登记 `work-package-execution` 接口（正本基线 dbf16c43…）；`references/project-service.md` 开头加“当前执行补充”。整合入口 `SKILL.md` 由 `sync-skills.mjs` 生成，三段接口依次为 KI-design、SketchUp、工作包执行检查；`framework-catalog.json` 的 `source_sha256` 和 `LOCAL-SHA256SUMS.txt` 随之更新。
- `kigaga-workflow-v0.3/scripts/sync-skills.mjs`：增加 `work-package-execution` 接口类型，不依赖其他本机 Skill 包，只允许挂在 `ki-archmain/SKILL.md`。
- 检查：`sync-skills` 演练对仓库 `skills/` 与一处已安装目录均为 0 项变化，接口 9 段；三组 Skill 同步测试 15 项通过；`verify-source.mjs` 通过。未运行项目服务全量测试，未重新发布云端站点。
- 本机私有版里的云端工作台地址与具体项目名未带入公开包。

## 2026-11-20 修订：确认不再连带整章复核

项目服务在子项目里写入任何 `decision` 记录时，会把整个子项目的任务及其下游都标为待复核。各章都是子项目，成果确认也是 `decision` 记录，于是确认一个成果会把本章和后面各章的任务全部标为待复核，尽管这些任务的内容没有变。

- `kigaga-workflow-v0.3/src/workflow-store.mjs`：成果确认（带 `task_id` 与版本的确认记录，确认和撤回都算）不再按子项目范围连带复核，只复核明确引用这条记录的任务；章末摘要只改确认状态（`status`、`decision_ref` 等）、正文不变并改为“已确认”时，不复核引用它的任务。普通决定仍按子项目范围复核；章末改回“待确认”或连同正文一起修改时照常复核。
- 新增 `tests/confirmation-scope.test.mjs` 4 项；其中 2 项在修改前失败、修改后通过，另 2 项确认原有复核仍然生效。
- 检查：项目服务测试 150 项全部通过；`verify-source.mjs` 通过。本机运行中的服务需重新连接后才加载新规则。

## 2026-11-23 修订：开工先选起点，门槛按任务定

只改方法文字，方法版本号仍为 1.30，项目服务和工作台代码不变。起因：一个测试项目只有一份简版 02.7 就进了 05 章，01、03、04 都缺，方法没有拦住；用户接手的项目进度各不相同，不采用固定门槛，改为每次开工由用户选起点、按任务定门槛。

- 根目录 `ki-archmain`：第 4 节开头加“开工前先选起点、定门槛”。新项目、续接、开新工作包前，AI 先列项目进度，由用户选从哪里开始、这次做什么；门槛内容由用户按这次任务定，缺项由用户定现在补、登记“外部已有”或“这次不做”，“这次不做”写成记录、不算缺项，没表态的不能静默跳过。第 1 节第 1 条、第 2 节“从任何阶段进入”和中途进场第 3 步、第 3 节 b 阶段常用顺序随之改写；第 14 节加修订记录。
- 随之更新：根目录 `SHA256SUMS.txt`；`local-skill-adapters.json` 中三段 `ki-archmain` 接口的正本基线；用 `sync-skills.mjs` 重新生成 `skills/ki-archmain/SKILL.md`；`framework-catalog.json` 的 `source_sha256`；`LOCAL-SHA256SUMS.txt` 中这两个文件的哈希；`assets/workbench.html` 和云端 `public/workbench-method.js` 内嵌方法目录的 `source_sha256`（11-19 起没有跟上，这次一并对齐；内嵌目录其余内容与 `framework-catalog.json` 一致，没有重新打包）；`SOURCE-MANIFEST.json`。
- 检查（Node 25，独立 worktree）：项目服务测试 150 项全部通过；`sync-skills` 演练对仓库 `skills/` 和一处临时安装目录均为 0 项变化，接口 9 段；两个工作台资产内嵌的方法目录与生成脚本的输出逐字节一致；`SHA256SUMS.txt`、`LOCAL-SHA256SUMS.txt` 与 `verify-source.mjs` 校验通过。

没有回装到任何已安装的 Skill 目录，没有重新发布云端站点，新规则也还没有在真实项目上试过。

## 2026-11-25 修订：流程反馈、按段推进与三个深度

改方法文字、方法目录和依赖目录的测试断言，方法版本号仍为 1.30；本包里的项目服务代码（`kigaga-workflow-v0.3/src`）和工作台源码没有动。分两轮：先按用户在一个测试项目里攒下的 10 条流程反馈改，再按用户当天定的框架取舍、三个深度的子项、中途进入的衔接和第七章接口改。

第一轮（流程反馈）：

- 根目录 `ki-archmain`：工作包做完默认结案，用户确认集中由主总控问一次，一个包只存一版成果；总控派子代理做包，没有方向抉择就接着做，做完才回主线，主线卡只在回主线时更新；互不依赖的包可以并行（随用户提速要求补）；防对话过长、项目运行规则存项目库、汇报短和读取窄、按任务选模型；分析阶段（01–04 章）的图只出够下判断的草图，内容照样核对，要正式画的列进交接记录的正式图清单，出图的线程直接开在 07 章；加“已确认的上游前提被推翻”的处理。
- 根目录 `site-study` v0.4：加“选址核查与周边建筑（必做）”一节，选址候选卡必须核现状建筑和历史资源，周边建筑清单和图、紧邻建筑从按需改为必做。`brief-and-metrics` v0.4、`case-study` v0.3、`concept-scheme` v0.5 只把和新规则冲突的句子改齐。
- `skills/ki-archmain`：接口片段 `references/execution-interfaces/ki-archmain.txt`；`references/work-package-execution.md`（开工授权默认带 `complete`，新增“上游与用户确认”，参考类记录、主线卡和确认接替的打回规则，换对话凭 `execution_id` 续做）；`references/project-service.md`（加连续推进补充和读取工具的选用，主线卡升版一句改写）。

第二轮（框架取舍与三个深度，2026-11-25 用户定）：

- 01 章不动，W1.1、W1.2 不合并、内容不减：业主更看重立项分析和立项阶段的经济测算，前期分析要加深。
- 工作包合并，编号不重排：W2.2 并入 W2.1（使用、条件与立项测算），W3.3 并入 W3.2（场地条件），W4.3 并入 W4.1（案例借鉴，一个包出借鉴问题、案例卡和 04.7），W5.5a 并入 W5.5，W8.2 并入 W8.1（收尾，由主总控做）。停用的编号在 `framework-catalog.json` 的 `work_packages` 里保留，标 `retired: true` 和 `merged_into`，老项目的旧编号仍能查到。W5.1 改为带草模的方向粗选，W5.2–W5.4 只做挑中的方向。06、07 的包不变。
- 总控按五段合并，代替每章一个章总控：立项与任务书（01–02）、场地与案例（03–04）、概念方案（05）、深化（06）、展示与交付（07–08）。确认点：01.5 和 02.7、03.8 和 04.7、05.1 连同挑方向、05.9、06.9、08.3，主线卡在确认之后一次写入对应的栏。03 和 04 并行。
- 三个深度各用哪些子项：`ki-archmain` 第 2 节改成项目策划、概念方案、方案设计三张表；`framework-catalog.json` 的条目要求、`core_by_stage`、`declared_core_by_stage`、`entry_backfill`、`source_document`、`revision_note` 随之更新。项目策划加 01.4、立项测算表和对标案例（04.1、04.3、04.6、简版 04.7，并在 W2.1 里做）；概念方案把 03.1、04.7 列为核心，不做 06 和 03.7；方案设计把 08.2 列为核心。07 两个条目登记了各深度做不做，仍不计入完成情况。表列核心由 0／a／b／c 的 3／8／13／9 项变为 3／12／15／10 项，加上章末必做为 3／16／16／10 项。
- 中途进场：所有中途进入的项目先做接收包、出进场卡，按进入位置只补下游要引用的那几项；原“直出”作为细则保留。`entry_backfill` 去掉 b 的 03.1（已是本深度核心）和 c 的 03.1、03.8。
- 第七章只留接口：`ki-archmain` 第 11 节加“分析图出图风格”和“输出文件与交互界面版式”两个接口，风格和版式待跑完一个项目后讨论，没有设计具体风格。
- 章节 Skill 同步：`brief-and-metrics` v0.5（立项测算表、策划深度的对标案例）、`site-study` v0.5（各深度做哪些）、`case-study` v0.4（W4.1 一个包、先按 C02- 写借鉴问题）、`concept-scheme` v0.6（草模粗选、W5.5 含速核、强排示意）。
- 接口片段、`work-package-execution.md`、`project-service.md` 里的“同章／跨章”改为“同段／跨段”，各包默认要已确认的上游章末改为：W2.x 不要求；W3.x 和 W4.x 都只要 02.7；W5.1 要 02.7、03.8、04.7；W5.2 起要 02.7、03.8、05.1；W6.x 要 05.9。

随之更新：

- 根目录 `SHA256SUMS.txt`（五个 Skill）；`local-skill-adapters.json` 八段接口的正本基线和 `site-study`、`case-study`、`concept-scheme` 的标题锚点；用 `sync-skills.mjs` 重新生成 `skills/` 下 `ki-archmain`、`site-study`、`brief-and-metrics`、`case-study`、`concept-scheme` 五个入口；`framework-catalog.json` 的 `source_sha256`；`LOCAL-SHA256SUMS.txt` 中五个文件的哈希；`SOURCE-MANIFEST.json`。
- 工作台内嵌的方法目录这次内容变了，用构建脚本重新生成：在 `kigaga-workflow-v0.3` 目录运行 `node scripts/build-v04.mjs`（即 `npm run build`，esbuild 0.28.2）生成 `assets/workbench.html`；在 `sites/ki-workbench` 目录运行 `node scripts/import-workbench.mjs` 生成云端 `public/workbench-method.js`。重建前后对比：`workbench.html` 除内嵌目录一段外逐字节相同；云端 `public/workbench-runtime.js` 和 `workbench/page.html` 重新生成后与原文件相同，没有变化。
- `tests/process-workflow.test.mjs`：目录测试改为按新目录断言核心项个数、两张清单与条目表一致、停用包号的 `merged_into`、每个条目都挂在在用的包上、`entry_backfill`。

检查（Node 25，独立 worktree）：项目服务测试 150 项全部通过；`sync-skills` 演练对仓库 `skills/` 和一处临时安装目录均为 0 项变化，接口 9 段；两个工作台资产内嵌的方法目录与生成脚本的算法输出一致；`SHA256SUMS.txt`、`LOCAL-SHA256SUMS.txt` 与 `verify-source.mjs` 校验通过。云端工作台测试这次没有跑。

**服务代码这次没有同步。** `work-package-execution.md` 和 `project-service.md` 写的放行规则（同段上游结案即可开下包，跨段上游要本包确认或该章章末已确认；W2.x 不必等 01.5，W3.x 和 W4.x 只要 02.7；笔记、交接和主线卡升版不自动打回；确认被接替后自动改引用；内容没变的复核重存保留原确认）是私有维护版项目服务 2026-11-25 的行为。本包 `kigaga-workflow-v0.3/src` 仍是 2026-11-20 的快照，会按旧规则拦下游、打回任务；要对齐，需另做一次服务代码同步，连同 `tests/chapter-flow.test.mjs`。

没有回装到任何已安装的 Skill 目录，没有重新发布云端站点（云端仍是旧的方法目录）；按段推进和三个深度的新写法还没有在真实项目上完整走过一遍。

## 2026-11-28 修订：整体审查后的四处方法修订与修订日期

起因是对整个公开包做的一次审查。方向由用户 2026-11-28 定，细则由 AI 起草，**还没有经用户逐条核对**；方法版本号仍为 1.30。

**审查发现、这次没有解决的缺口：公开包里没有“执行规则1”的服务代码。** `skills/ki-archmain/SKILL.md` 的接口要求写入前核对连接返回 `execution_policy_version=1`，没有就只读；`references/work-package-execution.md` 用到的 `authorization_record_id`、`execution_id`、`execution_readiness`、`kg_bind_task_context`、`entry_mode`、`required_summary_items`、`affects` 等字段和工具，在本包 `kigaga-workflow-v0.3/src` 和测试里都不存在。2026-11-19 并入的只是接口文字。所以只用本包的 Skill 加本包的项目服务，按 Skill 自己的规则只能读、不能写；另外本包服务在主线卡升版时仍会把引用旧版的任务标为待复核，和“主线卡升版不自动打回”的方法文字相反。2026-11-25 那条记录只说了分段放行规则没同步，实际缺的是 2026-10-27 起的整套执行规则。私有维护版的服务代码在另一台电脑上，待上传并脱敏后另做一次同步。

方法文字（根目录正本）：

- `ki-archmain`：开头写“当前修订”日期；交接记录和章末摘要加 `method_revision`（第 7 节）。项目启动（0）单独做时 01.5 做完单独确认并建主线卡 v0.1；策划深度的对标结论（04.7 简版）随 02.7 确认，场地与案例段末在策划深度只确认 03.8 简版（第 2、3、4 节）。第 5 节：用户确认不改变来源等级，外部事实当硬限制或选址条件用、来源只有 B、D、E 级的，标 ✔ 也记“待取得正式文件”。第 6 节：策划深度的对标问题沿用 Q 编号。
- `brief-and-metrics` v0.6：“策划深度的对标案例”重写，先写对标问题，数字按来源分原始、转述、线索三档，不用案例等级甲／乙／丙，加口径要求和五栏对标卡。
- `case-study` v0.5：写明案例等级只用于概念方案和方案设计深度的设计借鉴。
- `site-study` v0.6：选址条件和硬限制随第 5 节改写；“05 必须”写成能逐条判断的条件。
- `concept-scheme` v0.7：05.9 第一关门槛写成四条，补上“违反 03.8 的 05 必须”，以及用到“待取得正式文件”的硬限制时怎么注明。此前这一条只写在主流程和 site-study 里，做 W5.5 的子代理按规定只读本包那一节，会漏掉。

随之更新：

- 根目录 `SHA256SUMS.txt`（五个 Skill）；`local-skill-adapters.json` 八段接口的正本基线和 `site-study`、`case-study`、`concept-scheme` 的标题锚点；用 `sync-skills.mjs` 重新生成 `skills/` 下五个入口；`framework-catalog.json` 加 `method_revision`，改 01.5（0、a）、04.1（a）、04.7（a）的条件说明、`source_document`、`revision_note`、`source_sha256`；`references/work-package-execution.md` 和 `references/project-service.md` 的确认点、`method_revision`、`rules_revision` 说明；`LOCAL-SHA256SUMS.txt`；`SOURCE-MANIFEST.json`。
- 工作台内嵌的方法目录内容变了，用构建脚本重新生成 `assets/workbench.html` 和云端 `public/workbench-method.js`。
- 项目服务代码改了一处：`src/method-version.mjs` 加 `SERVICE_RULES_REVISION`（本包为 2026-11-20），`kg_get_connection` 多返回 `rules_revision`，让对话能看出服务的放行和打回规则是哪一天的。放行、打回规则本身没有动。私有维护版同步进来时要带上这个字段，并把日期改成它实际的规则日期。
- 新增 `tests/method-revision.test.mjs` 3 项：交接和章末摘要带不带 `method_revision` 都能保存读回；修订日期不代替方法版本号；服务报告规则日期。`tests/process-service.test.mjs` 加一句核对 `rules_revision`。
- 根目录 `README.md` 和本目录 `README.md` 里“最近一次修订是 2026-11-16”的说法改为指向本记录。

检查（Node 22，云端容器；说明要求 Node 24）：项目服务测试 153 项，151 项通过、2 项 Windows 专项跳过、0 项失败；云端工作台 12 项通过；`sync-skills` 在临时目录安装并回读 604 次哈希，再次演练 0 项变化，接口 9 段；`SHA256SUMS.txt`、`LOCAL-SHA256SUMS.txt` 与 `verify-source.mjs` 校验通过。

没有回装到任何已安装的 Skill 目录，没有重新发布云端站点。新规则没有在真实项目上试过；私有维护版服务对记录里多出的 `method_revision` 字段是否照常保存，没有验证。审查里列的其余次要问题这次没有改。
