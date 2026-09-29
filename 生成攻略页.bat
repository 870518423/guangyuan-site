@echo off
rem ============================================================
rem  Build the "Ultraman Human Host Guide" page from the Excel file
rem  Just double-click this file. Or drag an .xlsx onto it.
rem ============================================================
chcp 65001 >nul
cd /d "%~dp0"

set "PY=%USERPROFILE%\.workbuddy\binaries\python\envs\default\Scripts\python.exe"

if not exist "%PY%" goto NOENV

"%PY%" build_guides.py %*
set "RC=%ERRORLEVEL%"

echo.
if "%RC%"=="0" (
  echo [OK] Done. guides.html has been updated.
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
