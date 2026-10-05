# V1 — 实现差距与验证记录

**当前结论：FEASIBLE — 最小原生 Generate → 不可变 AssetVersion → 指令 Edit → 新 AssetVersion / Project Memory 已通过，停止供 dogfooding。** 完整 V1 尚未验收。产品负责人接受 native Skill 为 best effort；下方严格 Skill / 单次操作 / selected-reference-only 的 BLOCKED 记录仅为历史，不能作为当前 gate。

## 后继批准：Skill best effort，硬边界决定可行性（2026-10-05）

PRD/ADR-017 先记录新批准，再调整实现/验证。本轮从干净 `90a10a9991b0537b0d533e8e916d83a45e3e3eaa` 开始，分支 `codex/production-loop-feasibility`。受测实现/测试/诊断提交为 **`734b4b2413da154aa1a0ce273f8d93037dcd36f7`**；后续文档提交只同步本结果，不改变受测代码。原有三项领域修正、profile 和兼容策略保留。没有推送、发布或加入凭证/真实图片/会话/私有报告；本地材料保留在被忽略的 `.workbench/`。

### 最低控制与闭环证据

| 必要边界 | 实装、测试和真实结果 | 判定与限制 |
|---|---|---|
| 每 Action 最多 2 次操作且授权不跨 Action | 复用前轮十项预算机制证据；当前产品在转发前同步保存 SQLite reservation，独占 Action staging，不退款、不自动重放。新 runtime/service 测试覆盖第三次/并发、重复 requestId/owner、恢复、取消/暂停 | PASS。真实两项 Action 各 1 次；未额外发收费请求测试限额，限额证据来自本地故障测试。未测试断电 |
| 正常宿主/其他项目不能成为生产输入 | 外部模型 Responses/SSE 完全不进入 CLI，应用本地产生唯一固定 imagegen 调用。服务按项目解析资产并传 PNG Buffer；host 构造当前项目路径与调用 ID，无隐式历史图片。其他工具关闭。外部、其他项目、越界和 junction 路径负例拒绝；真实 staged 正例成功 | PASS，限于此固定工具执行面。不是 Windows 任意进程 OS 沙箱；旧 wrapper 失败仍成立。Skill 可加载，但没有把文本变为任意工具/路径的模型环节。代码审查与实际 CLI probe 支持本界限，不以事后检查字节替代读取约束 |
| 独立认证且固定订阅路线 | 复用用户完成的独立交互 ChatGPT 登录，正常 host profile inspection 通过；真实 native CLI 生成认证头，仅向固定 ChatGPT Codex images endpoint 转发。API 认证、重定向、备用端点均拒绝 | PASS 路线及实际图片请求；没有账单/额度审计，usage 仍 unknown。个人四个指令/配置/认证文件检查不变，未复制个人凭证 |
| 成功来自文件，非模型自报 | PNG 完整解码、尺寸/字节限制、响应字节等于原生实际文件；归档规范化 PNG，记录 inputHash/artifactHash。测试缺失/损坏/不匹配文件、伪造验证标志、仅模型文本均不成功 | PASS。两次真实 native 文件匹配；归档重新编码，因此原始/归档哈希不同且分别记录 |
| 不可变原版、正确 lineage/依赖/记忆 | 新生成 parent=null，参考图为 dependency；编辑 parent=第一图，额外参考为空。两 run、ProductionSnapshot、能力/预算/结果元数据均留在 SQLite/Activity；原文件 hash 与编辑前 snapshot 相同 | PASS。归档故障/文件先写后事务失败/重启本地恢复由回归覆盖，未重复收费调用 |
| 业务授权只来自应用用户动作 | 浏览器分别明确选择 concept + unchecked reference，再点击 Start image generation；第二项点击 Edit image 并提交编辑指令。服务认证/CSRF及作用域检查，模型无法调用业务 API | PASS。实际 selections 为空，无自动批准、采用、发布或下一 Production Action；Review/采用仍留给用户 |
| Skill best effort 与可升级契约 | 契约 6 不再因 Skill canary 拒绝；保留配置/指令、工具、PNG、认证、无重试硬检查，记录不含路径/正文的观察。图片独立 probe 使用同一生产 dispatcher，新二进制/契约先测 | PASS。实际观察 selectedSkill=1，允许继续；观察来自 probe，不声称每次调用 Skill 清单。没有回到 exact-version equality |

