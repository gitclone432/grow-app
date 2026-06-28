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

Write-Host ""
Write-Host "Starting local dev servers..."
Write-Host "  Front: http://127.0.0.1:5173"
Write-Host "  Back:  http://127.0.0.1:5000/api (proxied as /api from Vite)"
Write-Host "Press Ctrl+C to stop both."
Write-Host ""

npm run dev
