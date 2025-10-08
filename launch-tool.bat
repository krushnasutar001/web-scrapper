@echo off
setlocal ENABLEDELAYEDEXPANSION

REM Scralytics Tool Launcher (Windows)
REM Starts backend and frontend in separate windows
REM Reads EXTENSION_ID from .env if available

title Scralytics Launcher
echo(
echo Launching Scralytics Tool (backend + frontend)
echo(

REM Read EXTENSION_ID / REACT_APP_EXTENSION_ID from .env
if exist .env (
  for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
    if /I "%%A"=="EXTENSION_ID" set "EXTENSION_ID=%%B"
    if /I "%%A"=="REACT_APP_EXTENSION_ID" set "REACT_APP_EXTENSION_ID=%%B"
  )
)

REM Default to known extension ID if none provided
if not defined EXTENSION_ID set "EXTENSION_ID=lfoboeoobhkaajgkfommkckedmpckjmp"
if not defined REACT_APP_EXTENSION_ID if defined EXTENSION_ID set "REACT_APP_EXTENSION_ID=%EXTENSION_ID%"
if not defined REACT_APP_API_BASE_URL set "REACT_APP_API_BASE_URL=http://localhost:5001"

echo Extension ID: %REACT_APP_EXTENSION_ID%

REM Start Backend (Port 5001)
if exist backend (
  echo( Starting backend...
  start "Scralytics Backend" cmd /c "pushd backend && set EXTENSION_ID=%EXTENSION_ID% && npm run dev"
) else (
  echo( Backend directory not found. Expected: %CD%\backend
)

REM Start Frontend (Port 3021)
if exist frontend (
  echo( Starting frontend on PORT=3021 ...
  set "PORT=3021"
  set "BROWSER=none"
  if defined REACT_APP_EXTENSION_ID set "REACT_APP_EXTENSION_ID=%REACT_APP_EXTENSION_ID%"
  start "Scralytics Frontend" cmd /c "pushd frontend && set PORT=3021 && set BROWSER=none && set REACT_APP_EXTENSION_ID=%REACT_APP_EXTENSION_ID% && set REACT_APP_API_BASE_URL=%REACT_APP_API_BASE_URL% && npm start"
) else (
  echo( Frontend directory not found. Expected: %CD%\frontend
)

echo(
echo Backend: http://localhost:5001
echo Frontend: http://localhost:3021
echo(
echo Tip: If ports are busy, edit PORT in this script.
echo(
endlocal
exit /b 0