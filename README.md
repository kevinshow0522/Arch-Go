# KI建筑设计工作流 · Skills 与源码

**当前完整工作流：** [workflow/README.md](workflow/README.md)。包含整合后的 10 个 Skill 包、项目服务、云端只读工作台，以及安装、构建和校验说明。同步版本：方法 1.30、KI-design 0.9.0、UI 0.6 / 视觉 0.6.1（2026-10-27）。

下列根目录 Skill 保留为方法正本；完整安装请使用上述入口，避免同名 Skill 重复安装。`map2model/` 保持独立。

KI建筑设计工作流（方法 1.30）的 skill 正本，以及建筑与城市设计分析图、场地建模相关的 skill。

## 整体框架

| Skill | 说明 |
| --- | --- |
| [ki-archmain](ki-archmain/SKILL.md) | KI建筑设计工作流 1.30：八章与 0/a/b/c 阶段、工作包、该调哪个章节 skill、等级与编号、设计主线卡、交接记录、成果存放 |

## 章节 skill

| Skill | 说明 |
| --- | --- |
| [brief-and-metrics](brief-and-metrics/SKILL.md) | 02 章：使用者与功能、规模与指标口径、规划条件与投资、设计任务书 |
| [site-study](site-study/SKILL.md) | 03 章场地研究：三个圈层、四边界面表、发现卡、03.8 综合判断 |
| [case-study](case-study/SKILL.md) | 04 章案例研究：借鉴问题、检索顺序、案例卡、04.7 借鉴结论 |
| [concept-scheme](concept-scheme/SKILL.md) | 05 章概念方案推演：设计主线卡、多方向、体量推演、比选门槛 |
| [architecture-analysis-diagrams](architecture-analysis-diagrams/SKILL.md) | 建筑单体分析图：B1–B9（候选 B10–B12）模板、日本传统色卡配色、交互规则和出图校核 |
| [urban-design-analysis](urban-design-analysis/SKILL.md) | 城市设计分析图 v1.2：底图、配色风格、符号、模板、SVG 分层、交互展示（07.2）和校核清单 |

## 其他

| Skill | 说明 |
| --- | --- |
| [Map to Model](map2model/SKILL.md) | 地图／影像或 CAD 整理为前期建模底图，支持局部米制坐标、DWG 回读与 SketchUp 封面（v0.9.12） |

## 校验

`SHA256SUMS.txt` 列出方法 1.30 各 skill 文件的哈希（不含 map2model），在仓库根目录运行 `sha256sum -c SHA256SUMS.txt` 核对。

## 使用

把需要的 skill 文件夹放进 `~/.claude/skills/`，或在 claude.ai 的 Skills 设置里上传对应文件夹。
