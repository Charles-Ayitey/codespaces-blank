# Copilot Instructions for Printer Monitor API

## Project Overview

Node.js/Express SNMP-based printer monitoring system with standalone HTML/Tailwind CSS frontend. Monitors printer status, supply levels, tray states, and page counts via SNMP polling, with alerting, notifications, and reporting.

## Architecture

### Core Components
| File | Purpose |
|------|---------|
| `server.js` | Express API server (~900 lines): SNMP polling, alert logic, REST endpoints, background jobs |
| `storage.js` | JSON persistence (~250 lines): AES-256 encryption, automatic `.bak` backups |
| `data/` | Runtime data (gitignored): `printers.json`, `config.json`, `alert-history.json`, `history.json` |

### Data Flow
```
SNMP Poll (60s) → queryPrinter() → in-memory Map → data/printers.json
                                 ↓
                    recordSnapshot() (60s) → history.snapshots[]
                                 ↓
                    checkAlerts() → triggerAlert() → Email/Webhook
```

### Frontend Pages (Standalone HTML, no build)
| Page | Purpose | Key Features |
|------|---------|--------------|
| `standalone_dashboard.html` | Main entry point | Printer grid, stat cards, scan/add controls |
| `printer-view.html` | Single printer detail | Tabs: Overview, Supplies, Trays, Errors |
| `analytics.html` | Fleet analytics | Charts (Chart.js), daily volumes, top printers |
| `printer-analytics.html` | Per-printer analytics | Supply trends, page history, usage predictions |
| `alerts.html` | Alert management | Filter/acknowledge/delete alerts |
| `settings.html` | Configuration | Tabs: Email, Webhooks, Alerts, Reports |
| `printers-detail.html` | Filtered printer list | Query param: `?filter=active|offline|low-supplies` |

All pages use `const API_BASE = 'http://localhost:5000/api'` and auto-refresh every 30 seconds.

## Key Patterns

### SNMP OID Structure
OIDs defined in `PRINTER_OIDS` constant (RFC 3805 Printer MIB). To add monitored values:
```javascript
const PRINTER_OIDS = {
  // Existing: description, sysName, serial, status, totalPages, supply*, inputTray*, alert*
  newValue: '1.3.6.1.2.1.43.x.x.x.x',
};
// Then add snmpGet() or snmpWalk() call in queryPrinter()
```

### Alert Cooldown System
Prevents alert spam using key pattern: `"${ip}-${alertType}-${supplyName}"`:
```javascript
isInCooldown(key)    // Check before triggering
setCooldown(key)     // Set after trigger
clearCooldown(key)   // Clear on acknowledge
```
Default cooldown: 4 hours (configurable in settings).

### Storage Encryption
Sensitive fields auto-encrypted via `storage.encrypt()`/`storage.decrypt()`:
- `config.email.pass` - SMTP password
- `config.webhooks[].url` - Webhook URLs
- Key auto-generates to `.env` (`ENCRYPTION_KEY=...`) on first run

### Frontend Fetch Pattern
```javascript
const API_BASE = 'http://localhost:5000/api';
fetch(`${API_BASE}/printers`)
  .then(res => res.json())
  .then(data => { /* render */ });
```

### Supply Filtering Logic (Backend)
Supplies are filtered in `queryPrinter()` to include only recognized consumables:
- **Included types**: `toner`, `drum`, `fuser`, `transfer`, `maintenance`, `waste`
- **Excluded**: Numeric-only names, names < 3 chars, unrecognized "other" items
- Canon printers return 1000+ supply entries; filtering reduces to ~10-15 meaningful items

### Supply Filtering Logic (Frontend)
Dashboard filters supplies to show only toner/ink (not drums/fusers):
```javascript
function filterSupplies(supplies) {
  // Includes: toner, ink, cyan, magenta, yellow, black, cartridge
  // Excludes: drum, fuser, belt, maintenance, waste, transfer, roller
}
```

### Tray Filtering Logic (Backend)
Trays are filtered in `queryPrinter()` using strict keyword matching:
- **Required keywords**: `tray`, `drawer`, `cassette`, `bypass`, `manual feed`, `multi-purpose`, `multipurpose`, `mpt`
- **Excluded**: Binary/garbage data, numeric-only names, names < 3 chars, entries without tray keywords
- **Deduplication**: Same-name trays are not added twice
- **mediaName cleanup**: Numeric-only mediaName values are set to null
- Canon printers return 500+ tray entries; filtering reduces to ~2-4 actual trays

