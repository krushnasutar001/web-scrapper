@echo off
cd /d "%~dp0"
echo.
echo ========================================
echo    SCRALYTICS HUB - LinkedIn Automation
echo    Automate. Enrich. Analyze.
echo ========================================
echo.
echo Starting Scralytics Hub services...
echo.

REM Check if PowerShell is available
powershell -Command "Write-Host 'PowerShell detected' -ForegroundColor Green"
if %errorlevel% neq 0 (
    echo ERROR: PowerShell not found!
    echo Please install PowerShell to run Scralytics Hub.
    pause
    exit /b 1
)

REM Run the PowerShell launcher
echo Launching Scralytics Hub...
powershell -ExecutionPolicy Bypass -File "%~dp0scraze-launcher.ps1"

REM Keep window open if there's an error
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Failed to start Scralytics Hub!
    echo Check the error messages above.
    pause
)