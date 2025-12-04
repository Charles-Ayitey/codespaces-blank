/**
 * Printer Monitoring API Server - Node.js Version
 * Express-based REST API for SNMP printer monitoring
 * With alerts, notifications, and persistent storage
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const snmp = require('net-snmp');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const PDFDocument = require('pdfkit');
const path = require('path');
const storage = require('./storage');

const app = express();
const PORT = process.env.PORT || 5000;

// Get app directory (works in Electron and standalone)
const APP_DIR = process.env.APP_PATH || __dirname;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static HTML files (for desktop and server modes)
app.use(express.static(APP_DIR, {
  extensions: ['html'],
  index: 'standalone_dashboard.html'
}));

// ============================================
// Data Storage (In-memory with persistence)
// ============================================

// Load printers from storage on startup
const printers = new Map();
const savedPrinters = storage.loadPrinters();
savedPrinters.forEach(p => printers.set(p.ip, p));
console.log(`Loaded ${printers.size} printers from storage`);

let scanStatus = { scanning: false, lastScan: null };

// Load config from storage
let config = storage.loadConfig();
console.log('Loaded configuration from storage');

// Alert cooldown tracking (in-memory)
// Key: "ip-alertType-supplyName", Value: timestamp of last alert
const alertCooldown = new Map();

// Offline tracking (when printer went offline)
const offlineTimestamps = new Map();

// Historical data storage
const history = {
  // Stores snapshots: { timestamp, printers: [{ ip, totalPages, supplies: [{name, percentage}] }] }
  snapshots: [],
  // Daily aggregates: { date: { totalPages: {ip: pages}, avgSupplyLevels: {ip: {supply: avg}} } }
  daily: new Map(),
  // Configuration
  maxSnapshots: 1440, // Keep 24 hours of minute-by-minute data
  snapshotInterval: 60000 // 1 minute
};

// Record a history snapshot
function recordSnapshot() {
  const printerList = Array.from(printers.values());
  if (printerList.length === 0) return;

  const snapshot = {
    timestamp: new Date().toISOString(),
    printers: printerList.map(p => ({
      ip: p.ip,
      name: p.name,
      status: p.status,
      online: p.online,
      totalPages: p.totalPages,
      supplies: p.supplies.map(s => ({
        name: s.name,
        percentage: s.max > 0 ? Math.round((s.current / s.max) * 100) : 0
      }))
    }))
  };

  history.snapshots.push(snapshot);

  // Keep only last maxSnapshots
  if (history.snapshots.length > history.maxSnapshots) {
    history.snapshots.shift();
  }

  // Update daily aggregates
  const today = new Date().toISOString().split('T')[0];
  if (!history.daily.has(today)) {
    history.daily.set(today, {
      pageCountStart: {},
      pageCountEnd: {},
      supplyLevels: {},
      uptimeMinutes: {},
      totalMinutes: {}
    });
  }

  const dailyData = history.daily.get(today);
  for (const printer of printerList) {
    // Track page counts
    if (!dailyData.pageCountStart[printer.ip]) {
      dailyData.pageCountStart[printer.ip] = printer.totalPages;
    }
    dailyData.pageCountEnd[printer.ip] = printer.totalPages;

    // Track uptime
    if (!dailyData.totalMinutes[printer.ip]) {
      dailyData.totalMinutes[printer.ip] = 0;
      dailyData.uptimeMinutes[printer.ip] = 0;
    }
    dailyData.totalMinutes[printer.ip]++;
    if (printer.online) {
      dailyData.uptimeMinutes[printer.ip]++;
    }

    // Track supply levels (store latest)
    dailyData.supplyLevels[printer.ip] = printer.supplies.map(s => ({
      name: s.name,
      percentage: s.max > 0 ? Math.round((s.current / s.max) * 100) : 0
    }));
  }

  // Clean up old daily data (keep 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoffDate = thirtyDaysAgo.toISOString().split('T')[0];
  for (const [date] of history.daily) {
    if (date < cutoffDate) {
      history.daily.delete(date);
    }
  }
}

// Start history recording
setInterval(recordSnapshot, history.snapshotInterval);

// ============================================
// Alert System
// ============================================

// Check if alert is in cooldown
function isInCooldown(cooldownKey) {
  if (!alertCooldown.has(cooldownKey)) return false;
  
  const lastAlert = alertCooldown.get(cooldownKey);
  const cooldownMs = (config.alerts.cooldownHours || 4) * 60 * 60 * 1000;
  
  return (Date.now() - lastAlert) < cooldownMs;
}

// Set cooldown for an alert
function setCooldown(cooldownKey) {
  alertCooldown.set(cooldownKey, Date.now());
}

// Clear cooldown for an alert (on acknowledge)
function clearCooldown(cooldownKey) {
  alertCooldown.delete(cooldownKey);
}

// Check if current time is within notification schedule
function isWithinNotificationSchedule() {
  const alertConfig = config.alerts || {};
  const schedule = alertConfig.notifySchedule || 'always';
  
  // Always send notifications
  if (schedule === 'always') {
    return true;
  }
  
  const now = new Date();
  const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const currentTime = now.toTimeString().slice(0, 5); // HH:MM format
  
  const startTime = alertConfig.notifyTime || '08:00';
  const endTime = alertConfig.notifyEndTime || '18:00';
  
  // Check if current time is within the time window
  const isWithinTime = currentTime >= startTime && currentTime <= endTime;
  
  if (schedule === 'business-hours') {
    // Monday-Friday (1-5), within time window
    const isWeekday = currentDay >= 1 && currentDay <= 5;
    return isWeekday && isWithinTime;
  }
  
  if (schedule === 'scheduled') {
    // Check if today is in the selected days
    const notifyDays = alertConfig.notifyDays || [1, 2, 3, 4, 5];
    const isDayAllowed = notifyDays.includes(currentDay);
    return isDayAllowed && isWithinTime;
  }
  
  return true;
}

// Send email notification
async function sendEmailNotification(subject, message, alertType) {
  if (!config.email.enabled) {
    console.log('Email notifications disabled');
    return false;
  }
  
  // Check notification schedule (skip for reports which have their own schedule)
  if (alertType !== 'report' && !isWithinNotificationSchedule()) {
    console.log('Email notification skipped - outside scheduled hours');
    return false;
  }
  
  if (!config.email.host) {
    console.log('Email error: SMTP host not configured');
    return false;
  }
  if (!config.email.user) {
    console.log('Email error: Username not configured');
    return false;
  }
  if (!config.email.pass) {
    console.log('Email error: Password not configured');
    return false;
  }
  
  try {
    // Determine if this is Gmail
    const isGmail = config.email.host.toLowerCase().includes('gmail');
    const port = config.email.port || 587;
    
    // For Gmail: port 587 uses STARTTLS (secure: false), port 465 uses SSL (secure: true)
    // For other providers, use the configured secure setting
    const useSecure = port === 465 ? true : (config.email.secure || false);
    
    const transportConfig = {
      host: config.email.host,
      port: port,
      secure: useSecure,
      auth: {
        user: config.email.user,
        pass: config.email.pass
      }
    };
    
    // For Gmail with 2FA, we need specific settings
    if (isGmail) {
      transportConfig.service = 'gmail';
      // Gmail requires TLS
      transportConfig.tls = {
        rejectUnauthorized: false
      };
    }
    
    const transporter = nodemailer.createTransport(transportConfig);
    
    // Verify connection before sending
    await transporter.verify();
    
    const recipients = config.email.recipients.filter(r => r && r.includes('@'));
    if (recipients.length === 0) {
      console.log('No valid email recipients configured');
      return false;
    }
    
    const emoji = alertType === 'critical-supply' ? '🚨' : 
                  alertType === 'offline' ? '❌' :
                  alertType === 'back-online' ? '✅' : '⚠️';
    
    await transporter.sendMail({
      from: config.email.user,
      to: recipients.join(', '),
      subject: `${emoji} Printer Alert: ${subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2 style="color: ${alertType.includes('critical') ? '#dc2626' : alertType === 'back-online' ? '#16a34a' : '#f59e0b'};">
            ${emoji} ${subject}
          </h2>
          <p style="font-size: 16px; color: #374151;">${message}</p>
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="font-size: 12px; color: #9ca3af;">
            Sent by Printer Monitoring System at ${new Date().toLocaleString()}
          </p>
        </div>
      `
    });
    
    console.log(`Email sent: ${subject}`);
    return true;
  } catch (error) {
    console.error('Email send failed:', error.message);
    console.error('Full error:', error);
    return false;
  }
}

// Send webhook notification
async function sendWebhookNotification(subject, message, alertType) {
  const enabledWebhooks = (config.webhooks || []).filter(wh => wh.enabled && wh.url);
  
  for (const webhook of enabledWebhooks) {
    try {
      const emoji = alertType === 'critical-supply' ? '🚨' : 
                    alertType === 'offline' ? '❌' :
                    alertType === 'back-online' ? '✅' : '⚠️';
      
      // Detect webhook type and format accordingly
      let payload;
      if (webhook.url.includes('discord')) {
        payload = {
          content: `${emoji} **${subject}**\n${message}`
        };
      } else if (webhook.url.includes('slack') || webhook.url.includes('hooks.slack.com')) {
        payload = {
          text: `${emoji} *${subject}*\n${message}`
        };
      } else {
        // Generic webhook (Microsoft Teams, custom)
        payload = {
          title: `${emoji} ${subject}`,
          text: message,
          type: alertType,
          timestamp: new Date().toISOString()
        };
      }
      
      await fetch(webhook.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      console.log(`Webhook sent to ${webhook.name || 'webhook'}: ${subject}`);
    } catch (error) {
      console.error(`Webhook failed (${webhook.name}):`, error.message);
    }
  }
}

// Trigger an alert
async function triggerAlert(type, printerIp, printerName, supplyName, details) {
  const cooldownKey = supplyName 
    ? `${printerIp}-${type}-${supplyName}`
    : `${printerIp}-${type}`;
  
  // Check cooldown
  if (isInCooldown(cooldownKey)) {
    return null;
  }
  
  // Build alert message
  let subject, message;
  switch (type) {
    case 'critical-supply':
      subject = `Critical: ${printerName} - ${supplyName} at ${details.percentage}%`;
      message = `The ${supplyName} on printer "${printerName}" (${printerIp}) has reached a critical level of ${details.percentage}%. Immediate replacement recommended.`;
      break;
    case 'low-supply':
      subject = `Low Supply: ${printerName} - ${supplyName} at ${details.percentage}%`;
      message = `The ${supplyName} on printer "${printerName}" (${printerIp}) is running low at ${details.percentage}%. Consider ordering replacement supplies.`;
      break;
    case 'offline':
      subject = `Offline: ${printerName}`;
      message = `Printer "${printerName}" (${printerIp}) has gone offline. Last seen: ${details.lastSeen || 'Unknown'}`;
      break;
    case 'back-online':
      subject = `Back Online: ${printerName}`;
      message = `Printer "${printerName}" (${printerIp}) is back online after being offline for ${details.downtime || 'some time'}.`;
      break;
    default:
      subject = `Alert: ${printerName}`;
      message = details.message || 'An alert was triggered.';
  }
  
  // Save alert to history
  const alert = storage.addAlert({
    type,
    printerIp,
    printerName,
    supplyName,
    subject,
    message,
    details
  });
  
  // Set cooldown
  setCooldown(cooldownKey);
  
  // Send notifications (async, don't wait)
  if (config.alerts.enabled) {
    sendEmailNotification(subject, message, type);
    sendWebhookNotification(subject, message, type);
  }
  
  console.log(`Alert triggered: ${subject}`);
  return alert;
}

// Check all printers for alert conditions
async function checkAlerts() {
  if (!config.alerts.enabled) return;
  
  const printerList = Array.from(printers.values());
  
  for (const printer of printerList) {
    // Check offline status
    if (!printer.online || printer.status === 'offline') {
      if (!offlineTimestamps.has(printer.ip)) {
        offlineTimestamps.set(printer.ip, Date.now());
      }
      
      const offlineDuration = Date.now() - offlineTimestamps.get(printer.ip);
      const offlineThresholdMs = (config.alerts.offlineMinutes || 5) * 60 * 1000;
      
      if (offlineDuration >= offlineThresholdMs) {
        await triggerAlert('offline', printer.ip, printer.name || printer.ip, null, {
          lastSeen: printer.lastUpdate
        });
      }
    } else {
      // Printer is online - check if it was offline before
      if (offlineTimestamps.has(printer.ip)) {
        const downtime = Date.now() - offlineTimestamps.get(printer.ip);
        const downtimeStr = downtime > 3600000 
          ? `${Math.round(downtime / 3600000)} hours`
          : `${Math.round(downtime / 60000)} minutes`;
        
        await triggerAlert('back-online', printer.ip, printer.name || printer.ip, null, {
          downtime: downtimeStr
        });
        
        offlineTimestamps.delete(printer.ip);
      }
      
      // Check supply levels
      for (const supply of printer.supplies) {
        const percentage = supply.max > 0 ? Math.round((supply.current / supply.max) * 100) : 100;
        
        // Only check toner/ink supplies
        const supplyName = supply.name.toLowerCase();
        if (!supplyName.includes('toner') && !supplyName.includes('ink')) continue;
        if (supplyName.includes('drum') || supplyName.includes('fuser')) continue;
        
        if (percentage >= 0 && percentage < config.alerts.criticalSupplyThreshold) {
          await triggerAlert('critical-supply', printer.ip, printer.name || printer.ip, supply.name, {
            percentage
          });
        } else if (percentage >= config.alerts.criticalSupplyThreshold && percentage < config.alerts.lowSupplyThreshold) {
          await triggerAlert('low-supply', printer.ip, printer.name || printer.ip, supply.name, {
            percentage
          });
        }
      }
    }
  }
}

// ============================================
// Persistence - Save data periodically
// ============================================

// Save printers every 5 minutes
setInterval(() => {
  if (printers.size > 0) {
    storage.savePrinters(Array.from(printers.values()));
    console.log(`Saved ${printers.size} printers to storage`);
  }
}, 5 * 60 * 1000);

// Save history every 10 minutes
setInterval(() => {
  storage.saveHistory(history);
  console.log('Saved history to storage');
}, 10 * 60 * 1000);

// Standard Printer MIB OIDs
const PRINTER_OIDS = {
  // System Information
  description: '1.3.6.1.2.1.1.1.0',
  sysName: '1.3.6.1.2.1.1.5.0',
  sysLocation: '1.3.6.1.2.1.1.6.0',
  sysContact: '1.3.6.1.2.1.1.4.0',
  
  // Printer Identity - Standard MIB
  serial: '1.3.6.1.2.1.43.5.1.1.17.1',
  
  // Alternative Serial OIDs (HP, Lexmark, etc.)
  serialAlt1: '1.3.6.1.4.1.11.2.3.9.4.2.1.1.3.3.0',  // HP specific
  serialAlt2: '1.3.6.1.4.1.2699.1.2.1.2.1.1.3.1',    // PWG Printer MIB
  serialAlt3: '1.3.6.1.2.1.43.5.1.1.17',             // Without instance
  
  // Status
  status: '1.3.6.1.2.1.25.3.5.1.1.1',
  deviceStatus: '1.3.6.1.2.1.43.16.5.1.2.1.1',
  
  // Alternative Status OIDs
  statusAlt1: '1.3.6.1.4.1.11.2.3.9.1.1.3.0',        // HP specific
  
  // Page Counts
  totalPages: '1.3.6.1.2.1.43.10.2.1.4.1.1',
  
  // Alternative Page Count OIDs (different manufacturers)
  totalPagesAlt1: '1.3.6.1.4.1.11.2.3.9.4.2.1.4.1.2.5.0',  // HP specific
  totalPagesAlt2: '1.3.6.1.2.1.43.10.2.1.4.1',             // Without instance
  totalPagesAlt3: '1.3.6.1.4.1.1347.43.10.1.1.12.1.1',     // Kyocera
  totalPagesAlt4: '1.3.6.1.4.1.253.8.53.13.2.1.6.1.20.1',  // Xerox
  totalPagesAlt5: '1.3.6.1.4.1.367.3.2.1.2.19.5.1.9.1',    // Ricoh
  totalPagesAlt6: '1.3.6.1.2.1.43.10.2.1.5.1.1',           // prtMarkerLifeCount (alternate)
  
  // Supplies (prtMarkerSuppliesTable)
  supplyDesc: '1.3.6.1.2.1.43.11.1.1.6.1',
  supplyMax: '1.3.6.1.2.1.43.11.1.1.8.1',
  supplyCurrent: '1.3.6.1.2.1.43.11.1.1.9.1',
  
  // Input Trays (prtInputTable)
  inputTrayName: '1.3.6.1.2.1.43.8.2.1.9.1',
  inputTrayCapacityMax: '1.3.6.1.2.1.43.8.2.1.10.1',
  inputTrayCapacityCurrent: '1.3.6.1.2.1.43.8.2.1.11.1',
  inputTrayStatus: '1.3.6.1.2.1.43.8.2.1.12.1',
  inputTrayMediaName: '1.3.6.1.2.1.43.8.2.1.18.1',
  
  // Printer Alerts (prtAlertTable)
  alertSeverity: '1.3.6.1.2.1.43.18.1.1.2.1',
  alertGroup: '1.3.6.1.2.1.43.18.1.1.4.1',
  alertIndex: '1.3.6.1.2.1.43.18.1.1.5.1',
  alertDescription: '1.3.6.1.2.1.43.18.1.1.8.1'
};

// Status mappings
const DEVICE_STATUS = {
  1: 'other',
  2: 'unknown',
  3: 'idle',
  4: 'printing',
  5: 'warmup',
  6: 'waiting'
};

// Input tray status mappings
const TRAY_STATUS = {
  0: 'unknown',
  1: 'available',
  2: 'unavailable',
  3: 'empty',
  4: 'paper-jam',
  5: 'tray-missing'
};

// Alert severity mappings
const ALERT_SEVERITY = {
  1: 'other',
  2: 'critical',
  3: 'warning',
  4: 'info'
};

/**
 * Perform SNMP GET request
 */
