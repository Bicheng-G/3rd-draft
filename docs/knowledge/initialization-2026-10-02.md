# INIT-GOV-20261002：治理初始化证据

**historical / non-authoritative · not required reading。** 本文件是 INIT-GOV-20261002 的历史执行快照，**不代表当前 operational state**，不是冷启动或普通任务的必读材料，也不授予任何执行权限。

## 2026-10-02 精简取代说明

用户随后明确要求按 subtraction review 执行，建立 3rd Draft 的首次长期最小治理基线。以下历史快照中的 registry/schema、registry-driven metadata、knowledge_check.py 及专用测试、固定 model/profile routing、完整 dispatch 字段和独立 change/handoff 流程已被本次精简 supersede；相关文件已移除。其名称、命令、哈希和旧验证结果只作历史证据，不能作为当前规则、工具或验收引用。

现行入口是根 [AGENTS](../../AGENTS.md) 与 [docs/README](../README.md)，环境和按需协作/恢复见 [PROJECT_GUIDE](../PROJECT_GUIDE.md)，工程原则保留原路径。普通任务直接检查、实施、验证；无需登记、program、worker 或治理更新。产品 PRD、ADR 与业务行为未修改。

原 G-01/G-02/G-03 队列不再是现行机制。当时的问题分别是首次 Git 交付范围、M0 素材/路线/预算、发布负责人/目标；只在将来实际操作前依据当次指令和已有适用授权核实，不要求普通任务先关闭这些历史编号。

原 cold-start 将“初始化尚未收口”判 FAIL，是验收 framing 过严：当时已能准确恢复未完成状态及下一步。恢复的正确标准是状态准确、边界和下一步清楚，不要求任务已完成。旧结果保留在下方，不能据此增加现行收口轮次。

本次精简复核：修改 7 个现有文件、删除 8 个、未新增文件；其余 16 个文件逐字节未变。一次性检查 73 个本地文件链接，无断链，现行入口无已删除机制的 mandatory reference。未添加替代 validator 或常驻脚本。已审阅本次差异；旧工具测试随工具退役，不再运行。

本次 cold-start 为**模拟读取，非真实 fresh-session 验证**：仅沿 AGENTS → docs/README 的路径检查三个场景。极小 UI/copy 找到局部设计导航和直接修改路径（当前无 UI，运行 NOT_APPLICABLE）；普通 bug 找到 source/test 的查找方式和 integrity 的 RED→GREEN 原则（当前无产品源码/测试，执行 NOT_RUN）；跨上下文未完成任务按 PROJECT_GUIDE 保存必要状态与下一步，不要求 program 或先完成任务。三个场景的导航与尺度检查通过；未启动 worker，也未运行产品、M0 或发布验证。远端 freshness 本轮未重核。

以下原初始化快照中的“当前”“下一步”“本次”等均指当时，不描述今天的 checkout。最新 Git 状态和活动任务以实际检查为准。

## 范围与最小计划

来源：用户 2026-10-02 的“新项目治理与知识库初始化 Prompt”，特别是末尾“最轻流程”修正；允许本地治理与必要验证、独立只读 cold-start。非目标：业务实现、架构迁移、发布、数据清理、改全局配置、安装插件、Git 远端交付。

按序：发现 → 整合入口与治理 → 本地机械检查 → fresh-context 只读验证 → 最终 diff 与收口。发现为 Explore，文件/工具建设为 Build，cold-start 为 Explore；不触碰 Protect 操作。root 单独写全部文件，冷启动 agent 只读。

## 初始基线与发现

- branch `main`，unborn HEAD；完整 commit SHA、task base、fetched baseline 均 N/A，禁止把 worktree 的全零占位当 SHA。
- 19 个初始文件全部 untracked；无 staged/unstaged tracked diff，无 refs，只有当前 primary worktree。`.git` 未发现 rebase/merge/cherry-pick 或 lock 标记；未同步/切换/清理。
- 当时 origin 为 `https://github.com/Bicheng-G/3rd-draft.git`，初次连接失败，显式 URL 重试 exit 0/无 refs，没有可比较的集成关系；本机 Python 3.12.5、Node v22.15.0。显式检查祖先/仓库指令，只有根 AGENTS 有内容，个人 Codex AGENTS 为空，未发现仓库深层 override 或个人 fallback 配置。均为历史探测，不保证以后宿主、环境或远端不变。
- 修改前保存 19 份内容与 SHA-256 至 Git 忽略的 `.workbench/governance-init/before.json`，仅用于保护初始成果与本轮差异比对。此本地副本不是恢复新 agent 的必读材料，也不加入 Git。
- 没有产品代码、测试/CI/部署，原文中的 SQLite、Node、状态机、T 场景都是设计/计划。不存在可填写的真实实现图、schema 或 UI tokens。

