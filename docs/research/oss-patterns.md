# 开源项目机制研究与采用建议

状态：2026-10-02 文档/局部源码研究；没有部署这些项目，也没有完成全面代码或安全审计。

选择标准是与本产品关键风险直接相关、可在一手文档/代码中查到具体机制、能缩小 v0.1 实现成本。没有把 star 数、知名度或“最优秀”作为未经验证的结论。用户给出的仓库是研究入口，不是依赖清单。

## 参考矩阵

| 参考 | 本次查看的证据 | 借鉴机制 | 对本产品的落点 | 暂不采用的部分 |
|---|---|---|---|---|
| [Cumora](https://github.com/yetone/cumora) | [BYOA](https://github.com/yetone/cumora/blob/main/docs/BYOA.md)、[Coordination](https://github.com/yetone/cumora/blob/main/docs/COORDINATION.md) | 宿主凭证与 agent 分离、原生引擎拥有内部执行循环、任务碰撞由程序处理 | Runtime Adapter、宿主 credential broker、任务 lease、并发上限 | 团队聊天、邮件、Redis/Kubernetes、常驻 agent 社交行为 |
| [LangGraph](https://github.com/langchain-ai/langgraph) | 官方 [Persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence)、[Interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts)、[Fault tolerance](https://docs.langchain.com/oss/javascript/langgraph/fault-tolerance) | 检查点与长期知识分开；中断与恢复有明确状态；重放考虑副作用 | 步骤结果持久化、人工选择点、失败后对账 | v0.1 暂不引入框架；固定流程用小型状态机即可，避免再包一层 agent 推理循环 |
| [ComfyUI](https://github.com/Comfy-Org/ComfyUI) | README、[caching.py](https://github.com/Comfy-Org/ComfyUI/blob/master/comfy_execution/caching.py) | 图依赖、输入变更后的局部重算、工作流随产物可追踪 | 版本依赖、下游失效、制作快照、复用未变步骤 | 节点画布、GPU/模型安装、任意 custom nodes；未来本地图片 adapter 可另评估 |
| [OpenCode](https://github.com/anomalyco/opencode) | 官方 [Server](https://opencode.ai/docs/server/)、[Permissions](https://opencode.ai/docs/permissions/) | UI 与 headless server 分离；结构化接口和事件；可配置权限 | 本地 UI/API 边界、typed adapter、权限声明与可见错误 | 直接继承宽松权限默认、假定所有登录均支持订阅、第一版支持第二 runtime |
| [OpenShip](https://github.com/oblien/openship) | README 中 CLI、REST 与 MCP 的描述 | 工具和 UI 操作复用权限校验；敏感凭证操作不暴露给 agent | 统一 Domain Command 入口，agent 不能绕过品牌确认或导出范围 | 部署编排、服务器管理、GitHub deploy 流程；不把部署平台当作创意操作系统 |
| [Ian 小黑 skill](https://github.com/helloianneo/ian-xiaohei-illustrations) | [SKILL.md](https://github.com/helloianneo/ian-xiaohei-illustrations/blob/main/ian-xiaohei-illustrations/SKILL.md)、[style-dna.md](https://github.com/helloianneo/ian-xiaohei-illustrations/blob/main/ian-xiaohei-illustrations/references/style-dna.md) | 将视觉语法、角色、参考、制作方法和 QA 拆开 | Style Profile + Skill + reference assets + 检查项 | 原封不动套用小黑角色、固定 16:9、默认其 image_gen 在所有引擎存在 |
| [Agent Skills](https://agentskills.io/specification) | 开放格式规范 | SKILL.md 入口与按需加载资源 | 导入格式兼容；工具依赖等元数据由本平台另存 | 伪造通用标准字段、把文档包当成可信可执行插件 |

## 采用决定

**采用机制，暂不把上述大型项目作为应用底座。** 本产品是本地单人、少量固定工作流；其品牌知识、Creative Set 和资产血缘需要自己的领域模型。为复用一个机制而引入整个平台，会同时引入不需要的账户、部署、数据或 UI 模型。

具体落地：

1. 本地服务持有数据和调度状态，浏览器只是客户端；provider runtime 是可替换执行端。
2. 每一步明确输入快照、交付契约和外部副作用；成功结果可复用，修改只使依赖它的步骤过期。
3. agent 的临时会话、工作流检查点和已确认品牌知识分别存储；“恢复聊天”不是恢复完整业务流程。
4. Skill 固定方法，Brand Pack 固定品牌约束，Style Profile 固定某系列的视觉规则；当前 brief 决定内容。
5. 授权、预算和项目访问经同一组应用命令校验；通过 agent 工具也不能跳过。

## 需要警惕的差异

- Cumora 的安全路径限制了一些 Codex 工具；直接复用其配置可能破坏研究能力。需给研究角色提供可控搜索/抓取能力，不能整体关闭沙箱来“修好”它。
- LangGraph 的 interrupt 恢复可能重跑节点前段代码。因此我们必须把图片请求等副作用与人工确认隔开，不能仅凭有 checkpoint 就承诺不会重复付费。
- ComfyUI 的输入缓存适用于其执行模型；云图片模型不保证确定性。缓存代表复用某次成功产物，不代表重跑会得到相同像素。
- OpenCode 文档说明多数权限默认允许。可参考接口设计，但本产品的默认权限由角色任务决定。
- 小黑 skill 将字体、留白、色彩职责写得具体；这能提供约束方法，却不能替代图片结果检查，也不证明其现有风格符合所有品牌。

## 何时重新评估依赖

| 候选 | 进入条件 | 需要追加的验证 |
|---|---|---|
| LangGraph 或其他 durable workflow 库 | 固定状态机已明显难以维护，出现复杂并行/长时恢复需求 | 与原生 runtime 的控制权、checkpoint 存储、迁移、Windows 打包及副作用重放 |
| ComfyUI adapter | 用户确有本地 GPU/本地模型需求或其特定节点明显改善作品 | Windows 安装、资源消耗、工作流版本和 API 节点的费用边界 |
| OpenCode/其他 runtime adapter | 主 runtime 不满足能力或用户需要另一个已验证 provider | 认证条款/可用性、能力探测、sandbox、产物格式、恢复语义 |
| 更完整的 agent 平台 | 本地单人边界明确改变为团队/远程工作 | 重新做产品范围与架构 ADR，不能隐式升级 |

本次未复制项目代码或安装外部 skill。实现采用前锁定 commit/版本、查看实际 license，并保留必要归属信息；不把“参考架构”写成“已经完成安全审计”。
