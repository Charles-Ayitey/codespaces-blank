/**
 * Storage Module - JSON file persistence with encryption and backups
 */

const fs = require('fs');
const path = require('path');
const CryptoJS = require('crypto-js');

// Data directory
const DATA_DIR = path.join(__dirname, 'data');

// Ensure data directory exists
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log('Created data directory');
  }
}

// Get or generate encryption key
function getEncryptionKey() {
  const envPath = path.join(__dirname, '.env');
  
  // Try to load existing key
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/ENCRYPTION_KEY=(.+)/);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  // Generate new random key (32 characters)
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = '';
  for (let i = 0; i < 32; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  // Save to .env file
  const envContent = `# Auto-generated encryption key - DO NOT SHARE OR COMMIT\nENCRYPTION_KEY=${key}\n`;
  fs.writeFileSync(envPath, envContent);
  console.log('Generated new encryption key in .env file');
  
  return key;
}

// Encryption key (loaded once on module init)
let ENCRYPTION_KEY = null;

// Initialize encryption key
function initEncryption() {
  if (!ENCRYPTION_KEY) {
    ENCRYPTION_KEY = getEncryptionKey();
  }
}

// Encrypt a string
function encrypt(text) {
  if (!text) return text;
  initEncryption();
  return CryptoJS.AES.encrypt(text, ENCRYPTION_KEY).toString();
}

