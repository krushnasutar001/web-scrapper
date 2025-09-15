@echo off
REM Simple launcher for Scraze LinkedIn Automation
REM Double-click this file to start the system

cd /d "%~dp0"

REM Check if PowerShell is available
powershell -Command "Get-Host" >nul 2>&1
if errorlevel 1 (
    echo PowerShell not available, using batch launcher...
    call launcher.bat
) else (
    echo Starting Scraze with PowerShell launcher...
    powershell -ExecutionPolicy Bypass -File "launcher.ps1"
)

pause