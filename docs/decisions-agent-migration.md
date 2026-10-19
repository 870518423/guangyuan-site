# 决策记录 · Agent 迁移（WorkBuddy → dsh）

> 本文件由 A 窗口（WorkBuddy 计划员）维护，记录「开发维护从 WorkBuddy 切换到 dsh」的决策与理由。
> 接手者（dsh）第一件事：通读本文件 + 工作区根的 `HANDOVER.md`（交接文档）。

## 已定决策

### D1（2026-10-19，经官方文档查证细化）｜dsh 的形态
- **结论**：dsh = DeepSeek Harness（deepseek-ai/deepseek-harness，developer preview 阶段），**本地 Web UI + headless 双形态**：
  - `dsh web` → 本地服务 http://127.0.0.1:3080，浏览器操作；
  - `dsh --profile headless "任务"` → 一次性执行退出，可脚本化；
  - 有「工作区」机制（指向项目目录）+ bash 执行工具（可加 Docker 沙箱）。
- **影响**：本地 agent 可直接接管 `C:\Users\Admin\WorkBuddy\workbuddy\`（工作区指向此目录），迁移以「文件 + 文档」为主。
- **已核实的注意点**：
  - Windows 是 npx 安装路线最容易出问题的平台（依赖解析内存失败、装几十分钟、二次启动符号链接问题）——管理者已下载本地版，装机环节已过；
  - 无内置浏览器自动化；EdgeOne 取数（eo_fetch.js 走 127.0.0.1:9222 登录态 Chrome）需要管理者配合先开调试 Chrome；
  - 模型走 DeepSeek API key（按 token 计费，存 $DSH_HOME/.credentials.yaml）；
  - developer preview，命令行为在版本间可能变化。

### D2（2026-10-19）｜切换范围
- **结论**：WorkBuddy **完全退役**（选项 A），dsh 接管本网站全部后续开发与维护。
- **理由**：管理者不想维护两套 agent 的工作流。
- **连带**：① WorkBuddy 的 A/B 协作板（资料库内的计划/回执两篇文档）随之退役，dsh 时代任务组织方式见 D5；② WorkBuddy 记忆目录（`.workbuddy/memory/`）的内容已提炼进交接文档，原目录保留本地供查阅。

### D3（2026-10-19）｜切换时机
- **结论**：在途工作已全部完成——deploy.zip（BUILD v85，含 CORS 修复与 content.json）已上传 EdgeOne、APK v0.2.0 已发布、真机验收已过。**干净交接**，dsh 接手时无半成品。
- **交接载体**：工作区根 `HANDOVER.md`（现状/铁律/工具链/凭据位置/待办）。

### D4（2026-10-19）｜凭据授权
- **结论**：本机全部凭据对 dsh **无禁区**（git push、EdgeOne 登录态 Chrome、keystore 签名、51.la），等同管理者本人权限。理由：单人项目、本地运行、资产本属管理者。

### D5（2026-10-19）｜dsh 时代的任务组织
- **结论**：A/B 双窗口模式随协作板退役；dsh 时代 = 管理者直接对话下任务，agent 单线执行。**每轮开工标准读物 = HANDOVER.md + 本文件 + 最近 memory 日志**。决策继续追加到本文件（格式：结论 + 理由 + 待定）。

### D6（2026-10-19，dsh 接管后首次推送实测）｜推送通路与凭据（运维备注）
- **现象**：交接后首次 `git push` 连续失败，四层原因叠加——
  1. `workspace-write` 沙箱下 git 无法创建 `git-remote-https` 的子进程管道（`cannot create standard input pipe: Permission denied`）；
  2. 全局 `http(s).proxy = socks5://127.0.0.1:7890` 指向的 Clash 未运行，端口无监听；
  3. 绕开代理后直连 GitHub **间歇通**（实测 `200 → 200 → 超时` 交替，推送时 `Connection was reset`）；
  4. DSH 自带 git 的凭据助手链在无终端环境取不到 PAT（`/dev/tty: No such device or address`），但 PAT 实际在 Windows 凭据管理器里（GCM 目标 `git:https://github.com`，账号 870518423）。
