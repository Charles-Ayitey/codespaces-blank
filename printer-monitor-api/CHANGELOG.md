# Printer Monitor API - Feature Changelog

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
