@echo off
REM ========================================
REM    SCRAZE QUICK LAUNCHER
REM    Double-click to start Scraze
REM ========================================

REM Set window title
title Scraze LinkedIn Automation - Quick Launcher

REM Change to the script directory
cd /d "%~dp0"

REM Check if we're in the right directory
if not exist "START_SCRAZE.bat" (
    echo ❌ Error: START_SCRAZE.bat not found!
    echo Please make sure this launcher is in the linkedin-automation-saas folder.
    echo Current directory: %CD%
    pause
    exit /b 1
)

echo.
echo ========================================
echo    🚀 SCRAZE QUICK LAUNCHER
echo    LinkedIn Automation Made Easy
echo ========================================
echo.
echo 📍 Directory: %CD%
echo 🔄 Starting Scraze system...
echo.

REM Try PowerShell launcher first (more robust)
if exist "LAUNCH_SCRAZE.ps1" (
    echo 💡 Using PowerShell launcher for better process management...
    powershell -ExecutionPolicy Bypass -File "LAUNCH_SCRAZE.ps1"
) else (
    echo 💡 Using batch launcher...
    call "LAUNCH_SCRAZE.bat"
)

REM If we reach here, the launcher has exited
echo.
echo ========================================
echo    SCRAZE LAUNCHER FINISHED
echo ========================================
echo.
echo Options:
echo [R] Restart Scraze
echo [D] Open Debug Tool
echo [Any other key] Exit
echo.
set /p choice="Your choice: "

if /i "%choice%"=="R" (
    echo 🔄 Restarting Scraze...
    goto :start
)

if /i "%choice%"=="D" (
    echo 🔧 Opening debug tool...
    if exist "frontend-debug-auth.html" (
        start "" "frontend-debug-auth.html"
    ) else (
        echo ❌ Debug tool not found!
    )
    pause
)

echo 👋 Goodbye!
exit /b 0

:start
cls
goto :eof