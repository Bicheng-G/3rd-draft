# v0.1 Walking Skeleton — 关闭标准与验证记录

**当前最终验收：PASS WITH NON-BLOCKING LIMITATIONS — RidePass 实际项目 dogfood 通过（2026-10-05，Asia/Singapore）。** 六项关闭标准都有当前实测或前提未变的复用证据；真实项目的已存创作判断在服务重启后的独立新任务中被选取，并影响新文案、视觉方向和原生归档图片。无 v0.1 blocker，无产品代码修复。仅关闭 v0.1 记忆闭环；完整 V1 未验收，本轮停止，不继续实施 V1。下面的 2026-10-02 结论及原记录保留历史身份。

## RidePass 最终 dogfood（2026-10-05）

### 范围、起点与预先固定的程序

用户明确要求用真实 RidePass 验收当前 Third Draft 的跨次记忆核心假设，允许最小必要修复，通过后更新文档、提交、保持工作树干净、展示图片并停止。不是重启完整 V1、发布或客户外部动作授权。开工分支 `codex/production-loop-feasibility`，完整 HEAD **`21b7014183d6d6d8117db8e05a632c2ea0e38c0e`**；staged/unstaged/untracked 均干净。经 `git diff 734b4b2413da154aa1a0ce273f8d93037dcd36f7 HEAD -- src tests capabilities package.json package-lock.json` 核对，当前实现与此前原生图片闭环受测代码一致。

先阅读产品边界、PRD、下方六项关闭标准、评测、领域/系统/Provider/Skill 契约、ADR-013/017、已有 v0.1/V1 证据及相关源码。沿用六项标准；中文界面要求已有 NFR-06 英文界面后继决定，native Skill containment 按 ADR-017 为 best effort，不恢复旧纯度门禁。历史文字记录末尾关于全局指令为空的限制只描述旧 runtime，不适用于当前应用独立 profile。

RidePass 材料来自只读本地仓库，clean `staging` **`870409e50dc16b397bb19645d30b3adfff7d6d80`**：README 的固定通勤定位、index.html 的公开表达与 FAQ 限定、DESIGN.md 的 Calm Commute Confidence，以及产品 authority index 对历史意图/已批准政策/运行证据的区分。没有 fetch 或生产访问，不声称远端最新或线上已符合所有政策。未修改 RidePass 仓库，也未导入客户、路线、支付或联系方式数据。

首个真实调用前在忽略的 `.workbench/ridepass-dogfood/protocol.json` 固定输入、程序、分母与判定，SHA-256 **`cdcba9ad5c5231c6c8da0ac06b76a7c2fda7f8426a1c0b53cbd26d93fd52985a`**。选择最小真实日常需要：一个 Monday rider introduction，再做另一个 midweek Organic post。每轮 1 个文字创意、1 次显式图片制作；不重证此前已成功的一次 Edit，不新增研究、Skill 包、Review 或第三个模型任务。

操作全部经过真实浏览器 UI：创建 RidePass 项目；保存有来源的产品描述/禁用承诺，明确确认后才使用；将受众痛点与设计方向保留为 reference/hypothesis；同时保存项目真实存在但与当前创作无关的 ERP POC 工程资料。第一轮创意和图片归档后，在该图片上保存明确 **project scope** 的判断：用乘客上车前、带工作包的日常步行瞬间表达安心感，让人而非汽车/豪华感成为主角，文案不作准时保证。判断是此次受托创作操作，不伪称既有客户研究、品牌产品事实或投放效果。

品牌确认及制作选择由受用户委托的 root 操作 UI；应用记录的 `createdBy=user` 表示用户命令入口，不能据此声称真人逐条点击、亲自审稿或最终采用。source 字段保留 delegated acceptance operator 身份；只是确认已有来源的描述，不新增 RidePass 产品政策。

