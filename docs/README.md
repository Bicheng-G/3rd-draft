# 产品知识库

当前状态：RidePass 实际项目 v0.1 最终 dogfood **PASS WITH NON-BLOCKING LIMITATIONS**；六项记忆闭环关闭标准通过，完整 V1 未验收，本轮停止实施 · 2026-10-05 · Asia/Singapore。维护责任：产品负责人维护范围与验收，架构负责人维护技术决策；root 负责本次集成与验收。

最新任务已收敛为 v0.1 最终验收：在真实 RidePass 项目中保存图片创作判断，服务重启后由独立新任务自动检索，影响新文案、视觉方向及归档图片；新增真实 2 次文字 + 2 次图片均成功，132 项回归通过，无产品代码修复。证据/六项映射与非阻断限制见 [v0.1 最终验收](product/validation-v0.1.md#ridepass-最终-dogfood2026-10-05)。本次没有关闭完整 V1 质量/采用/发布门槛，历史原生制作证据继续复用。

此前原生制作里程碑（2026-10-05）：暂停外围 V1 扩展，完成领域语义修正、应用独立 Codex profile 和最小原生图片闭环。实际二进制的有界行为探针替代全局空指令要求和单一版本等值门禁；文字与图片分别验证。ADR-017 将个人原生 Skill 抑制改为 best effort，保留项目数据、计费、批准和调用预算的硬边界。当前图片路线由应用在本地 Responses 中构造唯一原生图片调用，只使用应用暂存的项目图片，并通过固定订阅端点和持久化最多 2 次操作控制；不声称通用 OS 沙箱隔离。独立 ChatGPT profile 的真实 Generate 和一次指令 Edit 均成功，旧版保留、文件校验和新版本归档已通过，最小切片为 FEASIBLE，其证据由上述 dogfood 复用。完整 V1 尚未验收，FR-17/18 仍为 P1；准确身份、限制和历史失败见 [V1 验证记录](product/validation-v1.md)，历史与最终记忆验收见 [v0.1 验证记录](product/validation-v0.1.md)，启动/测试见 [项目指南](PROJECT_GUIDE.md)。

这是供后续开发和产品讨论使用的持久知识。没有标记为已实现的功能均为设计要求；没有附运行记录的能力均未在本产品验证。

这里同时是产品知识和日常任务导航的唯一入口。按任务选择相关原文即可；下表状态描述证据性质，不表示整份文档已获用户逐条批准。环境与命令见 [项目指南](PROJECT_GUIDE.md)。

## 按任务阅读

| 当前任务 | 读取路径与执行尺度 |
|---|---|
| 极小 UI / copy 修改 | [流程与交互](product/workflows-and-ux.md) 及相关 PRD 条目；当前英文工作台源码在 public/，直接修改局部并适当验证；不为小改动建立大型计划 |
| 普通可测 bug | 找实际 source/test/运行说明，读 [实现完整性](knowledge/engineering/implementation-integrity.md)，复现后修根因并验证；缺源码/环境明确 NOT_RUN，不用文档场景冒充测试 |
| 非平凡设计/重构或增加概念与规则 | [工程优雅](knowledge/engineering/engineering-elegance.md) 及受影响契约；只解决已观察到的问题 |
| 产品方向或行为变化 | [产品定义](product/vision-and-scope.md)、[PRD](product/prd-v0.1.md)、[用户证据](research/founder-context.md)；区分用户要求、受托设计取舍与模型建议 |
| 记忆、事实确认、创意/收藏、备份 | [领域与记忆](architecture/domain-and-memory.md)、[系统设计](architecture/system-design.md)、[ADR](architecture/decisions.md)；按对应 FR/AC 和评测场景核验项目隔离及版本引用 |
| 执行、重试、费用、provider、skills | [系统设计](architecture/system-design.md)、[Provider 契约](architecture/provider-contract.md)、[应用 Agent/Skill](architecture/agents-and-skills.md)；外部结果未知先对账，不静默切换 BYOK |
| 外部能力、验收和实施顺序 | 对应 [日期核查](research/claim-review-2026-10-02.md)、[评测](product/evaluation.md)、[路线图](product/roadmap.md)；资料支持、场景定义和运行通过是不同证据 |
| 实际委派、跨上下文未完成工作 | 只在需要时读 [项目指南](PROJECT_GUIDE.md) 的协作/恢复部分；准确保存未完成状态即可，不要求先完成任务 |

普通任务不需要 registry、program、worker 或治理更新才能开始。治理机制只在实际导航、协作或风险问题出现时另行考虑，不因工具可用就安装。

## 文档地图

| 文档 | 回答的问题 | 状态 |
|---|---|---|
| [创始人需求上下文](research/founder-context.md) | 用户实际说了什么？哪些只是 GPT 的建议？ | 用户证据整理 |
| [Claim 核查](research/claim-review-2026-10-02.md) | 技术与产品判断是否有依据？ | 2026-10-02 外部资料核查 |
| [开源机制研究](research/oss-patterns.md) | 从参考项目采用什么、舍弃什么？ | 有来源的设计建议 |
| [产品定义与边界](product/vision-and-scope.md) | 为什么做，价值和边界是什么？ | 当前 V1 范围与历史 v0.1 |
| [PRD](product/prd-v0.1.md) | V1 要实现和验收什么？ | 保留原文件路径与 FR/AC ID；NFR-06 更新为英文界面 |
| [流程与交互](product/workflows-and-ux.md) | 用户如何完成任务和处理失败？ | v0.1 设计 |
| [系统架构](architecture/system-design.md) | 模块职责、存储、执行和安全如何分工？ | 原完整设计及 V1 实施注记；受控原生图片最小闭环已验证 |
| [领域与记忆](architecture/domain-and-memory.md) | 什么是事实、版本、血缘和项目隔离？ | 既有契约及 schema v3 范围/来源修正 |
| [Agent 与 Skill](architecture/agents-and-skills.md) | 谁负责判断，如何组合和约束 skills？ | 角色契约及 ADR-017 受控图片/个人 Skill 边界 |
| [Provider 契约](architecture/provider-contract.md) | 如何接入、探测能力、计费和恢复？ | 有界行为探针与受控原生图片路线；真实生成/编辑已测 |
| [架构决策记录](architecture/decisions.md) | 选择了什么，为什么，何时重议？ | ADR 基线 |
| [质量评测](product/evaluation.md) | 如何证明不输手工流程且减少操作？ | 未执行的验证计划 |
| [V1 验证记录](product/validation-v1.md) | 已有实现与完整要求差在哪，新增证据是什么？ | 工程、真实五任务、重启/备份及英文 UI 证据；V1 尚未通过 |
| [v0.1 验证记录](product/validation-v0.1.md) | 真实项目跨次记忆闭环是否成立？ | 2026-10-05 RidePass 最终 PASS WITH NON-BLOCKING LIMITATIONS；保留 2026-10-02 历史证据 |
| [路线图与风险](product/roadmap.md) | 实施顺序、停止条件和未决事项？ | 排序后的 backlog |
| [Brand Pack 模板](templates/brand-pack.md) | 如何输入并确认品牌信息？ | 可复用模板 |
| [Creative Brief 模板](templates/creative-brief.md) | 如何完整交接一套创意？ | 可复用模板 |

## 效力与冲突处理

1. 用户明确需求与本轮澄清是需求证据，见 U-01～U-16；Living Project 补充中 GPT 的建议单独标记。
2. 产品定义和 PRD 是当前实施基线，由产品负责人作出的具体取舍不等于用户逐条批准过。
3. ADR 解释选择；架构契约将其细化。如与 PRD 冲突，保留证据并交给适用 owner 决定；工程不能仅靠改文档替代批准，也不按文件新旧暗中择一。保留 accepted 原文，通过 successor/annotation 说明变更。
4. 外部核查只证明指定日期与指定接入路线的资料支持；账号权限、部署环境和实际质量仍需实测。
5. 原始对话和参考项目都是输入材料，不能自动覆盖产品基线。

文档中的“必须”指设计/验收约束；“候选”指尚未选定的方案；“已核实”指注明范围的证据；“待实测”指还不能承诺。

当前任务与适用授权说明可以执行什么；产品决定说明应当怎样；源码/config/schema 说明检查版本如何实现；测试与运行记录只证明指定环境、输入下的观察。approved、implemented、verified、integrated、deployed、product accepted 分别取证，不能互相推出。导航、治理、skill 和计划均不创造执行权限。

活动计划只描述已授权工作的范围、当前状态和下一步；audit、proposal、历史计划是背景证据，不是现行政策。依赖规则前打开原文，检查适用范围、批准来源与明确 supersession，不按日期或文件名裁决。Product 由用户决定，工程实现由当次受托维护者负责；角色称谓不代表已有人审阅。

## 更新规则

- 每次行为变更保留 FR/AC ID，并同步流程、数据契约和对应评测。
- 每次改变默认部署、计费、项目隔离、记忆归属或执行控制权，新增或取代一条 ADR。
- Provider 上线前、升级时、认证路线改变时，重查官方资料并执行能力探测；不要仅刷新文档日期。
- 评测报告记录运行环境、材料版本、全部失败和分母。目标值不能写成已达到的结果。
- 真实品牌资料属于应用数据。这里的产品知识库不等于应用未来的用户记忆存储。
- 任务结束时只更新实质改变的行为、契约、操作方式或关键引用；无需更新时一句具体说明即可，不为每份文件创建记录。

## 历史材料（非必读）

[2026-10-02 初始化记录](knowledge/initialization-2026-10-02.md) 仅保留历史执行证据，不代表当前 operational state。其中 registry、专用 validator、固定模型路由及额外流程已被同日的精简决定取代，不再是现行工作要求。

## 基线变更记录

| 日期 | 变更 | 依据 |
|---|---|---|
| 2026-10-02 | 建立产品、架构、核查、评测与实施基线 | 用户提供的两轮 GPT 对话及本轮澄清 |
| 2026-10-02 | 确认本地 Windows 单人版；扩大开源机制研究范围 | 本轮用户答复 |
| 2026-10-02 | Living Project：独立研究/洞察、项目创意库、收藏与跨次复用；新增 FR-19/20、ADR-011/012、T-29～36、B-15/16 | 本轮补充对话的用户陈述 U-13～U-16；模型建议另列，工程与效果仍未实测 |
| 2026-10-02 | 完成 v0.1 文字 Walking Skeleton；随后启动完整 V1，NFR-06 改为英文产品界面 | v0.1 运行记录及用户后续明确请求；历史记录保留，V1 另行验收 |