// Decrypt a string
function decrypt(encryptedText) {
  if (!encryptedText) return encryptedText;
  initEncryption();
  try {
    const bytes = CryptoJS.AES.decrypt(encryptedText, ENCRYPTION_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch (error) {
    console.error('Decryption failed:', error.message);
    return null;
  }
}

// Create backup of a file
function createBackup(filePath) {
  if (fs.existsSync(filePath)) {
    const backupPath = filePath + '.bak';
    try {
      fs.copyFileSync(filePath, backupPath);
    } catch (error) {
      console.error(`Failed to create backup for ${filePath}:`, error.message);
    }
  }
}

// Read JSON file
function readJSON(filename, defaultValue = null) {
  ensureDataDir();
  const filePath = path.join(DATA_DIR, filename);
  
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error(`Error reading ${filename}:`, error.message);
    
    // Try to restore from backup
    const backupPath = filePath + '.bak';
    if (fs.existsSync(backupPath)) {
      console.log(`Attempting to restore from backup: ${backupPath}`);
      try {
        const backupContent = fs.readFileSync(backupPath, 'utf8');
        return JSON.parse(backupContent);
      } catch (backupError) {
        console.error('Backup restore failed:', backupError.message);
      }
    }
  }
  
  return defaultValue;
}

// Write JSON file (with backup)
function writeJSON(filename, data) {
  ensureDataDir();
  const filePath = path.join(DATA_DIR, filename);
  
  try {
    // Create backup first
    createBackup(filePath);
    
    // Write new content
    const content = JSON.stringify(data, null, 2);
    fs.writeFileSync(filePath, content);
    return true;
  } catch (error) {
    console.error(`Error writing ${filename}:`, error.message);
    return false;
  }
}

// ============================================
// Config Storage (with encrypted fields)
// ============================================

const DEFAULT_CONFIG = {
  email: {
    enabled: false,
    host: '',
    port: 587,
    secure: false,
    user: '',
    pass: '', // Encrypted
    recipients: []
  },
  webhooks: [],
  alerts: {
    enabled: true,
    lowSupplyThreshold: 20,
    criticalSupplyThreshold: 10,
    offlineMinutes: 5,
    cooldownHours: 4
  },
  reports: {
    enabled: false,
    schedule: 'weekly', // daily, weekly, monthly, custom
    format: 'pdf',
    emailOnGenerate: false,
    lastRun: null,
    // Custom schedule options
    time: '08:00', // Time to send report (HH:MM)
    days: [1], // Days to send: 0=Sun, 1=Mon, ... 6=Sat (for weekly/custom)
    dayOfMonth: 1 // Day of month for monthly reports (1-28)
  }
};

// Load config (decrypts sensitive fields)
function loadConfig() {
  const config = readJSON('config.json', DEFAULT_CONFIG);
  
  // Decrypt password if present
  if (config.email && config.email.pass) {
    config.email.pass = decrypt(config.email.pass) || '';
  }
  
  // Decrypt webhook URLs
  if (config.webhooks) {
    config.webhooks = config.webhooks.map(wh => ({
      ...wh,
      url: decrypt(wh.url) || wh.url
    }));
  }
  
  return { ...DEFAULT_CONFIG, ...config };
}

// Save config (encrypts sensitive fields)
function saveConfig(config) {
  const toSave = JSON.parse(JSON.stringify(config)); // Deep clone
  
  // Encrypt password
  if (toSave.email && toSave.email.pass) {
    toSave.email.pass = encrypt(toSave.email.pass);
  }
  
  // Encrypt webhook URLs
  if (toSave.webhooks) {
    toSave.webhooks = toSave.webhooks.map(wh => ({
      ...wh,
      url: encrypt(wh.url)
    }));
  }
  
  return writeJSON('config.json', toSave);
}

// Get config for API response (masks sensitive data)
function getConfigForAPI(config) {
  const masked = JSON.parse(JSON.stringify(config));
  
  // Mask password
  if (masked.email && masked.email.pass) {
    masked.email.pass = masked.email.pass ? '••••••••' : '';
  }
  
  // Mask webhook URLs (show only domain)
  if (masked.webhooks) {
    masked.webhooks = masked.webhooks.map(wh => {
      let maskedUrl = '';
      try {
        const url = new URL(wh.url);
        maskedUrl = `${url.protocol}//${url.hostname}/••••`;
      } catch {
        maskedUrl = wh.url ? '••••••••' : '';
      }
      return { ...wh, url: maskedUrl };
    });
  }
  
  return masked;
}

// ============================================
// Alert History Storage
// ============================================

// Load alert history
function loadAlertHistory() {
  return readJSON('alert-history.json', []);
}

// Save alert history
function saveAlertHistory(alerts) {
  // Keep only last 1000 alerts
  const trimmed = alerts.slice(-1000);
  return writeJSON('alert-history.json', trimmed);
}

// Add alert to history
function addAlert(alert) {
  const alerts = loadAlertHistory();
  alerts.push({
    id: Date.now().toString(),
    ...alert,
    timestamp: new Date().toISOString(),
    acknowledged: false,
    acknowledgedAt: null,
    acknowledgedBy: null
  });
  saveAlertHistory(alerts);
  return alerts[alerts.length - 1];
}

// Acknowledge alert
function acknowledgeAlert(alertId, acknowledgedBy = 'user') {
  const alerts = loadAlertHistory();
  const alert = alerts.find(a => a.id === alertId);
  
  if (alert) {
    alert.acknowledged = true;
    alert.acknowledgedAt = new Date().toISOString();
    alert.acknowledgedBy = acknowledgedBy;
    saveAlertHistory(alerts);
    return alert;
  }
  
  return null;
}

// Delete alert
function deleteAlert(alertId) {
  const alerts = loadAlertHistory();
  const index = alerts.findIndex(a => a.id === alertId);
  
  if (index !== -1) {
    alerts.splice(index, 1);
    saveAlertHistory(alerts);
    return true;
  }
  
  return false;
}

// Get unacknowledged alert count
function getUnacknowledgedCount() {
  const alerts = loadAlertHistory();
  return alerts.filter(a => !a.acknowledged).length;
}

// ============================================
// Printer Data Storage
// ============================================

// Load printers
function loadPrinters() {
  const data = readJSON('printers.json', { printers: [], lastSave: null });
  return data.printers || [];
}

// Save printers
function savePrinters(printerList) {
  return writeJSON('printers.json', {
    printers: printerList,
    lastSave: new Date().toISOString()
  });
}

// ============================================
// History Data Storage
// ============================================

// Load history
function loadHistory() {
  return readJSON('history.json', {
    snapshots: [],
    daily: {}
  });
}

// Save history
function saveHistory(historyData) {
  // Convert daily Map to object if needed
  const toSave = {
    snapshots: historyData.snapshots || [],
    daily: historyData.daily instanceof Map 
      ? Object.fromEntries(historyData.daily)
      : historyData.daily || {}
  };
  return writeJSON('history.json', toSave);
}

// ============================================
// Exports
// ============================================

module.exports = {
  // Encryption
  encrypt,
  decrypt,
  
  // Generic JSON
  readJSON,
  writeJSON,
  
  // Config
  loadConfig,
  saveConfig,
  getConfigForAPI,
  DEFAULT_CONFIG,
  
  // Alerts
  loadAlertHistory,
  saveAlertHistory,
  addAlert,
  acknowledgeAlert,
  deleteAlert,
  getUnacknowledgedCount,
  
  // Printers
  loadPrinters,
  savePrinters,
  
  // History
  loadHistory,
  saveHistory,
  
  // Utility
  ensureDataDir,
  DATA_DIR
};
