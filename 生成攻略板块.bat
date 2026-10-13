@echo off
rem ============================================================
rem  Rebuild the "Aoxi Strategy" section pages from source docs
rem  sources\修炼.md   -> strategy-xiulian.html
rem  sources\奥特曼答题.txt -> strategy-dati.html
rem  Output: strategies.html / strategy-xiulian.html / strategy-dati.html
rem  Just double-click this file.
rem ============================================================
chcp 65001 >nul
cd /d "%~dp0"

set "PY=%USERPROFILE%\.workbuddy\binaries\python\envs\default\Scripts\python.exe"

if not exist "%PY%" goto NOENV

"%PY%" build_strategies.py
set "RC=%ERRORLEVEL%"

echo.
if "%RC%"=="0" (
  echo [OK] Strategy section pages have been updated.
) else (
  echo [FAILED] Exit code = %RC%
)
echo.
pause
exit /b %RC%

:NOENV
echo.
echo [ERROR] Python environment not found:
echo         %PY%
echo.
echo Please ask the AI assistant to recreate it, then run this file again.
echo.
pause
exit /b 1
