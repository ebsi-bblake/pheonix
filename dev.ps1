param(
    [ValidateSet("start", "stop", "restart", "status", "logs")]
    [string]$Action = "status"
)

$ErrorActionPreference = "Stop"

$frontendPort = 8080
$backendPort  = 3001

$frontendPidFile = ".frontend.pid"
$backendPidFile  = ".backend.pid"

$frontendLog = "frontend.log"
$backendLog  = "backend.log"

function Touch-File($path) {
    if (-not (Test-Path $path)) { New-Item -Path $path -ItemType File | Out-Null }
}

function Start-Frontend {
    Write-Host "▶️ Starting frontend..."
    Push-Location frontend
    if (-not (Test-Path node_modules)) {
        Write-Host "📦 Installing frontend deps..."
        npm install --save-dev serve
    }
    Pop-Location

    Touch-File $frontendLog
    $proc = Start-Process `
        -FilePath "npx" `
        -ArgumentList "serve . -l $frontendPort" `
        -WorkingDirectory "$PSScriptRoot/frontend" `
        -RedirectStandardOutput "$PSScriptRoot/$frontendLog" `
        -RedirectStandardError "$PSScriptRoot/$frontendLog" `
        -WindowStyle Hidden `
        -PassThru

    $proc.Id | Out-File -Encoding ascii $frontendPidFile
    Write-Host "✅ Frontend running at http://localhost:$frontendPort (PID $($proc.Id))"
}

function Start-Backend {
    Write-Host "▶️ Starting backend..."
    Push-Location backend
    if (-not (Test-Path node_modules)) {
        Write-Host "📦 Installing backend deps..."
        npm install
    }
    Pop-Location

    Touch-File $backendLog
    $proc = Start-Process `
        -FilePath "node" `
        -ArgumentList "server.js" `
        -WorkingDirectory "$PSScriptRoot/backend" `
        -RedirectStandardOutput "$PSScriptRoot/$backendLog" `
        -RedirectStandardError "$PSScriptRoot/$backendLog" `
        -WindowStyle Hidden `
        -PassThru

    $proc.Id | Out-File -Encoding ascii $backendPidFile
    Write-Host "✅ Backend running at http://localhost:$backendPort (PID $($proc.Id))"
}

function Stop-ByPidFile($pidFile, $name, $pattern) {
    if (Test-Path $pidFile) {
        $pid = Get-Content $pidFile | Select-Object -First 1
        try {
            if (Get-Process -Id $pid -ErrorAction SilentlyContinue) {
                Stop-Process -Id $pid -Force
                Write-Host "🛑 $name stopped (PID $pid)"
            } else {
                Write-Host "ℹ️ $name PID file exists but process not found → using fallback"
                Stop-Process -Name $pattern -ErrorAction SilentlyContinue
            }
        } catch {
            Write-Host "⚠️ Could not stop $name (PID $pid): $($_.Exception.Message)"
        }
        Remove-Item $pidFile -Force
    } else {
        Write-Host "❌ $name not running (no PID file)"
        Stop-Process -Name $pattern -ErrorAction SilentlyContinue
    }
}

switch ($Action) {
    "start"   { Start-Frontend; Start-Backend }
    "stop"    { 
        Stop-ByPidFile $frontendPidFile "Frontend" "npx"
        Stop-ByPidFile $backendPidFile "Backend" "node"
    }
    "restart" { & $PSCommandPath stop; Start-Sleep -Seconds 1; & $PSCommandPath start }
    "status"  {
        Write-Host "📡 Process status:"
        if (Test-Path $frontendPidFile) {
            $pid = Get-Content $frontendPidFile | Select-Object -First 1
            if (Get-Process -Id $pid -ErrorAction SilentlyContinue) {
                Write-Host "  ✔️ Frontend running (PID $pid)"
            } elseif (Get-Process -Name "npx" -ErrorAction SilentlyContinue) {
                Write-Host "  ✔️ Frontend running (detected via process scan)"
            } else {
                Write-Host "  ❌ Frontend not running"
            }
        }
        if (Test-Path $backendPidFile) {
            $pid = Get-Content $backendPidFile | Select-Object -First 1
            if (Get-Process -Id $pid -ErrorAction SilentlyContinue) {
                Write-Host "  ✔️ Backend running (PID $pid)"
            } elseif (Get-Process -Name "node" -ErrorAction SilentlyContinue) {
                Write-Host "  ✔️ Backend running (detected via process scan)"
            } else {
                Write-Host "  ❌ Backend not running"
            }
        }
    }
    "logs"    {
        Write-Host "📜 Tailing logs (Ctrl+C to stop)…"
        Get-Content -Path $frontendLog, $backendLog -Wait -Tail 50
    }
}
