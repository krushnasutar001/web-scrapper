# ========================================
#    SCRAZE SMART LAUNCHER (PowerShell)
#    Intelligent Start/Restart System
# ========================================

param(
    [switch]$Force,
    [switch]$Quiet
)

# Set execution policy for this session
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process -Force

# Change to script directory
Set-Location $PSScriptRoot

function Write-Status {
    param([string]$Message, [string]$Color = "White")
    if (-not $Quiet) {
        Write-Host $Message -ForegroundColor $Color
    }
}

function Write-Header {
    param([string]$Title)
    if (-not $Quiet) {
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Cyan
        Write-Host "   $Title" -ForegroundColor Yellow
        Write-Host "========================================" -ForegroundColor Cyan
        Write-Host ""
    }
}

# Main execution
Write-Header "SCRAZE SMART LAUNCHER"
Write-Status "Working directory: $PWD" "Gray"

# Step 1: Kill processes on ports 3000 and 3001
Write-Status "[1/5] Checking for processes on ports 3000 and 3001..." "Yellow"

# Kill processes on port 3000
$port3000 = netstat -ano | Select-String ":3000"
foreach ($line in $port3000) {
    if ($line -match '\s+(\d+)\s*$') {
        $processId = $matches[1]
        if ($processId -and $processId -ne "0") {
            Write-Status "Terminating process PID: $processId using port 3000" "Red"
            taskkill /PID $processId /F | Out-Null
        }
    }
}

# Kill processes on port 3001
$port3001 = netstat -ano | Select-String ":3001"
foreach ($line in $port3001) {
    if ($line -match '\s+(\d+)\s*$') {
        $processId = $matches[1]
        if ($processId -and $processId -ne "0") {
            Write-Status "Terminating process PID: $processId using port 3001" "Red"
            taskkill /PID $processId /F | Out-Null
        }
    }
}

# Step 2: Kill Node.js processes if Force is specified
if ($Force) {
    Write-Status "[2/5] Force cleaning up Node.js processes..." "Yellow"
    $nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue
    foreach ($process in $nodeProcesses) {
        Write-Status "Force terminating Node.js process (PID: $($process.Id))" "Red"
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    }
} else {
    Write-Status "[2/5] Skipping Node.js cleanup (use -Force to enable)" "Gray"
}

# Step 3: Wait for ports to be free
Write-Status "[3/5] Waiting for ports to be available..." "Yellow"
Start-Sleep -Seconds 3

# Step 4: Clear DNS cache
Write-Status "[4/5] Clearing DNS cache..." "Yellow"
try {
    ipconfig /flushdns | Out-Null
} catch {
    Write-Status "Warning: Could not clear DNS cache" "Yellow"
}

# Step 5: Start Scraze
Write-Status "[5/5] Launching Scraze..." "Green"
Write-Header "SCRAZE SYSTEM STARTING"

if (Test-Path "START_SCRAZE.bat") {
    Write-Status "Starting Scraze Launcher..." "Green"
    Write-Status "Frontend: http://localhost:3000" "Cyan"
    Write-Status "Backend: http://localhost:3001" "Cyan"
    Write-Status "Login: test@example.com / password123" "Magenta"
    Write-Status ""
    Write-Status "Press Ctrl+C to stop, or close this window to exit." "Yellow"
    
    # Start the batch file
    & ".\START_SCRAZE.bat"
} else {
    Write-Status "START_SCRAZE.bat not found in current directory!" "Red"
    Write-Status "Current directory: $PWD" "Gray"
    exit 1
}

Write-Header "SCRAZE LAUNCHER FINISHED"

if (-not $Quiet) {
    Write-Status "Press any key to restart Scraze or close this window to exit..." "Yellow"
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    
    # Restart
    Write-Status "Restarting Scraze..." "Cyan"
    & $PSCommandPath @PSBoundParameters
}