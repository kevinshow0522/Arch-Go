# SketchUp 建模安装与本机适配

原发行包构建为 **0.5.39**。原 Skill 与 MCP 的基线信息保留在各自 `BUILD.json`，原发行范围见 `RELEASE.md`。本机 Skill 的方法和显示文字已单独适配，范围及文件哈希见 `LOCAL-ADAPTATION.json`；不能再把方法文件相同或旧 source_digest 当作本机修改后的完整校验。MCP/RBZ 仍需核对其各自实际构建，方法适配不升级程序能力。

1. 准备 Windows、Node.js 18+、Python 3.10+；Python 依赖见 MCP 包内 `requirements.txt`。
2. 将 MCP 解压到稳定目录。宿主以 `node` 启动该目录 `launch.cjs` 的绝对路径，传输使用 stdio。
3. 将 `professional-sketchup-modeling` 放入当前宿主 Skill 目录，并启用这份 Skill 与 MCP；MCP 也自带同构建运行支持。
4. 保存当前文档，再在目标 SketchUp 的扩展管理器安装 MCP 内 `mcp/sketchup-mcp/plugin/su_mcp.rbz`，重启目标实例。只加载这份桥接插件。
5. 首次调用 `sketchup_runtime(action=bind_shortcut, shortcut_path=<用户指定的 exe 或 lnk 绝对路径>, user_provided=true)` 绑定程序，再调用 `startup`。按返回动作启动或选择实例；多实例时用 `instances/select_instance`。
6. 用 `sketchup_ping`、`sketchup_get_model_summary` 核对真实版本和文档。本机令牌首次运行生成，不从其他机器复制。

TOML 宿主需要登记时可先检查：

```text
python <Skill目录>/scripts/install_managed_mcp.py --entry <MCP目录>/launch.cjs --config <宿主配置绝对路径> --check
```

用相同参数改为 `--install` 后登记；它会备份目标配置。MCP 独立包内的 Skill 目录为 `runtime-support/professional-sketchup-modeling`。配置变更后让宿主重新加载，并在新会话核对工具可见性。非 TOML 宿主使用其资产管理入口。

可选变量：`PIPCLAW_SKILL_ROOT`、`PIPCLAW_BUNDLED_REF_ROOT`、`SKETCHUP_PYTHON`、`SKETCHUP_BRIDGE_DIR`、`SKETCHUP_BRIDGE_TOKEN_FILE`、`SKETCHUP_BRIDGE_MODE`（默认 file）。显式指定桥目录或令牌时，SU 与 MCP 两端一致。

RBZ 与 MCP 按原构建配套；本机 Skill 方法适配单独记录。实际执行前按[运行兼容性](references/runtime-compatibility.md)核对工具策略与目标 SU，安装成功、工具可见、SU 连通和建模质量分别判断。原发行说明中的 SU2019 试件记录不代表本机当前会话、其他版本或第二台机器已经验证；以实际能力返回与现场检查为准。升级保留用户模型、项目和自建经验包。