### 实际 runtime、profile 与有界探针

实际 binary 为 **Codex 0.160.0**，路径 `C:\Users\zhuzh\AppData\Local\OpenAI\Codex\bin\f544b3844e0f14e9\codex.exe`，SHA-256 `4b01d5920e6785614727443bbecf343f4dedbb7347052b72ba805aab6353ef01`。历史 `0.159.0-alpha.12.1` 不可用，未重测、未声称当前证据覆盖它。基本契约 **6** 为 `42338840743ab3804b61ac4d2b0fbeafffdabbea822658f014b7ac43462fe79d`；图片契约为 `988d97a8a6a73ba43725ad91b6622a03652398b894431e5ece7176f63803400a`。成功缓存按实际二进制/契约在服务进程内复用。

正常 Windows 宿主（不是编码 sandbox 账户）的基础 probe 于 `2026-10-05T08:17:15.797Z` 七项硬检查全部通过；success/503/broken-stream 各 1 本地请求、API-auth 0，真实调用 0。报告 `.workbench/native-skills-best-effort/actual-host-contract.json` SHA-256 `4c392c26689d4174ef1ca0b7511a896a9e1f70c8fa470280696b44c79654ce41`，evidenceId `4a60c1cdfc593d47790106928b93aea31738b5cf80c11523706a38bf0489da7a`。native Skill catalogue=0、selected=1，现作为观察而非失败。

登录后的浏览器缓存问题修正在检查范围：CODEX_HOME 整体仍递归校验；隔离用户目录只递归 native `.agents` / `.codex` 子树，根与祖先继续拒绝链接，不删除缓存或提高上限。超过 5,000 项浏览器缓存及 native 配置链接回归通过。原独立 profile 的正常 inspect 于 `08:23:02.596Z` 返回 available、codex-native/subscription；`.workbench/native-skills-best-effort/owned-profile-status.json` SHA-256 `92c8002e6fbee2bfddbfd592dc008e084f2c7afabb7c89487606bc5fb2ad8e51`。这一步无真实模型调用。

`node tools/probe-controlled-native-image.mjs` 调用同一产品 `runImageProbe` / dispatcher，用虚构 ChatGPT 认证验证原生 generation、reference/edit、native 文件、原生认证。报告 `.workbench/controlled-native-image-probe/result-2026-10-05T08-33-16-716Z-e9fc72cf-9e5e-4080-b875-b3a614b402cc.json` SHA-256 `53d1fd82183d9a30be7b0d0d492007d9a3d199758c3ac0d4abce7ca4c1485587`。正常生产服务首次 image inspect 也通过同一 probe，作为能力快照保存；这些 probe 没有真实图片服务调用。没有系统级网络 trace，不声称整个 native 进程绝无附带网络活动。

前轮最终预算报告 `07-39-34-108Z`（下文完整路径、SHA-256 `ed50715d3d7f7d44a9391a5b055acda8d88e6e7d9326f59e69d6f7a98d576dac`）复用，不重跑。当前新增的是 SQLite 服务整合、固定工具编排和文件归档检查；前提未变的 Windows wrapper 负例同样不重跑。早期本轮探索性固定调用报告 `08-15-48-656Z` 保留在本地，不代替以上共享生产代码的最终 probe。

### 两项真实 Production Actions

