# Build script — QMS License Admin Desktop App
# Phase 11X
#
# Prerequisites:
#   1. Rust (stable) installed
#   2. Node.js >= 18 installed
#   3. license-admin/.env.local must exist with:
#        VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
#        VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
#
# Usage:
#   cd D:\QMS-Desktop
#   .\scripts\build-license-admin-desktop.ps1

$ErrorActionPreference = "Stop"

$root       = "D:\QMS-Desktop"
$appDir     = "$root\license-admin"
$testBuilds = "$root\test-builds"
$version    = "1.0.0"

Write-Host "=== QMS License Admin Desktop — Build v$version ===" -ForegroundColor Cyan

# ── Guard: .env.local must exist ──────────────────────────────────────────────
if (-not (Test-Path "$appDir\.env.local")) {
    Write-Host ""
    Write-Host "ERROR: license-admin/.env.local not found." -ForegroundColor Red
    Write-Host "Copy .env.example to .env.local and fill in your Supabase values." -ForegroundColor Red
    exit 1
}

# ── npm install ───────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "Step 1/4 — Installing npm dependencies..." -ForegroundColor Yellow
Set-Location $appDir
npm install --prefer-offline
if ($LASTEXITCODE -ne 0) { Write-Host "npm install failed." -ForegroundColor Red; exit 1 }

# ── TypeScript + Vite build ───────────────────────────────────────────────────
Write-Host ""
Write-Host "Step 2/4 — TypeScript + Vite build..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "Frontend build failed." -ForegroundColor Red; exit 1 }

# ── Tauri release build ───────────────────────────────────────────────────────
Write-Host ""
Write-Host "Step 3/4 — Tauri release build (this takes ~2-3 minutes)..." -ForegroundColor Yellow
npx tauri build
if ($LASTEXITCODE -ne 0) { Write-Host "Tauri build failed." -ForegroundColor Red; exit 1 }

# ── Copy artifacts ────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "Step 4/4 — Copying artifacts to test-builds/..." -ForegroundColor Yellow

$msiSrc  = "$appDir\src-tauri\target\release\bundle\msi\QMS License Admin_${version}_x64_en-US.msi"
$nsisSrc = "$appDir\src-tauri\target\release\bundle\nsis\QMS License Admin_${version}_x64-setup.exe"

if (-not (Test-Path $testBuilds)) { New-Item -ItemType Directory -Path $testBuilds | Out-Null }

Copy-Item $msiSrc  "$testBuilds\QMS-License-Admin-$version-test.msi"       -Force
Copy-Item $nsisSrc "$testBuilds\QMS-License-Admin-$version-test-setup.exe" -Force

Write-Host ""
Write-Host "=== Build complete ===" -ForegroundColor Green
Write-Host "  MSI:  $testBuilds\QMS-License-Admin-$version-test.msi"
Write-Host "  NSIS: $testBuilds\QMS-License-Admin-$version-test-setup.exe"