- **结论（现行可用流程）**：
  1. **全局代理配置已删除**（管理者同意，2026-10-19）；git 默认直连，需要代理时临时 `git -c http.proxy=...`。
  2. 无终端环境下用**一次性凭据助手**：`git-credential-manager.exe get` 取 PAT → 经环境变量注入临时 shell helper → 用完即删；PAT 不落盘、不进命令行。
  3. **大小文件分开提交**：5.3MB 的 APK 与源码同包会被 RST 掐断；拆开后源码包仅 23 KiB，一次通过。今后顺序 = 先源码/文档（小包），再二进制（APK）。
  4. 推送成功**必须**用 `git ls-remote origin main` 核实远端 SHA——git 可能假报成功。
  5. 运维习惯：推送/下载类操作**不在单次调用里跑长循环**，每次独立短超时、结果可见（本次因 660 秒大循环 + 命令替换缓冲进度，白等约 12 分钟）。
- **理由**：链路质量属外部条件，代码侧无法解决；拆包 + 短超时重试把单次失败的代价压到最小。
- **待定**：若直连长期不稳，考虑改用 SSH over 443（`ssh.github.com:443`），需生成密钥并在 GitHub 添加公钥（管理者操作）。

### D7（2026-10-19）｜App 两个报障的根因与修法（BUILD v86）
- **报障**：① 设置齿轮出现在「角色被动版本收录」页左上角、压住标题；② 设置页「检查更新」永远差 11 个文件，下完再点又重下。
- **根因①**：`addGear()` 用 `/index\.html$/` 判首页，`passive/index.html` 同样以 `index.html` 结尾被误判成首页；齿轮 CSS 固定 `left:14px;top:14px`，正好压在页面标题上。
- **根因②（两因叠加）**：缓存桶里的键被 URL 解析成百分号编码（`%E6%9E%81…`），清单里是原文（`极恶贝利亚.js`）→ 11 个中文名文件永远不相等；且原逻辑只判「桶里有没有」，不判「内容变没变」。
- **修法**：
  1. 齿轮判断加 `!/\/passive\//` 排除（二级页一律不浮动，回到管理者 2026-10-18 的口径）。
  2. 取桶键后 `decodeURIComponent` 清码。
  3. 差量判定升级为**指纹比对**：新增本机台账 `localStorage[ak-content-index]`（path→md5），差分 = 桶里没有 **或** 指纹与清单不一致；老用户无台账时按桶内现存文件补台账，避免一次性重下 76 个。
  4. 下载失败不再计入「更新完成」；清空内容包时台账同步清（否则「清完还说已是最新」）。
- **连带修三处（同一批上线）**：
  1. `version.json` / `module.json` / `content.json` 之前没有专属分支，落进通用 SWR → 被写进 RUNTIME 桶（违反铁律 8）。现加 network-only 分支，并从预缓存 ASSETS 移除。
  2. 「是否有新安装包」改为读 `version.json.apk`（pack_deploy 从 build.gradle 的 versionName 生成），不再拿 BUILD 比——否则每次内容热更都会误报「请下载安装包」。APK 侧缺该字段时一律按「无需重装」处理。
  3. `content.json` 不再自列这三份活清单（自列会让指纹天生对不上，且等于允许把它们塞进内容桶）：清单 79 → 76 项。
- **闸门**：新增 `tools/content_diff_test.js`（24 条断言：中文名收敛、二次点击不重下、指纹变更识别、老用户补台账、清空回退、清单卫生、SW 分支卫生、齿轮位置）。
- **BUILD**：v85 → v86（SW 逻辑变更）。**APK 未重建**——修复全在内容文件内，走热更，用户无需重装。
- **待定**：真机验证需管理者上传 deploy.zip 后在 App 内点一次「更新内容」（或进设置页由 SW 后台换新）才生效。

## 待定问题

- O5：calc_regress 基线决策——「维护」周二次数 5→4 漂移导致 5/20 FAIL，根因未钉死（嫌疑：测试时日期冻结未生效 / 浏览器 localStorage 存档带偏窗口）。先复现钉死根因，再由管理者决定重采基线（`node tools/calc_regress.js --save`）或修代码。
- O6：public 仓库 142 张游戏截图（passive/img，11MB）的暴露处置——管理者知情，暂维持现状；若版权风险显现，考虑转 private 或移出跟踪。
