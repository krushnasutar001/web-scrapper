@echo off
setlocal enabledelayedexpansion

REM ========================================
REM    SCRALYTICS HUB SMART LAUNCHER v2.0
REM ========================================

echo ========================================
echo     SCRALYTICS HUB SMART LAUNCHER v2.0
echo ========================================
echo.
echo Working directory: %CD%
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo Node.js detected: 
node --version
echo.

REM Function to kill processes on specific ports
echo [1/6] Terminating existing processes on ports 3000, 3001, 5000, 5001...

REM Kill processes on port 3000 (Frontend)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000') do (
    if not "%%a"=="" (
        echo Terminating process PID: %%a on port 3000
        taskkill /PID %%a /F >nul 2>&1
    )
)

REM Kill processes on port 3001 (Backend alternative)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3001') do (
    if not "%%a"=="" (
        echo Terminating process PID: %%a on port 3001
        taskkill /PID %%a /F >nul 2>&1
    )
)

REM Kill processes on port 5000 (Legacy Backend)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5000') do (
    if not "%%a"=="" (
        echo Terminating process PID: %%a on port 5000
        taskkill /PID %%a /F >nul 2>&1
    )
)

REM Kill processes on port 5001 (New Backend)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5001') do (
    if not "%%a"=="" (
        echo Terminating process PID: %%a on port 5001
        taskkill /PID %%a /F >nul 2>&1
    )
)

REM Kill any remaining Node.js processes
echo Terminating any remaining Node.js processes...
taskkill /IM node.exe /F >nul 2>&1
taskkill /IM npm.exe /F >nul 2>&1

echo Process cleanup completed.
echo.

REM Wait for ports to be available
echo [2/6] Waiting for ports to be available...
timeout /t 3 /nobreak >nul
echo.

REM Clear DNS cache
echo [3/6] Clearing DNS cache...
ipconfig /flushdns >nul 2>&1
echo DNS cache cleared.
echo.

REM Check and install dependencies
echo [4/6] Checking dependencies...

REM Check backend dependencies
if not exist "backend\node_modules" (
    echo Installing backend dependencies...
    cd backend
    call npm install
    if errorlevel 1 (
        echo ERROR: Failed to install backend dependencies
        pause
        exit /b 1
    )
    cd ..
) else (
    echo Backend dependencies already installed.
)

REM Check frontend dependencies
if not exist "frontend\node_modules" (
    echo Installing frontend dependencies...
    cd frontend
    call npm install
    if errorlevel 1 (
        echo ERROR: Failed to install frontend dependencies
        pause
        exit /b 1
    )
    cd ..
) else (
    echo Frontend dependencies already installed.
)

echo Dependencies check completed.
echo.

REM Update backend port configuration
echo [5/6] Configuring backend port...
if exist "backend\.env" (
    powershell -Command "(Get-Content 'backend\.env') -replace 'PORT=.*', 'PORT=5001' | Set-Content 'backend\.env'"
    echo Backend configured for port 5001.
) else (
    echo Creating backend .env file...
    (
        echo # LinkedIn Automation SaaS Backend Configuration
        echo NODE_ENV=development
        echo PORT=5001
        echo FRONTEND_URL=http://localhost:3000
        echo.
        echo # Database Configuration ^(MySQL^)
        echo DB_HOST=localhost
        echo DB_PORT=3306
        echo DB_USER=root
        echo DB_PASSWORD=Krushna_Sutar@0809
        echo DB_NAME=linkedin_automation_saas
        echo.
        echo # JWT Configuration
        echo JWT_SECRET=linkedin-automation-jwt-secret-key-production
        echo JWT_REFRESH_SECRET=linkedin-automation-refresh-secret-key-production
        echo JWT_EXPIRES_IN=1h
        echo JWT_REFRESH_EXPIRES_IN=7d
    ) > "backend\.env"
    echo Backend .env file created.
)
echo.

REM Update frontend API configuration
echo Configuring frontend API endpoint...
if exist "frontend\src\services\api.js" (
    powershell -Command "(Get-Content 'frontend\src\services\api.js') -replace 'localhost:3001', 'localhost:5001' -replace 'localhost:5000', 'localhost:5001' | Set-Content 'frontend\src\services\api.js'"
    echo Frontend API configured for backend port 5001.
)
echo.

REM Start services
echo [6/6] Starting Scralytics Hub services...
echo.
echo ========================================
echo     SCRALYTICS HUB SYSTEM STARTING
echo ========================================
echo.
echo Starting Scralytics Hub Launcher...
echo Frontend: http://localhost:3000
echo Backend: http://localhost:5001
echo Login: test@example.com / password123
echo.
echo Press Ctrl+C to stop all services
echo.
echo ========================================
echo     SCRALYTICS HUB - LinkedIn Automation
echo     Automate. Enrich. Analyze.
echo ========================================
echo.

REM Start backend server
echo Starting Backend Server on port 5001...
start "Scralytics Hub Backend" cmd /k "cd /d %CD%\backend && npm start"

REM Wait for backend to start
echo Waiting for backend to initialize...
timeout /t 5 /nobreak >nul

REM Check if backend is running
netstat -an | findstr :5001 >nul
if errorlevel 1 (
    echo WARNING: Backend may not have started properly
    echo Check the backend terminal window for errors
) else (
    echo Backend server started successfully on port 5001
)

echo.
echo Starting Frontend Server on port 3000...
start "Scralytics Hub Frontend" cmd /k "cd /d %CD%\frontend && npm start"

REM Wait for frontend to start
echo Waiting for frontend to initialize...
timeout /t 8 /nobreak >nul

REM Check if frontend is running
netstat -an | findstr :3000 >nul
if errorlevel 1 (
    echo WARNING: Frontend may not have started properly
    echo Check the frontend terminal window for errors
) else (
    echo Frontend server started successfully on port 3000
    echo.
    echo ========================================
    echo     SCRALYTICS HUB READY!
    echo ========================================
    echo.
    echo 🚀 Frontend: http://localhost:3000
    echo 🔧 Backend API: http://localhost:5001
    echo 📊 Health Check: http://localhost:5001/health
    echo.
    echo 👤 Default Login:
    echo    Email: test@example.com
    echo    Password: password123
    echo.
    echo ✅ System is ready for use!
    echo.
    REM Auto-open browser
    start http://localhost:3000
)

echo.
echo Services are starting in separate windows...
echo Close this window or press Ctrl+C to stop monitoring.
echo.

REM Keep launcher running to monitor services
:monitor
timeout /t 10 /nobreak >nul

REM Check if services are still running
netstat -an | findstr :3000 >nul
set frontend_running=!errorlevel!

netstat -an | findstr :5001 >nul
set backend_running=!errorlevel!

if !frontend_running! neq 0 (
    echo WARNING: Frontend service stopped unexpectedly
)

if !backend_running! neq 0 (
    echo WARNING: Backend service stopped unexpectedly
)

if !frontend_running! equ 0 if !backend_running! equ 0 (
    REM Both services running, continue monitoring
    goto monitor
) else (
    echo One or more services have stopped. Check the service windows for errors.
    pause
    exit /b 1
)