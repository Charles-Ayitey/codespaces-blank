#!/bin/bash
# Printer Monitor - Linux/macOS Startup Script
# This script starts the server as a background service

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Configuration
PORT=${PORT:-5000}
LOG_FILE="$SCRIPT_DIR/printer-monitor.log"
PID_FILE="$SCRIPT_DIR/printer-monitor.pid"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Functions
log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

check_node() {
    if ! command -v node &> /dev/null; then
        error "Node.js is not installed. Please install Node.js 18+ first."
        exit 1
    fi
    
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        warn "Node.js version 18+ recommended. Current: $(node -v)"
    fi
}

check_dependencies() {
    if [ ! -d "node_modules" ]; then
        log "Installing dependencies..."
        npm install
    fi
}

start_server() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if ps -p "$PID" > /dev/null 2>&1; then
            warn "Server is already running (PID: $PID)"
            exit 0
        else
            rm "$PID_FILE"
        fi
    fi
    
    log "Starting Printer Monitor server on port $PORT..."
    
    # Start in background
    nohup node server.js >> "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
    
    # Wait and check if it started
    sleep 2
    
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if ps -p "$PID" > /dev/null 2>&1; then
            log "Server started successfully (PID: $PID)"
            log "Access the dashboard at: http://localhost:$PORT"
            log "Logs: $LOG_FILE"
        else
            error "Server failed to start. Check logs: $LOG_FILE"
            exit 1
        fi
    fi
}

stop_server() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if ps -p "$PID" > /dev/null 2>&1; then
            log "Stopping server (PID: $PID)..."
            kill "$PID"
            sleep 2
            if ps -p "$PID" > /dev/null 2>&1; then
                warn "Server didn't stop gracefully, forcing..."
                kill -9 "$PID"
            fi
            rm "$PID_FILE"
            log "Server stopped"
        else
            warn "Server is not running"
            rm "$PID_FILE"
        fi
    else
        warn "No PID file found. Server may not be running."
    fi
}

status_server() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if ps -p "$PID" > /dev/null 2>&1; then
            log "Server is running (PID: $PID)"
            log "Dashboard: http://localhost:$PORT"
            
            # Check health
            if command -v curl &> /dev/null; then
                HEALTH=$(curl -s "http://localhost:$PORT/api/health" 2>/dev/null)
                if [ -n "$HEALTH" ]; then
                    log "Health: $HEALTH"
                fi
            fi
        else
            warn "Server is not running (stale PID file)"
            rm "$PID_FILE"
        fi
    else
        warn "Server is not running"
    fi
}

restart_server() {
    stop_server
    sleep 1
    start_server
}

show_logs() {
    if [ -f "$LOG_FILE" ]; then
        tail -f "$LOG_FILE"
    else
        error "Log file not found: $LOG_FILE"
    fi
}

# Main
case "$1" in
    start)
        check_node
        check_dependencies
        start_server
        ;;
    stop)
        stop_server
        ;;
    restart)
        check_node
        restart_server
        ;;
    status)
        status_server
        ;;
    logs)
        show_logs
        ;;
    *)
        echo "Printer Monitor Server"
        echo ""
        echo "Usage: $0 {start|stop|restart|status|logs}"
        echo ""
        echo "Commands:"
        echo "  start   - Start the server in background"
        echo "  stop    - Stop the server"
        echo "  restart - Restart the server"
        echo "  status  - Check server status"
        echo "  logs    - Tail the log file"
        exit 1
        ;;
esac
