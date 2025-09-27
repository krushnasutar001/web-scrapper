@echo off
REM ========================================
REM    SCRALYTICS HUB SMART LAUNCHER
REM    Batch version with process cleanup
REM ========================================

echo.
echo ========================================
echo    SCRALYTICS HUB SMART LAUNCHER
echo ========================================
echo.

REM Change to script directory
cd /d "%~dp0"

REM Step 1: Check for existing processes
echo [1/5] Checking for existing Scralytics Hub processes...

REM Kill existing Node.js processes on our ports
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 "') do (
    if not "%%a"=="0" (
        echo Killing process on port 3000: %%a
        taskkill /F /PID %%a >nul 2>&1
    )
)

for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5001 "') do (
    if not "%%a"=="0" (
        echo Killing process on port 5001: %%a
        taskkill /F /PID %%a >nul 2>&1
    )
)

REM Step 2: Clean up any remaining Node processes
echo [2/5] Cleaning up Node.js processes...
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM npm.exe >nul 2>&1

REM Step 3: Wait for cleanup
echo [3/5] Waiting for cleanup to complete...
timeout /t 3 /nobreak >nul

REM Step 4: Verify ports are free
echo [4/5] Verifying ports are available...
netstat -an | findstr ":3000 " >nul
if %errorlevel% equ 0 (
    echo Warning: Port 3000 may still be in use
)

netstat -an | findstr ":5001 " >nul
if %errorlevel% equ 0 (
    echo Warning: Port 5001 may still be in use
)

REM Step 5: Launch fresh instance
echo [5/5] Starting fresh Scralytics Hub instance...
echo.
echo ========================================
echo    LAUNCHING SCRALYTICS HUB
echo ========================================
echo.

REM Start the main launcher
call start-scralytics-hub.bat

echo.
echo ========================================
echo    SCRALYTICS HUB LAUNCHER EXITED
echo ========================================
echo.
echo Press any key to restart or close this window to exit...
pause >nul
goto :start

:start
cls
goto :eof