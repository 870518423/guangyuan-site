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

echo [3/3] 推送到 GitHub...
git push

echo.
if %errorlevel%==0 (
    echo 推送成功！约 1~2 分钟后网站自动更新。
) else (
    echo 推送失败。常见原因：
    echo   1. Clash 没开（全局 git 代理写的是 127.0.0.1:7890）
    echo   2. 令牌过期（90 天有效期，需重新生成并更新远程地址）
)
echo.
pause