### HP Printer Compatibility
HP printers use non-standard SNMP OIDs. The system tries multiple OIDs:
- **Serial**: Standard → HP-specific (`1.3.6.1.4.1.11.2.3.9.4.2.1.1.3.3.0`) → PWG MIB
- **Page Count**: Standard → HP-specific (`1.3.6.1.4.1.11.2.3.9.4.2.1.4.1.2.5.0`)
- **Status**: Standard → HP-specific (`1.3.6.1.4.1.11.2.3.9.1.1.3.0`)
- SNMP timeout increased to 5 seconds with 2 retries for slower printers

## Development

```bash
cd printer-monitor-api
npm install           # Install dependencies
npm run dev           # nodemon auto-reload
npm start             # Production
```
Server: `http://localhost:5000` | Open `.html` files directly in browser

## API Reference

### Core Endpoints
```
GET    /api/printers              # List all printers
GET    /api/printers/:ip          # Get single printer
POST   /api/printers              # Add printer { ip, community? }
DELETE /api/printers/:ip          # Remove printer
POST   /api/printers/:ip/refresh  # Refresh single printer
POST   /api/printers/refresh      # Refresh all printers
```

### Network Scanning
```
POST   /api/scan                  # Start scan { network_prefix: '10.233.6' }
GET    /api/scan/status           # { scanning: bool, lastScan: ISO }
POST   /api/scan/cancel           # Cancel running scan
```

### History & Analytics
```
GET    /api/history/snapshots?minutes=60   # Minute-by-minute data
GET    /api/history/daily?days=7           # Daily aggregates
GET    /api/history/printer/:ip            # Per-printer history
GET    /api/history/analytics              # Summary: topPrinters, lowSupplyAlerts
```

### Alerts
```
GET    /api/alerts                # { total, unacknowledged, alerts[] }
GET    /api/alerts/count          # { count } for badge
POST   /api/alerts/:id/acknowledge
POST   /api/alerts/acknowledge-all
DELETE /api/alerts/:id
DELETE /api/alerts                # Clear all
```

### Settings
```
GET    /api/settings              # Returns masked passwords (••••••••)
POST   /api/settings              # Update (preserve masked values)
POST   /api/settings/test-email   # Send test email
POST   /api/settings/test-webhook # { webhookIndex }
```

### Reports
```
GET    /api/reports/usage?format=json|csv|pdf&days=7
GET    /api/reports/supplies?format=json|csv|pdf
```

## Adding Features

### New Printer Data Field
1. Add OID to `PRINTER_OIDS` in `server.js`
2. Add `snmpGet()` or `snmpWalk()` in `queryPrinter()`
3. Add field to `printerData` object
4. Update relevant HTML page rendering

### New Alert Type
1. Add case in `triggerAlert()` switch (builds subject/message)
2. Add check in `checkAlerts()` function
3. Add style in `alerts.html` → `getAlertStyle(type)`

### New Settings Section
1. Add to `DEFAULT_CONFIG` in `storage.js`
2. Add tab/panel in `settings.html`
3. Handle in `loadSettings()` and `saveSettings()`

## Printer Data Structure
```javascript
{
  ip: '10.233.6.100',
  name: 'HP LaserJet Pro',
  model: 'HP LaserJet Pro MFP',
  serial: 'VNB1234567',
  status: 'idle' | 'printing' | 'offline' | 'warmup' | 'waiting' | 'unknown',
  online: true,
  totalPages: 45678,
  supplies: [{ 
    name: 'Black Toner', 
    current: 80, 
    max: 100, 
    type: 'toner' | 'drum' | 'fuser' | 'transfer' | 'maintenance' | 'waste'
  }],
  trays: [{ name: 'Tray 1', currentLevel: 250, maxCapacity: 500, status: 'available' }],
  errors: [{ severity: 'warning', description: 'Low toner', timestamp: ISO }],
  network: { sysName, sysLocation, sysContact },
  lastUpdate: ISO
}
```

## Background Jobs
| Job | Interval | Function |
|-----|----------|----------|
| Auto-refresh printers | 60s | Polls all printers, runs `checkAlerts()` |
| Record snapshot | 60s | `recordSnapshot()` → history.snapshots |
| Save printers | 5min | Persists in-memory Map to `printers.json` |
| Save history | 10min | Persists snapshots/daily to `history.json` |

## Gitignored Files
```
data/           # All runtime JSON data
.env            # Encryption key
node_modules/
*.log
*.bak
```

## Testing
- No test framework installed
- Manual SNMP testing with real printer IPs
- Health check: `GET /api/health`
- Test notifications: `/api/settings/test-email`, `/api/settings/test-webhook`

## External Dependencies
| Package | Purpose |
|---------|---------|
| `net-snmp` | SNMP protocol (GET/WALK operations) |
| `nodemailer` | SMTP email sending |
| `pdfkit` | PDF report generation |
| `crypto-js` | AES-256 encryption |
| `node-cron` | Scheduled tasks (reports) |
| `dotenv` | Environment variable loading |
