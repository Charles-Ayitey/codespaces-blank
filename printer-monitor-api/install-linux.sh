#!/bin/bash
# Printer Monitor - Linux Server Installation Script
# Run as root or with sudo

set -e

# Configuration
INSTALL_DIR="/opt/printer-monitor"
SERVICE_USER="printermonitor"
SERVICE_GROUP="printermonitor"
LOG_DIR="/var/log/printer-monitor"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[INFO]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }
warn() { echo -e "${YELLOW}[WARNING]${NC} $1"; }

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    error "Please run this script as root or with sudo"
fi

log "Installing Printer Monitor..."

# Check for Node.js
if ! command -v node &> /dev/null; then
    log "Node.js not found. Installing..."
    
    # Detect package manager
    if command -v apt-get &> /dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
        apt-get install -y nodejs
    elif command -v yum &> /dev/null; then
        curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
        yum install -y nodejs
    elif command -v dnf &> /dev/null; then
        curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
        dnf install -y nodejs
    else
        error "Unsupported package manager. Please install Node.js 18+ manually."
    fi
fi

log "Node.js version: $(node -v)"

# Create service user
if ! id "$SERVICE_USER" &>/dev/null; then
    log "Creating service user: $SERVICE_USER"
    useradd -r -s /bin/false "$SERVICE_USER"
fi

# Create directories
log "Creating directories..."
mkdir -p "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR/data"
mkdir -p "$LOG_DIR"

# Copy files
log "Copying application files..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp "$SCRIPT_DIR/server.js" "$INSTALL_DIR/"
cp "$SCRIPT_DIR/storage.js" "$INSTALL_DIR/"
cp "$SCRIPT_DIR/package.json" "$INSTALL_DIR/"
cp "$SCRIPT_DIR"/*.html "$INSTALL_DIR/" 2>/dev/null || true

# Copy .env if it exists
if [ -f "$SCRIPT_DIR/.env" ]; then
    cp "$SCRIPT_DIR/.env" "$INSTALL_DIR/"
fi

# Install dependencies
log "Installing Node.js dependencies..."
cd "$INSTALL_DIR"
npm install --production

# Set permissions
log "Setting permissions..."
chown -R "$SERVICE_USER:$SERVICE_GROUP" "$INSTALL_DIR"
chown -R "$SERVICE_USER:$SERVICE_GROUP" "$LOG_DIR"
chmod 750 "$INSTALL_DIR"
chmod 750 "$INSTALL_DIR/data"
chmod 640 "$INSTALL_DIR"/*.js
chmod 640 "$INSTALL_DIR"/*.html 2>/dev/null || true

# Install systemd service
log "Installing systemd service..."
cp "$SCRIPT_DIR/printer-monitor.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable printer-monitor

# Start the service
log "Starting Printer Monitor service..."
systemctl start printer-monitor

# Wait and check status
sleep 3
if systemctl is-active --quiet printer-monitor; then
    log "Installation complete!"
    echo ""
    echo "========================================="
    echo " Printer Monitor Installed Successfully"
    echo "========================================="
    echo ""
    echo "Service Status: $(systemctl is-active printer-monitor)"
    echo "Dashboard URL:  http://$(hostname -I | awk '{print $1}'):5000"
    echo ""
    echo "Commands:"
    echo "  systemctl status printer-monitor   - Check status"
    echo "  systemctl restart printer-monitor  - Restart service"
    echo "  systemctl stop printer-monitor     - Stop service"
    echo "  journalctl -u printer-monitor -f   - View logs"
    echo ""
else
    error "Service failed to start. Check: journalctl -u printer-monitor -xe"
fi