function snmpGet(ip, oid, community = 'public', timeout = 5000) {
  return new Promise((resolve, reject) => {
    const session = snmp.createSession(ip, community, { timeout: timeout, retries: 2 });
    
    session.get([oid], (error, varbinds) => {
      session.close();
      
      if (error) {
        resolve(null);
      } else {
        if (snmp.isVarbindError(varbinds[0])) {
          resolve(null);
        } else {
          resolve(varbinds[0].value.toString());
        }
      }
    });
  });
}

/**
 * Perform SNMP WALK to get multiple values
 */
function snmpWalk(ip, oid, community = 'public', timeout = 5000) {
  return new Promise((resolve, reject) => {
    const session = snmp.createSession(ip, community, { timeout: timeout, retries: 2 });
    const results = [];
    
    function feedCb(varbinds) {
      for (let i = 0; i < varbinds.length; i++) {
        if (snmp.isVarbindError(varbinds[i])) {
          continue;
        } else {
          results.push(varbinds[i].value.toString());
        }
      }
    }
    
    function doneCb(error) {
      session.close();
      if (error) {
        resolve([]);
      } else {
        resolve(results);
      }
    }
    
    session.walk(oid, 20, feedCb, doneCb);
  });
}

/**
 * Query a printer for all its information
 */