数据根 `.workbench/native-production-acceptance` 使用用户此前亲自登录的应用 profile；合成项目 `ecfed245-775d-40d3-853e-a03aa1c0db08`（Native production · reading ritual）。手工 concept `3ccd1702-4bd7-4940-99a2-16c3d84a51b9`，set `c8411fb5-fcab-4ab0-85d7-6deba0e806e7`。参考为本地创建的合成书本/杯子图 `cf1356eb-ca02-45de-901e-2ac9d262e1f6`，不是用户真实资产。浏览器 UI 显式选择该 concept/ref；生产没有额外文字模型调用。

| 操作 | 真实 run 与输出 | 文件证据 |
|---|---|---|
| Generate | run `44a0797f-f08a-4b93-ac2e-3a3013c3b62f`，asset `8cbdaf9e-6864-4aea-a778-a9fafba4e9d8`；1 次原生 images/edits（新图带参考），succeeded | 1254×1254。原生 SHA-256 `536e280ac604f6f862f776db217b342a9d62ab9b2a1eb939b19b28b18c9138bb`；归档 `504c79ff4828b27a2f3d519294eadf4a524373b50adb4e2e42dcd3a7178da474` |
| Instruction Edit | run `31b07a4e-adcf-4490-9d3b-44f338a16d2f`，asset `4997ce14-784b-4c0a-b089-e3991183715a`；1 次原生 images/edits，succeeded，parent 为上一 asset | 1254×1254。原生 SHA-256 `76a169921264ef0968b018b3b4f0562b6cd8aed60efb37209863610fd696f5f6`；归档 `3333b425bf104b1e9134efe085776a3efdeb0d241d0fd637668fa3225b4ec2ad` |

第二项指令只把 teal mug 改为 warm orange 并保持其他内容；目视两张原生归档图，杯子改色，书、桌面、背景与构图保留。未做像素级不变或商业视觉质量承诺。两项各持久 reservation=1、imageOperations=1、nativeFileVerified=true、modelSelfReportUsed=false，均留 requestId/generationId。实际总图片请求 **2**，无额外收费探针、无隐式 fallback/重发；未进行自动 Review/采用/发布。

本地验收摘要 `.workbench/native-production-acceptance/acceptance-result.json` SHA-256 `39057b203c9758863c888b9d58c8d1325808b4ca176617c38a2cefc3d0760259`，包括真实 run、快照、哈希、lineage/依赖及断言。原图归档 hash 与编辑前 snapshot 相同；两张图均完整解码。个人 `AGENTS.md`、`AGENTS.override.md`、`config.toml`、`auth.json` 的存在状态/哈希与登录前记录一致；实际 AGENTS.md 原已为空，非空全局指令不干扰由合成兼容夹具证明，未为了产品清空任何个人文件。

### 回归、UI 与停止范围

完整 `npm test` **132/132 PASS，0 fail / 0 skip，17.542 秒**。日志 `.workbench/native-production-regression-final.log` SHA-256 `376e4889355b1198db56399420d3fea18911514d41d06d20b5c2e4bd2e5e5206`。保留领域、项目隔离、恢复、备份、HTTP 安全；新增 14 项 production 与 12 项 runtime-image 用例。首次完整运行 131/132，唯一失败是旧 HTTP fixture 仍要求“图片永远 blocked”的历史 evidence 字段；改为文字 double 缺少 native 身份时 unsupported，未伪造 live counter，最终全过。profile 缓存、原生文件证明/哈希和 prompt 上限均有针对性 RED→GREEN 证据。

实际浏览器完成两个制作表单、检查 Studio 两个版本、Activity 两个 Saved run、打开 edit 的完整 context/ProductionSnapshot；控制台 0 errors / 0 warnings。选择器初次 label 查询未命中，改用实际 combobox role 后完成，没有重复提交。语法检查、task-owned diff 检查通过，独立代码复核未发现关键问题。没有再次运行历史 v0.1 live/性能/全部 wrapper 探针，未进行服务断电或真实 provider 故障注入；异常、取消、未知结果和本地归档恢复由回归验证。

