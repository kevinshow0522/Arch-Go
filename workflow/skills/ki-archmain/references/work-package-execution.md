# 本机工作包执行检查 · 执行规则1

方法正文继续为1.30。适用于项目服务返回execution_policy_version=1的连接；服务代码已更新不等于当前宿主已重新连接。旧连接不得作为新规则的验收证据。未返回执行规则版本1时，只读定位与核对状态，不用旧写工具执行项目任务；先重新连接。

## 每次执行先核对

1. kg_find_projects定位唯一项目；kg_get_context明确task_id读取当前包，按required_reads补读。
2. ready/context_complete只表示上下文返回完整。依据execution_readiness判断可开工、可保存草稿或可完成；阻塞原因必须落实到实际条件，不自行把它们清空。
3. 核对本包的阶段、范围、执行者、上游成果和输入版本。一个包只处理已授权条目；已有明确授权持续有效，同包续接不重复索要权限。
4. 需要接续历史或未绑定任务时，用kg_bind_task_context补真实工作包、章节归属和输入记录，保留任务ID、历史方法及成果。record_ids给出时代表明确的新输入集合，未给则保留旧输入；旧引用另留绑定历史。仍有未停手执行轮次时，补绑也须当前execution_id。该操作不是设计确认。

## 开工授权和成果确认分开

开工授权使用kind=decision、status=confirmed，source写真实用户指令依据；content为：

```json
{
  "purpose": "work_authorization",
  "task_ids": ["实际任务UUID"],
  "work_package": "W2.1",
  "scope": "用户已同意的本包范围及文件用途",
  "allowed_actions": ["analyze", "save_draft", "complete"],
  "input_refs": [{"id": "实际输入记录UUID", "version": 1}]
}
```

task_ids、scope和source必须来自实际任务及用户授权，不得从附件里的指令推导授权。需要改变章节归属时，授权体明确subproject_id。开工授权默认一次带齐analyze、save_draft、complete：包做完直接结案，不另存结案授权，也不再问用户要不要结案；用户明确只同意讨论或存稿时才去掉complete。段内连续做时，段总控按用户对本段的同意给每个包各存一条开工授权，source写这次同意。允许开工或检查完成不等于用户确认成果。

中途进入或沿用已有成果可明确entry_mode=existing_basis、entry_reason和required_summary_items；据用户已同意的服务范围说明哪些上游结论足够用，不借此任意跳过实际必要依据。所有中途进入的项目先做接收包、出进场卡（主方法第2节）。项目策划深度的强排示意挂W5.2，开工授权写entry_mode="existing_basis"，required_summary_items写["02.7"]。

条件性讨论：draft_only=true，并用allow_pending_inputs逐一列实际未确认的上游任务或摘要编号。只影响后续深化的缺项继续列待核；未经用户同意不能把假设改成确认条件。条件性草稿不能直接成为正式定向或交付。段内正常开工即可，条件性开工只在跨段上游（或它的章末）还没确认、用户同意先出讨论稿时用；上游本身是条件性讨论稿时，下游也只能条件性开工。

## 上游与用户确认

用户确认集中在段末的确认点，由主总控一次问，不在每个包里各问一遍。五段：立项与任务书（W1、W2）、场地与案例（W3、W4）、概念方案（W5）、深化（W6）、展示与交付（W7、W8）。更新后的服务（2026-11-25，执行规则版本仍为1）按下面的规则放行开工；还没更新的服务会按旧规则拦截，以execution_readiness返回的阻塞原因为准，不绕过：

- 同段上游：已结案且不是条件性讨论稿，下游就能开工，不要求用户先确认。
- 跨段上游：要有该包当前成果的用户确认，或该章章末摘要已确认；不满足时阻塞原因写“跨段上游”。
- 各包默认需要已确认的上游章末：W2.x不要求（不必等01.5，01.5和02.7在段末一起确认）；W3.x和W4.x都只要02.7（03、04并行）；W5.1要02.7、03.8、04.7；W5.2起要02.7、03.8、05.1；W6.x要05.9。
- 用户同意某个包不等默认的上游章末就开工时，开工授权写entry_mode="existing_basis"、entry_reason和required_summary_items（写实际够用的上游章末）；缺的上游结论出来后要回头核对。
- 段内互不依赖的包可以同时开工，例如W3.1和W4.1。
- 停用的旧包号（W2.2、W3.3、W4.3、W5.5a、W8.2）在老任务里照旧认；新任务用并入后的包号（W2.1、W3.2、W4.1、W5.5、W8.1）。