async function queryPrinter(ip, community = 'public') {
  console.log(`Querying printer at ${ip}...`);
  
  const printerData = {
    ip: ip,
    name: null,
    model: null,
    serial: null,
    status: 'unknown',
    totalPages: 0,
    supplies: [],
    trays: [],
    errors: [],
    network: {
      sysName: null,
      sysLocation: null,
      sysContact: null
    },
    lastUpdate: new Date().toISOString(),
    online: false
  };
  
  try {
    // Get description - try standard OID first
    const desc = await snmpGet(ip, PRINTER_OIDS.description, community);
    if (desc) {
      printerData.online = true;
      printerData.name = desc.substring(0, 50);
      printerData.model = desc.substring(0, 50);
    } else {
      printerData.status = 'offline';
      return printerData;
    }
    
    // Get serial number - try multiple OIDs (HP uses different OIDs)
    let serial = await snmpGet(ip, PRINTER_OIDS.serial, community);
    if (!serial) {
      serial = await snmpGet(ip, PRINTER_OIDS.serialAlt1, community);
    }
    if (!serial) {
      serial = await snmpGet(ip, PRINTER_OIDS.serialAlt2, community);
    }
    if (serial) {
      printerData.serial = serial;
    }
    
    // Get status - try multiple OIDs
    let status = await snmpGet(ip, PRINTER_OIDS.deviceStatus, community);
    if (!status) {
      status = await snmpGet(ip, PRINTER_OIDS.statusAlt1, community);
    }
    if (status && !isNaN(status)) {
      const statusCode = parseInt(status);
      printerData.status = DEVICE_STATUS[statusCode] || 'unknown';
    }
    
    // Get page count - try multiple OIDs for different manufacturers
    let pages = await snmpGet(ip, PRINTER_OIDS.totalPages, community);
    if (!pages || isNaN(pages)) {
      pages = await snmpGet(ip, PRINTER_OIDS.totalPagesAlt1, community); // HP
    }
    if (!pages || isNaN(pages)) {
      pages = await snmpGet(ip, PRINTER_OIDS.totalPagesAlt2, community); // Without instance
    }
    if (!pages || isNaN(pages)) {
      pages = await snmpGet(ip, PRINTER_OIDS.totalPagesAlt3, community); // Kyocera
    }
    if (!pages || isNaN(pages)) {
      pages = await snmpGet(ip, PRINTER_OIDS.totalPagesAlt4, community); // Xerox
    }
    if (!pages || isNaN(pages)) {
      pages = await snmpGet(ip, PRINTER_OIDS.totalPagesAlt5, community); // Ricoh
    }
    if (!pages || isNaN(pages)) {
      pages = await snmpGet(ip, PRINTER_OIDS.totalPagesAlt6, community); // prtMarkerLifeCount
    }
    if (pages && !isNaN(pages)) {
      printerData.totalPages = parseInt(pages);
    }
    
    // Get network identity information
    const [sysName, sysLocation, sysContact] = await Promise.all([
      snmpGet(ip, PRINTER_OIDS.sysName, community),
      snmpGet(ip, PRINTER_OIDS.sysLocation, community),
      snmpGet(ip, PRINTER_OIDS.sysContact, community)
    ]);
    
    printerData.network = {
      sysName: sysName || null,
      sysLocation: sysLocation || null,
      sysContact: sysContact || null
    };
    
    // Get supply levels
    const supplyNames = await snmpWalk(ip, PRINTER_OIDS.supplyDesc, community);
    const supplyMax = await snmpWalk(ip, PRINTER_OIDS.supplyMax, community);
    const supplyCurrent = await snmpWalk(ip, PRINTER_OIDS.supplyCurrent, community);
    
    if (supplyNames.length > 0 && supplyMax.length > 0 && supplyCurrent.length > 0) {
      for (let i = 0; i < supplyNames.length; i++) {
        if (i < supplyMax.length && i < supplyCurrent.length) {
          const maxVal = parseInt(supplyMax[i]);
          const currentVal = parseInt(supplyCurrent[i]);
          const name = supplyNames[i] || '';
          const nameLower = name.toLowerCase().trim();
          
          // Skip invalid entries
          if (!isNaN(maxVal) && !isNaN(currentVal) && maxVal > 0 && name) {
            // Skip junk entries: numeric-only names, empty, or very short names
            if (/^\d+$/.test(name.trim()) || name.trim().length < 3) {
              continue;
            }
            
            // Determine supply type based on name
            let type = 'other';
            if (nameLower.includes('toner') || nameLower.includes('ink') || nameLower.includes('cartridge')) {
              // Exclude waste toner from primary toner display
              if (nameLower.includes('waste')) {
                type = 'waste';
              } else {
                type = 'toner';
              }
            } else if (nameLower.includes('drum')) {
              type = 'drum';
            } else if (nameLower.includes('fuser') || nameLower.includes('fixing')) {
              type = 'fuser';
            } else if (nameLower.includes('belt') || nameLower.includes('transfer')) {
              type = 'transfer';
            } else if (nameLower.includes('maintenance') || nameLower.includes('kit')) {
              type = 'maintenance';
            }
            
            // Only include recognized supply types (filter out unknown "other" items)
            if (type !== 'other') {
              printerData.supplies.push({
                name: name.trim(),
                current: currentVal,
                max: maxVal,
                type: type
              });
            }
          }
        }
      }
    }
    
    // Get input tray information
    const [trayNames, trayMaxCapacity, trayCurrentLevel, trayStatus, trayMediaName] = await Promise.all([
      snmpWalk(ip, PRINTER_OIDS.inputTrayName, community),
      snmpWalk(ip, PRINTER_OIDS.inputTrayCapacityMax, community),
      snmpWalk(ip, PRINTER_OIDS.inputTrayCapacityCurrent, community),
      snmpWalk(ip, PRINTER_OIDS.inputTrayStatus, community),
      snmpWalk(ip, PRINTER_OIDS.inputTrayMediaName, community)
    ]);
    
    if (trayNames.length > 0) {
      for (let i = 0; i < trayNames.length; i++) {
        const name = trayNames[i] || '';
        const nameLower = name.toLowerCase().trim();
        const maxCapacity = i < trayMaxCapacity.length ? parseInt(trayMaxCapacity[i]) : -1;
        const currentLevel = i < trayCurrentLevel.length ? parseInt(trayCurrentLevel[i]) : -1;
        const statusCode = i < trayStatus.length ? parseInt(trayStatus[i]) : 0;
        const mediaName = i < trayMediaName.length ? trayMediaName[i] : null;
        
        // === STRICT TRAY FILTERING ===
        // Skip empty, very short, or numeric-only names
        if (!name || name.trim().length < 3 || /^\d+(\.\d+)?$/.test(name.trim())) {
          continue;
        }
        
        // Skip binary/garbage data (contains null bytes or non-printable chars)
        if (/[\x00-\x1F\x7F-\x9F]/.test(name) || name.includes('\u0000')) {
          continue;
        }
        
        // Only include entries with explicit tray keywords
        const isTray = nameLower.includes('tray') || 
                       nameLower.includes('drawer') || 
                       nameLower.includes('cassette') || 
                       nameLower.includes('bypass') || 
                       nameLower.includes('manual feed') ||
                       nameLower.includes('multi-purpose') ||
                       nameLower.includes('multipurpose') ||
                       nameLower.includes('mpt');
        
        // Skip non-tray entries entirely (no capacity fallback - too unreliable)
        if (!isTray) {
          continue;
        }
        
        // Skip duplicates (same name already added)
        const alreadyExists = printerData.trays.some(t => 
          t.name.toLowerCase() === name.trim().toLowerCase()
        );
        if (alreadyExists) {
          continue;
        }
        
        // Handle SNMP special values for capacity:
        // -1 = "some remaining" (unknown exact amount)
        // -2 = "unknown"
        // -3 = "at least one remaining"
        // Values > 0 are actual counts
        let finalMaxCapacity = null;
        let finalCurrentLevel = null;
        let capacityStatus = null;
        
        if (maxCapacity > 0) {
          finalMaxCapacity = maxCapacity;
        }
        
        if (currentLevel > 0) {
          finalCurrentLevel = currentLevel;
        } else if (currentLevel === -1) {
          // "some remaining" - printer has paper but doesn't report exact count
          capacityStatus = 'has-paper';
        } else if (currentLevel === -3) {
          // "at least one remaining"
          capacityStatus = 'has-paper';
        } else if (currentLevel === 0) {
          // Empty
          capacityStatus = 'empty';
        }
        
        printerData.trays.push({
          name: name.trim(),
          maxCapacity: finalMaxCapacity,
          currentLevel: finalCurrentLevel,
          status: TRAY_STATUS[statusCode] || 'unknown',
          mediaName: mediaName && !/^-?\d+$/.test(mediaName) ? mediaName : null,
          capacityStatus: capacityStatus // 'has-paper', 'empty', or null (use currentLevel/maxCapacity)
        });
      }
    }
    
    // Get printer alerts/errors
    const [alertSeverities, alertDescriptions] = await Promise.all([
      snmpWalk(ip, PRINTER_OIDS.alertSeverity, community),
      snmpWalk(ip, PRINTER_OIDS.alertDescription, community)
    ]);
    
    if (alertSeverities.length > 0) {
      for (let i = 0; i < alertSeverities.length; i++) {
        const severityCode = parseInt(alertSeverities[i]);
        const description = i < alertDescriptions.length ? alertDescriptions[i] : 'Unknown alert';
        
        // Only include critical and warning alerts
        if (severityCode === 2 || severityCode === 3) {
          printerData.errors.push({
            severity: ALERT_SEVERITY[severityCode] || 'unknown',
            description: description,
            timestamp: new Date().toISOString()
          });
        }
      }
    }
    
    return printerData;
  } catch (error) {
    console.error(`Error querying printer ${ip}:`, error.message);
    printerData.status = 'offline';
    return printerData;
  }
}

