# Printer Monitor API - Feature Changelog

## Alerts, Notifications & Reports Feature

### Backend Changes (`server.js`)

- [x] **Alert System**
  - Alert cooldown tracking (prevents spam, default 4-hour cooldown)
  - Offline printer detection with configurable timeout
  - Low/critical supply threshold checking
  - Back-online notifications when printers recover
  - `checkAlerts()` runs in existing 60-second monitoring loop

- [x] **Email Notifications (Nodemailer)**
  - SMTP configuration (host, port, user, password)
  - HTML-formatted alert emails with color-coded urgency
  - Test email endpoint for configuration validation

- [x] **Webhook Notifications**
  - Support for Slack, Discord, Teams, custom webhooks
  - Auto-detect webhook type and format payload accordingly
  - Enable/disable individual webhooks

- [x] **Settings API**
  - `GET /api/settings` - Get configuration (passwords masked)
  - `POST /api/settings` - Update configuration
  - `POST /api/settings/test-email` - Send test email
  - `POST /api/settings/test-webhook` - Send test webhook

- [x] **Alerts API**
  - `GET /api/alerts` - Get alert history
  - `GET /api/alerts/count` - Unacknowledged count (for badge)
  - `POST /api/alerts/:id/acknowledge` - Acknowledge alert (clears cooldown)
  - `POST /api/alerts/acknowledge-all` - Bulk acknowledge
  - `DELETE /api/alerts/:id` - Delete alert
  - `DELETE /api/alerts` - Clear all alerts

- [x] **Reports API**
  - `GET /api/reports/usage?format=json|csv|pdf` - Usage report
  - `GET /api/reports/supplies?format=json|csv|pdf` - Supply status report
  - PDF generation with PDFKit
  - CSV export for data analysis

### Storage Module (`storage.js`)

- [x] **JSON File Persistence**
  - `data/config.json` - Settings with encrypted passwords
  - `data/alert-history.json` - Alert history (max 1000)
  - `data/printers.json` - Printer data persistence
  - Auto-create `data/` directory

- [x] **Encryption**
  - AES-256 encryption for sensitive fields (passwords, webhook URLs)
  - Auto-generate random 32-char encryption key on first run
  - Key stored in `.env` file

- [x] **Backup System**
  - Create `.bak` backup before every save
  - Auto-restore from backup on corruption

### Frontend Changes

- [x] **Settings Page (`settings.html`)**
  - Tabbed interface: Email, Webhooks, Alerts, Reports
  - Email config: SMTP settings, recipients list, test button
  - Webhooks: Add/remove/toggle webhooks, test button
  - Alerts: Threshold sliders, cooldown configuration
  - Reports: Schedule options, download buttons (PDF/CSV)

- [x] **Alerts Page (`alerts.html`)**
  - Alert history table with filtering
  - Acknowledge button per alert (with confirmation)
  - Acknowledge All / Clear All buttons
  - Color-coded alerts by type (critical, low, offline, online)
  - Auto-refresh every 30 seconds

- [x] **Dashboard Updates (`standalone_dashboard.html`)**
  - Added Alerts button with red badge counter
  - Added Settings button
  - Badge shows unacknowledged alert count

### New Files Created

| File | Description |
|------|-------------|
| `storage.js` | JSON persistence, encryption, backup module |
| `settings.html` | Settings configuration UI |
| `alerts.html` | Alert history and management UI |
| `.gitignore` | Ignore data/, .env, node_modules |
| `.env.example` | Example environment file |

### Dependencies Added

| Package | Version | Purpose |
|---------|---------|---------|
| `nodemailer` | ^6.9.7 | Email notifications |
| `node-cron` | ^3.0.3 | Scheduled reports |
| `pdfkit` | ^0.14.0 | PDF report generation |
| `dotenv` | ^16.3.1 | Environment variables |
| `crypto-js` | ^4.2.0 | Credential encryption |

---

## Historical Data & Analytics Feature

### Backend Changes (`server.js`)

- [x] **History Storage System**
  - Added `history` object for storing snapshots and daily aggregates
  - Minute-by-minute snapshots (keeps last 24 hours)
  - Daily aggregates (keeps last 30 days)
  - `recordSnapshot()` function runs every 60 seconds

- [x] **History API Endpoints**
  - `GET /api/history/snapshots?minutes=N` - Recent snapshots
  - `GET /api/history/daily?days=N` - Daily aggregates
  - `GET /api/history/printer/:ip?minutes=N` - Per-printer history
  - `GET /api/history/analytics` - Summary dashboard data

### Frontend Changes

- [x] **Analytics Dashboard (`analytics.html`)**
  - Summary cards: Pages Today, Total All Time, Days Tracked, Low Supply Alerts
  - Page Counts Over Time chart (line chart)
  - Daily Print Volume chart (stacked bar)
  - Supply Level Trends chart (line chart with printer selector)
  - Top Printers by Volume chart (doughnut)
  - Low Supply Alerts list
  - Printer Usage Summary table
  - Time range selector (1hr, 6hr, 24hr)
  - Auto-refresh every 2 minutes

- [x] **Main Dashboard Update (`standalone_dashboard.html`)**
  - Added "Analytics" button in header linking to analytics page

---

## Individual Printer Analytics Feature

### Frontend Changes

- [x] **Printer Analytics Page (`printer-analytics.html`)**
  - Dedicated analytics view for a single printer
  - Current status display (status, pages, uptime, last update)
  - Page count history over time (line chart)
  - Supply level trends with color-coded lines (cyan, magenta, yellow, black)
  - Daily print volume (bar chart)
  - Daily uptime history (bar chart with color-coded bars)
  - Current supply level bars
  - Usage predictions based on consumption rate
  - Summary cards: Avg Pages/Day, Total Tracked, Days Tracked, Low Supplies

- [x] **Navigation Updates**
  - Added "Analytics" button in printer detail view header
  - Made usage table rows clickable in main analytics
  - Made low supply alerts clickable in main analytics

---

## Files Modified/Created

| File | Status | Description |
|------|--------|-------------|
| `server.js` | ✅ Modified | Added history storage and API endpoints |
| `analytics.html` | ✅ Modified | Main analytics dashboard with clickable links |
| `standalone_dashboard.html` | ✅ Modified | Added analytics link |
| `printer-view.html` | ✅ Modified | Added analytics button in header |
| `printer-analytics.html` | ✅ Created | Individual printer analytics page |
| `CHANGELOG.md` | ✅ Created | This documentation file |
