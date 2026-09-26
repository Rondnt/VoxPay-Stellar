<#
.SYNOPSIS
    Levanta todo el stack de VoxPay en desarrollo local con un solo comando.

.DESCRIPTION
    Redis va en Docker (rapido, estable, no se toca). El resto -- emulador de
    Firestore/Auth, backend API, backend worker, ai-service y frontend -- corren
    como procesos locales, cada uno en su propia ventana de PowerShell, para
    poder ver los logs de cada uno y reiniciar solo el que se cuelgue (el
    backend en watch mode se crashea de vez en cuando en Windows; si pasa,
    cerra esa ventana puntual y volve a correr este script, no hace falta
    tocar las demas).

    ai-service NO va en Docker a proposito: la imagen de ai-service/Dockerfile
    nunca se probo con la config real (Groq, edge-tts) y reconstruirla justo
    antes de una demo es mas riesgo que beneficio. Corre igual que siempre,
    con el venv local.

.USAGE
    .\start-all.ps1
#>

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

function Start-Window {
    param(
        [string]$Title,
        [string]$WorkingDirectory,
        [string]$Command
    )
    Start-Process powershell -ArgumentList @(
        "-NoExit",
        "-Command",
        "`$Host.UI.RawUI.WindowTitle = '$Title'; $Command"
    ) -WorkingDirectory $WorkingDirectory
}

Write-Host "1/6 Redis (Docker)..." -ForegroundColor Cyan
docker compose -f "$root\docker-compose.yml" up -d redis
if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker no respondio. Abri Docker Desktop y volve a correr el script." -ForegroundColor Red
    exit 1
}

Write-Host "2/6 Firestore + Auth Emulator..." -ForegroundColor Cyan
Start-Window -Title "VoxPay - Firebase Emulator" -WorkingDirectory $root `
    -Command "npx firebase-tools emulators:start --only firestore,auth"

Write-Host "Esperando a que el emulador levante..." -ForegroundColor DarkGray
Start-Sleep -Seconds 6

Write-Host "3/6 Backend API (puerto 3001)..." -ForegroundColor Cyan
Start-Window -Title "VoxPay - Backend API" -WorkingDirectory "$root\backend" `
    -Command "npm run start:dev"

Write-Host "4/6 Backend Worker..." -ForegroundColor Cyan
Start-Window -Title "VoxPay - Backend Worker" -WorkingDirectory "$root\backend" `
    -Command "npm run worker:dev"

Write-Host "5/6 ai-service (puerto 8000)..." -ForegroundColor Cyan
Start-Window -Title "VoxPay - ai-service" -WorkingDirectory "$root\ai-service" `
    -Command ".\.venv\Scripts\uvicorn.exe app.main:app --reload"

Write-Host "6/6 Frontend..." -ForegroundColor Cyan
Start-Window -Title "VoxPay - Frontend" -WorkingDirectory "$root\frontend" `
    -Command "npm run dev"

Write-Host ""
Write-Host "Todo lanzado. Se abrieron 5 ventanas nuevas (emulador, API, worker, ai-service, frontend)." -ForegroundColor Green
Write-Host "Si es la primera vez con datos limpios del emulador, corre 'npm run seed' en backend/ una vez que la API este arriba." -ForegroundColor Yellow