/**
 * Scan network range for printers
 */
async function scanNetworkRange(networkPrefix, community = 'public') {
  console.log(`Scanning network ${networkPrefix}.1-254...`);
  scanStatus.scanning = true;
  const found = [];
  
  // Scan in batches to avoid overwhelming the network
  const batchSize = 10;
  for (let start = 1; start <= 254; start += batchSize) {
    if (!scanStatus.scanning) break;
    
    const promises = [];
    for (let i = start; i < start + batchSize && i <= 254; i++) {
      const ip = `${networkPrefix}.${i}`;
      promises.push(
        snmpGet(ip, PRINTER_OIDS.description, community)
          .then(desc => ({ ip, desc }))
      );
    }
    
    const results = await Promise.all(promises);
    
    for (const result of results) {
      if (result.desc) {
        const keywords = ['printer', 'hp', 'canon', 'brother', 'epson', 'xerox', 'lexmark', 'samsung', 'ricoh', 'kyocera', 'zebra'];
        if (keywords.some(k => result.desc.toLowerCase().includes(k))) {
          console.log(`Found printer at ${result.ip}`);
          found.push(result.ip);
          const printerData = await queryPrinter(result.ip, community);
          printers.set(result.ip, printerData);
        }
      }
    }
  }
  
  scanStatus.scanning = false;
  scanStatus.lastScan = new Date().toISOString();
  console.log(`Scan complete. Found ${found.length} printers.`);
  return found;
}

