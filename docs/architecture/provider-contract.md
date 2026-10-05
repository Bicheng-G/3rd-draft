# Provider、认证路线与 Adapter 契约

状态：2026-10-05；最小原生图片路线 FEASIBLE，完整 V1 仍未验收。历史外部能力资料见 [C-01～C-15](../research/claim-review-2026-10-02.md)，当前二进制、真实调用及限制见 [V1 验证](../product/validation-v1.md)。

应用独立 profile 不复制或修改个人 Codex 配置、规则、认证、Skill 和会话；个人全局 AGENTS 无需清空。native Skill 可能仍被原生发现/加载，按 ADR-017 为 best effort 观察，不单独阻断。契约 6 保留简单抑制、工具/认证/重试/输出硬检查；新二进制 SHA-256/契约组合通过有界 loopback dummy 探针才启用，文字通过不自动启用图片。旧 `0.159.0-alpha.12.1` 没有重新验证，不能套用 `0.160.0` 的结果。

## 当前原生图片路线

每个显式 Production Action 最多 2 次图片操作。应用先冻结当前项目的 ConceptVersion、brief、品牌版本、指令、明确参考和可选编辑原版，再构造原生唯一的 `image_gen.imagegen` 调用。loopback `/responses` 只有应用固定响应；外部模型、Skill 和图片 provider 均不能选择工具、路径或新增 Action。当前实现仅接受应用验证过的 PNG buffer，写入当前项目 Action staging。不是任意 Codex agent 的 Windows OS 沙箱，也不要求 selected-reference-only ACL。

原生 CLI 使用应用自有 ChatGPT 登录构造请求；harness 在同步 SQLite reservation 后，只向固定 Codex subscription `/images/generations` 或 `/images/edits` 转发。没有 API key、alternate provider、重定向或自动重发；同 Action 不能重新取得预算，结果未知不自动派发。原生保存文件必须与已完整解码的 backend 图像字节一致，再由应用去元数据归档 PNG、记录原始/归档哈希、lineage、依赖与 Project Memory；模型文字不作为图片成功证据。一次生成带参考图也可能调用 edits endpoint，不因此成为领域修订。

实际 `0.160.0` 已在独立交互登录的 profile 通过一次真实生成及一次显式编辑，各 1 次图片请求。profile 登录/真实 subscription endpoint/原生文件证明路线可用；未审计账单或额度扣减，`usage` 保留 unknown。参考上限 5 张（编辑原版占 1 张），单张 10 MiB、合计 40 MiB，输出 PNG 20 MiB/25M 像素，单 Action deadline 180 秒。当前只支持 opaque 输出；mask、透明背景、批量和额外 provider 未启用。

| 路线 | 当前决定与证据 |
|---|---|
| Codex 原生登录/runtime | 主路线；独立 profile，文本/视觉无工具，图片由应用固定原生工具调用；分别通过行为探针。最小 Generate/Edit 真实闭环已通过 |
| SIWC plan usage → Responses | 未实现；不把其权限或限制与原生 Codex 路线合并 |
| OpenAI/Gemini/Ideogram/fal API | 未启用；不得作为隐式 fallback |
| 人工导出 brief → 导入图片 | 用户显式选择时保留进度；不算自动原生制作证据 |

