# GPT 对话中的关键判断核查

核查日期：2026-10-02（Asia/Singapore）。范围：用户所给两轮对话中会改变产品边界、接入方式、质量承诺或工程设计的判断。证据来自已打开的官方文档、项目维护者文档/源码及本地只读 CLI 检查。

**总体结论：第二轮建议更符合用户需求，主要方向有依据；它仍然是一份方案，不是经过集成和质量验证的系统。** 最需要修正的是能力适用范围、运行时成熟度，以及把视觉一致性/性能收益视为待测结果。

“已支持”仅表示资料支持该能力描述；不表示此账号、此 runtime 或本产品已经通过验收。对厂商的质量描述只确认其产品定位，不把它视为跨模型实测结果。

## 接入、模型与工具

| ID | 原对话判断（概述） | 判定 | 核查结果及产品处理 |
|---|---|---|---|
| C-01 | GPT Image 2.5 Flare / Sunburst 存在，分别偏快生成/精细编辑 | 已支持 | 两个名称有正式模型页；属于 API 能力，不能推断原生订阅 runtime 使用同一模型。[Flare](https://developers.openai.com/api/docs/models/gpt-image-2.5-flare)、[Sunburst](https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst) |
| C-02 | Responses 支持多轮图片编辑 | 已支持，但限定路线 | 官方有图片生成/编辑和多轮交互文档；不代表 SIWC preview 支持图片工具。[图片工具](https://developers.openai.com/api/docs/guides/tools-image-generation) |
| C-03 | Google 从 Imagen 转向 Nano Banana | 需限定范围 | 当前 Gemini API 文档明确说明 Imagen 已停用；应表述为 Gemini API 的迁移，不泛化为 Google 所有产品/端点的统一状态。[Imagen](https://ai.google.dev/gemini-api/docs/imagen) |
| C-04 | Nano Banana Pro 适合品牌一致性、多参考图和创意控制 | 官方定位成立；效果待测 | 官方有相应能力描述；不能据此判定它优于 OpenAI，也不能保证某张图产品外观不漂移。[Google 生图文档](https://ai.google.dev/gemini-api/docs/image-generation) |
| C-05 | Ideogram 4/4.5 有文字优势、精确编辑和最多四张参考图 | 已支持，注意参数范围 | 官方 API 概述支持这些产品定位；四张参考图是所述编辑能力的约束，不应写成所有模型/端点的统一限制。[Ideogram API](https://developer.ideogram.ai/ideogram-api/api-overview) |
| C-06 | GPT-5.6 Sol / Luna 可分别承担高价值推理与便宜批处理 | 名称/定位支持；选型待测 | 有官方模型页。具体任务如何分配是工程策略，不能固定成长期最优模型映射；运行时按账号可用性和测试结果选择。[Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol)、[Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna) |
| C-07 | Responses API 内置 web search 和来源引用 | 已支持 | 可获得搜索结果与 URL annotations；引用存在不证明论点受支持、样本充分或目标站点可访问。[Web search](https://developers.openai.com/api/docs/guides/tools-web-search) |
| C-08 | fal 可接多个图片模型，key 必须留在服务端 | 已支持 | 已核查 Nano Banana Pro 与 Ideogram 接入页，且明确提醒保护客户端 key。未据此承诺每个模型版本均可用。[Nano Banana Pro](https://fal.ai/models/fal-ai/nano-banana-pro/api)、[Ideogram](https://fal.ai/models/fal-ai/ideogram/v3/api) |
| C-09 | Codex App Server 可承载认证、会话、审批和流式事件 | 已支持，有成熟度限制 | 官方有集成协议和由 Codex 管理的 ChatGPT OAuth；当前文档同时将 app-server 命令/WebSocket 路径标为实验性并提示生产限制。采用本地 stdio 候选，版本锁定并先验收。[App Server](https://learn.chatgpt.com/docs/app-server) |
| C-10 | Codex 内置生图计入一般 Codex 用量 | 已支持 | 当前文档说明内置生图使用一般 Codex 用量，且列出的模型为 gpt-image-2。不能据此宣称订阅路径提供 API 上全部 GPT Image 2.5 选项或独立无限额度。[内置生图](https://learn.chatgpt.com/docs/image-generation) |
| C-11 | 原生订阅 adapter 可完整传参考图、编辑、回收文件并恢复 | 未实测 | 对话自己承认未跑通；本次也没有执行任何图片或推理请求。M0 必须验证工具可用、文件回收、预算、隔离和恢复。当前聊天里能用的插件不能推定新 app-server 子进程也有。 |
| C-12 | 开源/本地应用可通过 Sign in with ChatGPT 使用 plan | 已支持，有资格和授权边界 | 官方提供开源客户端路线；需合格账户、注册及用户授予 plan usage 权限。身份登录本身不等于获准推理。[SIWC Quickstart](https://developers.openai.com/siwc/quickstart) |
| C-13 | SIWC preview 不含生图/托管 file search；web search 有条件 | 已支持 | 当前限制页明确列出。通过该路线配置 app-server 不会解除限制；本产品将 SIWC 与原生登录分开建模。[Preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations) |
| C-14 | 登录不会自动获得 ChatGPT Project 的会话和资料 | 已支持 | 官方说明身份及 plan usage 权限不授予会话访问。旧项目资料采用用户导入，不承诺自动同步。[SIWC Quickstart](https://developers.openai.com/siwc/quickstart) |
| C-15 | Gemini CLI 的 Nano Banana 扩展仍需 API key | 对所审查扩展成立 | 官方扩展配置列有敏感的 NANOBANANA_API_KEY；不能从 Gemini CLI 登录推断此扩展走订阅额度。[扩展配置](https://github.com/gemini-cli-extensions/nanobanana/blob/main/gemini-extension.json) |

## 开源参考与架构判断

| ID | 原对话判断（概述） | 判定 | 核查结果及产品处理 |
|---|---|---|---|
| C-16 | Cumora 通过本地 daemon 组织独立 agent，provider 凭证留在宿主 | 文档支持 | 借鉴宿主/runtime/产品接口分离，不照搬团队聊天与云基础设施。[BYOA](https://github.com/yetone/cumora/blob/main/docs/BYOA.md) |
| C-17 | Cumora 的安全默认会关闭 Codex web search 等能力 | 文档支持 | 当前 BYOA 文档确有相关限制；其原生安全路径与 persistent app-server 的处理也不同，不能把该项目当作我们的集成已成功证据。[BYOA 安全章节](https://github.com/yetone/cumora/blob/main/docs/BYOA.md) |
| C-18 | 用程序处理并发/重复工作，而非持续加 prompt | 合理且有参考实现 | 协调文档讨论原子任务认领和过期上下文等机制；这里采用任务 lease、版本检查和持久状态。[Coordination](https://github.com/yetone/cumora/blob/main/docs/COORDINATION.md) |
| C-19 | OpenShip 是部署平台，工具仍走权限边界 | 已支持；仓库已由用户确认 | README 表述匹配。适合借鉴 CLI/UI/工具的统一权限入口，不作为创意领域模型基础。[OpenShip](https://github.com/oblien/openship) |
| C-20 | Agent Skills 有 SKILL.md 开放格式 | 已支持 | 格式包括入口与可选资源；格式兼容不等于工具兼容、可安全执行或跨引擎结果等价。[规范](https://agentskills.io/specification) |
| C-21 | 小黑 skill 用风格 DNA、角色、构图与检查维持一致性 | 机制支持；结果未验证 | 已读 SKILL.md 与 style-dna；其中确实依赖 image_gen。可学习结构，不能承诺导入后自动生图或复制角色即适合商业品牌。[SKILL.md](https://github.com/helloianneo/ian-xiaohei-illustrations/blob/main/ian-xiaohei-illustrations/SKILL.md)、[Style DNA](https://github.com/helloianneo/ian-xiaohei-illustrations/blob/main/ian-xiaohei-illustrations/references/style-dna.md) |
| C-22 | 项目知识应独立于 agent 会话，隔离不能只靠 prompt | 采纳的架构决策 | 与用户跨项目和持久知识需求直接相关；“实现隔离”要由文件权限、查询范围和对抗测试证明，不是加 project_id 字段就完成。 |
| C-23 | logo、字体和布局经确定性合成就永远准确 | 过度绝对 | 合成能提高精确性，仍可能缺字体、溢出、错误裁切、低分辨率或使用错误资产。必须验证文字、尺寸和模板；第二轮提出双模式更合理。 |
| C-24 | 多 agent 比单 agent 更适合且产生更好创意 | 尚无比较证据 | 接受职责分工需求，不承诺性能收益；相同资料与预算下比较单角色/多角色策略，复杂研究才默认拆分。 |
| C-25 | 13 条 Reddit 讨论足以标为强证据 | 原文只是例子，不能当研究发现 | 本次没有相应数据。即使找到 13 条，也需检查独立性、代表性、时间、反例和访问情况，不能用数量自动变成“目标用户最大痛点”。 |
| C-26 | 已有作品足以证明质量；反馈会形成有效营销学习 | 部分不可验证 | 本次无原图；“用户采用”只说明创作偏好和可用性。点击/转化改善需要真实投放数据及合理比较，v0.1 不承诺。 |

## 本地证据与未做的检查

本次只读检查发现：

- 仓库起始为空，`main` 尚无提交；没有现有实现、测试或 AGENTS.md。
- `codex --version` 返回 `codex-cli 0.159.0-alpha.12.1`。
- `codex app-server --help` 有 stdio、协议类型生成等选项，命令本身标注 experimental。

这只证明本机存在相关 CLI 入口。没有读取认证 token，没有运行登录、模型推理、生图、用户素材传输或额度测试。M0 的所有端到端结果仍为未验证。

## 核查后的产品调整

1. 保留本地 BYOA 主方向，拆开 provider、认证方式、runtime、模型和可用工具，不写一个笼统的“OpenAI 支持”。
2. 先验证单一原生 adapter；SIWC、第二 provider 和自动 router 不同时开工。
3. 将文档支持、账号可用、实际探测、质量合格四层证据分开。
4. 将“品牌记忆”“学习效果”“一致性”改写成可测试的数据规则和质量要求。
5. 用公开的一手资料支持选型，但依赖是否采用由本产品约束决定，见[开源机制研究](oss-patterns.md)。

链接中的 `main/master` 与厂商文档会变化；本次没有固定上游 commit。任何复制代码、安装 skill 或集成依赖之前，都必须记录实际版本/commit、license 与当时测试结果。
