# v0.1 Walking Skeleton — 关闭标准与验证记录

**结果：PASS — v0.1 Walking Skeleton 关闭。** 2026-10-02（Asia/Singapore），root 按实施前固定的六项标准完成中文浏览器真实两轮创作、进程重启、只读证据核对与边界/故障测试；独立 worker 复核通过。20 项工程测试通过、0 失败、0 跳过；实际订阅创作 2/2 成功。结论只覆盖合成项目的文字记忆闭环，不等于用户已采用作品或完整 V1 通过。记录完成后停止，不继续 V1。

## 范围与基线

授权来源是本轮用户要求：将 Third Draft 从实际仓库推进到首个已验证产品里程碑；v0.1 只证明跨次创作记忆闭环，V1 完整产品不得在本次继续实施。产品依据为 [PRD 当前范围](prd-v0.1.md#当前-v01跨次创作记忆闭环)、[产品边界](vision-and-scope.md)、[ADR-013](../architecture/decisions.md#adr-013--walking-skeleton-以跨次文本创作证明项目记忆闭环)及[本次评测协议](evaluation.md#当前-v01-的证明对象)。旧 FR/AC/T 定义保留，以下只验证适用部分。

开始时工作目录为 `C:\Users\zhuzh\dev\3rd-draft`，分支 `main` 尚无 HEAD；既有文档全部 untracked，无 staged/unstaged 已跟踪差异。实现前没有产品源码。结束时仍是 unborn `main`，没有 HEAD、staged 内容或已跟踪 diff；没有 commit/push。新增实现位于 src/public/capabilities/tests/tools 与 package.json；只修改任务相关文档和 ignore。15 个实现/测试文件的 SHA-256 清单位于 `.workbench/v01-source-manifest.json`，该清单文件哈希为 `d71d02cdaa2aa859e1447f97001892d72d00ae30a75bdc101a13247aecf0ba16`，用于标识未提交源码。

测试仅使用明确标记的合成项目，不将真实资产、运行时会话、用户数据或凭证加入 Git。运行材料与原始证据留在本地私有数据目录；本记录只存脱敏观察、命令、版本、哈希及可定位的证据引用。

## 关闭标准

以下标准在真实创作前固定；任何实质调整须说明原因，不能看过结果后降低门槛。

| 项 | 必须证明的行为 | 对应原要求（部分） | 当前结果与证据 |
|---|---|---|---|
| 1. 浏览器可用链路 | 在中文浏览器界面创建/切换两个隔离项目，录入知识、明确确认品牌事实，提交文本创作，查看任务与已归档作品；无需编辑数据库或手工拼装 runtime 返回来走完链路 | FR-01/02/11/13/14；T-13/18；NFR-06 | PASS：Chrome 中创建/切换两个项目、确认事实、预览、创作、收藏、反馈和续作；API 仅做验收只读核对 |
| 2. 实际执行与血缘 | 至少两次创作经应用调用实际 Codex 原生 ChatGPT 文本路线；每次有不可变输入/context manifest、能力内容哈希、尝试/路线记录、结构化结果验证、可读文字文件和输出哈希；作品归档后才记成功 | FR-06/11/13/14；NFR-03/05/08 | PASS：2/2 原生任务归档；记录 context/能力哈希、route、attempt、usage；下载文件哈希匹配 |
| 3. 跨次影响 | 第一次作品与显式有范围反馈经应用保存；停止并重新启动本地服务后，第二次 brief 不重述反馈且使用新 runtime 会话。manifest 选入相关前作/反馈并说明理由，实际文字体现具体的创意改变；第一版作品/哈希保留 | FR-15/19/20；T-31/34 的跨次复用部分 | PASS：真实服务进程重启，新 session；coffee/lid 改为 page/bookmark，使用存储反馈的短语及问题 |
| 4. 记忆语义与相关性 | 已确认品牌约束优先；未确认模型输出不自动变品牌事实。选择少量相关历史而非全量历史，排除无关材料并可解释；反馈只在明确范围内生效，不能因采用/收藏推导效果或品牌规则 | FR-02/15/20；T-23/32/34 的适用部分 | PASS：第二轮选入 4 条（确认事实、参考、前稿、反馈），排除原草稿及 orchid 资料；新任务不带旧稿范围反馈 |
| 5. 隔离与路线 | 跨项目知识/作品/反馈/context ID 请求被拒绝，第二次 context/输出无项目 B 识别信息；无跨项目 runtime 会话复用或运行时任意宿主访问；本地 Host/Origin/会话边界可验证；路线不静默转为 API，用量未知如实显示 | FR-01/13；NFR-01/02/04/05/08；T-01/02/17/25/27/35 的适用部分 | PASS：跨项目引用/导出 404；Host/Origin/CSRF 负例通过；真实 CLI 本地请求无工具/宿主 skills；原生订阅无 API fallback |
| 6. 失败与恢复 | 无效输出、引用或归档失败不能成为成功作品；中断/重启时已成功任务不再调用 runtime，提交后结果无法确认则持久化 `result_unknown` 且不自动重试；旧作品与引用仍可查 | FR-14；NFR-03/05；ADR-008 | PASS：无效引用、磁盘故障、事务 rollback、重启和 result_unknown 不重试测试；第二轮关闭浏览器后继续完成 |

关闭需六项全部有证据且无未修复的阻断问题。某个自动化测试使用 fake runtime 时须明确标记，不能充当第 2/3 项实际模型证据。通过不等于全部 AC/T 场景通过，也不等于用户已批准作品或产品全面发布。

## 切片、依赖与责任

| 切片 | 责任 | 依赖与交付 |
|---|---|---|
| 范围与共享接口 | root；文档 worker 同步本页与相关产品/ADR 文件 | 先检查实际仓库及原文，固定上述关闭标准与 route/domain/UI 接口 |
| 原生文本 runtime | runtime worker；root 复核实际环境与授权 | 验证认证和 tool-free 边界；实现一次有界调用、结构化结果与可解释错误；不静默回退 |
| 本地服务、项目记忆与归档 | root | 实现 project scope、版本/反馈、相关 context、持久 attempt 和原子归档；提供 UI/adapter 合同 |
| 浏览器体验 | UI worker | 基于已定 HTTP 合同开发；项目、知识确认、创作、作品/反馈/血缘可在界面操作 |
| 集成与关闭 | root，必要时独立 worker 审阅 | 适当自动化验证 → 浏览器真实两次创作及重启 → 修必要缺陷 → 完整证据与限制 → 停止 |

共享 schema、命令、依赖与接口由 root 协调；worker 文件 ownership 不代表可自行改变产品契约。这里只记录实际实施顺序与证据，不增加独立治理系统。

## 环境与测试范围

| 项目 | 记录 |
|---|---|
| 实际测试日期/时间与 Windows 版本 | 2026-10-02，真实任务 20:44–20:48 SGT；Windows `10.0.26200` x64（Node os.release 实测；CIM 查询被宿主拒绝，未推断 edition） |
| 应用 revision 或未提交源码标识 | 无 HEAD；上述 15 文件清单哈希，文件均未 stage/commit |
| Node / SQLite | Node 22.15.0，内置 SQLite 3.49.1；`node:sqlite` experimental。无 npm 应用依赖 |
| Codex / adapter / 能力版本及哈希 | Codex 0.159.0-alpha.12.1；adapter `src/runtime.mjs` 受源码清单锁定；creative-draft v1，哈希见下表 |
| 认证 / 计费路线 | ChatGPT 原生认证，codex-native/subscription。显式调用已知 app 内 codex.exe；API key、代理和 provider URL 环境变量不进入子进程 |
| 允许调用与副作用 | 本地合成项目；最小真实成功样本为两次文本创作；无图片/研究/客户外部动作。所有实际尝试包括失败均须记录 |
| 用量及控制粒度 | 每次一个 task；HTTP/stream retries=0，180s 上限，全局单任务。两次有 token 统计；模型身份、剩余额度和美元成本 unknown |
| 私有数据目录与脱敏证据位置 | `.workbench/v01-acceptance/`、`.workbench/v01-before-restart.json`、`.workbench/v01-acceptance-report.json`；截图 `output/playwright/`，浏览器 snapshots `.playwright-cli/`；全部 git ignored |

## 运行记录（包括失败）

验收命令：指定 `THIRD_DRAFT_CODEX_PATH` 为已核实的 app 内 CLI，然后执行 `npm test`；真实创作由 Playwright CLI 操作中文 UI；`npm run validate:live` 通过 HTTP 只读检查现有结果，不再次调用模型。原始报告只留在已忽略目录。

| 运行 | 类型与输入 | 观察与证据 | 结果 |
|---|---|---|---|
| 工程边界测试 | 10 项 domain、1 项 HTTP、9 项 runtime | 最终 `npm test`：20 PASS、0 FAIL、0 SKIP；故障使用 fake runtime，2 项传输负例使用真实 CLI + loopback dummy 凭证，未访问 provider | PASS |
| 浏览器第一轮创作 | 合成 A：确认品牌约束、相关 commute 观察、无关 orchid 资料；合成 B 独立品牌 marker | 创建、输入、确认、预览、生成全由 UI 完成；20:44:23.643 → 20:44:37.307 SGT，13.664s；归档 One Last Sip | PASS |
| 保存反馈并重启 | 收藏第一稿，反馈默认 concept scope；先经 API 保存只读 checkpoint | 终止第一服务进程并重启同一数据目录；第一稿、全部知识/反馈及整个首轮 run/context 经独立 deepStrictEqual 核对保持不变 | PASS |
| 浏览器第二轮创作 | 从第一稿继续，仅输入下述新目标；新的服务实例及 runtime session | 20:48:01.617 → 20:48:18.678 SGT，17.061s；20:48:03 左右关闭浏览器，服务继续归档 One More Page；重开可读 | PASS |
| 项目 B 与请求负例 | 从 B 引用 A 的创意、文件；独立新任务 context | 404；新任务未带上旧稿专属反馈；第二轮 context 和输出无 B marker；原草稿与无关资料各有遗漏理由 | PASS |
| 最终浏览器检查 | Chrome 1280×720、390×844 | 截图检查；窄视口 documentWidth=390；重开后 console 0 errors/0 warnings | PASS |
| 独立 acceptance 复核 | 已忽略报告、重启前 checkpoint、源码与固定标准 | 确认语义改变、所有旧内容完全一致、文件 576/616 bytes、哈希与引用；无剩余阻断问题；未另调模型 | PASS |

所有真实 provider 尝试分母为 2，无隐藏重抽、修复生成或 API 调用。以下失败发生在前置检查/工程测试，保留其区别：

- 普通沙箱 `login status` 曾误报未登录；同一明确 CLI 在获准宿主进程检查为 ChatGPT，实际调用证明可用。没有改写凭证或个人配置。
- CLI 初版隔离试验暴露 shell 开关不足以禁止 apply_patch、全局 AGENTS 与 Skill 元数据仍可能注入。最终使用无工具 catalog、逐路径禁用技能；非空/链接全局 AGENTS 直接拒绝。真实 CLI canary/HTTP503/断流测试通过；原文件未修改。
- runtime 测试新增 canary 时一度把局部变量未初始化吞成 SKIP；修复后 narrowed catch，只对 CLI 不存在/版本不匹配跳过。最终安装版测试全部实际执行，无跳过。
- 独立代码评审复现归档事务 rollback 丢失恢复载荷、分块 UTF-8 损坏中文；root 对同一回归观察 RED 后修复为 GREEN。首轮测试清理钩子顺序导致 Windows EBUSY，也已修正。旧失败不计为最终通过。
- 初始端口 4317 被 Windows 拒绝，改为实测可用的默认 4057；没有改防火墙。连接式 IAB 不可用、Chrome connector 阻止本地页；独立 Playwright headless Chrome 正常打开并完成验收。早期 favicon 404 已处理，最终 console 为零错误。
- npm 缓存/联网及 Playwright daemon 目录的沙箱限制通过工具批准的局部执行解决；应用没有增加依赖或改变用户安全配置。

### 输入、产物与能力指纹

| 记录 | SHA-256 / 实测值 |
|---|---|
| 第一轮 ContextManifest | `f59472f98c82c2b8cef6d1be365500ab6c43c2c338b21708c254a14e4a5b1e69` |
| 第二轮 ContextManifest | `cbf2b279abff421fbd56c21b5f2b62e837aabeb6a3913acc700587a695b621bc` |
| creative-draft v1 | `d122b0bed9d2a7a684ee8e910a5f10b073aca4cb79b1b8eaae0af81c1c82ac83` |
| 两轮实际 runtime 配置（含禁用 Skill 路径的哈希） | `5279dc4b81a2aa70012f57f5dd0497ef1efdf6448522afc47e032e5102129990` |
| 工具清除后的 runtime catalog | `f790656bf7274282b7c7a79b7f4b48bb9a8c336c28545880a4641a093d8f8cfb` |
| 第一稿 Markdown，576 bytes；重启及续作后相同 | `d217fb615d33446aab5e1ec27095bd3398bdb7064878fc398dd5b7d5234adba4` |
| 第二稿 Markdown，616 bytes | `688abbbc97b3db76d38ae737a3a89d87cf7fb73d7823643ed9dfcc49af7f43dc` |
| 第一轮实际 usage | input 5287 / output 226 tokens；provider 报告 cached/write/reasoning 均 0 |
| 第二轮实际 usage | input 5696 / output 314 tokens；provider 报告 cached/write/reasoning 均 0 |

token 数是 runtime 返回字段；不能据此编造美元成本或剩余额度。实际模型身份未由事件返回，保留 unknown；没有把 bundled catalog 的默认候选冒充实际模型。运行/session ID 留在本地原始报告，不复制进 Git。

### 外部能力核查边界（2026-10-02）

开发参考 [官方配置表](https://learn.chatgpt.com/docs/config-file/config-reference) 的 `model_catalog_json`、`skills.config`、认证与 provider 配置；[官方 provider 源码](https://raw.githubusercontent.com/openai/codex/main/codex-rs/model-provider-info/src/lib.rs)解释原生认证、订阅 backend 和 retries；[官方工具配置源码](https://raw.githubusercontent.com/openai/codex/main/codex-rs/core/src/tools/spec_plan.rs)及[模型能力类型](https://raw.githubusercontent.com/openai/codex/main/codex-rs/protocol/src/openai_models.rs)辅助确定无工具配置；[全局指令加载源码](https://raw.githubusercontent.com/openai/codex/main/codex-rs/codex-home/src/instructions/mod.rs)辅助确认全局 AGENTS 限制。这些 `main` URL 是可变资料，不声称对应已安装 binary commit。验收结论以 0.159.0-alpha.12.1 的本地请求捕获与两次实际调用为准，不外推到其他 CLI/认证路线。

## 跨次创作观察

第一稿 One Last Sip 用 coffee/lid 的短句节奏介绍服务。随后通过 UI 保存仅作用于该版本及续作的反馈：改成乘车前阅读仪式，包含 “a pocket of quiet”，以关于读者会带哪本书的开放问题结尾，保留已确认服务描述且不增添利益承诺。

服务重启后，第二次 brief **仅为** `Develop another short social caption for this project.`，没有粘贴反馈、品牌资料或前稿内容。manifest 自动选入确认品牌版本、相关观察、被选中的第一稿以及该反馈；排除原始未确认草稿和 Orchid care。新稿 One More Page 实际以 “One more page. Bookmark in.” 起头，包含指定短语，末句为 “What book would you bring along?”；服务描述保持原文，无新增价钱/速度/环保承诺。

这证明有范围的前次判断经持久存储和相关上下文影响了下一次作品本身，而不只是 prompt 含有引用 ID。独立审核检查了实际文案及重启前后深度相等；未用模型自评代替判断。两次合成样本不能证明一般质量提升、长期使用收益或营销效果。

## 限制与 V1 后续

本次不证明图片生成/编辑、自动研究、完整 Paid/Organic 或收藏/洞察工作流、第三方 Skill 生态、完整备份迁移、12 个 brief 的视觉/操作时间对照、长期质量提升、营销效果、生产规模或其他 Windows/CLI 组合。原要求保留在 [PRD](prd-v0.1.md)、[路线图](roadmap.md)与[评测](evaluation.md)。

源码许可证与公开分发仍按 O-02 另行决定；本地验收不自动授权发布、收费 API 或客户外部动作。最终总结应明确实际证明及剩余限制；v0.1 关闭后停止，不在本次继续 V1。

当前 runtime 的额外限制：仅验证这一个 Windows/CLI 组合；全局 AGENTS 必须为空或不存在，非空时拒绝运行；存在不能安全枚举的链接 Skill 目录/超长配置时也拒绝。当前宿主满足前提，应用没有删改任何个人规则。检索为有界关键词匹配，不是语义搜索；最多 12 条当前品牌约束、5 条参考、2 条相关历史、6 条适用反馈。品牌版本修订 API 已有，但 UI 只提供新增/确认；更完整的知识编辑、归档与恢复仍留后续。人工评审和用户最终采用没有被自动化替代。