读出完整首轮 checkpoint，确认已成功且无待归档任务后，停止实际服务进程并在同一数据根/独立应用 ChatGPT profile 重启。新进程的完整项目 snapshot 和文件哈希与 checkpoint 深度相等。第二轮从 **Independent ideas** 开始：`sourceConceptId=null`、`setId=null`、`imageIds=[]`，仅要求一个不同日常角度的 midweek post；没有重复上车前/工作包/豪华车等判断。第二个 set 的 brief 仅引用保存的新创意和视觉方向，图片 Additional direction 留空，也没有选择第一张图片作为参考。

### 已有证明与本次新增证明：六项关闭标准

编号、FR/AC/T 映射沿用下方原关闭标准，不把适用子集扩大成完整 AC 或 V1 通过。

| 项 | 本次前已证明、可以复用的证据 | RidePass 本次新证据 | v0.1 结果 |
|---|---|---|---|
| 1. 浏览器可用链路 | 历史双项目创建/切换/确认/归档；后继英文 UI 和 Studio Generate/Edit 已测 | UI 新建真实项目、录入/确认、预览、两个独立创意、两个 set 的选择/制作、图片反馈；重启后从 control 项目切回 RidePass，Knowledge → Images 可见两张产物。API/helper 仅验收读取/上下文预览，无 DB 改写 | PASS |
| 2. 实际执行与血缘 | 历史 2/2 文本；当前独立 profile 原生 Generate/Edit、文件回收和编辑 parent 已有真实证据，前提未变 | 新增 2/2 实际文字与 2/2 原生图片；ContextManifest/inputHash、creative-draft v2 内容/hash、能力快照、route/attempt、文本文件与图片 SHA-256 验证。两图均完整解码 1254×1254；nativeFileVerified=true、modelSelfReportUsed=false，各 1 reservation。成功在归档后成立 | PASS |
| 3. 跨次影响 | 历史合成项目重启后续作复用局部反馈，但尚未证明真实品牌独立新任务 | 第一图判断明确保存后重启；第二轮新的 service instance 和 ephemeral native thread，无源版本指针。4 条 manifest 自动选入确认约束、相关 reference、首轮创意及图片 project feedback，并给理由。新文案写到电梯厅/上车点，视觉方向明确上车前步行及车辆画外；实际新图体现该场景，旧记录/文件全部不变 | PASS |
| 4. 记忆语义与相关性 | 既有有界关键词检索、概念/asset/set 等反馈范围、事实确认与不可变版本回归 | 原未确认草稿和真实 ERP 工程资料分别因未确认/无主题匹配排除；仅 4 条相关记忆。反馈保持 project feedback 身份，确认品牌条目仍只有 1；未把产物/选择升级为事实。第二轮保存后只读 context 预览还能检索到新创意及原判断，证明积累可继续复用；没有因此启动第三次生成 | PASS |
| 5. 隔离与路线 | ADR-017 的有限原生执行面、固定订阅端点、两次操作预算、独立 profile 和无 BYOK fallback；旧 OS wrapper 负例保留 | RidePass context 不含已有 reading-ritual control 项目 ID；跨项目取 RidePass 文本/图/任务、RidePass 引用另一项目创意、另一项目引用 RidePass 图片共 5 项，均 404。control snapshot 检查前后相等。真实 4 runs 全部 codex-native/subscription，无路线回退；图片 usage、额度/成本仍 unknown | PASS，保留已批准 best-effort 限制 |
| 6. 失败与恢复 | 归档失败、receipt、事务 rollback、取消/迟到、重启 result_unknown 不重放及预算恢复测试；此处 fake/local transport 不冒充真实 provider 故障 | 当前 `npm test` 132/132 PASS、0 fail/skip；无效跨项目引用未创建新 run；首轮完整 state/hash 重启不变、成功 run 未重发，后续仍能读取首轮产物。真实调用无失败，不另作收费故障注入 | PASS，结合有效工程故障证据 |

### 实际影响与证据边界

第一轮从一般的重复路线介绍出发，图中乘客在住宅上车点旁，汽车仍占较大面积。判断保存后，第二轮的发布文案将开头转为经过熟悉电梯厅、走向上车点的具体 midweek 瞬间；visualDirection 明确 passenger/work bag/before boarding，并要求车辆失焦或画外。root 直接查看两张归档 PNG：第二张以乘客在电梯厅向外行走为主体，工作包、走廊、绿植与上车点可见，汽车不在画面中。图片动作的 instruction 为空、参考列表为空，其快照中的新 concept 已带这段方向；这是 **记忆 → context → Skill → 新创意 → ProductionSnapshot → native image → 验证归档/Project Memory** 的实际传播。

