@echo off
REM Printer Monitor - Windows Startup Script
REM This script starts the server on Windows

setlocal enabledelayedexpansion

cd /d "%~dp0"

set PORT=5000
set LOG_FILE=%~dp0printer-monitor.log

REM Check for Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed. Please install Node.js 18+ first.
    echo Download from: https://nodejs.org/
    pause
    exit /b 1
)

REM Check Node.js version
for /f "tokens=1 delims=v" %%a in ('node -v') do set NODE_VER=%%a
for /f "tokens=1 delims=." %%a in ("%NODE_VER%") do set NODE_MAJOR=%%a

REM Install dependencies if needed
if not exist "node_modules" (
    echo [INFO] Installing dependencies...
    call npm install
)

echo.
echo ========================================
echo   Printer Monitor Server
echo ========================================
echo.
echo Starting server on port %PORT%...
echo Dashboard: http://localhost:%PORT%
echo.
echo Press Ctrl+C to stop the server.
echo.

REM Start the server
node server.js

pause
