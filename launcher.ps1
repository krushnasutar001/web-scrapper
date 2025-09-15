# ========================================
#    SCRAZE SMART LAUNCHER v2.0 (PowerShell)
# ========================================

Param(
    [switch]$Force,
    [switch]$SkipBrowser
)

# Set console title and colors
$Host.UI.RawUI.WindowTitle = "Scraze Smart Launcher"

function Write-Header {
    param([string]$Text)
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "    $Text" -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Step {
    param([string]$Step, [string]$Message)
    Write-Host "[$Step] $Message" -ForegroundColor Green
}

function Write-Success {
    param([string]$Message)
    Write-Host "✅ $Message" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "⚠️  $Message" -ForegroundColor Yellow
}

function Write-Error-Custom {
    param([string]$Message)
    Write-Host "❌ $Message" -ForegroundColor Red
}

function Kill-ProcessOnPort {
    param([int]$Port)
    
    try {
        $processes = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess
        
        foreach ($pid in $processes) {
            if ($pid -and $pid -ne 0) {
                Write-Host "Terminating process PID: $pid on port $Port" -ForegroundColor Yellow
                Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
            }
        }
    }
    catch {
        # Port not in use, continue
    }
}

function Test-Port {
    param([int]$Port)
    
    try {
        $connection = Test-NetConnection -ComputerName "localhost" -Port $Port -InformationLevel Quiet -WarningAction SilentlyContinue
        return $connection
    }
    catch {
        return $false
    }
}

function Wait-ForPort {
    param([int]$Port, [int]$TimeoutSeconds = 30)
    
    $timeout = (Get-Date).AddSeconds($TimeoutSeconds)
    
    while ((Get-Date) -lt $timeout) {
        if (Test-Port -Port $Port) {
            return $true
        }
        Start-Sleep -Seconds 1
    }
    
    return $false
}

function Install-Dependencies {
    param([string]$Directory, [string]$Name)
    
    $nodeModulesPath = Join-Path $Directory "node_modules"
    
    if (-not (Test-Path $nodeModulesPath)) {
        Write-Host "Installing $Name dependencies..." -ForegroundColor Yellow
        
        Push-Location $Directory
        try {
            $result = Start-Process -FilePath "npm" -ArgumentList "install" -Wait -PassThru -NoNewWindow
            if ($result.ExitCode -ne 0) {
                throw "npm install failed with exit code $($result.ExitCode)"
            }
            Write-Success "$Name dependencies installed successfully"
        }
        catch {
            Write-Error-Custom "Failed to install $Name dependencies: $($_.Exception.Message)"
            Pop-Location
            return $false
        }
        finally {
            Pop-Location
        }
    }
    else {
        Write-Success "$Name dependencies already installed"
    }
    
    return $true
}

function Update-EnvFile {
    $envPath = "backend\.env"
    
    if (Test-Path $envPath) {
        # Update existing .env file
        $content = Get-Content $envPath
        $content = $content -replace '^PORT=.*', 'PORT=5001'
        $content = $content -replace '^DB_PASSWORD=.*', 'DB_PASSWORD=Krushna_Sutar@0809'
        $content = $content -replace '^DB_NAME=.*', 'DB_NAME=linkedin_automation_saas'
        $content | Set-Content $envPath
        Write-Success "Backend .env file updated"
    }
    else {
        # Create new .env file
        $envContent = @"
# LinkedIn Automation SaaS Backend Configuration
NODE_ENV=development
PORT=5001
FRONTEND_URL=http://localhost:3000

# Database Configuration (MySQL)
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=Krushna_Sutar@0809
DB_NAME=linkedin_automation_saas

# JWT Configuration
JWT_SECRET=linkedin-automation-jwt-secret-key-production
JWT_REFRESH_SECRET=linkedin-automation-refresh-secret-key-production
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# Job Worker Configuration
MAX_CONCURRENT_JOBS=3
URL_PROCESSING_DELAY=2000
SUCCESS_RATE=0.85
"@
        $envContent | Set-Content $envPath
        Write-Success "Backend .env file created"
    }
}

function Update-FrontendConfig {
    $apiConfigPaths = @(
        "frontend\src\services\api.js",
        "frontend\src\config\api.js",
        "frontend\src\utils\api.js"
    )
    
    foreach ($path in $apiConfigPaths) {
        if (Test-Path $path) {
            $content = Get-Content $path -Raw
            $content = $content -replace 'localhost:3001', 'localhost:5001'
            $content = $content -replace 'localhost:5000', 'localhost:5001'
            $content = $content -replace ':3001', ':5001'
            $content = $content -replace ':5000', ':5001'
            $content | Set-Content $path
            Write-Success "Updated API configuration in $path"
        }
    }
}

# Main execution
clear
Write-Header "SCRAZE SMART LAUNCHER v2.0"

Write-Host "Working directory: $(Get-Location)" -ForegroundColor Cyan
Write-Host ""

# Check Node.js installation
try {
    $nodeVersion = node --version
    Write-Success "Node.js detected: $nodeVersion"
}
catch {
    Write-Error-Custom "Node.js is not installed or not in PATH"
    Write-Host "Please install Node.js from https://nodejs.org/" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""

# Step 1: Terminate existing processes
Write-Step "1/7" "Terminating existing processes on ports 3000, 3001, 5000, 5001..."

$ports = @(3000, 3001, 5000, 5001)
foreach ($port in $ports) {
    Kill-ProcessOnPort -Port $port
}

# Kill any remaining Node.js processes if Force flag is used
if ($Force) {
    Write-Host "Force cleanup: Terminating all Node.js processes..." -ForegroundColor Yellow
    Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Get-Process -Name "npm" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}

Write-Success "Process cleanup completed"
Write-Host ""

# Step 2: Wait for ports to be available
Write-Step "2/7" "Waiting for ports to be available..."
Start-Sleep -Seconds 3
Write-Success "Port cleanup completed"
Write-Host ""

# Step 3: Clear DNS cache
Write-Step "3/7" "Clearing DNS cache..."
try {
    ipconfig /flushdns | Out-Null
    Write-Success "DNS cache cleared"
}
catch {
    Write-Warning "Could not clear DNS cache (may require admin privileges)"
}
Write-Host ""

# Step 4: Check directories
Write-Step "4/7" "Checking project structure..."

if (-not (Test-Path "backend")) {
    Write-Error-Custom "Backend directory not found"
    Read-Host "Press Enter to exit"
    exit 1
}

if (-not (Test-Path "frontend")) {
    Write-Error-Custom "Frontend directory not found"
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Success "Project directories found"
Write-Host ""

# Step 5: Install dependencies
Write-Step "5/7" "Checking and installing dependencies..."

$backendSuccess = Install-Dependencies -Directory "backend" -Name "Backend"
if (-not $backendSuccess) {
    Read-Host "Press Enter to exit"
    exit 1
}

$frontendSuccess = Install-Dependencies -Directory "frontend" -Name "Frontend"
if (-not $frontendSuccess) {
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""

# Step 6: Update configuration
Write-Step "6/7" "Updating configuration files..."

Update-EnvFile
Update-FrontendConfig

Write-Success "Configuration updated"
Write-Host ""

# Step 7: Start services
Write-Step "7/7" "Starting Scraze services..."
Write-Host ""

Write-Header "SCRAZE SYSTEM STARTING"

Write-Host "Starting Scraze Launcher..." -ForegroundColor Green
Write-Host "Frontend: http://localhost:3000" -ForegroundColor Cyan
Write-Host "Backend: http://localhost:5001" -ForegroundColor Cyan
Write-Host "Login: test@example.com / password123" -ForegroundColor Yellow
Write-Host ""
Write-Host "Press Ctrl+C to stop all services" -ForegroundColor Red
Write-Host ""

Write-Header "SCRAZE - LinkedIn Automation"
Write-Host "           Scrap with Craze!" -ForegroundColor Magenta
Write-Host ""

# Start backend server
Write-Host "Starting Backend Server on port 5001..." -ForegroundColor Yellow

$backendProcess = Start-Process -FilePath "powershell" -ArgumentList "-NoExit", "-Command", "cd '$PWD\backend'; npm start" -PassThru

# Wait for backend to start
Write-Host "Waiting for backend to initialize..." -ForegroundColor Yellow

if (Wait-ForPort -Port 5001 -TimeoutSeconds 30) {
    Write-Success "Backend server started successfully on port 5001"
}
else {
    Write-Warning "Backend may not have started properly - check the backend window"
}

Start-Sleep -Seconds 2

# Start frontend server
Write-Host "Starting Frontend Server on port 3000..." -ForegroundColor Yellow

$frontendProcess = Start-Process -FilePath "powershell" -ArgumentList "-NoExit", "-Command", "cd '$PWD\frontend'; npm start" -PassThru

# Wait for frontend to start
Write-Host "Waiting for frontend to initialize..." -ForegroundColor Yellow

if (Wait-ForPort -Port 3000 -TimeoutSeconds 45) {
    Write-Success "Frontend server started successfully on port 3000"
    
    Write-Host ""
    Write-Header "SCRAZE READY!"
    
    Write-Host "🚀 Frontend: http://localhost:3000" -ForegroundColor Green
    Write-Host "🔧 Backend API: http://localhost:5001" -ForegroundColor Green
    Write-Host "📊 Health Check: http://localhost:5001/health" -ForegroundColor Green
    Write-Host ""
    Write-Host "👤 Default Login:" -ForegroundColor Cyan
    Write-Host "   Email: test@example.com" -ForegroundColor White
    Write-Host "   Password: password123" -ForegroundColor White
    Write-Host ""
    Write-Success "System is ready for use!"
    Write-Host ""
    
    # Auto-open browser
    if (-not $SkipBrowser) {
        Write-Host "Opening browser..." -ForegroundColor Yellow
        Start-Process "http://localhost:3000"
    }
}
else {
    Write-Warning "Frontend may not have started properly - check the frontend window"
}

Write-Host ""
Write-Host "Services are running in separate windows..." -ForegroundColor Green
Write-Host "Close this window or press Ctrl+C to stop monitoring." -ForegroundColor Yellow
Write-Host ""

# Monitor services
try {
    while ($true) {
        Start-Sleep -Seconds 10
        
        # Check if processes are still running
        $backendRunning = Test-Port -Port 5001
        $frontendRunning = Test-Port -Port 3000
        
        if (-not $frontendRunning) {
            Write-Warning "Frontend service stopped unexpectedly"
        }
        
        if (-not $backendRunning) {
            Write-Warning "Backend service stopped unexpectedly"
        }
        
        if (-not $frontendRunning -and -not $backendRunning) {
            Write-Error-Custom "Both services have stopped. Exiting..."
            break
        }
    }
}
catch {
    Write-Host "\nLauncher stopped by user." -ForegroundColor Yellow
}
finally {
    Write-Host "\nCleaning up..." -ForegroundColor Yellow
    
    # Optionally kill the started processes
    if ($backendProcess -and -not $backendProcess.HasExited) {
        Write-Host "Stopping backend process..." -ForegroundColor Yellow
        $backendProcess.Kill()
    }
    
    if ($frontendProcess -and -not $frontendProcess.HasExited) {
        Write-Host "Stopping frontend process..." -ForegroundColor Yellow
        $frontendProcess.Kill()
    }
    
    Write-Host "Cleanup completed." -ForegroundColor Green
}

Read-Host "Press Enter to exit"