此结论只覆盖上述窄执行路线和运行身份，符合本地单用户产品批准的合理控制标准；不覆盖任意 agent 工具执行、多 provider、batch、透明/mask 编辑或全部宿主组合。今后若允许外部模型决定工具调用或任意路径，必须重新验证硬边界。当前停止实施，保留浏览器与合成结果供真实社媒工作流 dogfooding；真实品牌素材、配对质量、业务采用和完整 V1 发布门槛仍待用户工作流验证。

## 前轮记录：两次操作、项目文件区及严格 Skill 门禁

## 后继批准：重新评估的最低证据（2026-10-05）

本轮基线 `c95107512ce3c17afd64ac4d4a13645decbe9f36`，分支 `codex/production-loop-feasibility`，开工工作区干净。产品负责人明确允许每个用户发起 Production Action 最多 **2 次图片操作**，可由应用 harness/runtime 边界强制实施；允许读取当前项目隔离/staged 区全部文件，禁止正常宿主及其他项目，ProductionSnapshot 仍保留用户显式选定参考。独立应用 ChatGPT 登录与真实订阅路线须另外验证。旧的一次操作、selected-reference-only、native-only 控制要求已被取代，不再作为验收条件。

新的最小检查：第三次操作（含并发/重试）不能到达真实派发边界，同一 action 的持久预算不能因重启/恢复绕过；项目区内正例可读，合成宿主/其他项目 canary 的绝对路径、越界路径和链接不能进入图片请求；应用 profile 独立交互登录及一项真实订阅任务成功，个人 profile 未被借用或修改。只在这些控制通过后执行一次真实生成及一次显式编辑，验文件解码/哈希、不可变前版本、新 lineage 和 Project Memory；仍失败则记录具体剩余 blocker。

旧 `tools/probe-native-image.mjs` 把工作目录设置为 `<probe>/workspace`，未批准参考文件放在 `<probe>/other-project-unapproved.png`，而 CODEX_HOME/HOME 也是 `<probe>`。文件名含 other-project 不代表真的属于另一个项目；实际只是越出工作子目录、仍在同一 probe runtime 根。因此旧报告既不能证明逃出当前项目隔离区，也不能把两次图片操作当作新上限失败。原始报告不改写，本轮用明确分开的合成项目/宿主根重新取证。

### 修订边界的实装调查结果

本轮仍检查实际 `codex-cli 0.160.0`、SHA-256 `4b01d5920e6785614727443bbecf343f4dedbb7347052b72ba805aab6353ef01`；不更新历史 pin，不把当前结果转给 `0.159.0-alpha.12.1`。

| 修订后的问题 | 运行证据 | 结论与限制 |
|---|---|---|
| 每个 Production Action 最多 2 次图片操作，harness 可执行 | `tools/probe-image-budget.mjs` 十个有界本地用例：无 gate 对照发出 3 次；顺序、同响应多调用、并发、503/断连重试、重复 owner、未知结果恢复、重定向及取消均在实际派发前处理 | **可行机制已证明**。限额 2；租约防同 Action 两个 owner；派发前同步刷写 reservation，失败不退还，未知结果重开后拒绝自动重放。尚未接入产品 SQLite/真实 upstream，不假称完整生产已实现 |
| 当前项目 staging 可读，正常宿主/其他项目不可读 | `tools/probe-image-filesystem.mjs` 采用 Cumora 风格命名 profile（`:minimal` read + `:workspace_roots` 当前目录 write，network false），测试 staged 正例及独立兄弟项目/合成宿主负例 | **当前 native Windows 路线 BLOCKED**：elevated 要求 effective `:root` read；unelevated 明确不能实施 split filesystem read restrictions。两者连合法 staged 正例都无法读取，各 4 次本地 responses、0 图片请求。不能把所有读取失败算隔离 PASS，也没有证据声称这次发生真实宿主泄露 |
| 应用 profile 独立交互 ChatGPT 登录及真实订阅 | 认证专用重试由用户完成交互，CLI 返回 Successfully logged in，独立 login status 确認 ChatGPT；个人两份 AGENTS、config.toml、auth.json 哈希不变。契约 5 检查仍拒绝原生个人 Skill 展开 | **独立认证 PASS；真实订阅推理 NOT_RUN**。没有复制个人凭证或绕过兼容门禁；登录后的浏览器缓存还触发 profile 检查上限，不能把登录成功当正常产品 setup 或订阅生成通过 |