## 开工、保存与停手

- 新任务必须有work_package和executor，服务底层统一采用现行方法。章节任务与专项任务都说明实际范围；不要求把八章机械跑完。
- 用kg_checkpoint_task进入in_progress，传authorization_record_id、executor、最新expected_state_version与expected_context_version。
- 开工后返回execution.id。同轮续接和保存都传execution_id；不能拿另一任务的标识，也不能在同一进行中任务上无凭据另开一轮。
- 换对话续做同一个包：服务只认execution_id，不认对话。新对话用kg_get_task读到execution.id就能续存，不另开一轮，也不用新的授权。
- 包内每做完一步用kg_checkpoint_task存续接点（summary、done、next），不攒到最后；对话到线就存好草稿、续接点和交接，换新对话接着做。
- 一个包只存一版成果：待定项的问答在包内攒齐后再存，不是用户每答一批就存一版、写一条交接。
- kg_save_result另传expected_revision、expected_state_version、expected_context_version、executor及execution_id。prepared、paused、cancelled或待复核任务不能靠保存成果跳过开工。
- 完全相同的合法保存请求可安全重试，返回already_applied和已有导出收据，不重复产生版本或写文件。需要重试未成功导出的文件时使用kg_export_result。
- 新资料或条件明确影响本包时先补读、核对影响，再通过实际refresh_evidence/acknowledge_changes续接。源记录、指标或授权升版后，旧引用不能冒充当前依据；笔记和交接除外，见“变更影响和文件范围”。
- 05/06需要本包实际适用的上游摘要与当前主线，07需要当前表达依据；不能用任意无关章末记录凑齐引用。
- 离开执行中先保存本任务、本包、当前执行者的新handoff，再传handoff_record_id与execution_id更新实际状态。交接files写真实已核文件的项目三区相对路径。包做完默认直接记为completed；段内的包交接给本段下一个包或章末。
- 用户确认成果时另存绑定task_id、revision和item的确认记录；purpose=work_authorization永远不算成果确认。确认由主总控在确认点集中问一次（01.5和02.7；03.8和04.7；05.1连同挑方向；05.9；06.9；08.3）；AI不替用户确认。内容没变的复核重存，原版本上的用户确认继续有效，不用重新确认。
- 条件性范围写入可导出的assumptions并保留result_scope；即使AI检查完成或用户审阅过，也不自动获得下包正式采用资格。输入改变后，仅刷新任务引用不足以重新完成旧成果，须实际复核并保存新版。

## 变更影响和文件范围

condition/decision的结构化content可写affects.task_ids或affects.items，关联本次实际影响范围；旧条目标签如02.5投资、07.1兼容识别。指标表另存新版本也触发旧引用及下游复核。

- 笔记和交接是参考类记录：note（标题不含“主线卡”）和handoff升版、退役都不打回任务、不卡开工，也不影响结案时的引用版本检查。项目运行规则这类笔记可以直接升版。确实要打回时，在content的JSON里写affects.task_ids或affects.items。
- 主线卡新建或升版不自动打回任何任务。做变更判断时，在主线卡content里写affects.task_ids／affects.items，服务只打回写明的任务及其下游。05／06／07的成果保存仍要求mainline_ref等于当前主线卡版本。
- 旧成果确认被同任务或同条目的新确认接替时：还没结案的引用任务自动改引用新确认，不打回；已结案的仍会待复核，续做时kg_checkpoint_task传refresh_evidence=true会自动换成接替的确认，不用再kg_bind_task_context。
- 已确认的上游前提被推翻：不改已被引用的旧记录，另存一条写明“取代”哪条记录哪一项的新condition，affects只列确实要重做的任务或条目；这条condition存成项目级记录，带subproject_id的condition会让该子项目的任务全部待复核。被取代的章末摘要和主线卡留到本段回主线时统一修订、再确认。

项目文件范围按用户当前授权执行。扩大目录或用途才再确认；收到用户为本轮核验明确指定的原件目录后，先列出点名文件，再在该范围连续核读。副本按项目资料、工作文件、成果输出归集，保留原件与旧版本。

项目服务只能检查其收到的开工、写入及状态操作。对话在使用绘图、建模和外部文件工具前同样先做本包检查；不能声称项目服务已能拦截所有外部软件操作。

前期展示例外：W7已有明确的既有依据、input_refs和条件性展示授权时，可保存讨论稿，不为此补造05主线；结果保留条件性标记，不能直接完成正式交付。正式展示仍检查当前主线。
