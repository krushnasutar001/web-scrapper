@echo off
REM Simple launcher for Scralytics Hub LinkedIn Automation
REM Double-click this file to start the system

cd /d "%~dp0"

REM Check if PowerShell is available
powershell -Command "Get-Host" >nul 2>&1
if errorlevel 1 (
    echo ERROR: Failed to start Scralytics Hub!
) else (
    echo Launching Scralytics Hub...
    powershell -ExecutionPolicy Bypass -File "%~dp0scralytics-hub-launcher.ps1"
)

pause