预算初次十用例诊断报告 `.workbench/image-budget-probe/result-2026-10-05T07-11-14-172Z-5f260b22-82d9-43d2-9689-2161b09cdf93.json`，SHA-256 `7106a5f3965bf70b3452a2de05915a74767b0a6d10022ea7baec20fec19a2baf`，契约 `f9db9d75595bdd9b994d076c99e82b11475193eadf57570f68d1008070725f87`。503 / reset 各 5 个 gate 请求只转发 2 个；并发 6 个请求只允许 2 个；duplicate-owner 在首个 reservation 前就拒绝第二 owner。恢复测试是关闭 gate 后从已 fsync 的 JSONL 重开，未杀死 Node 进程或测试断电。前两份预算报告保留较窄的单活跃 gate 证据范围，不冒称已覆盖双 owner。当前配置的复验见下节。

文件系统报告：elevated `.workbench/native-image-filesystem/result-2026-10-05T07-05-08-414Z-e67dbb27-1135-4bdc-abf4-a28d4d5fc6ce.json`，SHA-256 `c1335e05cc32832a3b876c793b81a733b55a807dfbf19d2dea140bddbf860413`，配置 `60eef8ba86e7bc300091ca72df0c1d2e29556b633d2cc45a751a67908266febe`；unelevated `.workbench/native-image-filesystem/result-2026-10-05T07-06-09-737Z-724e3dc9-473b-4d3a-a3b7-800fff00fd9a.json`，SHA-256 `b2980c2fe1f2171b2dfbdb2ab4c730cafb702213ebaee58c8958b8fe68b5746f`，配置 `e2beaa6cb7101220b0abdb7a3fa0d66a706b96eb08bed478a0f40a99bde99f32`。报告中的 `INCONCLUSIVE` 指隔离未通过（正例也不可用），上表 BLOCKED 指该功能路线因此不能启用，并非相互矛盾。未加 root read、未关闭保护或静默使用更宽模式。