// API Routes

// Get all printers
app.get('/api/printers', (req, res) => {
  const printerList = Array.from(printers.values());
  res.json(printerList);
});

// Get specific printer
app.get('/api/printers/:ip', (req, res) => {
  const ip = req.params.ip;
  if (printers.has(ip)) {
    res.json(printers.get(ip));
  } else {
    res.status(404).json({ error: 'Printer not found' });
  }
});

// Add printer manually
app.post('/api/printers', async (req, res) => {
  const { ip, community = 'public' } = req.body;
  
  if (!ip) {
    return res.status(400).json({ error: 'IP address required' });
  }
  
  try {
    const printerData = await queryPrinter(ip, community);
    printers.set(ip, printerData);
    res.status(201).json(printerData);
  } catch (error) {
    res.status(500).json({ error: 'Failed to query printer' });
  }
});

// Delete printer
app.delete('/api/printers/:ip', (req, res) => {
  const ip = req.params.ip;
  if (printers.has(ip)) {
    printers.delete(ip);
    res.json({ message: 'Printer removed' });
  } else {
    res.status(404).json({ error: 'Printer not found' });
  }
});

// Refresh all printers
app.post('/api/printers/refresh', async (req, res) => {
  const { community = 'public' } = req.body || {};
  const ips = Array.from(printers.keys());
  
  for (const ip of ips) {
    const printerData = await queryPrinter(ip, community);
    printers.set(ip, printerData);
  }
  
  res.json({ message: 'Printers refreshed', count: printers.size });
});

// Refresh specific printer
app.post('/api/printers/:ip/refresh', async (req, res) => {
  const ip = req.params.ip;
  
  if (!printers.has(ip)) {
    return res.status(404).json({ error: 'Printer not found' });
  }
  
  const { community = 'public' } = req.body || {};
  const printerData = await queryPrinter(ip, community);
  printers.set(ip, printerData);
  
  res.json(printerData);
});

// Scan network
app.post('/api/scan', async (req, res) => {
  if (scanStatus.scanning) {
    return res.status(409).json({ error: 'Scan already in progress' });
  }
  
  const { network_prefix = '10.233.6', community = 'public' } = req.body;
  
  // Run scan in background
  scanNetworkRange(network_prefix, community).catch(console.error);
  
  res.json({ message: 'Network scan started', network: network_prefix });
});

// Get scan status
app.get('/api/scan/status', (req, res) => {
  res.json(scanStatus);
});

// Cancel scan
app.post('/api/scan/cancel', (req, res) => {
  scanStatus.scanning = false;
  res.json({ message: 'Scan cancelled' });
});

// Get statistics
app.get('/api/stats', (req, res) => {
  const printerList = Array.from(printers.values());
  
  const stats = {
    total: printerList.length,
    active: printerList.filter(p => ['idle', 'printing'].includes(p.status)).length,
    offline: printerList.filter(p => p.status === 'offline').length,
    lowSupplies: 0
  };
  
  for (const printer of printerList) {
    for (const supply of printer.supplies) {
      if (supply.max > 0 && (supply.current / supply.max * 100) < 20) {
        stats.lowSupplies++;
        break;
      }
    }
  }
  
  res.json(stats);
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    printers: printers.size,
    timestamp: new Date().toISOString()
  });
});

// ============================================
// Historical Data API Endpoints
// ============================================

// Get recent snapshots (last N minutes)
app.get('/api/history/snapshots', (req, res) => {
  const minutes = parseInt(req.query.minutes) || 60; // Default to last hour
  const limit = Math.min(minutes, history.maxSnapshots);
  const snapshots = history.snapshots.slice(-limit);
  
  res.json({
    count: snapshots.length,
    interval: history.snapshotInterval / 1000, // in seconds
    snapshots: snapshots
  });
});

// Get daily aggregates
app.get('/api/history/daily', (req, res) => {
  const days = parseInt(req.query.days) || 7; // Default to last week
  const dailyData = [];
  
  // Get sorted dates
  const dates = Array.from(history.daily.keys()).sort().slice(-days);
  
  for (const date of dates) {
    const data = history.daily.get(date);
    const summary = {
      date: date,
      printers: {}
    };
    
    // Calculate pages printed per printer
    for (const ip in data.pageCountEnd) {
      const pagesStart = data.pageCountStart[ip] || 0;
      const pagesEnd = data.pageCountEnd[ip] || 0;
      const uptime = data.uptimeMinutes[ip] || 0;
      const total = data.totalMinutes[ip] || 1;
      
      summary.printers[ip] = {
        pagesPrinted: pagesEnd - pagesStart,
        totalPages: pagesEnd,
        uptimePercent: Math.round((uptime / total) * 100),
        supplyLevels: data.supplyLevels[ip] || []
      };
    }
    
    dailyData.push(summary);
  }
  
  res.json({
    days: dailyData.length,
    data: dailyData
  });
});