官方资料支持原生内置图片计入 Codex 一般用量；具体说明在[内置生图文档](https://learn.chatgpt.com/docs/image-generation)。SIWC preview 当前排除图片生成等托管工具，见[限制页](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)。二者是不同路线，不从一个 token 的存在推断所有工具都能用。

## RouteProfile 与能力快照

路线身份由以下组合确定：provider、auth_mode、account/profile 引用、runtime/version、adapter/version、model、工具/权限配置和 billing_route。配置变化会使旧能力快照失效。

每项能力采用 `supported / unsupported / unknown / degraded`，并记录证据层级：`documented / discovered / tested`、检查时间和适用配置。读取工具列表只是 discovered，不等于实际生成/编辑成功。

至少覆盖：文本推理、结构化结果、搜索/抓取及来源、图像输入、多参考图、生成、编辑、mask、透明背景、输出文件、可恢复 session、取消、用量可见性、请求对账、幂等、沙箱与工具调用限额。

```ts
type CapabilityState = "supported" | "unsupported" | "unknown" | "degraded";
type BillingRoute = "subscription" | "api" | "manual" | "unknown";
type ErrorClass =
  | "auth_required" | "quota_exhausted" | "rate_limited"
  | "unsupported_capability" | "permission_denied" | "invalid_output"
  | "transient_failure" | "result_unknown" | "cancelled";

interface CapabilityRecord {
  name: string;
  state: CapabilityState;
  evidence: "documented" | "discovered" | "tested";
  checkedAt: string;
  configHash: string;
  limitations: string[];
}

interface ArtifactDescriptor {
  localStagingPath: string;
  mediaType: string;
  providerArtifactId?: string;
}
```

这是内部类型草案。具体供应商 RPC 字段以选定版本生成/核对的 schema 为准，不能用上述接口冒充其协议。

## Adapter 最小操作

| 操作 | 契约 |
|---|---|
| `inspectConnection` | 返回认证/连接状态与非敏感账号引用，不泄露 token |
| `discoverCapabilities` | 读取当前配置可用能力，保留 unknown |
| `validateCapabilities` | 在获准的测试预算内执行真实小样，产生测试记录；探测可能消耗额度，不能后台反复生图 |
| `startTask` | 输入角色契约、ContextManifest、只读素材、写入目录与执行边界；返回 attempt/session/request 标识 |
| `events` | 结构化状态、输出和错误；绑定 project/run/attempt；去重后持久化 |
| `resumeTask` / `inspectTask` | 仅恢复同项目同输入快照的会话；能否恢复/对账由能力声明决定 |
| `cancelTask` | 尽力停止；报告是否确认取消及用量可能已发生 |
| `collectArtifacts` | 输出描述符，不直接修改业务表；宿主再次校验并归档 |
| `readUsage` | 返回实际可获得的用量及缺失字段；无数据时返回 unknown |

凭证生命周期尽量交给原生 runtime；只有用户明确配置 BYOK 才由本地 secret store 保存 API key。浏览器、prompt、子进程通用环境、项目导出和日志均不包含凭证。不同认证路线的环境独立构造，防止残留 API key 触发另一账单。

## 执行与计费边界

生产前检查：所需能力已通过当前配置测试、输入属于当前项目、Skill 已启用、批准快照匹配、剩余预算足够、沙箱可用。失败时给出具体可修复原因，不猜测能力。

本地预算至少有最大 agent 任务数、图片尝试数、修改次数和总运行时长。API 路线在价格/用量可得时另记估计与实际费用；订阅路线显示可读到的额度信息，不编造每张图的美元成本。

预算记录还必须注明 `enforcement = host_enforced / runtime_enforced / observed_only / unavailable`。若 runtime 不暴露内部图片工具次数，本地“单次任务”不能伪装成“硬限制恰好一张图”。M0 必须验证可控的生产路径；无法强制限制时展示真实控制粒度，并不能通过要求精确图片调用上限的验收。

达到已批准的范围后暂停。其他可用 provider 只可作为建议；切换认证/费用路线、扩大预算或使用额外素材，必须有新的用户决定。

## 错误和重试

| 情况 | 处理 |
|---|---|
| 确认请求尚未提交的短暂网络失败 | 有界退避后重试；默认最多 2 次 |
| provider rate limit | 尊重 retry-after；有界等待，不启动其他账户/路线规避 |
| 配额不足/认证失效 | 持久等待状态，让用户重连或等待额度 |
| 提交后断流/超时 | 尝试 request ID 对账；无法确认则 `result_unknown`，不能直接重发 |
| 图片完成但本地写入失败 | 保留可回收引用，只重试归档 |
| 结构化输出不合法 | 最多一次格式修复任务；占用预算；不得用虚构 ID 填齐 |
| 取消后输出迟到 | 保存为未采用产物，记录原尝试，不触发下游制作 |

## M0 能力验证记录模板

每条记录保存：测试日期、Windows/CLI/adapter 版本、认证模式与非敏感 profile ID、实际工具配置、输入哈希、实际 provider/model（未知则注明）、操作、结果文件哈希、事件与费用证据、已知限制。

按顺序验证：

1. 原生认证可用，启动任务并返回终态；没有 API key 依赖。
2. 研究得到可访问来源，来源数据能够由 adapter 回收。
3. 两张已授权参考图进入图片制作；得到可解码的本地文件。
4. 修改指定部分，输出新版本，并评测需保留内容是否漂移。
5. 关闭浏览器、重启服务、断流/取消等情况下保留产物与状态；无重复隐式请求。
6. 两项目隔离、脚本权限、计费路径和预算控制都可被证据证明。

任何失败写入测试结果，不将参数降级、手动补图或改走 API 后的成功记在原生订阅路线下。
