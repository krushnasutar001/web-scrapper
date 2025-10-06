@echo off
setlocal

title LinkedIn Automation SaaS Launcher
echo ===============================
echo   LinkedIn SaaS Dev Launcher
echo ===============================
echo.

REM Check Node.js availability
where node >nul 2>nul
IF ERRORLEVEL 1 (
  echo [ERROR] Node.js not found. Please install Node.js 16+ from https://nodejs.org/
  echo Press any key to exit...
  pause >nul
  exit /b 1
)

REM Configure ports
set BACKEND_PORT=5002
set FRONTEND_PORT=3001
echo Using backend port %BACKEND_PORT% and frontend port %FRONTEND_PORT%

REM Resolve repo root
set REPO_ROOT=%~dp0
set BACKEND_DIR=%REPO_ROOT%backend
set FRONTEND_DIR=%REPO_ROOT%frontend

echo Starting backend on port %BACKEND_PORT% ...
start "LinkedIn SaaS Backend" cmd /c "set PORT=%BACKEND_PORT% && set FRONTEND_URL=http://localhost:%FRONTEND_PORT% && set DB_NAME=linkedin_automation && cd /d %BACKEND_DIR% && npm run dev"

echo Starting frontend on port %FRONTEND_PORT% ...
start "LinkedIn SaaS Frontend" cmd /c "set PORT=%FRONTEND_PORT% && set REACT_APP_API_URL=http://localhost:%BACKEND_PORT% && cd /d %FRONTEND_DIR% && npm start"

echo.
echo Frontend URL:  http://localhost:%FRONTEND_PORT%/
echo API Base URL:  http://localhost:%BACKEND_PORT%/api
echo.
echo Environment alignment:
echo   FRONTEND_URL      = http://localhost:%FRONTEND_PORT%
echo   REACT_APP_API_URL = http://localhost:%BACKEND_PORT%
echo   DB_NAME (backend) = linkedin_automation
echo.
echo Two terminal windows should appear (Backend and Frontend).
echo You can close this window; the apps will keep running.
echo.
pause
endlocal