// Get history for a specific printer
app.get('/api/history/printer/:ip', (req, res) => {
  const ip = req.params.ip;
  const minutes = parseInt(req.query.minutes) || 60;
  
  // Filter snapshots for this printer
  const printerHistory = history.snapshots.slice(-minutes).map(snapshot => {
    const printerData = snapshot.printers.find(p => p.ip === ip);
    return printerData ? {
      timestamp: snapshot.timestamp,
      ...printerData
    } : null;
  }).filter(Boolean);
  
  // Get daily history for this printer
  const dailyHistory = [];
  const dates = Array.from(history.daily.keys()).sort();
  
  for (const date of dates) {
    const data = history.daily.get(date);
    if (data.pageCountEnd[ip]) {
      dailyHistory.push({
        date: date,
        pagesPrinted: (data.pageCountEnd[ip] || 0) - (data.pageCountStart[ip] || 0),
        totalPages: data.pageCountEnd[ip],
        uptimePercent: Math.round(((data.uptimeMinutes[ip] || 0) / (data.totalMinutes[ip] || 1)) * 100),
        supplyLevels: data.supplyLevels[ip] || []
      });
    }
  }
  
  res.json({
    ip: ip,
    recentHistory: printerHistory,
    dailyHistory: dailyHistory
  });
});

// Get analytics summary
app.get('/api/history/analytics', (req, res) => {
  const printerList = Array.from(printers.values());
  const dates = Array.from(history.daily.keys()).sort();
  
  // Calculate totals
  let totalPagesAllTime = 0;
  let totalPagesToday = 0;
  const today = new Date().toISOString().split('T')[0];
  
  const printerStats = {};
  
  for (const date of dates) {
    const data = history.daily.get(date);
    for (const ip in data.pageCountEnd) {
      const printed = (data.pageCountEnd[ip] || 0) - (data.pageCountStart[ip] || 0);
      totalPagesAllTime += printed;
      
      if (date === today) {
        totalPagesToday += printed;
      }
      
      if (!printerStats[ip]) {
        printerStats[ip] = { totalPrinted: 0, daysActive: 0 };
      }
      printerStats[ip].totalPrinted += printed;
      printerStats[ip].daysActive++;
    }
  }
  
  // Find top printers
  const topPrinters = Object.entries(printerStats)
    .map(([ip, stats]) => ({
      ip,
      name: printers.get(ip)?.name || ip,
      totalPrinted: stats.totalPrinted,
      avgPerDay: Math.round(stats.totalPrinted / stats.daysActive)
    }))
    .sort((a, b) => b.totalPrinted - a.totalPrinted)
    .slice(0, 5);
  
  // Supply trends (low supplies)
  const lowSupplyAlerts = [];
  for (const printer of printerList) {
    for (const supply of printer.supplies) {
      const percentage = supply.max > 0 ? (supply.current / supply.max) * 100 : 0;
      if (percentage < 20 && percentage >= 0) {
        lowSupplyAlerts.push({
          ip: printer.ip,
          printerName: printer.name,
          supplyName: supply.name,
          percentage: Math.round(percentage)
        });
      }
    }
  }
  
  res.json({
    summary: {
      totalPagesAllTime: totalPagesAllTime,
      totalPagesToday: totalPagesToday,
      daysTracked: dates.length,
      printersMonitored: printerList.length
    },
    topPrinters: topPrinters,
    lowSupplyAlerts: lowSupplyAlerts.sort((a, b) => a.percentage - b.percentage),
    lastUpdated: new Date().toISOString()
  });
});

// ============================================
// Settings API Endpoints
// ============================================

// Get settings (masked)
app.get('/api/settings', (req, res) => {
  res.json(storage.getConfigForAPI(config));
});

// Update settings
app.post('/api/settings', (req, res) => {
  const updates = req.body;
  
  console.log('Saving settings...');
  console.log('Email enabled:', updates.email?.enabled);
  console.log('Password provided:', updates.email?.pass ? 'yes (new)' : 'no (keeping existing)');
  
  // Merge updates (preserve password if not provided or masked)
  if (updates.email) {
    // Preserve existing password if new one is null, empty, or masked
    if (!updates.email.pass || updates.email.pass === '••••••••' || updates.email.pass.includes('••••')) {
      updates.email.pass = config.email.pass;
      console.log('Preserved existing password');
    } else {
      console.log('Using new password');
    }
    config.email = { ...config.email, ...updates.email };
  }
  
  if (updates.webhooks) {
    // Restore encrypted URLs for unchanged webhooks
    config.webhooks = updates.webhooks.map((wh, i) => {
      if (wh.url && wh.url.includes('••••')) {
        return { ...wh, url: config.webhooks[i]?.url || '' };
      }
      return wh;
    });
  }
  
  if (updates.alerts) {
    config.alerts = { ...config.alerts, ...updates.alerts };
  }
  
  if (updates.reports) {
    config.reports = { ...config.reports, ...updates.reports };
  }
  
  // Save to storage
  storage.saveConfig(config);
  
  // Restart report scheduler if report settings changed
  if (updates.reports) {
    startReportScheduler();
  }
  
  res.json({ message: 'Settings saved', config: storage.getConfigForAPI(config) });
});

// Test email notification
app.post('/api/settings/test-email', async (req, res) => {
  // Validate email settings first
  if (!config.email.host || !config.email.user || !config.email.pass) {
    return res.status(400).json({ 
      success: false, 
      message: 'Missing email configuration. Please fill in SMTP host, username, and password.' 
    });
  }
  
  if (!config.email.recipients || config.email.recipients.filter(r => r && r.includes('@')).length === 0) {
    return res.status(400).json({ 
      success: false, 
      message: 'No valid email recipients configured. Please add at least one recipient.' 
    });
  }
  
  try {
    const result = await sendEmailNotification(
      'Test Notification',
      'This is a test notification from your Printer Monitoring System. If you received this, your email settings are configured correctly!',
      'test'
    );
    
    if (result) {
      res.json({ success: true, message: 'Test email sent successfully! Check your inbox.' });
    } else {
      res.status(400).json({ 
        success: false, 
        message: 'Failed to send test email. Check the server console for detailed error messages.' 
      });
    }
  } catch (error) {
    console.error('Test email error:', error);
    res.status(400).json({ 
      success: false, 
      message: `Email error: ${error.message}. For Gmail, ensure you are using an App Password (not your regular password) with 2FA enabled.`
    });
  }
});

