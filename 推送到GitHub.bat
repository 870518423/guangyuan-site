@echo off
cd /d "%~dp0"

echo ============================================
echo   奥系光元工具站 - 推送到 GitHub
echo   推送后 EdgeOne 会在 1~2 分钟内自动更新
echo ============================================
echo.

git --version >nul 2>nul
if errorlevel 1 (
  echo 没有找到 git，请先安装 Git for Windows
  echo 下载地址：https://git-scm.com/download/win
  echo.
  pause
  exit /b 1
)

set /p msg=本次更新说明（直接回车用默认说明）: 
if "%msg%"=="" set msg=更新站点内容

echo.
echo [1/3] 收集改动...
git add -A

echo [2/3] 提交：%msg%
git commit -m "%msg%"
if errorlevel 1 echo   提示：没有需要提交的新改动，继续推送。

echo.
echo [3/3] 推送到 GitHub（自动尝试三种网络方式）
echo.

echo   方式 1：使用当前 git 配置
git push
if not errorlevel 1 goto ok

echo   方式 1 失败，方式 2：走 Clash 代理 127.0.0.1:7890
git -c http.proxy=socks5://127.0.0.1:7890 -c https.proxy=socks5://127.0.0.1:7890 push
if not errorlevel 1 goto ok

echo   方式 2 失败，方式 3：不走代理，直连
git config --local http.proxy ""
git config --local https.proxy ""
git push
set rc=%errorlevel%
git config --local --unset http.proxy 2>nul
git config --local --unset https.proxy 2>nul
if "%rc%"=="0" goto ok

echo.
echo ============================================
echo   三种方式都失败了
echo ============================================
echo 常见原因：
echo   1. 网络临时不通 —— 过几分钟再双击重试一次
echo   2. 令牌过期（90 天有效期，约 2026-12-28 到期）
echo      重新生成令牌后，在本文件夹打开命令行执行：
echo      git remote set-url origin https://870518423:新令牌@github.com/870518423/guangyuan-site.git
echo.
pause
exit /b 1

:ok
echo.
echo ============================================
echo   推送成功！约 1~2 分钟后网站自动更新。
echo ============================================
echo.
pause
