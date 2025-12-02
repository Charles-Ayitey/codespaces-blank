# Printer Monitor API - Project Deliverables

This document outlines all features, components, and capabilities of the Printer Monitor API system.

---

## 📊 Core Monitoring Capabilities

### Status Monitoring
- **Real-time printer status** - Online/offline detection via SNMP
- **Device status codes** - Idle, printing, warmup, waiting, error states
- **Last update timestamps** - Track when each printer was last successfully polled

### Supplies Levels
- **Toner/Ink monitoring** - Current level vs maximum capacity
- **Percentage calculations** - Automatic level percentage computation
- **Supply type detection** - Toner, ink, drum, fuser, waste toner identification
- **Color matching** - Automatic color detection (Cyan, Magenta, Yellow, Black)
- **Multi-supply support** - Handles printers with multiple supply units

### Tray States
- **Paper tray levels** - Current vs maximum sheet capacity
- **Tray status detection** - Available, empty, missing, jam states
- **Media type identification** - Paper size and type per tray
- **Multiple tray support** - Monitors all trays (main, bypass, optional feeders)

### Error Detection
- **Active alerts table** - Current printer alerts and warnings
- **Error severity levels** - Critical, warning, informational
- **Alert descriptions** - Human-readable error messages
- **Error history** - Track when errors occurred and cleared

### Page Counts
- **Total page count** - Lifetime pages printed
- **Historical tracking** - Page count changes over time
- **Print volume analytics** - Daily/weekly/monthly statistics

### Network Identity
- **System name** - Printer hostname/display name
- **System location** - Physical location (if configured)
- **System contact** - Administrator contact info
- **IP address** - Network address for management
- **MAC address** - Hardware identification

---

## 🖥️ Dashboard & UI

### Main Dashboard (`standalone_dashboard.html`)
- **Printer grid view** - Visual overview of all printers
- **Grouped sections** - Categorize by status (Online, Warning, Offline)
- **Color-coded supplies** - Visual toner/ink level indicators
- **Stat cards** - Quick overview metrics (total printers, online, warnings)
- **Supply type filtering** - Show/hide specific supply types
- **Real-time updates** - Auto-refresh every 30 seconds
- **Navigation bar** - Links to Analytics, Alerts, Settings

### Printer Detail View (`printer-view.html`)
- **Tabbed interface** - Overview, Supplies, Trays, Errors, History tabs
- **Full printer information** - All monitored data points
- **Supply level charts** - Visual representation of consumable levels
- **Tray status display** - Paper tray states and capacities
- **Error log** - Current and recent printer errors
- **Print history** - Recent page count changes

### Printers List (`printers-detail.html`)
- **Filtered views** - By status, supply level, tray state
- **Sortable columns** - Sort by any data column
- **Quick actions** - Refresh, view details, remove printer
- **Search functionality** - Find printers by name/IP

---

## 📈 Analytics & History

### Analytics Dashboard (`analytics.html`)
- **Fleet overview** - Aggregate statistics for all printers
- **Page count trends** - Line charts of printing volume over time
- **Supply consumption** - Track toner/ink usage rates
- **Status distribution** - Pie chart of printer states
- **Top printers** - Most active printers by page count
- **Time range selection** - View data for 7/14/30/90 days

### Individual Printer Analytics (`printer-analytics.html`)
- **Per-printer history** - Detailed analytics for specific printer
- **Page count trends** - Historical print volume
- **Supply level history** - Track consumable depletion over time
- **Status history** - When printer was online/offline/error
- **Comparison tools** - Compare against fleet averages

### Historical Data Storage
- **Data retention** - Configurable history period
- **Hourly snapshots** - Page counts and supply levels
- **JSON storage** - Persistent data in `data/history.json`
- **Backup system** - Automatic backups on save

---

## 🔔 Alerts & Notifications

