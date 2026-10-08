# 光元收益预测器 — EdgeOne Pages 部署指引

本文档说明如何把本项目部署到腾讯云 EdgeOne Pages（上传文件方式），并绑定自定义域名 `m78calc.com`。

> **方式说明**：本方案采用「上传文件创建」，每次更新需重新上传（**无自动 CI/CD**）。若日后需要"推送即自动部署"，见文末「切换到 Git CI/CD」。

---

## 一、部署准备

待上传的包：`deploy.zip`（已与本文件同目录生成），内含：

```
deploy.zip
├── index.html              主页面（HTML+CSS+JS 内联）
├── manifest.json           PWA 配置
├── service-worker.js       离线缓存
├── edgeone.json            EdgeOne 缓存/安全头配置
└── assets/                 光元图标 + PWA 各尺寸图标
    ├── guangyuan.png
    ├── icon-192.png / icon-512.png
    ├── icon-192-maskable.png / icon-512-maskable.png
    ├── apple-touch-icon.png
    └── favicon-32.png
```

---

## 二、控制台部署步骤

1. **登录** EdgeOne 控制台：https://console.cloud.tencent.com/edgeone
   - 若无账号，先用微信/QQ 注册腾讯云并实名认证
2. 左侧菜单选 **Pages（页面）** → 点 **创建项目**
3. 创建方式选 **「上传文件」**
4. 上传 `deploy.zip`（或直接拖拽文件包）
5. 项目名填 `guangyuan-forecast`（可自定义）
6. 确认构建设置（上传方式通常无需构建命令）→ 点 **部署**
7. 等待 10~30 秒，部署成功后拿到临时公网地址：
   ```
   https://guangyuan-forecast.edgeone.app
   ```
8. **验证**：浏览器打开该地址，确认：
   - 15 张资源卡片正常渲染
   - 底部圆环图显示各资源占比
   - 光元图标显示正常
   - 修改每日量、勾选 toggle、氪金主开关等交互正常

---

## 三、绑定自定义域名 m78calc.com

### 3.1 前置：ICP 备案检查（关键）

- 用 EdgeOne **境内加速套餐** 时，`m78calc.com` **必须先完成 ICP 备案**，否则无法绑定。
- **已备案** → 直接走 3.2 绑定步骤。
- **未备案且想立即上线**，二选一：
  - **(a) 推荐**：先用免费 `guangyuan-forecast.edgeone.app` 临时域名上线，同时提交 ICP 备案（个人备案约数天~两周，腾讯云控制台「备案」可办）。备案下来后再绑 m78calc.com。
  - **(b)** 用 EdgeOne **境外/全球加速套餐**（无需备案，但境内访问稍慢）。

### 3.2 绑定步骤

1. 进入 Pages 项目 → **域名管理** → **添加自定义域名**
2. 输入 `m78calc.com`（建议同时加 `www.m78calc.com`）
3. EdgeOne 返回一个 CNAME 目标，形如：
   ```
   xxxxxxxx.cdn.dnsv1.com
   ```
4. 到 `m78calc.com` 的 DNS 服务商（如腾讯云 DNSPod、阿里云解析、Cloudflare 等）添加解析记录：

   | 主机记录 | 记录类型 | 记录值 |
   |---|---|---|
   | `@` | CNAME | EdgeOne 给的 CNAME 目标 |
   | `www` | CNAME | EdgeOne 给的 CNAME 目标 |

   > 若 DNS 商不支持根域 CNAME（CNAME flattening），可改用 A 记录或参考 DNSPod 的"CNAME 接入"说明。

5. 等待 DNS 生效（几分钟~数小时），可在 EdgeOne 控制台查看解析状态
6. 生效后 EdgeOne **自动签发 HTTPS 证书**（免费）
7. 访问 **https://m78calc.com** 验证站点

---

## 四、更新流程（每次改代码后）

1. 本地修改 `index.html` 等文件
2. 重新生成 `deploy.zip`（命令见下）
3. 回到 EdgeOne 控制台 → 该项目 → **部署** → **上传新版本** → 上传新的 zip
4. 几秒后边缘节点生效，用户访问即最新版

**重新打包**（在 `game-resource-forecast/` 目录下）：

推荐用项目自带的 Python 脚本（生成的 zip 路径用正斜杠，跨平台兼容）：
```bash
python pack_deploy.py
```
> 注：Windows 自带的 `Compress-Archive` 会生成反斜杠路径（如 `assets\guangyuan.png`），EdgeOne 的 Linux 构建环境可能识别不了，**请用上面的 Python 脚本**，不要用 Compress-Archive。

---

## 五、缓存策略（已写入 edgeone.json）

| 资源 | 策略 | 原因 |
|---|---|---|
| `/assets/*` | `max-age=31536000, immutable`（1 年） | 图标不变，长缓存省流量 |
| `/service-worker.js` | `no-cache` | PWA 更新必须即时拉新 |
| `/index.html` | `no-cache` | 主页面更新即时生效 |
| `/*` | `X-Frame-Options: SAMEORIGIN` | 防止被 iframe 嵌套 |

> 若上传方式下 EdgeOne 不读取 `edgeone.json`，可在控制台「项目设置 → headers」手动添加上述规则（格式一致）。

---

## 六、Git 自动部署（当前采用的方式）

**仓库地址**：https://github.com/870518423/guangyuan-site （公开）

已通过「导入 Git 仓库」接入 EdgeOne Pages。日常更新时：

```bash
git add -A
git commit -m "说明这次改了什么"
git push
```

推送后 EdgeOne 会在 1~2 分钟内自动重新发布，无需再手动打包上传。

### 关于推送用的令牌

推送走的是 Personal Access Token（写在 remote URL 里），**有效期 90 天**，到期后推送会报 401。
续期办法：GitHub → Settings → Developer settings → Tokens 重新生成一个（勾 `repo`），然后：

```bash
git remote set-url origin https://870518423:<新令牌>@github.com/870518423/guangyuan-site.git
```

### 注意事项

- `edgeone.json` 中 `buildCommand` 为空、`outputDirectory` 为 `.`，纯静态站点无需构建，接入后不要改这两项。
- 旧的手动 `deploy.zip` 上传方式依然保留，作为网络不通时的备用方案（见第四节）。
- **APK 不受 Git 影响**，安卓安装包仍需单独 `cap sync` + 构建。
- 若本机 git 报 "over proxy 127.0.0.1" 连接失败，是全局配置里的 Clash 代理（`socks5://127.0.0.1:7890`）没启动；可开 Clash，或只对本仓库关掉代理：`git config --local http.proxy ""`。

---

## 七、常见问题

**Q: 上传后访问 404？**
A: 检查 zip 内 `index.html` 是否在根目录（不要嵌套在子文件夹）。可在本地解压 `deploy.zip` 验证结构。

**Q: 圆环图不显示？**
A: 这是纯 SVG 内联实现，无需网络。若不显示，检查浏览器控制台是否有 JS 报错（可能是上传时 zip 损坏，重新打包上传）。

**Q: PWA 安装后图标不更新？**
A: Service Worker 缓存导致。已配置 `service-worker.js` no-cache，关闭重开浏览器或等 SW 自动更新即可。必要时在浏览器「清除站点数据」后重访问。

**Q: m78calc.com 绑定提示需备案？**
A: 见 3.1，境内加速必须备案。可先用 edgeone.app 临时域名。

---

## 关键文件位置
- 站点源码：`C:\Users\Admin\WorkBuddy\workbuddy\game-resource-forecast\`
- 待上传包：`deploy.zip`（同目录）
- 本指引：`DEPLOYMENT.md`