| 已有结构 / 差异 | 本次处理 |
|---|---|
| docs/README + 产品/架构/研究/模板已完整成形 | 保留路径、正文与 U/FR/AC/ADR/M/B/O/T ID；不另建 ARCHITECTURE、DESIGN 或产品领域树 |
| ADR 的 accepted baseline 与用户批准容易混淆 | 保留 ADR 原文，在 metadata 明确局部批准和证据边界；索引不提升权威 |
| docs/README 原“先修正文档再实现”可能被误读为工程自行决定冲突 | 改为保留双方证据、适用 owner 决定、successor/annotation |
| 开发 agent 与未来应用 agent 没有独立工作路由 | 根 AGENTS 增加触发器；协作文件只作用开发，不改变 PRD 并发/角色 |
| 缺少 artifact 元数据和链接/覆盖检查 | 一个 registry + schema + 标准库报告工具，避免 owner 表、domain registry 重复维护 |
| 原始附件不在仓库，外部核查有日期 | 本轮仅引用整理材料；未复核原始对话和外部能力，不刷新它们的证据日期 |
| 无活动业务 program 或 Git grant | 记录 G 队列；仅本初始化一份状态，完成后转历史；不创建空 exec-plans 体系 |

## 当时结束状态（历史快照）

已完成本地初始化、工具验证、cold-start 增量确认与最终 task diff 审阅；此任务转为 execution-history / historical，无活动业务 program。root owns：原 `AGENTS.md`、`README.md`、`docs/README.md` 的治理整合；新增 `docs/PROJECT_GUIDE.md`、`docs/knowledge/`、`tools/`，共 15 个 task-owned 路径。其余原始 16 个文件已比对 SHA-256，逐字节保持不变。

当前 Git 仍是 unborn `main`；HEAD/task base N/A，31 个文件 untracked，无 staged/已提交成果。未 commit/push/PR/merge，未改其他 worktree、全局配置或安装依赖。没有 runtime probes。忽略目录中的 before.json/impact.json 只是本轮检查副本，不是必须带到下次会话的隐藏状态。

本任务无剩余执行动作，不启动 M0。后续新任务可按知识路由直接工作；首次 Git 交付/M0/发布分别先处理 G-01/G-02/G-03。恢复时查询实时 Git；本状态是本轮结束时的证据，不是永久 checkout 声明。

## 验收记录

证据环境：Windows 本地 checkout、Python 3.12.5，未提交 candidate（无 commit SHA）。以下结果只支持本治理工具和导航范围。

已测试文件 SHA-256（非自引用 commit）：`tools/knowledge_check.py` = `8feb294c2a53498c29e4f0ae6820a689a0983acf7425e3ce5d95e8642b7a8f9b`；`tools/test_knowledge_check.py` = `db654d25903d167cee4fa3f1e55ef2adde93aa3c5831373e76de5e5e7b30ee6b`。后续工具改变时按受影响 claim 重验。

