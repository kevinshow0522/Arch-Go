# KI-design · V0.9.0 · 工作流接入版

2026-10-27按用户授权统一内部规则并接入现有章节：05默认，03/04/06按需。当前规则见[调用约定](references/workflow-contract.md)；原名cui-kai-local-design用于追溯。以工作区V0.7为基础，保留附件V0.6以来的原研究、台账与历史报告。当前研究基线仍是2026-10-10；六册目标著作均无完整正文入库。本包不是本人或团队授权产品。

入口为[SKILL.md](SKILL.md)：按任务选条件、理念与图纸卡，形成适合当前场地的空间判断。局部修改保持已确认范围；新方案按用户讨论/制作要求推进。事实、研究转译、原创决定和用户确认分开。

## 使用与检索

保留 `ki-design` 文件夹名，交由支持Agent Skills的宿主加载。压缩包本身只提供文件；本机安装结果与其他宿主状态分别以部署记录为准，没有训练新模型。

```bash
python scripts/query_skill.py "公共 路径"
python scripts/query_skill.py "气候 定量" --match all --limit 6
python scripts/validate.py
python scripts/validate.py --check-manifest
python -m unittest discover -s scripts -p "test_*.py"
```

Python 3.10+；PDF导入另需PyMuPDF。检索仅覆盖公开方法、理论、读图和案例笔记，返回章节与行号；私有正文使用既有独立检索入口。未命中不等于原书无此内容。

## 维护与资料

- [条件对照](method/条件到空间操作对照.md)：从当前问题选择J/W机制及R候选。
- [证据使用](references/evidence-use.md)：历史阅读、当前回核、引用定位和迁移条件。
- [KI衔接](references/kigaga-integration.md)：现行八章、项目目录与服务边界。
- `references/books/`：书籍身份、取得状态、正文导入说明；取得文件不等于全文核读。
- `references/index/`：来源定位。V0.6合并快照须与理论/图像分项一致。
- `archive/`、`reports/v05*`、`reports/v06*`、`reports/v07*`及旧台账：历史追溯，不代表本版重新验证。
- [任务检验](evals/07_任务边界与证据检验_v08.md)：行为题；实际验收状态在本次审阅报告中单列。

发布完整性检查比较manifest列出的文件与实际文件SHA256；普通维护检查不要求重建manifest。修改后需重新生成发行清单再检查。校验通过只证明它检查的程序与一致性，不证明建筑质量、归属事实或现行法规适用。

公开包不包含私有正文或原始商业书籍。新增资料须核权限、来源与实际阅读范围；外部图纸和照片不因登记URL获得再分发许可。原始资料与历史报告保持原字节，变化见[CHANGELOG](CHANGELOG.md)。
