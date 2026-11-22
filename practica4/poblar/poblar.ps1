# ============================================================================
# Script PowerShell de Carga de Datos - Almacén "El Pistón"
# Cumple con Práctica 4 - Ejercicio 1.4 y Ejercicio 1.6
# ============================================================================

$ErrorActionPreference = "Stop"

# Variables de entorno
$Env:PGHOST = if ($Env:PGHOST) { $Env:PGHOST } else { "localhost" }
$Env:PGPORT = if ($Env:PGPORT) { $Env:PGPORT } else { "5432" }
$Env:PGDATABASE = if ($Env:PGDATABASE) { $Env:PGDATABASE } else { "postgres" }
$Env:PGUSER = if ($Env:PGUSER) { $Env:PGUSER } else { "usr_app" }
$Env:PGPASSWORD = if ($Env:PGPASSWORD) { $Env:PGPASSWORD } else { "AppPiston2026!" }

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "Iniciando carga de datos en: $($Env:PGDATABASE)@$($Env:PGHOST):$($Env:PGPORT)" -ForegroundColor Cyan
Write-Host "Usuario de conexión (Rol de Aplicación): $($Env:PGUSER)" -ForegroundColor Cyan
Write-Host "Hora de inicio: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$sqlFile = Join-Path $scriptDir "poblar.sql"

$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

try {
    & psql -v ON_ERROR_STOP=1 `
           -h $Env:PGHOST `
           -p $Env:PGPORT `
           -U $Env:PGUSER `
           -d $Env:PGDATABASE `
           -f $sqlFile

    $stopwatch.Stop()
    Write-Host "----------------------------------------------------------------------" -ForegroundColor Green
    Write-Host "Carga masiva completada exitosamente." -ForegroundColor Green
    Write-Host "Tiempo total de ejecución masiva: $($stopwatch.ElapsedMilliseconds) ms" -ForegroundColor Green
    Write-Host "======================================================================" -ForegroundColor Green
}
catch {
    $stopwatch.Stop()
    Write-Host "ERROR CRÍTICO: La carga falló. Transacción revertida (ROLLBACK)." -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