| 实际检查 | 结果 / 限制 |
|---|---|
| registry/schema、本地链接、覆盖与元数据 lint | PASS：31 artifacts，0 findings；不查远端链接和 heading anchors，不证明业务语义 |
| 正反例测试 | PASS：11 个；含有效链接、坏链接、reference link、header 冲突、非法 owner/重复 ID、越界/不存在 evidence、audit 冒充政策、未登记文件/impact、缺字段/不支持 schema、中文路径及新 source subtree |
| 中文路径故障 | 诊断输出首先出现 Windows cp1252 编码失败；新增 CLI 回归在修复前真实 RED（返回 2 而非 finding 的 1），stdout/stderr 显式 UTF-8 后同测试 GREEN |
| 新 source 覆盖 | 独立审查发现旧 lint 只扫描 docs/tools；新增 `src/entry.py` 反例真实 RED。改用 Git tracked + untracked 非忽略文件名枚举后 GREEN；无 Git 夹具走显式目录扫描 |
| 实际 task paths impact | PASS：由修改前内容/哈希与现有 untracked 清单比较得到 15 路径，再传 `--paths`；无 uncovered。显式不存在路径返回 1，缺 `--paths` 返回 2 |
| 最终差异 / preservation | 已审阅 3 个原文件的前后差异及 12 个新增文件；16 个其他初始文件哈希不变；尾部空白检查无 finding。Git diff --check 亦通过，但 untracked 的验收依靠实际文件审阅 |
| 产品 source/tests、M0、CI、部署、provider 能力 | NOT_RUN / 尚无产品实现；没有把治理测试提升为应用验收 |

### Fresh-context cold-start

使用 `collaboration.spawn_agent`，`fork_turns="none"`，仅提供仓库路径、入口与场景任务，未传会话历史或预期答案。profile scout；requested `gpt-6-luna` / `medium`；理由是有界只读导航，root 保留写入/整合。实际 observed model/effort/token UNKNOWN，工具没有此遥测；并发本次最多 root + 1，不改变用户 root 设置。

| 场景 | 首轮实际答案 / 路径 |
|---|---|
| 小界面文案 | PASS 导航，真实 UI NOT_APPLICABLE：index → workflows-and-ux / PRD；无源码/tokens，不制造大 program |
| 代码/产品冲突、额度不足转 API | PASS：PRD、ADR-002、metadata；不得静默转 API；新产品规则由 Product 决定 |
| 接手初始化 | reviewer 首轮标 FAIL（记录未收口），但正确找到了基线、授权、当前进行中状态与下一动作，未误称已完成。现在补齐真实验证和剩余动作；增量确认见下 |
| 并行文档与 registry | PASS：collaboration；root 单写控制文件，disjoint ownership 仍需查共享资源；开发 4 slots 与产品 2/1 限制区分 |
| staging/production | PASS 边界：PROJECT_GUIDE G-01/G-03；无目标/Release owner/grant，不从 Protect 得授权 |
| 路径改动/证据不足 | PASS：change-and-handoff、metadata、collaboration；明确 diff basis、review 不等于必须改文档；先诊断 A/B/C 等缺口 |

Reviewer 另行执行 lint（31/0）和三个路径 impact，读到了 unborn main、无 refs、全 untracked；没有重新查询远端，不将其视为新的远端 freshness 证据。没有实际产品 bug、特殊 subtree、生产环境，因此未为这些场景搭建临时业务实现。cold-start 只证明本次工具下的仓库恢复，不证明其他 host 自动 discovery/截断/fallback。

同一只读 reviewer 的增量确认：source 覆盖修复 PASS，状态恢复 PASS；明确 Git-ignore 和无 Git 扫描的覆盖限制，未发现新实质风险。首轮 5 项 PASS、1 项因尚未收口标 FAIL 的结果保留；补齐证据后的恢复场景 PASS，因此六个所选导航/边界场景均获得适用证据。没有重跑已成立的五项或整个 suite。reviewer 不参与写入；root 核对工具差异、证据和最终状态后接受。

## Docs impact 与后续边界

`updated`：治理入口、元数据/路由、工程原则、dispatch/recovery 和本地命令。`reviewed-no-update-needed`：产品行为、领域契约、技术选型、应用 agent 并发均未变化，PRD、ADR、roadmap 和外部核查正文保持不变。既有 U/FR/AC/ADR/M/B/O/T 引用保留；未重新验证外部 claims，不把日期刷新作证据。

未关闭的 owner 问题只有原 roadmap O 队列与 PROJECT_GUIDE G 队列；当前无 accepted risk。Git 首次交付范围、M0 资产/预算和发布 owner/目标分别在真正执行前决定，不阻塞本地治理完成。工具为报告式，不是 CI/release gate。没有强制日常任务使用 program、子 agent 或完整知识加载。
