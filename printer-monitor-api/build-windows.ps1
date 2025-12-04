# Printer Monitor - Windows Build Script
# Run this script in PowerShell on Windows to build the Electron app

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Printer Monitor - Windows Build" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Check for Node.js
$nodeVersion = node --version 2>$null
if (-not $nodeVersion) {
    Write-Host "ERROR: Node.js is not installed!" -ForegroundColor Red
    Write-Host "Download from: https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}
Write-Host "Node.js version: $nodeVersion" -ForegroundColor Green

# Check for npm
$npmVersion = npm --version 2>$null
if (-not $npmVersion) {
    Write-Host "ERROR: npm is not installed!" -ForegroundColor Red
    exit 1
}
Write-Host "npm version: $npmVersion" -ForegroundColor Green

# Check we're in the right directory
if (-not (Test-Path "package.json")) {
    Write-Host "ERROR: package.json not found!" -ForegroundColor Red
    Write-Host "Run this script from the printer-monitor-api folder" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "Step 1: Cleaning old builds..." -ForegroundColor Yellow
if (Test-Path "dist") {
    Remove-Item -Recurse -Force "dist"
}
if (Test-Path "node_modules") {
    Remove-Item -Recurse -Force "node_modules"
}

Write-Host ""
Write-Host "Step 2: Installing dependencies..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: npm install failed!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Step 3: Rebuilding native modules for Electron..." -ForegroundColor Yellow
npm run postinstall
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Native module rebuild failed!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Step 4: Building Windows executable..." -ForegroundColor Yellow
npm run build:win
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "======================================" -ForegroundColor Green
Write-Host "  BUILD COMPLETE!" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green
Write-Host ""
Write-Host "Output files:" -ForegroundColor Cyan
Write-Host "  dist\win-unpacked\           - Unpacked app (for testing)" -ForegroundColor White
Write-Host "  dist\Printer Monitor-*.exe   - Installer" -ForegroundColor White
Write-Host "  dist\Printer Monitor-*.zip   - Portable ZIP" -ForegroundColor White
Write-Host ""
Write-Host "To test, run:" -ForegroundColor Yellow
Write-Host '  & ".\dist\win-unpacked\Printer Monitor.exe"' -ForegroundColor White
Write-Host ""
Write-Host "If you get SNMP errors, try running as Administrator." -ForegroundColor Yellow
