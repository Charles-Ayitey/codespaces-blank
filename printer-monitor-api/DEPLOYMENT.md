# Printer Monitor - Deployment Guide

This guide covers deploying Printer Monitor as a desktop application or server service.

## Quick Start

### Server Mode (Recommended for Networks)
```bash
# Using npm
npm start

# Or using Docker
docker-compose up -d
```

### Desktop Mode (Windows/macOS/Linux)
```bash
# Development
npm run electron:dev

# Build installers
npm run build
```

---

## Deployment Options

### Option 1: Docker (Production Servers)

The easiest way to deploy on a server:

```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

Access at `http://your-server:5000`

**Environment Variables:**
```env
PORT=5000           # API port
NODE_ENV=production # Environment
TZ=America/New_York # Timezone for scheduling
```

### Option 2: Linux Service (systemd)

For bare-metal Linux servers:

```bash
# Run the installer (as root)
sudo ./install-linux.sh

# Or manual installation:
sudo cp -r . /opt/printer-monitor
sudo cp printer-monitor.service /etc/systemd/system/
sudo systemctl enable printer-monitor
sudo systemctl start printer-monitor
```

**Service Commands:**
```bash
systemctl status printer-monitor   # Check status
systemctl restart printer-monitor  # Restart
systemctl stop printer-monitor     # Stop
journalctl -u printer-monitor -f   # View logs
```

### Option 3: Desktop Application (Electron)

Build native installers for end users:

```bash
# Install dependencies (including dev)
npm install

# Build for current platform
npm run dist

# Build for specific platforms
npm run build:win    # Windows (.exe installer, portable)
npm run build:mac    # macOS (.dmg)
npm run build:linux  # Linux (.AppImage, .deb, .rpm)

# Build for all platforms
npm run build:all
```

**Output:** `dist/` folder with platform-specific installers.

### Option 4: Standalone Server Binary (pkg)

Create a single executable with bundled Node.js:

```bash
npm run build:server
```

**Output:** `dist/server/` with executables:
- `printer-monitor-win.exe` (Windows)
- `printer-monitor-macos` (macOS)
- `printer-monitor-linux` (Linux)

### Option 5: Simple Script (Development/Testing)

```bash
# Linux/macOS
./start-server.sh start
./start-server.sh status
./start-server.sh logs

# Windows
start-server.bat
```

---

## Configuration

### Environment Variables (.env)

```env
# Server
PORT=5000

# Encryption (auto-generated on first run)
ENCRYPTION_KEY=your-32-char-hex-key

# Optional
NODE_ENV=production
```

### Data Directory

All runtime data stored in `data/`:
- `printers.json` - Printer configurations
- `config.json` - Settings (email, webhooks, thresholds)
- `alert-history.json` - Alert records
- `history.json` - Historical snapshots

**Backup:** Copy the entire `data/` folder.

---

## Desktop Application Features

When running as an Electron desktop app:

- **System Tray** - Minimizes to tray, quick access menu
- **Native Notifications** - Alert popups
- **Auto-start** - Optional launch on system startup
- **Single Instance** - Prevents multiple copies
- **Embedded Server** - No separate server needed

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+1` | Dashboard |
| `Ctrl+2` | Alerts |
| `Ctrl+3` | Analytics |
| `Ctrl+R` | Refresh All |
| `Ctrl+,` | Settings |
| `F11` | Toggle Fullscreen |

---

## Network Requirements

### Ports
- **5000** (TCP) - API and Web UI

### SNMP Access
The server needs network access to printers on SNMP port **161/UDP**.

For Docker, you may need to use `network_mode: host` if printers are on the same subnet:

```yaml
services:
  printer-monitor:
    network_mode: host
```

### Firewall Rules

```bash
# Linux (iptables)
sudo iptables -A INPUT -p tcp --dport 5000 -j ACCEPT

# Linux (ufw)
sudo ufw allow 5000/tcp

# Windows (PowerShell as Admin)
netsh advfirewall firewall add rule name="Printer Monitor" dir=in action=allow protocol=TCP localport=5000
```

---

## Troubleshooting

### Server Won't Start
```bash
# Check if port is in use
lsof -i :5000
netstat -tlnp | grep 5000

# Check logs
journalctl -u printer-monitor -xe
cat printer-monitor.log
```

### Can't Connect to Printers
```bash
# Test SNMP connectivity
snmpwalk -v2c -c public <printer-ip> 1.3.6.1.2.1.1.1.0

# Check network path
ping <printer-ip>
traceroute <printer-ip>
```

### Docker Issues
```bash
# Check container logs
docker-compose logs -f

# Enter container
docker-compose exec printer-monitor sh

# Rebuild image
docker-compose build --no-cache
```

### Electron Build Errors
```bash
# Clear cache
rm -rf node_modules dist
npm install
npm run dist
```

---

## Resource Requirements

### Minimum
- **CPU:** 1 core
- **RAM:** 256 MB
- **Disk:** 100 MB + data

### Recommended (100+ printers)
- **CPU:** 2 cores
- **RAM:** 512 MB
- **Disk:** 1 GB

---

## Security Considerations

1. **Encryption** - Sensitive config encrypted with AES-256
2. **No Auth by Default** - Add reverse proxy with auth for internet exposure
3. **SNMP Community** - Use non-default community strings
4. **Docker User** - Runs as non-root user

### Adding Authentication (nginx example)

```nginx
server {
    listen 80;
    server_name printers.example.com;

    auth_basic "Printer Monitor";
    auth_basic_user_file /etc/nginx/.htpasswd;

    location / {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## Updating

### Docker
```bash
docker-compose pull
docker-compose up -d
```

### Linux Service
```bash
sudo systemctl stop printer-monitor
# Copy new files to /opt/printer-monitor
npm install --production
sudo systemctl start printer-monitor
```

### Desktop App
Download new installer and run - settings are preserved.

---

## Uninstalling

### Docker
```bash
docker-compose down -v
```

### Linux Service
```bash
sudo systemctl stop printer-monitor
sudo systemctl disable printer-monitor
sudo rm /etc/systemd/system/printer-monitor.service
sudo rm -rf /opt/printer-monitor
sudo userdel printermonitor
```

### Desktop App
Use system uninstaller or delete app folder.
