# Scralytics Hub LinkedIn Automation Launcher
# PowerShell script to start both backend and frontend services

# Display banner
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "           SCRALYTICS HUB LAUNCHER             " -ForegroundColor Yellow
Write-Host "       Automate. Enrich. Analyze.        " -ForegroundColor Yellow
Write-Host "   LinkedIn Automation Made Easy      " -ForegroundColor White
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Node.js is installed
Write-Host "Checking system requirements..." -ForegroundColor Blue

try {
    $nodeVersion = node --version 2>$null
    if ($nodeVersion) {
        Write-Host "Node.js detected: $nodeVersion" -ForegroundColor Green
    } else {
        Write-Host "Node.js not found. Please install Node.js from https://nodejs.org/" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
} catch {
    Write-Host "Node.js not found. Please install Node.js from https://nodejs.org/" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Check directories
$backendPath = Join-Path $PSScriptRoot "backend"
$frontendPath = Join-Path $PSScriptRoot "frontend"

if (-not (Test-Path $backendPath)) {
    Write-Host "Backend directory not found: $backendPath" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

if (-not (Test-Path $frontendPath)) {
    Write-Host "Frontend directory not found: $frontendPath" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "Directories found" -ForegroundColor Green

Write-Host ""
Write-Host "Starting Scralytics Hub Services..." -ForegroundColor Green
Write-Host ""

# Start backend
Write-Host "Starting Backend Server..." -ForegroundColor Blue
$backendScript = Join-Path $backendPath "linkedin-account-manager.js"

if (-not (Test-Path $backendScript)) {
    Write-Host "Backend script not found: $backendScript" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

try {
    $backendProcess = Start-Process -FilePath "node" -ArgumentList $backendScript -WorkingDirectory $backendPath -PassThru -WindowStyle Hidden
    Start-Sleep -Seconds 3

    if ($backendProcess -and !$backendProcess.HasExited) {
        Write-Host "Backend started (PID: $($backendProcess.Id))" -ForegroundColor Green
        Write-Host "Backend: http://localhost:3001" -ForegroundColor Cyan
    } else {
        Write-Host "Backend failed to start" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
} catch {
    Write-Host "Error starting backend: $($_.Exception.Message)" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Start frontend
Write-Host "Starting Frontend..." -ForegroundColor Blue
Write-Host "This may take a moment to compile..." -ForegroundColor Yellow

try {
    # Use cmd to run npm start for better compatibility
    $frontendProcess = Start-Process -FilePath "cmd" -ArgumentList "/c", "cd /d `"$frontendPath`" && npm start" -PassThru -WindowStyle Hidden
    Start-Sleep -Seconds 15

    if ($frontendProcess -and !$frontendProcess.HasExited) {
        Write-Host "Frontend started (PID: $($frontendProcess.Id))" -ForegroundColor Green
        Write-Host "Frontend: http://localhost:3000" -ForegroundColor Cyan
    } else {
        Write-Host "Frontend failed to start - trying alternative method" -ForegroundColor Yellow
        # Alternative: Start frontend in a new window
        Start-Process -FilePath "cmd" -ArgumentList "/k", "cd /d `"$frontendPath`" && npm start" -WindowStyle Normal
        Write-Host "Frontend started in separate window" -ForegroundColor Green
        Write-Host "Frontend: http://localhost:3000" -ForegroundColor Cyan
    }
} catch {
    Write-Host "Error starting frontend: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Starting frontend in separate window as fallback" -ForegroundColor Yellow
    try {
        Start-Process -FilePath "cmd" -ArgumentList "/k", "cd /d `"$frontendPath`" && npm start" -WindowStyle Normal
        Write-Host "Frontend started in separate window" -ForegroundColor Green
        Write-Host "Frontend: http://localhost:3000" -ForegroundColor Cyan
    } catch {
        Write-Host "Could not start frontend. Please run manually: cd $frontendPath && npm start" -ForegroundColor Red
    }
}

# Success!
Write-Host ""
Write-Host "Scralytics Hub is now running!" -ForegroundColor Green
Write-Host ""
Write-Host "Service Status:" -ForegroundColor White
Write-Host "   Backend:  http://localhost:3001" -ForegroundColor Green
Write-Host "   Frontend: http://localhost:3000" -ForegroundColor Green
Write-Host ""

# Open browser
Write-Host "Opening browser..." -ForegroundColor Cyan
try {
    Start-Process "http://localhost:3000"
} catch {
    Write-Host "Could not open browser. Please navigate to: http://localhost:3000" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Press Ctrl+C to stop all services" -ForegroundColor Yellow
Write-Host "Backend health: http://localhost:3001/health" -ForegroundColor Cyan
Write-Host ""
Write-Host "Default Login: test@example.com / password123" -ForegroundColor Green
Write-Host ""

# Keep script running
try {
    while ($true) {
        Start-Sleep -Seconds 1
        
        # Check if processes are still running
        if ($backendProcess.HasExited) {
            Write-Host "Backend process has stopped" -ForegroundColor Red
            break
        }
        
        if ($frontendProcess.HasExited) {
            Write-Host "Frontend process has stopped" -ForegroundColor Red
            break
        }
    }
} catch {
    Write-Host "\nShutting down services..." -ForegroundColor Yellow
    
    if ($backendProcess -and !$backendProcess.HasExited) {
        $backendProcess.Kill()
        Write-Host "Backend stopped" -ForegroundColor Green
    }
    
    if ($frontendProcess -and !$frontendProcess.HasExited) {
        $frontendProcess.Kill()
        Write-Host "Frontend stopped" -ForegroundColor Green
    }
    
    Write-Host "Scralytics Hub services stopped. Goodbye!" -ForegroundColor Cyan
}