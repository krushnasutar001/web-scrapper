@echo off
cd /d "%~dp0"
echo.
echo ========================================
echo    SCRAZE - LinkedIn Automation
echo    Scrap with Craze!
echo ========================================
echo.
echo Starting Scraze services...
echo.

REM Check if PowerShell is available
powershell -Command "Write-Host 'PowerShell detected' -ForegroundColor Green"
if %errorlevel% neq 0 (
    echo ERROR: PowerShell not found!
    echo Please install PowerShell to run Scraze.
    pause
    exit /b 1
)

REM Run the PowerShell launcher
echo Launching Scraze...
powershell -ExecutionPolicy Bypass -File "%~dp0scraze-launcher.ps1"

REM Keep window open if there's an error
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Failed to start Scraze!
    echo Check the error messages above.
    pause
)