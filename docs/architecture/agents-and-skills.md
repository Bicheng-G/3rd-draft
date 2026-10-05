# Agent 分工与 Skill 治理

状态：保留 v0.1 角色契约（2026-10-02），补充 ADR-017 与当前原生图片实现（2026-10-05）。目标是明确判断责任与交付物，同时保持日常创作轻量。

## 角色和交接

逻辑角色可以使用同一 provider/model，但接收不同上下文和工具权限。多角色不意味着每次必须多进程并行，也不意味着维护一个长期聊天群。

Living Project 更新后，下列角色表示可按任务调用的职责，不是每次必须经过的流水线。用户新需求确认了独立研究/洞察、收藏与复用；“仅保留一个 Main Agent”来自 GPT 建议，尚未替代 U-08。一个执行端加载不同 Skills 是可评测方案，任何方案都由 Workflow Service 统一控制任务与批准。Review / QA 不要求部署独立常驻 Agent，但保留独立检查上下文与交付契约。

| 角色 | 输入 | 交付契约 | 允许的判断 | 无权执行 |
|---|---|---|---|---|
| User Researcher | 受众问题、已选资料、研究范围 | ResearchBrief：来源、观察、现有 workaround、反例、假设 | 决定查什么、解释样本 | 改品牌事实、读别项目、承诺市场代表性 |
| Product/Competitor Researcher | 产品版本、竞品/替代方案问题 | ProductBrief：事实差异、来源、未知和冲突 | 比较产品和竞争表达 | 把竞品宣传直接当成事实、自动更改本产品定位 |
| Insight synthesis（逻辑任务） | 用户指定的证据版本、已有洞察与受众范围 | InsightVersion 候选：观察、推断、反例、证据与修订理由 | 关联证据、提出新洞察或版本 | 自动外部研究、把收藏当市场证据、覆盖已确认事实 |
| Creative Strategist | 构思目标或 brief、品牌约束、相关洞察与创意历史 | 独立 IdeaBatchDraft 或 CreativeSetDraft：多个 ConceptDraft 及引用 | 受众、angle、文案、视觉隐喻 | 自行批准制作、编造 proof/保证、每次默认重做研究 |
| Art Director / Production | 已选 concept、Brand Pack、Skill、参考图、预算 | ProductionPlan + 图片/变体 + 修改说明 | 视觉解释、制作模式、参考图选择、定向修订 | 改变已确认产品事实、静默更换计费路线 |
| Reviewer | brief、品牌/概念快照、最终图文、机器检查 | ReviewReport：问题、证据、严重度、建议、无法判断项 | 发现偏离、提出有限返工 | 自行批准最终采用或把主观喜好写为品牌事实 |

ResearchBrief 最少有 `source_refs[]`、`observations[]`、`hypotheses[]`、`limitations[]`；CreativeSetDraft 每个 concept 有 `fact_refs[]` 与 `insight_refs[]`；ReviewReport 的每项 issue 有 `target_version_id`、`severity`、`category`、`explanation`、`suggested_action`。输出经过服务端 schema 和项目引用校验后才接入工作流。

IdeaBatchDraft 同样带 `fact_refs[]` / `insight_refs[]`，后者解析为具体 InsightVersion；不要求 creative_set_id。服务负责给有效草稿建立项目 CreativeIdea 与 ConceptVersion。Agent 不把用户“喜欢”推断为收藏命令，不直接写 Favorite 或确认事实；收藏按钮或用户明确收藏指令经领域命令落实。

Reviewer 的独立性首先是任务上下文独立与检查职责独立。同一个模型的不同角色仍可能共享偏差，不能称为独立第三方验证。用户是最终创意决策人。

## 调度策略

- 仅构思：复用相关项目记忆 → Ideation Skill / Strategist → 保存项目创意，用户可收藏后结束。
- 从收藏或历史续作：直接取指定版本 → 补齐 brief 并发展 → 用户选择制作范围 → Production → Review；不强制再生成一批点子。
- 需要新受众理解或竞争判断：先建议用户手动启动研究任务；只在已明确选择的研究范围内安排角色，并行仅限相互独立的研究输入。
- 洞察整理：用户手动选择证据及目标，保存洞察候选/新版本；未明确包含此任务时，新研究不自动刷新洞察库。
- 单纯修改标题拼写、文件名或尺寸：确定性任务直接完成，不启动 agent。
- 修改图片时 Production 可提出下一步，但每次外部调用仍受批准范围和剩余预算约束。
- 自动返工默认最多 2 次；达到上限回到用户选择，不允许 Reviewer/Production 无限互相派工。
- 子任务只有 Workflow Service 能持久创建。v0.1 不启用 runtime 自主无上限 spawning，保持一个全局调度权威。

多角色策略与简化单角色策略在[评测](../product/evaluation.md)中比较；这不取消产品角色模型，而是决定哪些角色在什么场景值得激活。

通常角色只得到当前任务的相关上下文包，不读取整个项目历史。图片生产保留当前项目隔离/staged 文件区可读、正常宿主与其他项目禁止的产品边界；当前切片由应用构造工具参数与项目暂存文件，不允许外部模型选择任意路径。这是受控执行路线，不代表 native 进程拥有通用 OS 沙箱隔离。显式参考选择进入快照，输出经领域服务保存才进入长期项目记忆。相关收藏和反馈可作为带范围的参考例子，不能自动归纳为已确认品牌偏好，更不能据此证明营销效果。