### Alert System (`alerts.html`)
- **Alert types**:
  - `offline` - Printer went offline
  - `online` - Printer came back online
  - `low-supply` - Supply below warning threshold
  - `critical-supply` - Supply below critical threshold
  - `error` - Printer error detected
- **Cooldown management** - Prevent alert spam (default: 4 hours)
- **Acknowledge function** - Mark alerts as acknowledged
- **Alert history** - View all past alerts
- **Filter options** - By type, printer, status, date range
- **Bulk operations** - Acknowledge all, delete acknowledged

### Email Notifications
- **SMTP support** - Gmail, Outlook, custom SMTP servers
- **Configurable recipients** - Multiple email addresses
- **Alert templates** - Customizable email content
- **Test functionality** - Send test emails from settings

### Webhook Notifications
- **HTTP POST webhooks** - Send alerts to external systems
- **Custom headers** - Add authorization or custom headers
- **Payload format** - JSON payload with alert details
- **Retry logic** - Automatic retry on failure

### Scheduled Reports
- **Daily/Weekly/Monthly** - Configurable report frequency
- **PDF generation** - Professional formatted reports
- **Email delivery** - Automatic report distribution
- **Report types**:
  - Fleet summary
  - Supply status
  - Page count statistics
  - Alert summary

---

## ⚙️ Settings & Configuration

### Settings Page (`settings.html`)
- **Tabbed interface** - Email, Webhooks, Alerts, Reports sections
- **SMTP configuration** - Server, port, security, credentials
- **Webhook management** - Add/edit/delete webhook endpoints
- **Alert thresholds** - Configure supply level warnings
- **Report scheduling** - Set up automated reports

### Security Features
- **Encrypted credentials** - AES-256 encryption for sensitive data
- **Auto-generated keys** - Random encryption key on first run
- **Environment variables** - Secure key storage in `.env`
- **Gitignore protection** - Data files excluded from version control

### Configuration Storage
- **JSON file storage** - `data/config.json` for settings
- **Backup system** - `.backup` files created on each save
- **Default values** - Sensible defaults for all settings

---

## 🔌 API Endpoints

### Printer Management
```
GET  /api/printers           - List all printers
GET  /api/printers/:ip       - Get specific printer
POST /api/printers           - Add a printer
DELETE /api/printers/:ip     - Remove a printer
POST /api/printers/:ip/refresh - Refresh printer data
```

### Network Scanning
```
POST /api/scan               - Start network scan
GET  /api/scan/status        - Get scan status
```

### History & Analytics
```
GET  /api/history/:ip        - Get printer history
GET  /api/analytics          - Fleet analytics
GET  /api/analytics/:ip      - Printer analytics
```

### Alerts
```
GET  /api/alerts             - Get all alerts
GET  /api/alerts/active      - Get unacknowledged alerts
POST /api/alerts/:id/acknowledge - Acknowledge alert
DELETE /api/alerts/:id       - Delete alert
POST /api/alerts/acknowledge-all - Acknowledge all
```

### Settings
```
GET  /api/settings           - Get current settings
PUT  /api/settings           - Update settings
POST /api/settings/test-email - Send test email
POST /api/settings/test-webhook - Test webhook
```

---

## 📁 File Structure

```
printer-monitor-api/
├── server.js                 # Main API server
├── storage.js                # File I/O and encryption
├── package.json              # Dependencies
├── .env                      # Environment variables (auto-generated)
├── .env.example              # Environment template
├── .gitignore                # Git exclusions
├── standalone_dashboard.html # Main dashboard
├── printer-view.html         # Printer detail page
├── printers-detail.html      # Printer list page
├── analytics.html            # Fleet analytics
├── printer-analytics.html    # Individual analytics
├── alerts.html               # Alert management
├── settings.html             # Configuration UI
├── CHANGELOG.md              # Version history
├── DELIVERABLES.md           # This document
└── data/                     # Data directory
    ├── config.json           # Configuration
    ├── printers.json         # Printer data
    ├── alerts.json           # Alert history
    ├── history.json          # Historical data
    └── *.backup              # Backup files
```