参考项目的正确仓库名为 [yetone/cumora](https://github.com/yetone/cumora)，检查了其 [Windows BYOA 说明](https://github.com/yetone/cumora/blob/main/docs/BYOA.md)和[命名 filesystem profile 配置](https://github.com/yetone/cumora/blob/main/server/src/agents/computer/engine.ts#L1717)。公开 [Codex Windows permission 实现](https://github.com/openai/codex/blob/main/codex-rs/windows-sandbox-rs/src/resolved_permissions.rs)作为错误解释线索。以上 main 来源于 2026-10-05 读取，未证明与已装二进制同 revision；结论依据仍是上述实装错误。宿主只读库存显示 Docker CLI 27.1.1 已装但 daemon 无响应/服务停止，WSL 只有停止的 docker-desktop，WindowsSandbox.exe 不存在；未启动服务、安装软件或改 OS 安全配置，因此没有已就绪的替代隔离 runner 证据。

最小剩余能力是 native image reader 能在 Windows 上执行“最低 runtime 文件 + 当前项目 staging”的读取限制，无需 effective root read；现有 imagegen 已通过 environment filesystem 读取参考，不必为了限额新增专用图片 API。若后续选择受支持的外部 executor，或由 harness 完整缓冲/校验 Responses 工具调用并规范化项目路径，均须单独验证。这些方案并未被证明不可能；当前未将新的协议解释器/执行服务包装成已经满足文件系统边界的实现。预算 gate 在图片请求发出时才看见字节，单靠它无法撤销此前已经发生的文件读取。

诊断本身的审查修正也保留：预算补足同 Action 独占 owner；文件系统 PASS 必须实际含 staged 正例图的 canary 字节，任何请求出现外部 canary 均失败，边界破坏返回非零。后者观察 3 项 RED 后 4 项 GREEN，旧报告的全部 wrapper 失败结论不受修正影响。图片 adapter 当前不再报告已取代的一次操作 / 所选参考限制，而只报告项目文件系统路线不可用，仍在任何图片准备或派发前拒绝。

### 原生 Skill 隔离与独立认证的补充证据

前一轮契约 4 的成功发生在编码 sandbox 账户，不能覆盖正常 Windows 用户环境。正常宿主上的探针最初发现 9 个物理用户 `.agents/skills` 清单引用；增加 `skills.include_instructions=false`、`skills.bundled.enabled=false`、`cloud.skills.enabled=false` 后清单消失，但显式 `$better-writing` 仍触发个人 Skill 内容进入原生请求。这与应用控制的、按项目选择的 Skill package 不同。改变 HOME/USERPROFILE/CODEX_HOME 与 `skip_host_skill_discovery` 没有完成该隔离；没有清空个人 AGENTS、修改个人 Skill 或逐个依赖个人文件禁用配置。

2026-10-05T07:24:32.967Z 正常宿主负例使用同一实际二进制、虚构认证与一个 `/v1/responses` loopback 请求，得到 catalogue 0、selectedSkill 1，路径为物理用户 `.agents/skills/better-writing/SKILL.md`；`unsupported_capability`、所有 acceptance checks false、无 evidenceId。私有摘要 `.workbench/host-profile-isolation/actual-host-explicit-skill-evidence-2026-10-05.json`，SHA-256 `4d88e5b99abbe74ffef42726b3c431e6c31dacb1c7f9fb39f0afe748673fff9c`，明确是先前 tool stdout 的脱敏摘录，不是持久原始 native log；没有保存 Skill 正文或真实 token。契约升级为 **5**，哈希 `e9eb56dfdbada3fb60579756c67fc1f735e4bcc2eb1a9793f9a7aedff3641a18`，增加工作目录合成 Skill 及显式引用 canary，当前实装回归同样拒绝展开，旧成功缓存不能复用。探针全过才启用的策略保持；未恢复 exact-version equality。

认证先后保留三种不同结果：第一次浏览器未自动打开，显式打开后用户完成回调，但 token exchange 失败；公共 auth metadata 的有界诊断在编码 sandbox 返回 EACCES、正常宿主返回 200。正常宿主的常规 login helper 随后被上面的 Skill 兼容检查拒绝，尚未进入登录。最后仅对认证使用 app-owned profile 的原生 `login`，在正常宿主由用户完成新交互，退出 0；没有 model prompt 或推理门禁绕过。

2026-10-05T07:29:41.319Z 用该 profile 的原生 `login status` 确认 ChatGPT，四个个人文件哈希与本轮基线一致。证据 `.workbench/revised-boundary-evidence/auth-completed.json`，SHA-256 `3d62224f603aea8fb552b279c7b981cec7c7cfeafccbc951bb6b365df8b39eab`。应用凭证保留在 Git 忽略的 `.workbench/native-production-acceptance/runtime/codex`，没有加入仓库。**本轮真实 inference/image calls 均为 0**；认证请求不是模型请求，也不证明实际订阅生成或账单路线已验收。

另外，登录/浏览器启动后应用隔离用户目录出现 5,230 项，其中 5,195 项位于 `home/AppData/Local/Microsoft` 浏览器缓存目录，触发 `prepareProfile` 5,000 项检查上限。因此正常 post-login profile inspection 失败；独立认证状态核验仅验证了原生 home/auth 文件为真实常规文件后运行原生 status，不能代替完整 profile 通过。未提高上限、删除缓存、移除链接或以绕过检查作为产品修复。若选择继续当前登录方式，需要另行解决浏览器状态与受检运行目录的边界。

### 最终配置复验与提交状态

实现、诊断与测试提交 **`293bd282351a83bd2b86146931c673c23ac40a7b`**，分支 `codex/production-loop-feasibility`；随后仅提交本轮 canonical 文档，未改变受测代码。既有领域修正保留。原始诊断、凭证、用户数据与登录 profile 均在 Git 忽略的私有目录；未发布或推送。

预算在最终配置复验的十个用例均通过，契约 `8ff36c97189e111ccc5b4451460e09e737ba25678f1a856daaf85926b3bf7aca`。最终报告 `.workbench/image-budget-probe/result-2026-10-05T07-39-34-108Z-c8a46281-4afb-485b-95e7-15e128c75441.json`，SHA-256 `ed50715d3d7f7d44a9391a5b055acda8d88e6e7d9326f59e69d6f7a98d576dac`，7.2 秒自然退出，无真实 provider 请求。较早的同配置报告 `.workbench/image-budget-probe/result-2026-10-05T07-36-02-777Z-eba7d3cf-6c3f-4346-91f7-a7acc279413e.json`（SHA-256 `7401ae2ddd608e23338285bcba9b9e895190f145d83e56ae334dc881d6d19e99`）也完成十项，但 tool command session 未返回 completion；只读进程检查未找到对应 node/probe wrapper，不能据此认定是脚本泄漏或证明正常退出。独立重复运行自然退出，未用 process.exit 隐藏 handle 问题。

Skill 配置改变后重新运行有界文件系统诊断，避免把旧配置当当前证据。最终 elevated 报告 `.workbench/native-image-filesystem/result-2026-10-05T07-36-02-933Z-cd2776bb-5ea1-4cfa-b4bc-32bd88535b67.json`，SHA-256 `93b062f91ea01862037a89fcfbd2ed23c4018dbf2a7ffb0df670a86bcdb85380`，配置 `1166067b3d4060a46e6084b132062d716f19d7d58bf293e44382cac8290cbdaf`；unelevated 报告 `.workbench/native-image-filesystem/result-2026-10-05T07-36-03-303Z-37b4d09a-ee5a-4f0a-8ba9-b03a0877c66e.json`，SHA-256 `f33daad5c59d15882bd1f89b2d08b12b92535eb921d0fc8d18b7dcaf73b4c322`，配置 `e59d255dc386ef9a19d5c4830f11b79cc1ed04b53927e57b026be68d06d03b30`。两模式重现相同 wrapper 限制，各 4 个本地 responses、0 image，诊断退出 2 / INCONCLUSIVE；不是隔离通过。

完整 `npm test` **107/107 PASS，0 fail / 0 skip**，15.382 秒，日志 `.workbench/revised-boundary-evidence/regression.log`，SHA-256 `41440221d59601b83f95e6e06b1d1bf096af8d9ac0ef711466727e70a815b1f4`。实装测试明确输出 BLOCKED / fail-closed regression evidence，故回归通过不能解释为 runtime acceptance。新增文件系统判定与显式 Skill 泄露回归保留，领域、项目隔离、恢复、备份及图片提交前拒绝仍通过。两个新诊断脚本语法检查和 `git diff --check` 通过；独立复核未发现关键代码问题。

本轮停止在修订后隔离边界，未实现或伪装 Generate/Edit、归档、lineage/Memory 的真实图片闭环。最小继续条件是可验证的项目文件读取边界和完整 native Skill 隔离，以及可完成产品 setup 的独立认证目录；由后续产品/架构选择运行时支持或等效 harness/executor，不假定所有方案不可能。

## 前一轮：严格边界下的提交、最低证据与结论（2026-10-05 历史）

下表的 profile / 契约 4 局部 PASS 已被上方正常宿主 Skill 负例限缩；只保留当时观察，不作为当前支持声明。旧图片条件亦已由 ADR-016 取代。

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
