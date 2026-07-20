# Start Back (API) + Front (Vite) for local development.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Ensure-NpmInstall {
    param([string]$Dir, [string]$Label)
    if (-not (Test-Path (Join-Path $Dir "node_modules"))) {
        Write-Host "Installing $Label dependencies..."
        Push-Location $Dir
        try {
            npm install
            if ($LASTEXITCODE -ne 0) {
                throw "npm install failed in $Dir (exit $LASTEXITCODE)"
            }
        } finally {
            Pop-Location
        }
    }
}

function Ensure-EnvFile {
    param(
        [string]$Target,
        [string]$Example,
        [string]$Hint
    )
    if (Test-Path $Target) { return }
    if (-not (Test-Path $Example)) {
        Write-Warning "Missing $Target and no $Example template found."
        return
    }
    Copy-Item $Example $Target
    Write-Warning "Created $Target from template. $Hint"
}

function Get-ListenerPids {
    param([int[]]$Ports)
    $pids = New-Object 'System.Collections.Generic.HashSet[int]'
    foreach ($port in $Ports) {
        try {
            Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
                ForEach-Object { [void]$pids.Add([int]$_.OwningProcess) }
        } catch {
            # Fallback when Get-NetTCPConnection is unavailable
            $lines = netstat -ano | Select-String ":$port\s+.*LISTENING"
            foreach ($line in $lines) {
                if ($line.Line -match '\s(\d+)\s*$') {
                    [void]$pids.Add([int]$Matches[1])
                }
            }
        }
    }
    return @($pids | Where-Object { $_ -gt 0 })
}

function Stop-DevPorts {
    param([int[]]$Ports = @(5000, 5173))
    $pids = Get-ListenerPids -Ports $Ports
    if (-not $pids -or $pids.Count -eq 0) { return }

    Write-Host ""
    Write-Host "Port(s) $($Ports -join ', ') already in use by PID(s): $($pids -join ', ')" -ForegroundColor Yellow
    Write-Host "Stopping old listener(s) so start-dev can bind cleanly..." -ForegroundColor Yellow
    foreach ($procId in $pids) {
        try {
            $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
            $name = if ($proc) { $proc.ProcessName } else { 'unknown' }
            Stop-Process -Id $procId -Force -ErrorAction Stop
            Write-Host "  Stopped PID $procId ($name)"
        } catch {
            Write-Warning ("  Could not stop PID {0}: {1}" -f $procId, $_.Exception.Message)
        }
    }
    Start-Sleep -Seconds 1
}

Ensure-NpmInstall -Dir $Root -Label "root (concurrently)"
Ensure-NpmInstall -Dir (Join-Path $Root "Back") -Label "Back"
Ensure-NpmInstall -Dir (Join-Path $Root "Front") -Label "Front"

Ensure-EnvFile `
    -Target (Join-Path $Root "Back\.env") `
    -Example (Join-Path $Root "Back\.env.example") `
    -Hint "Set MONGODB_URI and JWT_SECRET in Back\.env or login will fail."

if (-not (Test-Path (Join-Path $Root "Front\.env"))) {
    @"
# Local dev: use Vite proxy (see Front/vite.config.js)
VITE_API_URL=/api
VITE_SERVER_URL=http://127.0.0.1:5000
"@ | Set-Content -Path (Join-Path $Root "Front\.env") -Encoding utf8
    Write-Host "Created Front\.env with VITE_API_URL=/api"
}

if (-not (Test-Path (Join-Path $Root "Back\.env"))) {
    Write-Error "Back\.env is required. Copy Back\.env.example and add your MongoDB URI."
    exit 1
}

$backEnvPath = Join-Path $Root "Back\.env"
$backEnvText = Get-Content $backEnvPath -Raw
if ($backEnvText -match '<cluster>|<user>|<password>|<dbname>') {
    Write-Host ""
    Write-Host "ERROR: Back\.env still has placeholder MongoDB values from .env.example." -ForegroundColor Red
    Write-Host "Edit Back\.env and set a real MONGODB_URI from MongoDB Atlas (or local Mongo)." -ForegroundColor Yellow
    Write-Host "Also set CLIENT_ORIGIN=http://127.0.0.1:5173 for local login." -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

Stop-DevPorts -Ports @(5000, 5173)

Write-Host ""
Write-Host "Starting local dev servers..."
Write-Host "  Front: http://127.0.0.1:5173"
Write-Host "  Back:  http://127.0.0.1:5000/api (proxied as /api from Vite)"
Write-Host "Press Ctrl+C to stop both."
Write-Host ""

npm run dev
exit $LASTEXITCODE
