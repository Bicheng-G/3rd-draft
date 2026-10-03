# 项目指南

用于了解环境、查找命令，以及在实际需要时协作和恢复。产品方向与任务导航见 [文档入口](README.md)；不必为小修改通读本页。

## 项目事实与环境前提

- 3rd Draft 仓库承载面向个人创作者的多项目长期创意工作空间；产品正式命名仍见 [路线图 O-01](product/roadmap.md)。v0.1 是 Windows 本地单人、浏览器界面，项目拥有知识和资产。
- v0.1 文字闭环已通过；当前按用户后续授权实施 V1，英文 UI、批量创意、set/brief、来源/洞察、图片导入/本地模板、Review、Skill 与备份模块已进入集成。完整 V1 未验收，原生生图/编辑控制门槛仍 BLOCKED。历史与当前证据分别见 [v0.1](product/validation-v0.1.md)、[V1](product/validation-v1.md)。没有 CI/公开发布配置。
- 已选 Node.js 22.15.0 + 内置 SQLite 3.49.1（experimental）及零依赖浏览器 ES modules，见 ADR-013。React/Vite/TypeScript 仍为原候选，不是安装前提。
- 产品决定由用户作出；实现由当次受托维护者负责。发布负责人、集成/发布目标及适用授权在相关操作前核实，不能从分支名或历史任务记录推定。
- 开发宿主的工具和并发能力不等于产品 runtime 的能力。使用时检查实际可用工具和限制，不固定模型/profile，不改变用户 root model 或个人 trust 设置。

## 常用只读命令

在仓库根使用 Git 和可用的 ripgrep；没有 rg 时用宿主文件查找工具即可，不强制安装：

```powershell
git status --short --untracked-files=all
git branch --show-current
git rev-parse --verify HEAD
rg --files
rg -n '需要查找的标识或术语' docs
```

`HEAD` 不存在时据实记录，不伪造 revision。检查任务差异用 `git diff` / `git diff --cached`，但它们不显示 untracked 文件，相关新增文件须单独阅读。涉及 worktree/远端操作时再查询 `git worktree list --porcelain`、`git remote -v` 和所需 refs；未刷新远端就不声称最新。

首次 `npm ci` 安装锁定 sharp/fflate，前端无需 build。`npm start` 启动 loopback 服务，`npm test` 运行 Node 测试，`npm run validate:live` 只读检查按历史 v0.1 记录建立的两个合成项目（不调用模型），不是 V1 验收命令。默认数据根为 `%LOCALAPPDATA%\ThirdDraft`；测试用 `.workbench/`（已忽略），真实资产不放仓库。可用 `THIRD_DRAFT_DATA_DIR` / `THIRD_DRAFT_PORT` 配置；`THIRD_DRAFT_CODEX_PATH` 指定 CLI 路径。Codex 固定 `0.159.0-alpha.12.1`；认证须为 ChatGPT，API 登录不接受。普通沙箱进程可能无法读取宿主凭证存储，不能据此推断用户未登录。模板读取 Windows 已安装 Arial/Georgia，缺失即明确失败。完整启动/备份恢复步骤见根 [README](../README.md)。

测试使用 fake runtime 的故障用例不证明真实模型成功；实际 CLI 的 loopback dummy transport 测试不消耗模型额度，CLI 缺失/版本不匹配时单独 SKIP，不能把跳过当隔离验证。真实两轮证据另记。工程场景与 V1 评测未执行部分如实保留 NOT_RUN。

## 操作边界

遵循 [AGENTS](../AGENTS.md) 的授权与数据边界；检查与动作后果相称的证据。小修直接实施和定向验证；高后果权限、隔离、费用、持久化或外部副作用变更，先明确不变量、失败/恢复方式及适用授权。困难或文件多本身不要求增加流程。

Provider 实测前核实路线、授权素材、测试项目、预算和副作用；按 [M0](product/roadmap.md) 与 [Provider 契约](architecture/provider-contract.md) 留下真实证据。部署/数据库操作需核实实际目标和恢复条件，不能仅凭环境名判断安全；代码 rollback 不会自动撤销数据或外部动作。产品未决事项仍在路线图，不另建一套问题队列。

## 仅在需要时协作或恢复

Delegation 是可选的。Root 负责范围、协调、整合和最终 acceptance；只有工作可分离且有实际收益才委派。向 worker 说明目标、授权边界、实际工作位置/基线、必要上下文和验收即可，不要求派发模板、固定 profile 或额外记录。

并行写入前确认互不冲突的 ownership，检查共享契约、schema、fixture、lockfile、测试数据和环境；不同文件不保证独立。共享控制文件由一个明确负责人维护。验收检查实际差异与证据，不以 worker 摘要代替判断。

只有任务确实要跨上下文继续、存在长期协调或需要保留高后果工作证据时，才在现有相关工作文档中保存一段状态：目标与授权、实际 revision/未提交改动、已验证和未验证部分、阻塞与下一步。没有合适文档时可新增一份简短工作记录，不要求 program/slice/handoff 目录或多个状态文件。范围或不变量实质变化时先停止受影响动作并修订边界。

接手时先核实当前 Git，再读该状态及其引用的必要证据；不需要读全部聊天或所有历史报告。未完成任务只要状态准确、下一步清楚即可交接。换 agent/thread 不自动重跑验证；只重验实现、输入、依赖或环境变化使其失效的部分。