---

## 🛠️ Technology Stack

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **net-snmp** - SNMP protocol library
- **nodemailer** - Email sending
- **node-cron** - Scheduled tasks
- **pdfkit** - PDF generation
- **crypto-js** - AES encryption
- **dotenv** - Environment configuration

### Frontend
- **Tailwind CSS** - Utility-first styling
- **Chart.js** - Data visualization
- **Vanilla JavaScript** - No framework dependencies

### Data Storage
- **JSON files** - Simple file-based persistence
- **AES-256 encryption** - Credential security
- **Automatic backups** - Data protection

---

## 📋 SNMP OIDs Reference

### System Information
| OID | Description |
|-----|-------------|
| 1.3.6.1.2.1.1.1.0 | System description |
| 1.3.6.1.2.1.1.5.0 | System name |
| 1.3.6.1.2.1.1.6.0 | System location |
| 1.3.6.1.2.1.1.4.0 | System contact |

### Printer Status
| OID | Description |
|-----|-------------|
| 1.3.6.1.2.1.25.3.5.1.1.1 | Printer status |
| 1.3.6.1.2.1.43.16.5.1.2.1.1 | Device status |
| 1.3.6.1.2.1.43.5.1.1.17.1 | Serial number |

### Page Counts
| OID | Description |
|-----|-------------|
| 1.3.6.1.2.1.43.10.2.1.4.1.1 | Total page count |

### Supplies (prtMarkerSuppliesTable)
| OID | Description |
|-----|-------------|
| 1.3.6.1.2.1.43.11.1.1.6.1 | Supply description |
| 1.3.6.1.2.1.43.11.1.1.8.1 | Supply max capacity |
| 1.3.6.1.2.1.43.11.1.1.9.1 | Supply current level |

### Input Trays (prtInputTable)
| OID | Description |
|-----|-------------|
| 1.3.6.1.2.1.43.8.2.1.9.1 | Input tray name |
| 1.3.6.1.2.1.43.8.2.1.10.1 | Input tray capacity max |
| 1.3.6.1.2.1.43.8.2.1.11.1 | Input tray current level |
| 1.3.6.1.2.1.43.8.2.1.12.1 | Input tray status |

### Alerts (prtAlertTable)
| OID | Description |
|-----|-------------|
| 1.3.6.1.2.1.43.18.1.1.2.1 | Alert severity level |
| 1.3.6.1.2.1.43.18.1.1.4.1 | Alert group |
| 1.3.6.1.2.1.43.18.1.1.5.1 | Alert index |
| 1.3.6.1.2.1.43.18.1.1.8.1 | Alert description |

---

## ✅ Completed Features

- [x] SNMP-based printer discovery and monitoring
- [x] Real-time status monitoring
- [x] Supply level tracking with color matching
- [x] Page count monitoring
- [x] Dashboard with grouped sections
- [x] Individual printer detail pages
- [x] Historical data collection
- [x] Fleet analytics dashboard
- [x] Individual printer analytics
- [x] Alert system with cooldown
- [x] Email notifications (SMTP)
- [x] Webhook notifications
- [x] Encrypted credential storage
- [x] Settings configuration UI
- [x] Alert management UI
- [x] Tray state monitoring (OIDs added, UI implemented)
- [x] Error/alert detection from printers
- [x] Network identity information (sysName, sysLocation, sysContact)

## 🚧 In Progress

- [ ] PDF report generation

## 📅 Planned Features

- [ ] Active Directory integration
- [ ] Multi-site support
- [ ] Custom dashboard layouts
- [ ] Mobile-responsive design improvements
- [ ] Dark mode theme
- [ ] API authentication
- [ ] User roles and permissions
- [ ] Printer grouping by department/floor
- [ ] Cost tracking per page
- [ ] Carbon footprint reporting

---

*Last updated: Auto-generated*
