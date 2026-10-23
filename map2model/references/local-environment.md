# Map to Model 本机环境配置

本文件用于安装时核对运行环境。请在本机安装副本中记录实际软件路径；个人用户名、绝对路径与项目数据不随技能分发。

## 执行环境

- 使用独立 Python 3.12 或兼容版本，按 `requirements.txt` 安装依赖，不假定 PATH 已配置。
- 需要 DWG 时，核对实际 CAD 转换器路径及版本；需要 SKP 时，核对 SketchUp 可执行文件、原生 SDK 或可用导入接口。
- 在本机安装副本中填写以上路径。临时文件写入本次任务目录下的 `work/tmp`，必要时仅对本次进程设置 TEMP/TMP。
- 原生文件必须实际保存并重开核对；安装完成、历史测试和小样成功不能代替具体任务的检查。

## 依赖与验证

Python 依赖以 `requirements.txt` 为准，主要包括 ezdxf、NumPy、Pillow、Shapely 和 pyproj。安装后执行依赖检查与适用自动测试；在任务中分别记录地图获取、坐标转换、CAD 几何、DWG/SKP 回读和桌面操作的实际结果，未执行项如实保留。

## 来源与版本

- 显示名称：Map to Model
- 调用标识：`map2model`
- 当前版本：0.9.12
- 上游来源：https://github.com/RuiqiWang-LGD/Map2Model
- 本地增量基于提交 `04915a446eede26dca46014e726c8d19a561c074`；本地版本号不代表已发布至上游。