## 必须交给程序的工作

文件导入/命名/校验、项目权限、来源去重、任务认领、状态迁移、预算、重试、能力匹配、版本锁定、确定性排版、导出和备份都由代码处理。Agent 可以提出建议，但不能通过一段自然语言改写这些结果。

图片模型是生产工具。Art Director 负责判断怎样使用它；已确定请求的发送和文件回收是 adapter/固定任务。ADR-016 允许每个用户显式 Production Action 最多 2 次图片操作，由 harness/runtime 强制控制；上文自动返工设计不扩大这次切片的预算。

当前最小切片不运行外部模型规划器：用户选择 concept、参考图及修改指令后，应用冻结 brief、已确认品牌资料、concept、方法文本和图片哈希，在本地 `/responses` 中提供唯一的 `image_gen.imagegen` 调用。Native runtime 负责原生图片工具和独立 ChatGPT profile 认证；外部图片请求只经固定订阅端点。参考文件来自应用校验过的 Buffer，暂存于当前项目；新建临时线程，不使用隐式历史图片。每次发送前同步持久化预算预约，包含重试在内最多 2 次图片操作。应用验证返回图片并核对 native 文件后才归档；一次指令修改建立新 AssetVersion，原图保持不变，参考依赖与父版本分别记录。生成或编辑不自行批准、采用或发布。

文字/视觉输入契约和图片契约分别以实际 CLI 的有界本地探针验证；二进制或配置变化后重测，版本号相同不能代替证据。Codex `0.160.0` 已完成此路线的一次真实生成与一次指令编辑，完整 V1 和配对质量仍未验收，见 [V1 验证记录](../product/validation-v1.md)。

## 三种不同的资产

| 对象 | 回答的问题 | 示例 |
|---|---|---|
| Brand Pack | 这个品牌允许说什么、必须保留什么？ | 产品特征、logo、语气、已确认承诺 |
| Style Profile | 这个系列的视觉规则是什么？ | 摄影光线、留白、颜色职责、信息层级 |
| Skill | 这类工作怎样做、如何检查？ | 用户研究方法、广告创意、编辑式摄影、插画 QA |

组合为：Brand Pack 版本 + brief/concept 版本 + Style Profile + Skill 版本 + 本次参考图 + 当前路线能力。没有完整 design system 的项目允许使用一个简化 Brand Pack。

## Skill 包与元数据

以下导入、权限与版本规则针对 Third Draft 管理的项目 Skill 包。另按 ADR-017，宿主原生个人 Skill 的发现/加载只作 best-effort 抑制：应用不复制或修改个人 Skills，但 Windows native runtime 仍可能发现或显式展开它们。契约 6 将观察结果作为计数和警告展示，不保存其路径或内容，不以这一现象本身拒绝任务。工具、项目输入、固定计费路线、预算及业务批准仍由应用强制控制；个人 Skill 不能创建 Production Action 或执行导入包脚本。

入口兼容 [Agent Skills 规范](https://agentskills.io/specification)，保留 `SKILL.md` 和其可选资源。平台额外维护 sidecar manifest，不声称下面字段是通用 Skill 标准。

```json
{
  "schema_version": 1,
  "skill_id": "original-editorial-photo",
  "source": {"type": "local_directory", "ref": "user-selected"},
  "content_hash": "sha256:...",
  "declared_version": null,
  "license": "unverified",
  "requires_capabilities": ["image_generate", "reference_images"],
  "requested_permissions": ["read_selected_assets", "write_run_staging"],
  "scripts": [],
  "compatible_roles": ["production"],
  "review_status": "unreviewed"
}
```

哈希覆盖入口、references、assets 和 scripts。缺版本号时也能用内容哈希锁定。模型名不能代替能力需求；例如 `image_gen` 是具体工具依赖，须映射并验证实际语义，不能只重命名为 `generateImage`。

## 安装、启用与执行是不同状态

1. **导入**：复制到隔离库，防止 zip slip、绝对路径、junction/symlink 越界，限制大小；不执行脚本。
2. **检查**：展示来源、内容变化、license、外部工具、脚本、网络/文件要求；不将检查自动称为安全认证。
3. **项目启用**：设置项目允许的包版本；品牌知识不能隐式写入全局包。
4. **能力匹配**：每次运行与所选 route 的已验证能力相交；不兼容时给出具体原因。
5. **执行**：绑定不可变包版本和权限。外部 scripts 在明确授权与沙箱验证前不能运行。
6. **升级/停用**：升级创建新版本；在途任务保留旧版。若旧版因风险被撤销，停止派发并标出受影响任务，不能静默换版继续。

方法指令与品牌约束冲突时展示冲突：例如 Skill 强制蓝色而品牌禁止蓝色，用户可以选择别的 Skill 或提出品牌修改；agent 不自行决定覆盖。

## 一致性的检验

参考小黑 skill 的是“把视觉语法拆细”的方法，而不是借用其角色作为所有品牌的 IP。需要检查单张和整组：产品形状、logo、色彩职责、字体/文字、语气、信息层级及风格系列是否一致；同时记录构图和隐喻是否重复。

固定 seed、固定 prompt 或固定 Skill 版本都不保证一致像素。质量是输出评测结果，不是格式属性。
