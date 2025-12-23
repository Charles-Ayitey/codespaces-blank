# Printer Monitor

> A comprehensive SNMP-based printer monitoring system with real-time status tracking, alerting, analytics, and reporting capabilities. Available as both a desktop application (Electron) and server deployment.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)

## 📋 Table of Contents

- [Features](#-features)
- [Quick Start](#-quick-start)
- [Installation](#-installation)
- [Usage](#-usage)
- [API Documentation](#-api-documentation)
- [Configuration](#-configuration)
- [Deployment](#-deployment)
- [Technology Stack](#-technology-stack)
- [Project Structure](#-project-structure)
- [Contributing](#-contributing)
- [License](#-license)

## ✨ Features

### Core Monitoring
- **Real-time Printer Status** - Online/offline detection, device states (idle, printing, warmup, error)
- **Supply Level Tracking** - Monitor toner, ink, drum, fuser, and other consumables with percentage calculations
- **Paper Tray Monitoring** - Track paper levels, tray status, and media types
- **Page Count Tracking** - Historical page count data with volume analytics
- **Error Detection** - Active alerts and error messages from printers
- **Network Identity** - System name, location, contact information

### Analytics & Reporting
- **Fleet Analytics Dashboard** - Aggregate statistics, trends, and insights across all printers
- **Individual Printer Analytics** - Detailed history and usage patterns per printer
- **Historical Data** - Minute-by-minute snapshots and daily aggregates
- **Custom Reports** - PDF and CSV exports for usage and supply status
- **Print Volume Trends** - Line charts and bar graphs of printing activity

### Alerts & Notifications
- **Intelligent Alert System** - Offline detection, low/critical supply levels, printer errors
- **Alert Cooldown** - Prevent notification spam (configurable, default 4 hours)
- **Email Notifications** - SMTP support for Gmail, Outlook, custom servers
- **Webhook Integration** - Send alerts to Slack, Discord, Teams, or custom endpoints
- **Alert History** - View, filter, acknowledge, and manage all alerts

### User Interface
- **Modern Web Dashboard** - Clean, responsive interface built with Tailwind CSS
- **Printer Grid View** - Visual overview with color-coded status indicators
- **Detailed Printer Views** - Tabbed interface for supplies, trays, errors, and history
- **Settings Management** - Configure email, webhooks, thresholds, and report scheduling
- **Real-time Updates** - Auto-refresh every 30 seconds

### Desktop Application (Electron)
- **System Tray Integration** - Minimize to tray with quick access menu
- **Native Notifications** - Desktop alert popups
- **Auto-start Option** - Launch on system startup
- **Keyboard Shortcuts** - Quick navigation (Ctrl+1-3, Ctrl+R, etc.)
- **Embedded Server** - No separate server installation needed

### Security
- **AES-256 Encryption** - Secure credential storage
- **Auto-generated Keys** - Random encryption key on first run
- **Environment Variables** - Secure configuration via `.env` file
- **Automatic Backups** - Data backup on every save

## 🚀 Quick Start

### Server Mode (Recommended for Networks)

```bash
cd printer-monitor-api
npm install
npm start
```

Access the dashboard at `http://localhost:5000`

### Desktop Mode (Windows/macOS/Linux)

```bash
cd printer-monitor-api
npm install
npm run electron:dev
```

### Docker Deployment

```bash
cd printer-monitor-api
docker-compose up -d
```

## 📦 Installation

### Prerequisites

- **Node.js** 18.x or higher
- **npm** or **yarn**
- **SNMP access** to printers (UDP port 161)
- **Linux/macOS/Windows** operating system

### Option 1: From Source

```bash
# Clone the repository
git clone https://github.com/Charles-Ayitey/codespaces-blank.git
cd codespaces-blank/printer-monitor-api

# Install dependencies
npm install

# Create environment file (optional - auto-generated on first run)
cp .env.example .env

# Start server
npm start
```

### Option 2: Docker

```bash
cd printer-monitor-api

# Build and start with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### Option 3: Linux Service (systemd)

```bash
# Run the installer script
sudo ./install-linux.sh

# Check status
systemctl status printer-monitor

# View logs
journalctl -u printer-monitor -f
```

### Option 4: Desktop Application

```bash
# Install dependencies including dev dependencies
npm install

# Build for current platform
npm run dist

# Build for specific platforms
npm run build:win    # Windows
npm run build:mac    # macOS
npm run build:linux  # Linux (AppImage, deb, rpm)
```

Installers will be available in the `dist/` folder.

## 📖 Usage

### Adding Printers

1. **Manual Addition**
   - Navigate to the dashboard
   - Click "Add Printer"
   - Enter IP address and SNMP community string (default: `public`)

2. **Network Scan**
   - Click "Scan Network"
   - Enter network prefix (e.g., `192.168.1`)
   - System will scan addresses 1-254 and auto-detect printers

### Viewing Printer Details

Click any printer card to view:
- **Overview** - Current status, model, serial, network info
- **Supplies** - Toner/ink levels with visual indicators
- **Trays** - Paper tray status and capacities
- **Errors** - Active alerts and error messages
- **History** - Page count and supply level trends

### Managing Alerts

1. Navigate to **Alerts** page
2. View all alerts with type, severity, and timestamp
3. **Acknowledge** alerts to clear cooldown
4. **Filter** by type, printer, or date range
5. Use **Acknowledge All** or **Delete** actions as needed

### Configuring Notifications

1. Navigate to **Settings** page
2. **Email Tab**
   - Enter SMTP server details
   - Add recipient email addresses
   - Test with "Send Test Email" button
3. **Webhooks Tab**
   - Add webhook URLs (Slack, Discord, Teams, custom)
   - Test with "Test Webhook" button
4. **Alerts Tab**
   - Set low supply threshold (default: 20%)
   - Set critical supply threshold (default: 10%)
   - Configure alert cooldown period
5. **Reports Tab**
   - Schedule automated reports (daily/weekly/monthly)
   - Choose format (PDF/CSV)
   - Enable email delivery

### Viewing Analytics

1. **Fleet Analytics**
   - Navigate to **Analytics** page
   - View aggregate statistics and trends
   - See top printers by volume
   - Monitor supply levels across fleet

2. **Printer Analytics**
   - Click any printer card
   - Click **Analytics** button
   - View detailed history, trends, and predictions

### Generating Reports

Navigate to **Settings** → **Reports** tab:
- **Usage Report** - Page counts, print volumes, printer activity
- **Supply Report** - Current supply levels, low supply alerts
- **Formats** - JSON, CSV, or PDF
- **Schedule** - Configure automated email delivery

## 📚 API Documentation

### Base URL

```
http://localhost:5000/api
```

### Printer Management

```http
GET    /api/printers              # List all printers
GET    /api/printers/:ip          # Get specific printer
POST   /api/printers              # Add printer { ip, community? }
DELETE /api/printers/:ip          # Remove printer
POST   /api/printers/:ip/refresh  # Refresh single printer data
POST   /api/printers/refresh      # Refresh all printers
```

### Network Scanning

```http
POST /api/scan                    # Start network scan { network_prefix: '192.168.1' }
GET  /api/scan/status             # Get scan status { scanning, lastScan }
POST /api/scan/cancel             # Cancel running scan
```

### History & Analytics

```http
GET /api/history/snapshots?minutes=60     # Get minute-by-minute snapshots
GET /api/history/daily?days=7             # Get daily aggregates
GET /api/history/printer/:ip?minutes=1440 # Get per-printer history
GET /api/history/analytics                # Get summary analytics
```

### Alerts

```http
GET    /api/alerts                # Get all alerts
GET    /api/alerts/count          # Get unacknowledged count
POST   /api/alerts/:id/acknowledge # Acknowledge single alert
POST   /api/alerts/acknowledge-all # Acknowledge all alerts
DELETE /api/alerts/:id            # Delete single alert
DELETE /api/alerts                # Clear all alerts
```

### Settings

```http
GET  /api/settings                # Get current settings (passwords masked)
POST /api/settings                # Update settings
POST /api/settings/test-email     # Send test email
POST /api/settings/test-webhook   # Test webhook { webhookIndex }
```

### Reports

```http
GET /api/reports/usage?format=json|csv|pdf&days=7      # Generate usage report
GET /api/reports/supplies?format=json|csv|pdf          # Generate supply report
```

### Health Check

```http
GET /api/health                   # Server health status
```

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in the `printer-monitor-api/` directory:

```env
# Server Configuration
PORT=5000
NODE_ENV=production

# Encryption Key (auto-generated on first run)
ENCRYPTION_KEY=your-32-char-hex-key-here

# Optional: Timezone for scheduled reports
TZ=America/New_York
```

### Configuration Files

All runtime configuration is stored in `data/` directory:

- **`data/config.json`** - Email, webhook, alert settings (sensitive data encrypted)
- **`data/printers.json`** - Printer configurations and last known state
- **`data/alert-history.json`** - Historical alerts (max 1000 entries)
- **`data/history.json`** - Historical snapshots and daily aggregates

### Default Settings

```javascript
{
  "email": {
    "enabled": false,
    "host": "smtp.gmail.com",
    "port": 587,
    "secure": false,
    "user": "",
    "pass": "",
    "from": "",
    "recipients": []
  },
  "webhooks": [],
  "alerts": {
    "lowSupplyThreshold": 20,
    "criticalSupplyThreshold": 10,
    "offlineTimeout": 300000,  // 5 minutes
    "cooldownPeriod": 14400000 // 4 hours
  },
  "reports": {
    "enabled": false,
    "schedule": "daily",
    "time": "08:00",
    "format": "pdf",
    "emailOnGenerate": false
  }
}
```

## 🚢 Deployment

### Production Server (Docker - Recommended)

```bash
# Edit docker-compose.yml for environment variables
docker-compose up -d

# Access at http://your-server:5000
```

### Linux Bare Metal

```bash
# Install as systemd service
sudo ./install-linux.sh

# Or manually:
sudo cp -r . /opt/printer-monitor
sudo cp printer-monitor.service /etc/systemd/system/
sudo systemctl enable printer-monitor
sudo systemctl start printer-monitor
```

### Windows Server

```bash
# Use start-server.bat or install as Windows Service
start-server.bat

# Or use NSSM (Non-Sucking Service Manager)
nssm install PrinterMonitor "node.exe" "C:\path\to\server.js"
```

### Desktop Application Distribution

```bash
# Build installers for all platforms
npm run build:all

# Distribute files from dist/:
# - Printer Monitor-1.2.0-win-x64.exe (Windows installer)
# - Printer Monitor-1.2.0-mac-x64.dmg (macOS)
# - Printer Monitor-1.2.0-linux-x64.AppImage (Linux)
```

### Network Requirements

- **Port 5000** (TCP) - Web UI and API access
- **Port 161** (UDP) - SNMP access to printers
- Firewall rules to allow connections from monitoring server to printers

### Adding Authentication (Reverse Proxy)

For production deployments exposed to the internet, add authentication via reverse proxy:

```nginx
# nginx example
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

## 🛠️ Technology Stack

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework and REST API
- **net-snmp** - SNMP protocol implementation (RFC 3805)
- **nodemailer** - Email notifications via SMTP
- **node-cron** - Scheduled task execution
- **pdfkit** - PDF report generation
- **crypto-js** - AES-256 credential encryption
- **dotenv** - Environment configuration

### Frontend
- **HTML5/CSS3** - Semantic markup and styling
- **Tailwind CSS** - Utility-first CSS framework
- **Chart.js** - Data visualization and charting
- **Vanilla JavaScript** - No framework dependencies

### Desktop Application
- **Electron** - Cross-platform desktop framework
- **electron-builder** - Build and packaging
- **electron-store** - Persistent storage

### Data Storage
- **JSON files** - Simple file-based persistence
- **Automatic backups** - `.bak` files on each save
- **AES-256 encryption** - For sensitive credentials

## 📁 Project Structure

```
codespaces-blank/
└── printer-monitor-api/
    ├── server.js                    # Main API server (~900 lines)
    ├── storage.js                   # File I/O and encryption (~250 lines)
    ├── main.js                      # Electron main process
    ├── preload.js                   # Electron preload script
    ├── package.json                 # Dependencies and scripts
    ├── .env.example                 # Environment template
    ├── .gitignore                   # Git exclusions
    │
    ├── Frontend Pages (Standalone HTML)
    ├── standalone_dashboard.html    # Main dashboard
    ├── printer-view.html            # Printer detail view
    ├── printers-detail.html         # Filtered printer list
    ├── analytics.html               # Fleet analytics
    ├── printer-analytics.html       # Individual printer analytics
    ├── alerts.html                  # Alert management
    ├── settings.html                # Configuration UI
    │
    ├── Documentation
    ├── README.md                    # This file
    ├── DEPLOYMENT.md                # Deployment guide
    ├── DELIVERABLES.md              # Feature documentation
    ├── CHANGELOG.md                 # Version history
    │
    ├── Build & Deploy Scripts
    ├── Dockerfile                   # Docker container definition
    ├── docker-compose.yml           # Docker Compose configuration
    ├── printer-monitor.service      # systemd service file
    ├── install-linux.sh             # Linux installer
    ├── install-fedora.sh            # Fedora-specific installer
    ├── start-server.sh              # Server start script (Linux/Mac)
    ├── start-server.bat             # Server start script (Windows)
    ├── build-fedora.sh              # RPM build script
    ├── build-windows.ps1            # Windows build script
    │
    ├── Runtime Data (gitignored)
    └── data/
        ├── printers.json            # Printer configurations
        ├── config.json              # Settings (encrypted credentials)
        ├── alert-history.json       # Alert records
        ├── history.json             # Historical snapshots
        └── *.backup                 # Automatic backups
```

## 🔍 SNMP Compatibility

### Supported Standards
- **RFC 3805** - Printer MIB v2
- **RFC 1213** - MIB-II (System information)
- **SNMP v2c** - Community string authentication

### Tested Printer Brands
- ✅ HP LaserJet series
- ✅ Canon imageRUNNER series
- ✅ Brother laser printers
- ✅ Xerox WorkCentre series
- ✅ Ricoh/Savin/Lanier printers
- ✅ Kyocera ECOSYS series
- ✅ Konica Minolta bizhub series

### HP Printer Notes
HP printers use non-standard OIDs. The system automatically tries multiple OID paths:
- Standard RFC 3805 OIDs
- HP-specific OIDs (1.3.6.1.4.1.11.x.x.x)
- PWG MIB fallbacks

SNMP timeout increased to 5 seconds with 2 retries for slower HP models.

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/AmazingFeature`)
3. **Commit** your changes (`git commit -m 'Add some AmazingFeature'`)
4. **Push** to the branch (`git push origin feature/AmazingFeature`)
5. **Open** a Pull Request

### Development Setup

```bash
# Clone and install
git clone https://github.com/Charles-Ayitey/codespaces-blank.git
cd codespaces-blank/printer-monitor-api
npm install

# Run in development mode with auto-reload
npm run dev

# Run desktop app in development
npm run electron:dev
```

### Code Style
- Use ESLint and Prettier for code formatting
- Follow existing naming conventions
- Add comments for complex logic
- Update documentation for new features

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **net-snmp** - SNMP protocol implementation
- **Express.js** - Web framework
- **Electron** - Desktop application framework
- **Tailwind CSS** - UI styling
- **Chart.js** - Data visualization

## 📞 Support

For issues, questions, or contributions:
- **GitHub Issues**: [Create an issue](https://github.com/Charles-Ayitey/codespaces-blank/issues)
- **Email**: harley1362003@gmail.com
- **Documentation**: See [DEPLOYMENT.md](printer-monitor-api/DEPLOYMENT.md) and [DELIVERABLES.md](printer-monitor-api/DELIVERABLES.md)

## 🗺️ Roadmap

### Current Version (1.2.0)
- ✅ SNMP printer monitoring
- ✅ Real-time status and supply tracking
- ✅ Alert system with notifications
- ✅ Analytics and reporting
- ✅ Desktop and server modes

### Planned Features
- [ ] Active Directory integration
- [ ] Multi-site support with remote monitoring
- [ ] Custom dashboard layouts
- [ ] Mobile-responsive design improvements
- [ ] Dark mode theme
- [ ] API authentication and user roles
- [ ] Printer grouping by department/location
- [ ] Cost tracking per page/supply
- [ ] Carbon footprint reporting
- [ ] Multi-language support

---

**Made with ❤️ by the Printer Monitor Team**