// Test webhook notification
app.post('/api/settings/test-webhook', async (req, res) => {
  const { webhookIndex } = req.body;
  
  if (webhookIndex === undefined || !config.webhooks[webhookIndex]) {
    return res.status(400).json({ success: false, message: 'Invalid webhook index' });
  }
  
  const webhook = config.webhooks[webhookIndex];
  const originalEnabled = webhook.enabled;
  webhook.enabled = true;
  
  try {
    await sendWebhookNotification(
      'Test Notification',
      'This is a test notification from your Printer Monitoring System.',
      'test'
    );
    webhook.enabled = originalEnabled;
    res.json({ success: true, message: 'Test webhook sent' });
  } catch (error) {
    webhook.enabled = originalEnabled;
    res.status(400).json({ success: false, message: 'Failed to send webhook: ' + error.message });
  }
});

// ============================================
// Alerts API Endpoints
// ============================================

// Get alert history
app.get('/api/alerts', (req, res) => {
  const alerts = storage.loadAlertHistory();
  const unacknowledged = alerts.filter(a => !a.acknowledged).length;
  
  res.json({
    total: alerts.length,
    unacknowledged,
    alerts: alerts.reverse() // Most recent first
  });
});

// Get unacknowledged count (for badge)
app.get('/api/alerts/count', (req, res) => {
  res.json({ count: storage.getUnacknowledgedCount() });
});

// Acknowledge an alert
app.post('/api/alerts/:id/acknowledge', (req, res) => {
  const alertId = req.params.id;
  const { acknowledgedBy = 'user' } = req.body || {};
  
  const alert = storage.acknowledgeAlert(alertId, acknowledgedBy);
  
  if (alert) {
    // Clear cooldown so alert can trigger again if issue persists
    const cooldownKey = alert.supplyName 
      ? `${alert.printerIp}-${alert.type}-${alert.supplyName}`
      : `${alert.printerIp}-${alert.type}`;
    clearCooldown(cooldownKey);
    
    res.json({ message: 'Alert acknowledged', alert });
  } else {
    res.status(404).json({ error: 'Alert not found' });
  }
});

// Acknowledge all alerts
app.post('/api/alerts/acknowledge-all', (req, res) => {
  const alerts = storage.loadAlertHistory();
  let count = 0;
  
  alerts.forEach(alert => {
    if (!alert.acknowledged) {
      storage.acknowledgeAlert(alert.id, 'user');
      count++;
    }
  });
  
  res.json({ message: `Acknowledged ${count} alerts` });
});

// Delete an alert
app.delete('/api/alerts/:id', (req, res) => {
  const result = storage.deleteAlert(req.params.id);
  
  if (result) {
    res.json({ message: 'Alert deleted' });
  } else {
    res.status(404).json({ error: 'Alert not found' });
  }
});

// Clear all alerts
app.delete('/api/alerts', (req, res) => {
  storage.saveAlertHistory([]);
  res.json({ message: 'All alerts cleared' });
});

// ============================================
// Reports API Endpoints
// ============================================

// Generate usage report
app.get('/api/reports/usage', (req, res) => {
  const format = req.query.format || 'json';
  const days = parseInt(req.query.days) || 7;
  
  const printerList = Array.from(printers.values());
  const dates = Array.from(history.daily.keys()).sort().slice(-days);
  
  const reportData = {
    title: 'Printer Usage Report',
    generatedAt: new Date().toISOString(),
    period: `Last ${days} days`,
    printers: []
  };
  
  for (const printer of printerList) {
    const printerReport = {
      ip: printer.ip,
      name: printer.name,
      status: printer.status,
      totalPages: printer.totalPages,
      dailyUsage: []
    };
    
    for (const date of dates) {
      const dailyData = history.daily.get(date);
      if (dailyData && dailyData.pageCountEnd[printer.ip]) {
        printerReport.dailyUsage.push({
          date,
          pagesPrinted: (dailyData.pageCountEnd[printer.ip] || 0) - (dailyData.pageCountStart[printer.ip] || 0)
        });
      }
    }
    
    reportData.printers.push(printerReport);
  }
  
  if (format === 'csv') {
    let csv = 'Printer Name,IP,Status,Total Pages,';
    csv += dates.join(',') + '\n';
    
    for (const printer of reportData.printers) {
      csv += `"${printer.name}",${printer.ip},${printer.status},${printer.totalPages},`;
      csv += dates.map(d => {
        const usage = printer.dailyUsage.find(u => u.date === d);
        return usage ? usage.pagesPrinted : 0;
      }).join(',') + '\n';
    }
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=usage-report-${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csv);
  } else if (format === 'pdf') {
    const doc = new PDFDocument();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=usage-report-${new Date().toISOString().split('T')[0]}.pdf`);
    doc.pipe(res);
    
    doc.fontSize(20).text('Printer Usage Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Generated: ${new Date().toLocaleString()}`);
    doc.text(`Period: Last ${days} days`);
    doc.moveDown();
    
    for (const printer of reportData.printers) {
      doc.fontSize(14).text(`${printer.name} (${printer.ip})`);
      doc.fontSize(10).text(`Status: ${printer.status} | Total Pages: ${printer.totalPages}`);
      
      const totalPrinted = printer.dailyUsage.reduce((sum, d) => sum + d.pagesPrinted, 0);
      doc.text(`Pages printed in period: ${totalPrinted}`);
      doc.moveDown();
    }
    
    doc.end();
  } else {
    res.json(reportData);
  }
});

// Generate supply status report
app.get('/api/reports/supplies', (req, res) => {
  const format = req.query.format || 'json';
  const printerList = Array.from(printers.values());
  
  const reportData = {
    title: 'Supply Status Report',
    generatedAt: new Date().toISOString(),
    supplies: []
  };
  
  for (const printer of printerList) {
    for (const supply of printer.supplies) {
      const percentage = supply.max > 0 ? Math.round((supply.current / supply.max) * 100) : 0;
      reportData.supplies.push({
        printerName: printer.name,
        printerIp: printer.ip,
        supplyName: supply.name,
        percentage,
        status: percentage < 10 ? 'Critical' : percentage < 20 ? 'Low' : 'OK'
      });
    }
  }
  
  // Sort by percentage (lowest first)
  reportData.supplies.sort((a, b) => a.percentage - b.percentage);
  
  if (format === 'csv') {
    let csv = 'Printer,IP,Supply,Percentage,Status\n';
    for (const s of reportData.supplies) {
      csv += `"${s.printerName}",${s.printerIp},"${s.supplyName}",${s.percentage}%,${s.status}\n`;
    }
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=supply-report-${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csv);
  } else if (format === 'pdf') {
    const doc = new PDFDocument();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=supply-report-${new Date().toISOString().split('T')[0]}.pdf`);
    doc.pipe(res);
    
    doc.fontSize(20).text('Supply Status Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Generated: ${new Date().toLocaleString()}`);
    doc.moveDown();
    
    // Critical supplies first
    const critical = reportData.supplies.filter(s => s.status === 'Critical');
    if (critical.length > 0) {
      doc.fontSize(14).fillColor('red').text('Critical Supplies:');
      doc.fillColor('black').fontSize(10);
      critical.forEach(s => {
        doc.text(`• ${s.printerName}: ${s.supplyName} - ${s.percentage}%`);
      });
      doc.moveDown();
    }
    
    // Low supplies
    const low = reportData.supplies.filter(s => s.status === 'Low');
    if (low.length > 0) {
      doc.fontSize(14).fillColor('orange').text('Low Supplies:');
      doc.fillColor('black').fontSize(10);
      low.forEach(s => {
        doc.text(`• ${s.printerName}: ${s.supplyName} - ${s.percentage}%`);
      });
      doc.moveDown();
    }
    
    doc.end();
  } else {
    res.json(reportData);
  }
});

