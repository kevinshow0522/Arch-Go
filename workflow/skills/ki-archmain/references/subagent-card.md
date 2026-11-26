# 子代理操作卡

做一个工作包的子代理只读三样：简报、这一页、章节 skill 里本包那一节（01、07、08 的包读主方法第 8、11、12 节）。不读主方法全文，也不读 work-package-execution.md、project-service.md 全文。没有项目服务工具时，同样的内容写成文件，放哪里看简报。

## 六步

| 步 | 调什么 | 带什么 |
| --- | --- | --- |
| 1 开工 | kg_get_context，再 kg_checkpoint_task | kg_get_context 传 project_id、task_id。kg_checkpoint_task 传 request_id（每次新的 UUID）、task_id、status="in_progress"、authorization_record_id（简报给的开工授权）、executor、expected_state_version、expected_context_version、checkpoint。记下返回的 execution.id |
| 2 存续接点 | kg_checkpoint_task | 每做完一步存一次：status="in_progress"、execution_id、最新的两个版本号、checkpoint |
| 3 存成果 | kg_save_result | task_id、expected_revision、expected_state_version、expected_context_version、executor、execution_id、result（title、narrative、facts、assumptions、questions、actions）。05、06、07 的成果加 mainline_ref（当前主线卡版本）；05、06 另加 upstream_record_ids（完整记录编号）。一个包只存一版 |
| 4 写交接 | kg_save_record | request_id、project_id、kind="handoff"、title、status="active"、content 用下面的模板 |
| 5 结案 | kg_checkpoint_task | status="completed"、execution_id、handoff_record_id、checkpoint；checks 里写验收清单逐条结果和对齐检查三行 |
| 6 交回 | — | 不超过约 15 行：结论、成果版本、记录编号、验收清单逐条（有 / 没有 / 在哪）、对齐检查三行、待用户决定的事 |

版本号（state_version、context_version、revision）每次用上一次调用返回的最新值。checkpoint 有五项：summary、done、next、blockers、checks；done、blockers、checks 是字符串数组，最多 20 条，每条 500 字以内。

## 交接模板（content 的 JSON）

```json
{
  "from": "claude",
  "to": "any",
  "to_role": "场地与案例段总控",
  "work_package": "W3.2",
  "task_ids": ["本任务的完整编号"],
  "execution_id": "本轮的 execution.id",
  "done": "一个字符串：做完了什么，本包产生的编号范围",
  "next": "下一包或下一步；要正式出图的列在这里",
  "waiting_on_user": ["待定与待核：问谁、影响哪条"],
  "files": ["成果输出/...", "工作文件/..."],
  "mainline_ref": "主线卡 v0.3；指标表 v2",
  "method_version": "1.30",
  "created_at": "ISO 时间"
}
```

from 只能写 claude、gpt、user，并且和任务的执行者一致；to 写执行者名或 any，角色写在 to_role；done 是一个字符串，不是数组；task_ids 写完整编号；files 只写“项目资料/”“工作文件/”“成果输出/”开头的相对路径。每次停手要一条新的交接。

## 常见报错

- “任务或项目上下文版本已变化”：报错里带当前任务版本和项目版本。并行的包写库也会让项目版本加一；核对与本包无关后用报错里的版本重试，有关才重读合并。
- 漏列上游章末引用：报错会列出缺哪几条，照它补进 upstream_record_ids，写完整编号。
- kg_get_context 返回 ready=false：按 required_reads 补读；这时 execution_readiness 的 false 只表示没读全，开工检查结果看 task_readiness。
- 上游引用版本变了、成果不用改：成果原样重存，说明写在 review_note 里（最多 1000 字），标题和正文不加“复核重存”之类的字。
- 交接被拒：多半是 to 写了角色名、done 写成了数组、task_ids 不是完整编号、files 不是三区内的相对路径。
- 记录超长：主线卡和指标表上限 40000 字，其他记录 12000 字；读长记录按 next_offset 翻页。

## 不做什么

不问用户确认，不改主线卡，不做简报以外的事。遇到要用户抉择方向的事：存好续接点，交回段总控。实际做法和方法不一样：记进“偏离记录”并告诉段总控。不用条件性开工（draft_only）绕过确认。
