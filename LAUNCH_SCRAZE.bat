@echo off
setlocal enabledelayedexpansion

REM ========================================
REM    SCRAZE SMART LAUNCHER
REM    Intelligent Start/Restart System
REM ========================================

echo.
echo ========================================
echo    SCRAZE SMART LAUNCHER
echo    Kill existing + Fresh start
echo ========================================
echo.

REM Change to the correct directory
cd /d "%~dp0"

echo [1/5] Checking for existing Scraze processes...

REM Kill existing Node.js processes on ports 3000 and 3001
echo Checking port 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000') do (
    if not "%%a"=="" (
        echo Found process %%a using port 3000, terminating...
        taskkill /PID %%a /F >nul 2>&1
    )
)

echo Checking port 3001...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001') do (
    if not "%%a"=="" (
        echo Found process %%a using port 3001, terminating...
        taskkill /PID %%a /F >nul 2>&1
    )
)

REM Kill any remaining Node.js processes that might be related to our app
echo [2/5] Cleaning up any remaining Node.js processes...
for /f "tokens=2" %%a in ('tasklist /FI "IMAGENAME eq node.exe" /FO CSV ^| findstr /V "INFO:"') do (
    if not "%%a"=="" (
        set "pid=%%a"
        set "pid=!pid:"=!"
        echo Terminating Node.js process !pid!...
        taskkill /PID !pid! /F >nul 2>&1
    )
)

REM Wait a moment for processes to fully terminate
echo [3/5] Waiting for processes to terminate...
timeout /t 3 /nobreak >nul

REM Clear any potential port locks
echo [4/5] Clearing port locks...
netsh int ipv4 reset >nul 2>&1

echo [5/5] Starting fresh Scraze instance...
echo.
echo ========================================
echo    LAUNCHING SCRAZE
echo ========================================
echo.

REM Start the main launcher
call START_SCRAZE.bat

REM If we reach here, the launcher has exited
echo.
echo ========================================
echo    SCRAZE LAUNCHER EXITED
echo ========================================
echo.
echo Press any key to restart or close this window to exit...
pause >nul

REM Restart if user pressed a key
goto :start

:start
cls
goto :eof