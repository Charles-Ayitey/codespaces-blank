#!/bin/bash
# Printer Monitor - Fedora/RHEL Installation Script
# Quick installation for Fedora, RHEL, CentOS, Rocky Linux, AlmaLinux

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
CYAN='\033[0;36m'
NC='\033[0m'

log() { echo -e "${GREEN}[INFO]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }
warn() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
header() { echo -e "${CYAN}$1${NC}"; }

header "======================================"
header "  Printer Monitor - Fedora Installer"
header "======================================"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    error "Please run this script as root or with sudo"
fi

# Detect distro
if [ -f /etc/os-release ]; then
    . /etc/os-release
    DISTRO=$ID
    VERSION=$VERSION_ID
    log "Detected: $NAME $VERSION"
else
    error "Cannot detect distribution"
fi

# Check for compatible distro
case "$DISTRO" in
    fedora|rhel|centos|rocky|almalinux)
        log "Compatible distribution detected"
        ;;
    *)
        warn "Untested distribution: $DISTRO"
        warn "Continuing anyway..."
        ;;
esac

# Install Node.js if not present
if ! command -v node &> /dev/null; then
    log "Node.js not found. Installing..."
    
    # Use NodeSource repository for Node.js 18 LTS
    curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
    
    if command -v dnf &> /dev/null; then
        dnf install -y nodejs
    elif command -v yum &> /dev/null; then
        yum install -y nodejs
    else
        error "No supported package manager found (dnf/yum)"
    fi
fi

log "Node.js version: $(node -v)"
log "npm version: $(npm -v)"

# Create service user
if ! id "$SERVICE_USER" &>/dev/null; then
    log "Creating service user: $SERVICE_USER"
    useradd -r -s /sbin/nologin -d "$INSTALL_DIR" -c "Printer Monitor Service" "$SERVICE_USER"
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

# Copy .env if exists
if [ -f "$SCRIPT_DIR/.env" ]; then
    cp "$SCRIPT_DIR/.env" "$INSTALL_DIR/"
    chmod 600 "$INSTALL_DIR/.env"
fi

# Create production package.json (remove dev dependencies)
log "Creating production package.json..."
cd "$INSTALL_DIR"
node -e "
const pkg = require('./package.json');
const prodPkg = {
    name: pkg.name,
    version: pkg.version,
    description: pkg.description,
    main: 'server.js',
    scripts: { start: 'node server.js' },
    dependencies: {}
};
// Copy only server dependencies
const serverDeps = ['express', 'cors', 'net-snmp', 'nodemailer', 'node-cron', 'pdfkit', 'dotenv', 'crypto-js'];
for (const dep of serverDeps) {
    if (pkg.dependencies[dep]) {
        prodPkg.dependencies[dep] = pkg.dependencies[dep];
    }
}
require('fs').writeFileSync('package.json', JSON.stringify(prodPkg, null, 2));
"

# Install dependencies
log "Installing Node.js dependencies..."
npm install --production

# Set permissions
log "Setting permissions..."
chown -R "$SERVICE_USER:$SERVICE_GROUP" "$INSTALL_DIR"
chown -R "$SERVICE_USER:$SERVICE_GROUP" "$LOG_DIR"
chmod 750 "$INSTALL_DIR"
chmod 750 "$INSTALL_DIR/data"
chmod 640 "$INSTALL_DIR"/*.js
chmod 640 "$INSTALL_DIR"/*.html 2>/dev/null || true

# Create systemd service
log "Installing systemd service..."
cat > /etc/systemd/system/printer-monitor.service << 'EOF'
[Unit]
Description=Printer Monitor - SNMP Printer Monitoring System
Documentation=https://github.com/Charles-Ayitey/printer-monitor
After=network.target

[Service]
Type=simple
User=printermonitor
Group=printermonitor
WorkingDirectory=/opt/printer-monitor
ExecStart=/usr/bin/node /opt/printer-monitor/server.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=printer-monitor

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/printer-monitor/data /var/log/printer-monitor
PrivateTmp=true

# Environment
Environment=NODE_ENV=production
Environment=PORT=5000

[Install]
WantedBy=multi-user.target
EOF

# Configure firewall if firewalld is running
if systemctl is-active --quiet firewalld; then
    log "Configuring firewall..."
    firewall-cmd --permanent --add-port=5000/tcp
    firewall-cmd --reload
    log "Port 5000 opened in firewall"
fi

# Configure SELinux if enabled
if command -v getenforce &> /dev/null && [ "$(getenforce)" != "Disabled" ]; then
    log "Configuring SELinux..."
    # Allow Node.js to bind to port 5000
    semanage port -a -t http_port_t -p tcp 5000 2>/dev/null || \
    semanage port -m -t http_port_t -p tcp 5000 2>/dev/null || \
    warn "Could not configure SELinux port. You may need to run: semanage port -a -t http_port_t -p tcp 5000"
    
    # Set context for application directory
    semanage fcontext -a -t httpd_sys_content_t "/opt/printer-monitor(/.*)?" 2>/dev/null || true
    restorecon -Rv /opt/printer-monitor 2>/dev/null || true
fi

# Enable and start service
log "Enabling and starting service..."
systemctl daemon-reload
systemctl enable printer-monitor

# Start the service
systemctl start printer-monitor

# Wait and verify
sleep 3

if systemctl is-active --quiet printer-monitor; then
    header ""
    header "========================================"
    header " Printer Monitor Installed Successfully"
    header "========================================"
    echo ""
    log "Service Status: $(systemctl is-active printer-monitor)"
    
    # Get IP address
    IP_ADDR=$(hostname -I 2>/dev/null | awk '{print $1}')
    if [ -z "$IP_ADDR" ]; then
        IP_ADDR="localhost"
    fi
    
    log "Dashboard URL: http://${IP_ADDR}:5000"
    echo ""
    echo "Commands:"
    echo "  systemctl status printer-monitor   - Check status"
    echo "  systemctl restart printer-monitor  - Restart service"
    echo "  systemctl stop printer-monitor     - Stop service"
    echo "  journalctl -u printer-monitor -f   - View logs"
    echo ""
    echo "Configuration files:"
    echo "  /opt/printer-monitor/data/         - Data directory"
    echo "  /opt/printer-monitor/.env          - Environment config"
    echo ""
else
    error "Service failed to start. Check: journalctl -u printer-monitor -xe"
fi
