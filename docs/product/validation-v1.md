# V1 — 实现差距与验证记录

**当前里程碑结果：BLOCKED — 领域与 runtime 隔离修正完成；原生图片制作不得启用。** 2026-10-05 用户将本轮范围收敛为先纠错、再做有界可行性调查，明确允许在控制无法证明时停止。完整 V1 仍未验收；10 月 2 日的工程、真实任务及性能证据保留在下方历史部分，不当作新 profile / 新二进制的验证。取舍见 [ADR-015](../architecture/decisions.md#adr-015--修正领域语义以独立-profile-和有界行为探针接入-codex)。

## 当前提交、最低证据与结论（2026-10-05）

开工基线为 `main` / `6ecc44a5707aca6a6997fd2d230ef27c4eb027d8`，工作区原先干净。实现与测试提交为 `51f4feb0c4659dbdc259cc2fb627a48be40ae20d`；本页随后以文档提交补记该 revision 的验证结果，不改变受测代码。没有发布或推送，没有把凭证、真实资产、runtime 会话或私有报告加入 Git。下方曾记载的 unborn `main` 仅描述 10 月 2 日当时状态。

| 最低验收证据 | 当前观察 | 判定 / 限制 |
|---|---|---|
| 同一个 ConceptVersion 在两个 Creative Sets 中的决定独立，跨项目 / 未关联 set 被拒绝 | schema v3 的选择事件保存 set 外键；快照分别给出各 set 当前决定；领域回归及浏览器将 Beta 拒绝、Alpha 选择，Beta 不变 | PASS。收藏和发布仍有各自语义；旧无范围事件保留历史，不自动推断所属 set |
| AssetVersion 修订与输入依赖分开，旧文件不可变 | 新合成无 parent；视觉/logo 进入既有 `asset_links`。Recompose / caption 修订指向原作品，原图字节不变；Recompose 另拒绝跨项目、错 set / concept、非 layered 来源 | PASS。历史错误 parent 由读取层解释为 dependency，原 payload 不重写；备份 / 导出保留区别 |
| 手工创意来源及最小创建上下文可追溯 | `createdBy=user`、`runId=null`、来源版本、创建目标、当时品牌基线及显式洞察/证据版本保存；续作仍能识别祖先基线变更，固定引用不换成新版本 | PASS。品牌基线不表示用户使用了所有事实；旧未知上下文明确告警，不制造生成 run |
| 不依赖或修改个人 Codex 指令、配置、认证、skills、会话 | 独立应用 home / user / temp 与文件认证；继承环境 allowlist；个人非空指令夹具不受影响；junction / hardlink 路径拒绝；应用没有复制个人认证 | PASS 工程与实装局部行为。新 profile 未登录时正确返回 `auth_required`；交互登录与真实订阅调用本轮 NOT_RUN |
| 新 runtime 以必要行为验收，失败关闭 | 实际 0.160.0 二进制通过结构化输出、显式 PNG、无工具/环境指令、禁重试、原生 ChatGPT 认证 fixture 与 API 认证拒绝；缓存按二进制与契约哈希 | PASS，仅文本/受限视觉输入契约。无 exact version equality；没有静默把旧 pin 的证据转给新版本 |
| 图片操作数在派发前受限，参考图只来自批准输入 | 同 turn 批准上限为 1、批准参考为空；实装工具仍发出 2 次图片请求，第二次把工作目录外未批准 PNG 放入请求 | FAIL，足以判定 BLOCKED。单独 profile、read-only sandbox、prompt 要求与事后取消均不足以实现本次必要控制 |
| 图片结果有可靠文件证据，失败 / 未知不伪装成功 | adapter 在 inspect、准备文件、提交前拒绝 native generate/edit/reference；本地负例 CLI JSON 没有可用于归档的图片资产事件 | 门禁 PASS；真实图片文件解码/归档、生成→编辑版本链→Project Memory 闭环 NOT_RUN，不能据模型消息判成功 |
| 不发生静默 API/BYOK/其他计费路线 fallback | 生产文本配置固定原生订阅地址、ChatGPT 登录、重试 0；API-auth fixture 在 0 次请求时拒绝；图片入口持续关闭 | PASS 配置/本地协议检查，不是实际账单证明。图片调查的 API 形状 loopback fixture 不是产品计费路线 |
| 原有项目隔离、持久任务 / 取消 / 未知结果 / 本地归档恢复不退化 | 完整 `npm test` 含跨项目、重复请求、取消及迟到结果、receipt、恢复、图片前置拒绝、备份与 migration | 102/102 PASS，0 fail / 0 skip；double 与实际 CLI 本地 transport 明确区分 |

### Runtime 身份与实装兼容性

历史 pin 为 **0.159.0-alpha.12.1**；本轮该旧二进制不可用，未重新测试。实际默认 **0.160.0** 的文件为 `C:\Users\zhuzh\AppData\Local\OpenAI\Codex\bin\f544b3844e0f14e9\codex.exe`，SHA-256 `4b01d5920e6785614727443bbecf343f4dedbb7347052b72ba805aab6353ef01`。新的支持政策按能力探针验收实际二进制，不维护复杂版本矩阵；服务重启后重新解析安装路径，二进制或配置哈希变更必须重新探测。旧版本字符串也不能豁免新契约检查。

2026-10-05T06:26:01.067Z，root 从仓库目录运行 `npm run runtime:check`，指定独立合成数据根 `.workbench/runtime-contract-acceptance`，退出 0。契约哈希 `9aba436601051ac1d1fcb40d05090a59b423f2ecf03c0ac05ac5fec97a116c34`；证据 ID `078c4305ca36252e327ff18c63955607a2e63f4cb1b590ff28c9a8746ae0903b`。成功、HTTP 503、断流各观察 1 次 loopback 请求；后两者收到 `turn.failed` 后由宿主终止，退出 1，未重试；API 认证 fixture 确认被识别后，生产配置在 0 次请求时拒绝。探针使用虚构 ChatGPT token/account，与生产相同 provider 参数，仅把地址指向 loopback；两侧请求压缩均关闭。没有系统级网络追踪，不声称整个原生进程绝无附带网络活动。

保留的失败：仓库目录早期运行在 CLI 已报告 `turn.failed` 后仍等到 20 秒超时，并有 Node pipe handles 阻止退出；临时根目录的早期通过不能覆盖这一失败。随后修正显式失败终止与管道释放，最终相同仓库入口通过且自然退出。失败日志 `.workbench/runtime-contract-acceptance-failed.log` SHA-256 `fe9e1b4a1f1c222e40b7b007ec0abda818af3c87ba4731436579bc08612733e2`；最终日志 `.workbench/runtime-contract-acceptance-final.log` SHA-256 `ef16e4f7d81023930c137230c9a26fa3b1568d7c00000e1d97e2dc1ed2162c3e`。任务创建的旧诊断进程已关闭。独立复核 `.workbench/runtime-compatibility-2026-10-05-final.json` 还确认空应用 profile 返回 `auth_required`，其 SHA-256 为 `1ee8da792ecbc1aeeb6157ed9e9979ffbacdaf47351eb475d64c380914108e74`。

### 原生图片的有界失败证据与解阻要求

`node tools/probe-native-image.mjs` 的可复现检查于 2026-10-05T06:10:56.333Z 得到 `BLOCKED_CONTROLS_DEMONSTRATED`，不是图片成功。安装二进制身份同上；该工具的契约哈希 `f37a5e69eadf915203cca90f827a9d2482df1ea6c378756343fc8edf8be22cf0`。每次检查独立 home、dummy token、20 秒 deadline、最多 12 个本地请求 / 3 轮模型响应，只启用 native image tool，其他工具禁用；返回图片也是合成 fixture。

实际观察：3 次本地 responses 请求，2 次本地图片端点请求（generation、edit）；编辑请求包含未批准的目录外 PNG，fixture SHA-256 `4ff6ab670a58c14270e034e2090d9a432caa263a14e0a25785386b0c12f880b5`。原生 JSON 图片资产事件数为 0。该安装二进制生成的 app-server schema 未发现宿主可直接调用的图片 RPC；这不等于证明所有未来接口均不可行。保留报告 `.workbench/native-image-probe/result-2026-10-05T06-10-56-333Z.json` SHA-256 `d0978f2a0013b743fc7ceaf30a02033b35a7662fd43d452c285f55d043c23657`。调查脚本保留在 Git 供重现；本地报告/fixture 保持忽略，后续执行保存独立时间戳报告。初步调查与该复现都只使用本地 transport；**real image-service attempts = 0，accepted native image probes = 0，real credentials used = false，subscription billing validated = false**。

这些负例只适用于已记录二进制和探针配置，不能当作历史 pin 的实测，也不能用公开源码 revision 代替二进制身份。已有公开源码关于参考路径 / hook fail-open 的材料保留在下方历史来源，作为解释线索；最终 BLOCKED 依据是实装控制失败。文本契约通过不启用图片能力，用户批准制作也不能自动约束原生工具下一次内部调用。

最小解阻需要受支持 runtime/tooling 提供：宿主发起的单次 native 图片操作（或等价的原生执行层原子预算），只接受批准参考字节 / 受限句柄、在派发前 fail closed、固定订阅认证且无其他计费回退，并返回可验证的结构化图片文件身份。仅升级版本号不够。若改 runtime，至少重验上表全部隔离、认证、禁重试、输出和文件控制；先完成一次真实生成的文件解码/哈希/不可变归档/Project Memory，再在同一路线做一次指令编辑，验证原 AssetVersion 不变及新 parent 正确，才能记录 FEASIBLE 和端到端 PASS。当前停止在选择这种最小接口或工具变更的产品/架构决定边界，不自行加代理框架、runtime fork、API 提供商或更宽权限。

### 回归、浏览器与证据限制

完整 `npm test`：**102/102 PASS，96 个顶层测试及 6 个嵌套 lineage 用例，0 fail / 0 skip，13.56 秒**。日志 `.workbench/production-milestone-tests.log` SHA-256 `c23dc721a4f90bbf7d0dc5c4a47133e5c08129c4e77d0fb8601aba55c7b86c58`。另通过前端、server、login helper 与 image probe 的语法检查及 task-owned diff 检查。定向 25 项 runtime / 8 项 domain-corrections 是该回归的子集，不累加总数。

明确的 RED→GREEN 包括：set 决策互相污染、手工祖先上下文缺失、合成输入误作修订 parent、Recompose 未保存 prior version、schema 3 备份 SQL `set_id` 有值而 payload 丢失 `setId` 仍被接受，以及 profile 链接路径 / 运行失败管道问题。备份现在要求两层 scope 一致，拒绝发生在目标目录创建前；schema 2 的 null/缺失历史语义仍可恢复。

真实浏览器使用合成双 set / 手工创意 fixture 与禁止调用的 runtime：Beta 拒绝、Alpha 选择后独立状态保持；编辑手工创意时保留固定证据/洞察选项，保存后显示用户作者、原版本与创建基线，刷新后原版和修订均存在。结果 PASS；新会话 console 0 errors / 0 warnings。操作脚本 `.workbench/ui-decisions.js`、`.workbench/ui-manual-version.js` 及 `.playwright-cli/` 快照为忽略的本地证据；没有把合成使用情况记为用户采用。Recompose 的本轮验证来自领域回归和 UI 请求接线检查，未另做浏览器生成操作。

本轮没有真实品牌生成/图片编辑、没有新订阅 profile 的交互登录验收、没有端到端图片归档或质量验收。10 月 2 日的五次真实订阅任务、性能及视觉输入质量证据不重复扩张为本轮已验证。现有工程修正可以保留，产品仍不能声称已经闭合真实图片制作循环。

## 历史：2026-10-02 V1 工程集成记录

**当时结果：INCONCLUSIVE — V1 尚未完成。** 用户当时要求继续完整 V1 和英文界面；以下保留当时的实现范围、失败与验收限制，后续语义和 runtime 政策以本页 2026-10-05 记录及 ADR-015 为准。

## 历史工程实现与证据边界（2026-10-02）

当前仍为 unborn `main`、无 HEAD，未提交/未发布；不能填写不存在的 Git revision。root 负责共享 schema、服务/API、集成决定和最终 acceptance；worker 分别交付原生路线调查与受限视觉输入、研究读取与性能夹具、英文浏览器界面、Skill/备份及独立 HTTP 测试。本页由 root 汇总收到及亲自复核的证据，区分阶段测试、最终回归及真实任务。取舍见 [ADR-014](../architecture/decisions.md#adr-014--v1-沿用本地领域模型扩展版本化创作与受限视觉输入)，启动及恢复见[根 README](../../README.md)。

| 既有要求 | 已实施并有工程证据的范围 | 尚不能推出的结论 |
|---|---|---|
| FR-01/04/05/19；T-01/06/30/35 | schema v1→v2 迁移保留原 payload/作品；项目、set 和创意归档；Paid/Organic 版本 brief；独立手工创意和 1～12 批量构思；同一固定版本可收藏并关联多个 set；原因与发布记录分开保存；新增引用有同项目外键及服务校验；另有真实订阅六创意及重启续作证据 | 尚未证明两个真实品牌各完成 Paid/Organic 图片生产及完整质量演示；合成项目的手工 set/采用不等于用户采用 |
| FR-02/06/08/20；T-03/04/24/32/33/34 | 文本/Markdown 表单导入与确认版本；PNG/JPEG/WebP 完整解码后保存 PNG；真实视觉提取保存待确认草稿，真实 Reviewer 保留问题；当前事实、brief、Skill 与图片哈希进入任务快照；从已有 runtime 创意续作时提示确认事实已变化，旧 context 不改；图片采用/最终导出复验当前品牌与 brief | 真实调用使用合成图；自动发现任意事实冲突或真实品牌正确性未被证明；制作批准与原生图片调用预算仍未闭合 |
| FR-03/20；T-05/29/32/34 | 显式读取一个公共 URL 或手动保存观察；来源访问状态、日期、响应哈希/截断信息与推断分开；DNS 固定地址、逐跳重检、限时/限量且拒绝私网；洞察仅使用所选证据，版本/受众/反例/假设身份保存；日常创意只检索已有相关、未过期资料 | 自动化研究测试用受控传输；独立 HTTP 测试只验证私网拒绝及手工资料链路，不声称完成真实网页访问质量或广泛自动研究 |
| FR-07/08/09/10/11；T-08～14/23/24 | 本地导入图片、确定性视觉/headline/logo/CTA 模板、尺寸与字体/溢出检查；caption 独立新版本且图片哈希不变；Review 问题独立保存，阻断项须用户解释后解决；草稿与最终 ZIP 分开，最终包仅采用且仍有效的版本；图片库增加风格/采用状态筛选，创意可按 angle/theme 筛选 | 原生整图生成与自然语言图片编辑仍 **BLOCKED**；导入或本地合成不满足 AC-07。模板及 HTTP review 夹具不代表真实视觉质量或用户采用 |
| FR-12/06；T-07/15/16 | 全局不可变 Skill 包/本地目录导入；保留来源、声明版本、许可身份、全部文件哈希及检查结果；项目显式启用固定包；能力/权限不兼容时失败；脚本仅存储，既不执行也不作为方法指令；更新不修改已保存的选择快照 | 未声明第三方包可信或许可已核实；不是任意脚本执行平台。正常方法文本与所选资产读取是当前权限边界 |
| FR-13/14；NFR-01～05/08；T-17～22/25/27 | 固定 CLI 原生 ChatGPT 认证、拒绝 API 路线；tool-free 文本及显式 PNG 输入；临时副本清理、能力快照、unknown 用量；任务先持久化，重复请求不再派发；暂停阻止新任务；取消及迟到结果保留请求记录，迟到作品不自动采用/下游执行；结果未知不重试，已收到输出只重试本地归档 | 本机 CLI 的 loopback dummy transport 证明协议/隔离局部行为，未调用真实模型；完整原生图片恢复、费用控制与任务链路不能由文本结果替代 |
| FR-15/19/20；T-23/29～36 | concept/asset/set/style/brand/project 反馈按显式范围保存并检索；收藏、采用、拒绝和手动发布分开；旧作品/证据/洞察版本与跨 set 引用保留；不把收藏或模型洞察改成已确认品牌事实/营销效果 | 相关性目前为有界关键词与作用范围筛选；长期增益、用户判断和复杂冲突的质量仍未验证 |
| FR-16/11；T-14/26/36 | 单项目私有 ZIP 备份保存版本、任务、收藏理由、洞察/证据及 set 链接、已用历史 Skill 版本与全部所需文件；恢复先校验 schema/列/ID/同项目引用/路径/哈希，再写新目录；对比 raw rows、快照与文件哈希一致，归档状态保持；排除其他项目、settings、凭证及 runtime 临时文件 | 恢复不合并当前工作区；需按 README 重新指定数据目录启动。64 MiB 压缩/展开总量、20 MiB 单条目、512 条目、10,000 行是明确上限，不是生产规模承诺 |
| NFR-06 | 产品导航、表单、状态和错误已转换英文；HTTP 测试中中文构思、caption 和导出保持编码，内容语言独立于 UI；实际桌面/390px 界面、重启后历史/Studio/Review/context 通过操作检查，新的浏览器会话 console 无错误/警告 | 中文真实模型生成尚未在本次五调用中重复；合成资料的可用性检查不等于长期用户质量评价 |

## 已运行的定向工程验证

下列先保留阶段结果；文件随后仍有受控修复。**不将不同阶段的数量相加作为最终 suite 总数**。完成循环恢复、检索及两层 receipt 修复后，root 运行完整 `npm test`：**84/84 PASS，78 个顶层测试加 6 个嵌套 lineage 用例，0 fail / 0 skip，11.72 秒**。显式指定已安装的固定 CLI 路径；含原生进程 dummy transport/视觉隔离检查，不调用 provider。完整输出在 `.workbench/v1-final-tests.log`，SHA-256 `4758de8d9d8752ebf90594fdc02c1c2a50981439e3899cb0e6fec877177cd4a9`。前端后续只按实际受影响范围做语法/浏览器复核。测试数据都是合成资料；模型均为显式 double，不能替代下节真实五调用或用户质量评价。

| 日期 / 范围 | 命令或证据 | 观察与限制 |
|---|---|---|
| 2026-10-02 领域/HTTP/Skill/备份/研究阶段回归 | root 汇报的 `node --experimental-sqlite --test` 定向集合：`tests/domain.test.mjs`、`tests/http.test.mjs`、`tests/v1.test.mjs`、`tests/skills.test.mjs`、`tests/backup.test.mjs`、`tests/research.test.mjs` | 该阶段 50 项通过。V1 领域测试随后扩展，故此数只记录那次运行，不是当前最终总数 |
| 2026-10-02 Skill 与备份 worker 定向验证 | `node --experimental-sqlite --test tests/backup.test.mjs tests/skills.test.mjs` | 18/18 PASS、无 skip；不可变包与无脚本执行、目录/上传路径/链接攻击、能力/权限拒绝、跨项目绑定；完整 raw-row/file-hash 恢复、历史未绑定 Skill、活动任务拒绝备份、ZIP 路径/碰撞/伪造展开量/篡改/已有目录拒绝。与上一集合有重叠 |
| 2026-10-02 新公共 API 集成 | `node --experimental-sqlite --test tests/v1-http.test.mjs` | 5/5 PASS、无 skip。两项目；证据→独立洞察→六创意→Paid/Organic 复用；Skill 快照；图片导入→草稿提取→显式确认→Review 阻断/用户解决→采用/成品；caption 不调用模型；中文下载；备份恢复快照/文件一致；归档；暂停/取消/迟到结果/重复请求；新路由跨项目 ID、CSRF/Origin 与 loopback SSRF 零连接。所有模型输出明确为 double |
| 2026-10-02 runtime 与图片门禁 | root 汇报 `tests/runtime.test.mjs`、`tests/runtime-image.test.mjs` 的定向结果 | 16 项通过；含已安装固定 CLI 对 loopback dummy transport 的真实进程测试及 PNG 传递，验证无宿主工具/环境 Skill、无盲目重试；不调用 provider。图片门禁在准备文件或发起 native 请求前拒绝，健康文本认证不等于图片能力可用 |

此次已复现并修复的具体错误保留如下，不以“测试全绿”掩盖其发生：

| RED → GREEN 问题 | 修复后的不变量与对应证据 |
|---|---|
| Review 可被输入中的另一个 set/source 覆盖 | 指定图片的 set/idea 必须一致，否则失败；`tests/v1.test.mjs` 的 review-context 回归及 HTTP 跨项目负例 |
| 指定图片的 asset 范围反馈未被选入 Review context | 依据当前 asset ID 纳入对应反馈，其他资产范围不扩大；review-context 回归 |
| 洞察响应重复引用同一证据导致唯一链接冲突，停在 archiving | 验证后证据 ID 去重，保持内容/证据归属并能完成归档；duplicate-insight-citations 回归 |
| 异步完成覆盖取消请求时间 | 完成/失败前从持久记录合并 `cancelRequestedAt`；领域取消与 HTTP 取消/迟到成功回归，均无自动再派发 |
| 第二个服务在取得目录锁之前迁移现有数据库 | 先取得数据根锁，锁失败不得迁移；`a rejected second service cannot migrate a database owned by a live process` 回归 |
| 品牌事实已有确认版本时，修订草稿的 Confirm 按钮被抑制 | UI 以该草稿是否已有确认后继判断，允许新草稿显式确认；browser worker 已修复，最终浏览器操作证据由 root 追加 |
| 合法外键但循环 parent/previous 的备份能够恢复，续作遍历可无限循环 | 备份在创建目标前统一检查六种同表版本链无环；context 对循环/缺祖先明确 `invalid_lineage`，零 runtime 提交；先观察六组 restore 回归 RED，再通过定向 suite |
| runtime 已返回用量，但领域输出验证失败后用量变 unknown | 在领域验证前保留实际 receipt、usage 和图片转换记录；invalid-provider-reference 用例先观察 null 与已知用量不符，再修复通过 |
| 更早的 runtime JSON/schema 校验拒绝也会丢弃 completed-turn 用量 | adapter 只在已观察 `turn.completed` 后附带结构化 error.receipt，service 持久保存已知用量/出处及自有图片转换记录；无 completed 事件不伪造 receipt，unknown 仍为 null。JSON/schema/完成后非零退出及 service 边界均有 RED→GREEN 证据；不归档被拒内容，不重试 |
| 无关来源仅因通用指令词 `use` 被检索 | 扩展英语功能词/任务指令停用词；具体负例先 RED 后 GREEN。实际第五次记录保留，不回写历史；最终只读重建排除 Example Domain，并继续纳入原反馈与洞察 |

## 原生图片门槛：BLOCKED，未发出真实生图调用

2026-10-02 的路线调查发现 `image_gen.imagegen` 工具存在以及 app-server `imageGeneration` 结果形状，但没有通过**单次图片调用硬上限**与**仅允许已选参考图的路径隔离**。公开 hook 实现对执行/解析失败可放行；公开源码 revision 不能冒充本机二进制 revision。当前 [图片 adapter](../../src/runtime-image.mjs) 明确区分 native 连接状态与图片能力，generate/edit/reference 均不可用；`generate()` 在 inspect、文件准备或进程提交前即返回 `unsupported_capability`，没有 API/其他 runtime 降级。

路线调查所记录的依据是 [OpenAI 图片能力说明](https://learn.chatgpt.com/docs/image-generation)、固定公开 revision `ca466061d64f0b44f416135c7fd06aa7af850bbc` 的[参考路径实现](https://github.com/openai/codex/blob/ca466061d64f0b44f416135c7fd06aa7af850bbc/codex-rs/ext/image-generation/src/tool.rs)及[hook 失败行为](https://github.com/openai/codex/blob/ca466061d64f0b44f416135c7fd06aa7af850bbc/codex-rs/hooks/src/events/pre_tool_use.rs)。可控粒度和实装隔离仍需真实端到端探测：**live image attempts = 0，accepted native image probes = 0**。AC-07、自然语言图片编辑的 AC-08、完整两模式 AC-09 与 M0 不能记录 PASS。

受限视觉输入是另一条能力：应用最多选择 8 张图并制作不放大的 1024×1024 内 PNG 副本，保存原图/提交图哈希和转换政策，用于文本创意、草稿提取、Reviewer；它不等于生图或图片编辑。小字/细节受缩小影响，真实准确性仍需检验。

## NFR-07 / T-28 后端性能局部证据

私有报告 `.workbench/v1-benchmark/backend-20261002-1.json`，记录时间 `2026-10-02T13:51:37.092Z`，SHA-256 `1798c5b7e82c97622ec692a962689309f4cd678977774f5567d5e9032ffb64f7`。报告所在目录已被 Git 忽略，原始样本及各源文件哈希保留在报告；本节只存脱敏测量摘要。执行入口为 `node --experimental-sqlite tools/benchmark-local.mjs`。

- 环境：Windows `10.0.26200` x64、Intel Core 7 150U、12 logical CPUs、约 15.66 GiB RAM；Node `22.15.0`、SQLite `3.49.1`、sharp `0.35.5`。
- 两个隔离项目分别实际导入 1,000 和 1 张 1×1 PNG；每张均经过 `AssetService.import`、解码、文件校验与 SQLite 持久化。不是凭空插入资产计数。重复微型合成图片只检验元数据量，不代表真实图片解码/浏览器负载。
- 每项目预热 5 次，每指标 50 个样本；计时为 loopback HTTP 发起至响应传输和 JSON parse 完成，nearest-rank p95。主项目 snapshot p95 **62.273 ms**；交替切换回主项目 p95 **58.018 ms**。provider calls = 0，native inspections = 0；独立夹具运行后已清理。
- 报告判定为 backend PASS、browser **NOT_RUN**、overall NFR-07 **NOT_ACCEPTED**。尚未测量 DOM 渲染、缩略图载入及浏览器实际切换，不能将后端小于 1 秒写成完整 NFR-07 通过。代码后续变化亦需 root 判断哪些测量前提需要重验。

上述 NOT_RUN 是后端报告当时的边界。后续真实 Chrome 检查保留了一次无可用样本的 harness timeout：长调用通过 npm 子进程启动 CLI，Windows 终止 npm 后子进程仍持有输出管道；已停止该任务的进程/浏览器并清理独立夹具，失败记录 `output/playwright/v1-benchmark-browser/run-N7qZTc/failure.json`。改为直接调用缓存中的固定 CLI、分批持久化后，取得 **10 个测量样本、3 轮预热** 的稳定源码基线，provider calls = 0。

基线报告 `.workbench/v1-benchmark-browser/browser-2026-10-02T14-39-13-579Z.json`，SHA-256 `b1c3f060786cd8d397c4b58b97a2d45a412918a1ed49a164e3a7c97dd898894c`。主项目实际导入 1,000 张 PNG，同时渲染 1,000 library + 1,000 Studio cards；p95 项目切换 **2,384.2 ms**、图片列表 **4,523.5 ms**、Studio **4,401.4 ms**，均超过 1,000 ms，明确 **FAIL**。原始逐对样本、截图和当时 public 源码保留在 `output/playwright/v1-benchmark-browser/run-tq1pUV`；源码在测量期间不变。该结果驱动可见视图延迟渲染与 50 张/页的修复，不能仅通过修改判定来获得 PASS。

复验前明确测量方式：NFR-07 判定单次项目切换或列表显示操作；跨多个按钮的 switch→Knowledge→Images 总时长继续列为诊断，不能与单次操作阈值混用。基线列表包含 driver 操作/滚动开销；复验同时明确事件开始、可见缩略图解码与两次绘制帧的边界。保留方法差异，不用不同计时口径计算宣称的加速倍数；需独立验证仍能访问全部 1,000 项，而非删减夹具。

最终复验 **PASS（该合成夹具范围）**：Chrome `153.0.8010.54` headless，1440×1000，同一 Windows/CPU/Node 条件，3 轮预热后每目的项目 **30 个样本**，源码全程不变。主项目 p95 切换 **546.3 ms**、图片列表 **171.5 ms**、Studio **780.1 ms**；次项目分别为 504.3 / 77.7 / 205.8 ms，均小于 1 秒。含 driver 的主列表/Studio 诊断为 367.8 / 851.4 ms，完整 switch→library 为 922.9 ms。每次主项目样本检查真实总数 1,000、当前页 50 个精确 asset IDs，并完成 viewport 中 3 个 library / 2 个 Studio 缩略图解码与两帧绘制；两个表面另经真实 UI 验证第 2 页、第 20 页和返回第 1 页的精确身份。

报告 `.workbench/v1-benchmark-browser/browser-2026-10-02T14-51-24-660Z.json`，SHA-256 `7497577626799b38fa1fd492eec26b1209ae3baf7cc15a393336f61f34da6b62`。逐对样本、分页核验、截图及清理确认在 `output/playwright/v1-benchmark-browser/run-5S6sNP`。provider calls = 0，专用浏览器/服务已关闭、夹具已移除。后端及浏览器共同支持这台机器的合成 1,000 资产本地操作门槛；图片仍为重复微型 PNG，真实大图解码、冷盘、长历史内存压力和其他机器不在该结论内，不宣称完整 V1 质量通过。

## root 实际任务、跨会话与交付证据

2026-10-02 在独立 `.workbench/v1-acceptance`、端口 4058 完成预先限定的 **5/5 原生订阅文本/视觉任务**，无失败、无重抽；原生生图/编辑调用仍为 **0**。Codex `0.159.0-alpha.12.1`，ChatGPT 原生认证，5 个独立 ephemeral thread、工具列表均为空；model 是 runtime-default，runtime 未报告具体 model 名称，额度与金额保持 unknown。配置基线 SHA-256 `9fd87dca3226f1caff85f444379b69d622f085dfd3b6d613b84b29ee7bb479d6`，实际隔离配置 `5e7095d26836da79b9ee7de892f5cc869d0371e1beb535caa35f62b6d51c8ec4`。应用内置创意方法 v2；项目启用的合成方法包固定内容哈希 `d2b68b0e1fb31a57342476f3f8b132ffd1aed13d65e2fb6c615b8e8b43b9c95f`。

| 真实调用 | 结果与实际分母 | 已报告 input / output tokens |
|---|---|---|
| 六创意构思 | 英文 UI 创建项目/确认合成品牌事实后点击生成；6 个不同角度全部归档 | 5,332 / 1,395 |
| 洞察整理 | 仅所选虚构阅读日记；输出明确为假设，保留反例及“非真实研究”限制 | 5,434 / 201 |
| logo 视觉提取 | 一张实际 PNG 输入；识别橙色书本形状、无可见文字；仅保存 draft，未自动确认 | 7,304 / 153 |
| 独立图片 Review | 3 张实际输入（海报/logo/参考图）；正确读出 headline/CTA，2 个文案 warning、1 个 logo 细节 unable_to_judge | 10,998 / 402 |
| 服务重启后的续作 | 新服务/新 thread 从持久事实、brief、原稿、反馈及洞察生成第 7 个创意版本 | 9,687 / 510 |

合计 input **38,755** / output **2,661** tokens；这些是 runtime 返回的计数，不换算费用。原始报告 `.workbench/v1-live-report.json`，SHA-256 `f5e1b5ee6912875ad39d754d4200392482afc489f9f7ddfd5270ceed35adb744`；含每次 input/context/hash、时间、图片副本政策与哈希、全部结果和实际局限。Git 仅保留此摘要，私有项目/备份/会话不加入版本控制。

跨次检验：重启前 4 个任务全部终态，记录完整 snapshot；重启后调用前逐项 JSON 完全一致。第五次新请求只有 “Develop another short reading-club caption for this project.”，没有重述之前的措辞/问题要求。实际新文案包含 **“a page-sized pause”**，以 **“which book would you pick?”** 收尾，并加入洞察中的 **“stop there if you wish”**。manifest 与作品引用共同包含原稿、范围反馈和假设洞察；作品 rationale 说明三者的具体用法。旧知识、6 个原创意、4 次原运行、证据、brief、资产、Review 及反馈逐项不变，文件哈希复核一致。第二项目 marker 不进入 context；无关 fern 资料在第五次被排除。

保留负面证据：词法检索在第四次因共有 `synthetic` 字样选入了无关 fern 资料；第五次曾因通用词 `use` 选入 Example Domain，作品未引用它。后者已用回归修复并只读重建验证，旧 manifest 保持原样；前者表明词法相关性仍可能出现误召回，不能宣称语义理解或长期质量门槛通过。

Review 的阻断处理与采用是**合成工程测试操作者行为**，不冒充用户质量评分：先尝试采用得到 HTTP 409 `adoption_blocked`；用原图逐像素比较海报 logo 区域与记录的 contain 缩放/背景合成结果，12,960 个 RGBA 像素完全一致，再保存明确说明的人工解决记录。通过英文 UI 采用测试版本，2 个 warning 仍保留。最终 ZIP 恰含 PNG、caption TXT、最小 manifest 三项，两种内容哈希一致，无内部上下文/研究。成品 ZIP SHA-256 `2daa8192938439488b5eb20191b61b8f59859b16d167948525caa0055ba8a51d`。私有验证 helper 首次误将 Uint8Array 作为对象而非字节求哈希，修正为 Buffer 后通过；这不是产品文件被篡改，失败未删改记录。

公共来源只显式读取一次 `https://example.org/`：2026-10-02T14:17:51.470Z 返回 201，保存真实摘录、retrieved 状态、空推断及响应 SHA-256 `7d3e61f8f627c8cc640c209ba0777db95f198a64e766f47484c321d5eb5e0962`。这证明有界真实读取链路，不证明市场研究质量；没有搜索或自动爬取。

私有备份由真实五任务项目经 API 下载并恢复到新的独立目录；**21 张允许表的所有 raw rows、11 个文件哈希一致**，仅一个项目，foreign_key_check 无错误，另一项目/凭证/settings 未纳入。保留了 7 创意、5 runs、2 sets/briefs、3 图片、洞察及证据、收藏理由、Review/解决/采用、范围反馈与固定 Skill。备份 SHA-256 `0784389bd95ea39886ab5781abc19120d44f8600df82412135af47ec967e7765`；私有比对记录 `.workbench/v1-backup-check.json`。

英文浏览器检查：桌面 1280px 与移动 390px；项目/Knowledge/品牌修订草稿比较、图像库筛选、Paid/Organic brief、Studio 图片/血缘/Review/采用、saved context/Skill/用量、移动合成表单及取消。最终新会话 console **0 errors / 0 warnings**；服务重启前旧会话收到预期 401 并明确提示重新打开，未产生应用异常。增加原 PNG 打开链接，修正 warning.reason 和结构化 context 的可读显示。截图保存在忽略目录 `output/playwright/`：`ui-studio-reviewed-final.png`、`ui-context-final.png`、`ui-compose-mobile.png`；root 已查看 Studio 与移动表单。

性能修复后又在真实 3 图片/1 Studio 图片的五任务项目做浏览器 smoke：Ideas 不预渲染隐藏图像表面，页码/总数/asset IDs 正确，console 无错误；截图 `ui-studio-pagination.png`。中断请求时间在终态仍显示，迟到成功明确说明仅保存、未自动采用/执行后续任务。最终服务重启后五任务完整 snapshot 与 `.workbench/v1-final-state.json` 再次逐项一致，没有新增 provider 调用。

最终源码证据：仍为 unborn `main`、无 HEAD，相关 29 个源文件/测试/工具/能力/锁定依赖文件的逐文件哈希保存在 `.workbench/v1-source-manifest.json`；聚合 SHA-256 **`df9da3caa4c816812647e9256f20ef1fb91240b5c9db7b5e1a2efae2829a435e`**。未 commit、push 或公开发布；`.workbench`、浏览器截图/记录、node_modules 均被 Git 忽略。仅保留端口 4058 的最终合成项目预览供检查；1000 图片基准服务已清理，历史 v0.1 数据未迁移或覆盖。完整 V1 仍因下述图片路线、真实质量评价及发布输入保持 INCONCLUSIVE。

完整 V1 仍保持 INCONCLUSIVE：原生图片控制边界未通过；没有真实两品牌完整制作与定向修改链路；12 brief 的旧流程基线、配对主动时间、用户视觉/可采用性评分、多角色对照的适用预算及执行证据未齐；源码许可证仍待用户决定。[第三方说明](../../THIRD_PARTY.md)不代替本项目许可证。以下历史矩阵及原质量门槛继续保留，不因当前工程增量下调门槛或把未完成项删掉。

## 开工审计（历史）：范围、起点与证据边界

执行范围为 [PRD](prd-v0.1.md) 的 FR-01～FR-16、FR-19～FR-20、NFR 与 V1 发布条件；FR-17/18 及可视化 mask、自动发布、云端/多租户等既有 P1/排除项仍不进入本轮。NFR-06 的英文界面来自最新用户请求，生成内容语言独立设置。[评测协议](evaluation.md)、[路线图](roadmap.md)、[领域契约](../architecture/domain-and-memory.md)、[Provider 契约](../architecture/provider-contract.md)与既有 ADR 继续按适用范围使用；v0.1 的停止措辞仅保留为历史阶段证据。

开始时为 `C:\Users\zhuzh\dev\3rd-draft`，unborn `main`，无 HEAD，全部产品源码和文档尚未跟踪；无 staged/unstaged 已跟踪差异。此次不推定 Git 交付、公开发布、收费 API 或客户外部操作授权。真实品牌资料、运行时会话、凭证和原始项目资产不得加入 Git。

可复用事实：v0.1 验证了两个隔离项目的文字生成、确认知识、相关 context、固定创意版本、收藏、作用于原稿及续作的反馈、Markdown 归档、实际原生订阅调用、重启与若干失败边界。20 项工程测试和 2/2 实际生成的环境/源码指纹见 [v0.1 记录](validation-v0.1.md)；这是历史证据，不是新增 V1 运行结果。

初始源码为 `src/store.mjs` 的 projects/knowledge/runs/concepts/favorites/feedback 六表，`src/context.mjs` 的关键词及作用范围筛选，`src/service.mjs` 的单文本任务与归档恢复，`src/runtime.mjs` 的固定 CLI、tool-free 原生文本路线，`src/server.mjs` 的本地 HTTP，`public/` 的文字工作台。开工时没有完整 set/brief、Source/Evidence/Insight、ProductionSnapshot/Approval/AssetVersion/Review/Publication 或备份实体。开工时的 `concepts.run_id UNIQUE` 只允许每次运行产生一个概念；批量构思需兼容迁移，不应复制造出第二套 IdeaVersion 真相。

## 开工 FR / AC 差距矩阵（历史）

下面“已有”及 NOT_RUN 均描述本轮开工检查到的 v0.1 起点，不是当前实现清单；当前增量和证据见前文。保留初始差距是为了说明实际补齐了什么，不用描述性文字代替运行，也不把局部测试扩大为完整 AC 通过。

| FR / AC | 已有起点 | 完整 V1 尚缺能力或验证 | 主要 T / 证据 |
|---|---|---|---|
| FR-01 / AC-01 | 创建/切换项目，数据与创意 ID 隔离 | 项目归档；项目 skills、sets、图片/临时文件的全链路隔离与历史保留 | T-01/02/35；两项目负例与归档后历史 |
| FR-02 / AC-02 | 手工文字草稿、显式确认、不可变知识版本 | 文本/Markdown 和 PNG/JPEG/WebP 导入；AI 提取为草稿；Brand Pack 组合、事实来源/范围、冲突提案及过期影响 | T-03/04/24/32；确认不能由模型执行 |
| FR-03 / AC-03 | 手工 reference 记录与关键词复用 | 用户手动启动独立研究；来源/访问时间/观察/推断/失败身份；稳定证据版本；无隐式研究 | T-05/29；真实来源访问证据 |
| FR-04 / AC-04 | goal 与 language 两字段 | Paid/Organic 完整 brief、版本、必填/明确不适用、禁用承诺与资产引用 | T-06；两种模式各自完整输入 |
| FR-05 / AC-05 | 每次一个创意，可续作与收藏 | 默认 6、可选 1～12 概念并全部保存；手动创建/修改/拒绝/相似方案；选定方向关联 set，只制作所选 | T-06/30/31；选择前零图片调用 |
| FR-06 / AC-06 | 文字 context/能力哈希与快照 | Brand Pack/brief/Skill/参考资产完整固定版本；能力检查；批准绑定输入哈希/路线/预算，变更使批准失效 | T-07/16/24/33；旧批准不可复用 |
| FR-07 / AC-07 | 实际订阅文字结果及 Markdown 归档 | 经验证的原生参考图生成路线；真实文件类型/尺寸/解码/路径校验；caption 独立版本 | T-08；M0 图片文件、哈希和路线实测 |
| FR-08 / AC-08 | 文字续作保留前稿 | 自然语言定向图片编辑、变体、旧图保留；caption 只改文案；风格修改不研究；brief 下游过期提示 | T-09/10/24/33；调用计数及前后图像检查 |
| FR-09 / AC-09 | 无图像制作模式 | 整体生成与一个确定性分层模板；精确 headline/logo/CTA；缺字体、溢出、裁切检查及制作血缘 | T-11；两种制作方式与真实输出 |
| FR-10 / AC-10 | 结构化输出/引用校验，未有采用状态 | 机器图像检查；独立 Reviewer 问题；用户最终采用；阻断问题处理；草稿/最终导出区分 | T-03/12/24；模型不能清除阻断项 |
| FR-11 / AC-11 | 项目创意列表、Markdown 下载与 context 血缘 | set/angle/style/adoption 筛选；图文与精简 manifest 成品包；离线历史查询和内部隐私排除 | T-13/14/36；包内容与引用比对 |
| FR-12 / AC-12 | 一个随应用固定 hash 的能力 | SKILL.md 包/目录受控导入、来源/版本/权限展示、项目启用白名单、能力匹配与更新不改在途版本；导入不执行脚本 | T-07/15/16；越界包与在途更新 |
| FR-13 / AC-13 | 原生认证/版本/route/usage；拒绝 API 路线 | 能力测试时间与多能力状态；配额不足持久等待；图片调用与用量/预算真实控制粒度 | T-17/27；无静默 API 请求 |
| FR-14 / AC-14 | 浏览器关闭仍运行；重启结果未知；归档恢复；请求去重 | 暂停/取消、排队与持久步骤/attempt、租约/过期回报、对账、迟到产物隔离；成功步骤不重跑 | T-18～T-22；受控失败加实际 adapter 关键路径 |
| FR-15 / AC-15 | concept/project 反馈，收藏独立 | asset/set/style/brand 明确作用范围；收藏/采用/拒绝原因；angle/theme 覆盖与手动发布记录，状态不混用 | T-23/34；局部反馈不变全局事实 |
| FR-16 / AC-16 | 无备份/恢复 | 一致性私有备份、schema/hash manifest、恢复至新目录；完整知识/版本/资产/任务/独立创意/收藏/洞察及跨 set 引用；无凭证 | T-14/26/36；实际恢复逐项比对 |
| FR-19 / AC-19 | 固定创意收藏、取消不删、重启续作及源版本引用 | 手动创意、收藏原因、同一版本多个 set、已使用与收藏并存、独立创意归档、当前事实检查和新批准 | T-30/31/33/35/36；历史引用不可换版 |
| FR-20 / AC-20 | 有界关键词相关性、事实/参考/前作/反馈区分 | 独立 Insight/InsightVersion、证据及反例、受众/时效/范围筛选、冲突提示、旧引用保留与洞察任务 | T-29/32/34/35/36；不从收藏推导效果 |

FR-17/18：DEFERRED（既有 P1），不降低任何上述 P0 条件。

## 开工 NFR 与工程场景状态（历史）

| 条目 | 已有证据 | V1 仍需完成/复验 |
|---|---|---|
| NFR-01 | v0.1 文字项目/路径/thread 隔离局部通过 | Source/Insight/set/Skill/图片/备份/缓存与新工具路径；所有跨项目 ID 拒绝 |
| NFR-02 | loopback、Host/Origin/会话/CSRF 与静态路径负例 | 新导入、导出、研究 URL 与图片 endpoint 继承边界；日志/包中无凭证 |
| NFR-03 | attempt 先持久化、已校验文字归档、事务回滚恢复 | 图像落盘、DB 关联、重复/过期事件、取消迟到及磁盘故障 |
| NFR-04 | 用户确认事实；文本 adapter 不切 API | 输入快照/预算/制作批准/最终采用全部由服务控制 |
| NFR-05 | 重启后新 native session 从应用记忆续作 | 全部 V1 set/资产/备份与各任务都不依赖 provider 聊天历史 |
| NFR-06 | 历史中文界面已测，UTF-8 分块回归已有 | 英文产品界面待验；英文 UI 下分别生成、编辑与导出中英文内容 |
| NFR-07 | 尚无 1,000 资产计时 | 记录硬件/夹具与查询方法，项目切换/列表 p95 ≤ 1 秒，模型时长单列 |
| NFR-08 | 文字 token usage、unknown 与路线显示 | 每次图片/研究尝试的可用计数/费用/额度及 enforcement 粒度；不得伪造 0 |

| T 场景 | 开工时已有证据与剩余差距 | 完整 V1 状态 |
|---|---|---|
| T-01/02 | 文字概念/导出及独立 runtime session 部分通过；资产/检索/新任务边界待验 | NOT_RUN |
| T-03/04 | 普通文字确认版本部分通过；图片抽取、品牌冲突提案未实现 | NOT_RUN |
| T-05 | 无实际研究来源访问/失效处理 | NOT_RUN |
| T-06 | 无 Paid/Organic set 与多候选选择链路 | NOT_RUN |
| T-07/15/16 | 仅内置能力，无外部 Skill 导入/能力/更新生命周期 | NOT_RUN |
| T-08～T-12 | 尚无图像生成、定向修改、模板、Review 采用链路 | NOT_RUN |
| T-13/14 | Markdown 文件哈希通过；图文 manifest/成品隐私/完整备份待验 | NOT_RUN |
| T-17 | adapter 配额错误与 API 拒绝部分测试；产品等待状态待实现 | NOT_RUN |
| T-18 | 文字关闭浏览器继续运行已有真实证据；新增生产任务需验 | NOT_RUN |
| T-19/20/21/22 | 文字断流/未知/本地归档回滚已有局部测试；图片对账、租约事件、取消迟到待验 | NOT_RUN |
| T-23/24 | concept 反馈范围已有；资产反馈与事实变更影响/批准过期待验 | NOT_RUN |
| T-25 | 基础 Host/Origin/CSRF 已通过；研究 URL SSRF 与导入新路径待验 | NOT_RUN |
| T-26 | 无完整备份恢复 | NOT_RUN |
| T-27 | 文字 unknown/route 已有；图片等新路线与 UI 展示待验 | NOT_RUN |
| T-28 | 无 1,000 资产性能证据 | NOT_RUN |
| T-29 | 无隐式研究符合当前文本链路；手动研究/洞察任务尚缺 | NOT_RUN |
| T-30 | 收藏/取消保留单创意已有；六候选无 set 批量保存待实现 | NOT_RUN |
| T-31 | 单创意收藏重启续作已有；另一个收藏、多 set 和选中制作待验 | NOT_RUN |
| T-32 | 知识版本不可变已有；洞察版本、冲突与旧引用待实现 | NOT_RUN |
| T-33 | 没有价格变化影响、制作批准与旧收藏重新检查 | NOT_RUN |
| T-34 | 文字关键词/范围筛选已有；多受众、时效、相反反馈与完整洞察夹具待验 | NOT_RUN |
| T-35 | 单创意跨项目负例已有；Favorite/Insight/set 归档组合待验 | NOT_RUN |
| T-36 | 无完整备份、跨 set/洞察、成品内部记录排除证据 | NOT_RUN |

## 开工时的最小连贯实现切片与依赖（历史）

沿用 B 编号，不新建任务登记体系。root 维护共享 schema、API、依赖与最终验收；当前 runtime worker 只探测受控原生图片路线，UI worker 转换英文界面，本页审计 worker 只改获分配文档。后续 ownership 由 root 明确，避免并行改同一数据模型。

1. **界面与能力边界（NFR-06、B-01/02）**：先交付英文文案和错误显示；并行试验原生参考图、生成/编辑/回收及最小工具白名单。不因图片需求放开现有全部宿主工具；实际 adapter 安全性失败时保留阻断证据，继续本地领域工作。
2. **兼容数据模型与导入（B-03/04/15）**：迁移现有数据并保留旧版本；形成项目归档、导入资产、Brand Pack、独立 CreativeIdea/ConceptVersion、Favorite、brief/set 关联。解除单 run 单概念约束时有批量原子归档与重复完成保障。
3. **手动知识任务与构思（B-05/16/06）**：Source/Evidence 和 Insight 版本由用户明确任务产生；批量构思和所选方向发展复用相关记忆；不自动串起研究/洞察/制作。
4. **生产与质量控制（B-07/08/09/10）**：固定输入、项目 Skill、能力与预算批准；一条真实图像路线和一个基础分层模板；独立 caption、定向编辑、Review 阻断项与用户采用。执行失败不变成模型自评成功。
5. **交付与可靠性（B-11/12）**：成品包与私有备份分离；新目录恢复；用户暂停/取消、对账/未知、迟到产物、步骤去重。以上持久状态基础应随前序切片建设，不能最后补假恢复。
6. **完整验收与发布准备（B-13/14）**：全部 AC/NFR/T、两项目各 Paid 与 Organic、跨次收藏/洞察/备份；真实 12 brief 配对评测和用户评分；安装/恢复/许可。缺输入时报告 INCONCLUSIVE，不将合成素材冒充真实质量基线。

## 产品输入与验收依赖

这些是既有 O/R 项的具体输入，不是新的审批系统。先完成能独立完成的工程、夹具和评审材料；只有实际依赖输入的结论保持未完成。

| 既有项 | 缺口 | 可继续的工作与不能替代的证据 |
|---|---|---|
| O-03、R-02 | 两个真实品牌的授权参考图、确认事实/禁用承诺、旧流程作品；至少一个无完整 design system | 可用合成项目完成工程与 M0 探测；不能据此证明真实品牌可用率/视觉质量 |
| O-03、B-13 | 同一 12 brief 的手工 A 路径成果及可靠主动操作计时 | 可准备固定 brief、评分表和计时记录；历史图片无计时不能混入 30% 节省率分母 |
| B-13、评测协议 | 用户对可采用性、视觉量表、修改保持内容的实际评分 | root/worker 可查契约和明显错误；不能伪造用户接受，也不能只用模型自评替代 |
| O-04、Provider 契约 | 图片真实路线、执行配置、测试项目和可接受调用/时长范围；完整对照及多角色实验范围 | 使用明确有界的已授权试验；每条路线记录实际可控粒度，不能静默 BYOK 或无限重抽 |
| O-02、R-10 | 源码 license 的明确选择与第三方素材/字体可分发依据 | 可开发和本地测试、准备归属清单；不能自行声称已有开源许可或发布未经授权素材 |
| O-05/06 | 图片及合成依赖的 Windows 组合、字体与模板 | 先验证一个合法可用模板及实际编码/溢出/字体行为；不能用“已安装”替代产物检查 |

## V1 质量门槛与完成判定

沿用评测原分母与程序：12 个固定 brief = 2 项目 × Paid/Organic × 3 表达类别；每条路径每 brief 为 6 候选、1 次初始生成、最多 2 次定向修改；4 个高风险案例重复并单列。正式运行前固定样本、预算与门槛；不为通过而事后删失败或降低标准。

现有建议门槛不下调：可用交付至少 10/12 且不低于手工路径；配对视觉平均分不低于手工且类别不明显退步；可靠配对主动时间的中位数至少节省 30%；修改成功至少 80% 并报告分母；血缘完整 100%；未授权费用/跨项目访问 0；最终交付未确认承诺 0。用户最终采用与评分不可由模型补写。门槛的任何正式变更需用户决定并在评测前说明依据。

V1 只有在 FR-01～16/19/20 全 AC、NFR、M0～M3 退出证据、两项目各一套 Paid 和 Organic、T-29～36 跨次链路、完整质量评测、安装/恢复说明及许可证要求均完成后，才能记录 PASS。图片不可用、缺少真实基线/评分或无许可决定时分别记录限制，不能把“工程实现齐全”合并为“V1 已验收”。

## 新增运行与结论记录

| 日期 / 范围 | 命令或操作、环境、输入及版本 | 结果与失败/限制 |
|---|---|---|
| 2026-10-02 初始差距审计 | 读取现有 src/tests、PRD/ADR/契约和 v0.1 记录；未运行模型或新的工程测试 | V1 INCONCLUSIVE；上述缺口是开工时事实，不是最终实现状态 |

后续追加每次运行的日期、应用/runtime/adapter/Skill 版本、认证路线、输入材料哈希、配置/预算、全部尝试与失败、实际分母、unknown 用量、人工介入、用户评分、证据位置及下一步。原始项目数据和会话留在私有目录，Git 中只存脱敏摘要与哈希。root 汇总实际差异与知识影响，不因本页存在就宣称验收已发生。
