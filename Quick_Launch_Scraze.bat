@echo off
REM ========================================
REM    SCRALYTICS HUB QUICK LAUNCHER
REM    Double-click to start Scralytics Hub
REM ========================================

REM Set window title
title Scralytics Hub LinkedIn Automation - Quick Launcher

REM Change to the script directory
cd /d "%~dp0"

REM Check if we're in the right directory
if not exist "start-scralytics-hub.bat" (
    echo ❌ Error: start-scralytics-hub.bat not found!
    echo Please make sure this launcher is in the linkedin-automation-saas folder.
    echo Current directory: %CD%
    pause
    exit /b 1
)

echo.
echo ========================================
echo    🚀 SCRALYTICS HUB QUICK LAUNCHER
echo    Automate. Enrich. Analyze.
echo ========================================
echo.
echo 📍 Directory: %CD%
echo 🔄 Starting Scralytics Hub system...
echo.

REM Try PowerShell launcher first (more robust)
if exist "scralytics-hub-launcher.ps1" (
    echo 💡 Using PowerShell launcher for better process management...
    powershell -ExecutionPolicy Bypass -File "scralytics-hub-launcher.ps1"
) else (
    echo 💡 Using batch launcher...
    call "start-scralytics-hub.bat"
)

REM If we reach here, the launcher has exited
echo.
echo ========================================
echo    SCRALYTICS HUB LAUNCHER FINISHED
echo ========================================
echo.
echo Options:
echo [R] Restart Scralytics Hub
echo [D] Open Debug Tool
echo [Any other key] Exit
echo.
set /p choice="Your choice: "

if /i "%choice%"=="R" (
    echo 🔄 Restarting Scralytics Hub...
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