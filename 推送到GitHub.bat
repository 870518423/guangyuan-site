@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo   奥系光元工具站 - 推送到 GitHub
echo   （推送后 EdgeOne 会在 1~2 分钟内自动上线）
echo ============================================
echo.

set /p msg=本次更新说明（直接回车则用默认说明）: 
if "%msg%"=="" set msg=更新站点内容

echo.
echo [1/3] 收集改动...
git add -A

echo [2/3] 提交：%msg%
git commit -m "%msg%"

echo [3/3] 推送到 GitHub（自动尝试多种网络方式）...
echo.

echo   尝试 1/3：使用当前 git 配置...
git push
if %errorlevel%==0 goto ok

echo   失败。尝试 2/3：走 Clash 代理 127.0.0.1:7890...
git -c http.proxy=socks5://127.0.0.1:7890 -c https.proxy=socks5://127.0.0.1:7890 push
if %errorlevel%==0 goto ok

echo   失败。尝试 3/3：不走代理，直连...
git -c http.proxy= -c https.proxy= push
if %errorlevel%==0 goto ok

echo.
echo ============================================
echo   三次尝试全部失败
echo ============================================
echo 可能原因：
echo   1. 网络暂时不通 —— 过几分钟再双击重试一次即可
echo   2. 令牌过期（90 天有效期，约 2026-12-28 到期）
echo      重新生成令牌后，在本文件夹执行这条命令（把"新令牌"换成实际字符）：
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
