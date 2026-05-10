# scripts/bootstrap.ps1
#
# Pantheon does NOT support native Windows for local development. The supported
# Windows path is WSL2 (Ubuntu 22.04+ recommended), where scripts/bootstrap.sh
# runs unchanged.
#
# This stub:
#   1. Detects whether the current shell is already inside WSL (in which case
#      it just delegates to bash scripts/bootstrap.sh).
#   2. Otherwise, prints a clear error pointing the developer at the WSL2
#      install docs and exits non-zero.
#
# Usage (from PowerShell):
#   pwsh -File .\scripts\bootstrap.ps1

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot

# Heuristic: WSL exposes a /proc/version that contains "microsoft" or "WSL".
$inWsl = $false
if (Test-Path "/proc/version") {
    $procVersion = Get-Content "/proc/version" -ErrorAction SilentlyContinue
    if ($procVersion -match "(?i)(microsoft|wsl)") { $inWsl = $true }
}

if ($inWsl) {
    Write-Host "[bootstrap.ps1] Detected WSL — delegating to bash scripts/bootstrap.sh" -ForegroundColor Green
    bash "$repoRoot/scripts/bootstrap.sh" @Args
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Pantheon local development requires WSL2 on Windows." -ForegroundColor Yellow
Write-Host ""
Write-Host "  Why: native Windows paths (case-folding, fork(), pnpm/uv/alembic compatibility)"
Write-Host "       are not supported by the platform's POSIX-only build/test scripts."
Write-Host ""
Write-Host "  Install WSL2:  https://learn.microsoft.com/en-us/windows/wsl/install"
Write-Host ""
Write-Host "  After installing, from a WSL2 Ubuntu shell:"
Write-Host "      cd /mnt/c/path/to/pantheon  (or clone fresh inside WSL home)"
Write-Host "      bash scripts/bootstrap.sh"
Write-Host ""
exit 1