模型的引用 ID 与 rationale 提供关联说明；结论同时依据实际文案、保存的视觉方向及图片像素，不能仅靠模型声称“已用反馈”。第一轮已部分符合日常人像方向，不能把差异描述成完全从豪华车转向人像；本次新证据是更具体的上车前步行判断在独立新任务中持久复用。无 A/B 移除反馈对照，不声称统计因果、普遍质量提升或长期收益。

### 环境、运行分母与指纹

Windows 本地 Node **22.15.0**、内置 SQLite；浏览器使用 Codex IAB 的真实 UI，通过 cua_repl 中的 Playwright locator 操作。图片/文字均沿用应用自己的已独立登录 ChatGPT profile，数据根 `.workbench/native-production-acceptance/`，loopback `127.0.0.1:12080`。实际 **Codex 0.160.0**，二进制 SHA-256 **`4b01d5920e6785614727443bbecf343f4dedbb7347052b72ba805aab6353ef01`**；基础契约 6、图片契约身份与 [2026-10-05 原生验证](validation-v1.md#实际-runtimeprofile-与有界探针)相同。新服务按实现重新通过本地能力探针；这些 dummy 请求不计入真实生成分母。

| 新增真实操作 | 时间（2026-10-05 SGT） | 归档文件 SHA-256 |
|---|---|---|
| 第一轮文字 | 17:11:45.065–17:12:05.189 | `af7f31ed6186cc99ba68a09f1cb34276e34db584cf4b8d554425a7337862a599`，1178 bytes |
| 第一轮图片 | 17:13:44.939–17:14:11.379 | `8f154524db2ec1b9034eb4d6d800dc509eb67d7b8c4c5217f0b80de0fe608009`，1254×1254 PNG |
| 第二轮独立文字 | 17:18:12.946–17:18:35.526 | `dab8d38a9b06ed3de91db2dc9a2c6ae63d92b3db855275613dfa92499c0edffe`，1401 bytes |
| 第二轮图片 | 17:19:59.585–17:20:31.950 | `6bae2269ce7f5ef508fc5dfc99fe76a0a150615a185d33910769cc3a7b8f1ccc`，1254×1254 PNG |

真实分母：**2 text + 2 image = 4/4 succeeded，失败 0，重新抽样 0，额外 Edit 0，API fallback 0**；此前已证明的 Generate/Edit 另列为复用证据，不与本次分母相加。两图原生输入文件 hash 分别为 `4664d3d976e497443a9353452ab13ea6d9641611336d7a5038cdbdfece094ad5`、`b8f1fc2ad7a071eb075900b9353f7cadd74d7a385aecc7d01a8583b6deeca357`，匹配归档 AssetVersion.inputHash；归档去元数据/重新编码，artifactHash 合法不同。两个新生成 parent 均 null，reference/dependency 均空；未用新生成冒充对首图的编辑。

creative-draft **v2** SHA-256 `7e065689b033a6c2f641b78adfc5737b2c5a353e46747243523d7dbd3868037b`；两轮 ContextManifest hash 为 `6ef70f48c4581eb158fe6a21323a4408265db65d0252891cdf5e364405773f39`、`093639874c59b00a3dcc53d701de1df7c484a573075471b85127f02ea9990e28`。按固定 manifest 和已核对源码重建的发送 prompt hash 为 `ab2b60a95b691bb1e0749d7a29ec59582520e009448be9fa9979f0aa21e6d8e4`、`f7e870d1bf70d25318d6597b5eebe577dc20fc1ce3dd762d930482206505a7af`；这是源码/快照重建核验，未声称对真实 provider 网络做独立抓包。两次实际 text token 返回为 input/output 5725/398、6325/485；模型身份、图片 usage、剩余额度/费用 unknown。

所有原始资料、会话、作品、项目 ID 和完整运行 ID 保留在忽略目录，不进入 Git。定位证据：

- `.workbench/ridepass-dogfood/before-restart.json`、`after-restart.json`、`final.json` 保存只读项目快照及文件哈希；复验脚本 `verify.mjs` 不写业务 DB、不调用 provider，检查整个首轮 state/hash、旧版本、两个不同 thread/instance、manifest/Skill hash、图片解码/原生证据、5 个项目负例及第三轮取材预览。
- `verified.json` SHA-256 **`ea95f2faae255bf80f52af35507e22ca4e8f300466edcfe6dc1f36a4d615bc65`**，`final.json` SHA-256 **`b22a953904f55af55b8bc49b78b462de83184f78fb061d8eb2b9cd9da35482f0`**。
- `regression.log`：132 PASS、0 FAIL、0 SKIP，10.788s，SHA-256 **`1ae0b52caa492aea18fda8659bbae5696f23229491fbb6d11da1e447b7f79812`**；包含 fake fault tests 和实际 CLI local dummy probes，不是 132 次真实生成。
- `output/playwright/ridepass-round2-context.png`、`ridepass-round2-idea.png`、`ridepass-final-studio.png`、`ridepass-final-memory.png`；最终重载浏览器会话捕获的 console error/warn 均 0。root 查看了两张实际归档图片。

非产品失败也保留：Playwright CLI 的前置 npx 请求受 sandbox 网络/缓存 EACCES 限制，改用现有 cua_repl/IAB 操作，未安装依赖；两次 UI locator 选择误匹配（同名表单与 details 的 DOM role），改用实际 dialog/text 范围后继续，未重复提交；只读 verifier 初次错误期待空 instruction 为 null，实际 UI 空字符串，修正 helper 的精确断言后通过，失败日志 `verification-first.log` 保留。没有因此改产品代码或重发模型。

### 非阻断限制与停止决定

| 限制 | 对 v0.1 是否阻断 | 依据 |
|---|---|---|
| 只有一个真实产品、两轮任务；root 是受托操作/检查者，缺真人品牌采用和配对视觉/时间基线 | 否 | v0.1 只证明跨次记忆影响。没有声称用户已接受作品、视觉优于旧流程或营销有效；完整 V1 质量门槛未关闭 |
| 关键词检索；project feedback 未设 tags，适用于此项目所有未来任务，范围较宽 | 否 | UI 显式选择该范围，符合现有契约；不能据本例保证所有后续任务都选材正确。若判断只针对 rider 子场景，用户应使用更窄范围/可用主题控制 |
| 图片生产只使用所选 concept/brief/品牌及显式图片；不直接自动召回 asset feedback 或全部历史图片 | 否 | 本例通过新 ideation 将反馈转为已保存方向再制作，完整链路成立；不能据此承诺仅点击另一图片 Generate 也会直接读取所有反馈 |
| 未导入正式 logo/reference；第一张生成了未经验证的图形标识，两张有示意建筑/上车点标识；缺真实人物/路线证明 | 否 | 均为 draft creative illustration，无采用/发布；实际品牌标识和场景真实性须后续人工审查。本次不把图中文字当新产品事实，也不扩大为商业交付验收 |
| native Skills best effort、有限工具执行面而非通用 OS sandbox；图片费用/额度 unknown；未做真实 provider 故障或断电 | 否 | ADR-017 接受的风险边界继续有效；无新增击穿硬边界证据。固定路线、预算、引用隔离、校验/恢复证据复用并通过当前回归 |

最终：**六项 PASS，整体 PASS WITH NON-BLOCKING LIMITATIONS**。当前实现证明了一个真实项目中“知识和创作判断保存 → 相关选取 → 版本化 Skill/实际 runtime → 不可变归档 → 记忆积累 → 后续独立创作复用”的 v0.1 核心假设。无需实现修复、无需新增 ADR 或修改行为契约。本轮仅更新验收状态/导航，提交后检查工作树；展示本地图片后停止，不继续 V1。

## 历史验收（2026-10-02）

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
