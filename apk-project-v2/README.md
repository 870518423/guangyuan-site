# 奥系工具站 Android App

本目录是「奥系工具站」Android App 的完整源码，采用 Capacitor 8 + Android 原生工程。
网站页面、数据与 App 壳层共用同一个 GitHub 仓库，避免只发布 APK、无法核对源码。

## 基本信息

- App ID：`com.aoxi.tools`
- 当前版本：`0.2.2`
- 最低 Android：API 24
- 页面来源：仓库根目录的网站文件
- 当前安装包：[aoxi-tools-v0.2.2-r2.apk](../app/aoxi-tools-v0.2.2-r2.apk)

## 权限与原生能力

- Android 清单仅申请 `android.permission.INTERNET`。
- 未申请通讯录、定位、相机、麦克风、短信、通话或外部存储权限。
- `FileProvider` 仅用于 App 内更新安装流程，不导出，也不申请敏感权限。
- 原生 JavaScript 桥 `AKNativeApp` 只暴露只读的 `getVersionName()`，供页面判断当前安装版本。

网络用于加载站点内容、检查更新和下载内容包/安装包；App 的核心页面与数据可离线使用。

## 当前 APK 校验值

- 文件：`app/aoxi-tools-v0.2.2-r2.apk`
- SHA-256：`c849a7da252658e7a3a8b19e215875dbda79e9ec674f306bc85570e21119adf1`
- 签名证书 SHA-256：`5a7a53f78b241bff2d1794815b7f5b3f5c92676f7c87f892ac1279df80fed3b2`
- 签名证书 DN：`CN=Aoxi Tools Station, OU=Tools, O=Aoxi, L=Shanghai, ST=Shanghai, C=CN`

如果下载到的 APK 哈希与这里的值不同，请勿安装。

## 从源码构建

前置环境：Node.js 22、Python 3、JDK 21、Android SDK 36。

```bash
cd apk-project-v2
npm ci
python sync_www.py
npx cap copy android
cd android
./gradlew assembleDebug --no-daemon
```

正式发布包还需要本机的 `android/keystore.properties` 和签名证书。这些文件包含私密信息，已由 `.gitignore` 排除，禁止提交。

Windows 下仓库路径包含中文时，Android Gradle 配置已显式设置 `android.overridePathCheck=true`；GitHub Actions 仍会在 ASCII 路径下独立构建验证。

## 构建验证

当前源码已在本地按上述步骤成功编译 Debug APK。用于 GitHub Actions 的构建配置保存在 `ci/github-actions-android-build.yml`；当前推送令牌尚未包含 `workflow` 权限，因此还未启用为自动任务。为令牌补上 `workflow` 权限后，可将该文件移到仓库根目录的 `.github/workflows/android-build.yml` 启用干净环境构建。