// Background auto-refresh (every 60 seconds)
setInterval(async () => {
  if (printers.size > 0 && !scanStatus.scanning) {
    console.log(`Auto-refreshing ${printers.size} printers...`);
    const ips = Array.from(printers.keys());
    for (const ip of ips) {
      const printerData = await queryPrinter(ip);
      printers.set(ip, printerData);
    }
    
    // Check alerts after refresh
    await checkAlerts();
  }
}, 60000);

// ============================================
// Scheduled Report Generation
// ============================================

let reportCronJob = null;

// Generate and email scheduled report
async function generateScheduledReport() {
  if (!config.reports.enabled || !config.reports.emailOnGenerate) {
    return;
  }
  
  console.log('Generating scheduled report...');
  
  try {
    const printerList = Array.from(printers.values());
    const format = config.reports.format || 'pdf';
    
    // Build report summary for email
    const onlineCount = printerList.filter(p => p.online).length;
    const offlineCount = printerList.filter(p => !p.online).length;
    let lowSupplyCount = 0;
    
    printerList.forEach(p => {
      if (p.supplies.some(s => s.max > 0 && (s.current / s.max * 100) < 20)) {
        lowSupplyCount++;
      }
    });
    
    const subject = `Printer Fleet Report - ${new Date().toLocaleDateString()}`;
    const message = `
      <h3>Fleet Summary</h3>
      <ul>
        <li><strong>Total Printers:</strong> ${printerList.length}</li>
        <li><strong>Online:</strong> ${onlineCount}</li>
        <li><strong>Offline:</strong> ${offlineCount}</li>
        <li><strong>Low Supplies:</strong> ${lowSupplyCount}</li>
      </ul>
      <h3>Printer Status</h3>
      <table style="border-collapse: collapse; width: 100%;">
        <tr style="background: #f3f4f6;">
          <th style="border: 1px solid #d1d5db; padding: 8px; text-align: left;">Printer</th>
          <th style="border: 1px solid #d1d5db; padding: 8px; text-align: left;">Status</th>
          <th style="border: 1px solid #d1d5db; padding: 8px; text-align: left;">Pages</th>
        </tr>
        ${printerList.slice(0, 20).map(p => `
          <tr>
            <td style="border: 1px solid #d1d5db; padding: 8px;">${p.name || p.ip}</td>
            <td style="border: 1px solid #d1d5db; padding: 8px;">${p.online ? '🟢 Online' : '🔴 Offline'}</td>
            <td style="border: 1px solid #d1d5db; padding: 8px;">${p.totalPages.toLocaleString()}</td>
          </tr>
        `).join('')}
      </table>
      ${printerList.length > 20 ? `<p><em>...and ${printerList.length - 20} more printers</em></p>` : ''}
    `;
    
    await sendEmailNotification(subject, message, 'report');
    
    // Update last run time
    config.reports.lastRun = new Date().toISOString();
    storage.saveConfig(config);
    
    console.log('Scheduled report sent successfully');
  } catch (error) {
    console.error('Failed to send scheduled report:', error.message);
  }
}

// Build cron expression from schedule config
function buildCronExpression() {
  const schedule = config.reports.schedule;
  const time = config.reports.time || '08:00';
  const [hours, minutes] = time.split(':');
  
  switch (schedule) {
    case 'daily':
      // Every day at specified time
      return `${minutes} ${hours} * * *`;
    
    case 'weekly':
    case 'custom':
      // On specified days at specified time
      const days = config.reports.days || [1];
      return `${minutes} ${hours} * * ${days.join(',')}`;
    
    case 'monthly':
      // On specified day of month at specified time
      const dayOfMonth = config.reports.dayOfMonth || 1;
      return `${minutes} ${hours} ${dayOfMonth} * *`;
    
    default:
      return `${minutes} ${hours} * * 1`; // Default: Monday at specified time
  }
}

// Start or restart the report cron job
function startReportScheduler() {
  // Stop existing job if any
  if (reportCronJob) {
    reportCronJob.stop();
    reportCronJob = null;
  }
  
  if (!config.reports.enabled) {
    console.log('Scheduled reports disabled');
    return;
  }
  
  const cronExpression = buildCronExpression();
  console.log(`Starting report scheduler with cron: ${cronExpression}`);
  
  try {
    reportCronJob = cron.schedule(cronExpression, () => {
      generateScheduledReport();
    });
    console.log('Report scheduler started');
  } catch (error) {
    console.error('Failed to start report scheduler:', error.message);
  }
}

// Start the scheduler on server init
startReportScheduler();

// Determine the host to bind to
const HOST = process.env.ELECTRON_APP === 'true' ? '127.0.0.1' : '0.0.0.0';

// Start server
const server = app.listen(PORT, HOST, () => {
  console.log('='.repeat(60));
  console.log('Printer Monitoring API Server (Node.js)');
  console.log('='.repeat(60));
  console.log('\nAPI Endpoints:');
  console.log('  GET    /api/printers          - List all printers');
  console.log('  GET    /api/printers/<ip>     - Get specific printer');
  console.log('  POST   /api/printers          - Add printer manually');
  console.log('  DELETE /api/printers/<ip>     - Remove printer');
  console.log('  POST   /api/printers/refresh  - Refresh all printers');
  console.log('  POST   /api/scan              - Scan network');
  console.log('  GET    /api/scan/status       - Get scan status');
  console.log('  GET    /api/stats             - Get statistics');
  console.log('  GET    /api/health            - Health check');
  console.log('\nHistory & Analytics:');
  console.log('  GET    /api/history/snapshots - Recent snapshots');
  console.log('  GET    /api/history/daily     - Daily aggregates');
  console.log('  GET    /api/history/analytics - Analytics summary');
  console.log('\nSettings & Alerts:');
  console.log('  GET    /api/settings          - Get settings');
  console.log('  POST   /api/settings          - Update settings');
  console.log('  GET    /api/alerts            - Get alert history');
  console.log('  POST   /api/alerts/:id/acknowledge - Acknowledge alert');
  console.log('\nReports:');
  console.log('  GET    /api/reports/usage     - Usage report (json/csv/pdf)');
  console.log('  GET    /api/reports/supplies  - Supply report (json/csv/pdf)');
  console.log(`\nServer running on http://${HOST}:${PORT}`);
  console.log('='.repeat(60));
});

// Handle server errors
server.on('error', (err) => {
  console.error('Server error:', err.message);
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use!`);
  } else if (err.code === 'EACCES') {
    console.error(`Permission denied to bind to port ${PORT}`);
  }
});