/**
 * Printer Monitoring API Server - Node.js Version
 * Express-based REST API for SNMP printer monitoring
 */

const express = require('express');
const cors = require('cors');
const snmp = require('net-snmp');

const app = express();
const PORT = 5000;

// Middleware
app.use(cors());
app.use(express.json());

// In-memory storage
const printers = new Map();
let scanStatus = { scanning: false, lastScan: null };

// Standard Printer MIB OIDs
const PRINTER_OIDS = {
  description: '1.3.6.1.2.1.1.1.0',
  serial: '1.3.6.1.2.1.43.5.1.1.17.1',
  status: '1.3.6.1.2.1.25.3.5.1.1.1',
  deviceStatus: '1.3.6.1.2.1.43.16.5.1.2.1.1',
  totalPages: '1.3.6.1.2.1.43.10.2.1.4.1.1',
  supplyDesc: '1.3.6.1.2.1.43.11.1.1.6.1',
  supplyMax: '1.3.6.1.2.1.43.11.1.1.8.1',
  supplyCurrent: '1.3.6.1.2.1.43.11.1.1.9.1'
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

/**
 * Perform SNMP GET request
 */
function snmpGet(ip, oid, community = 'public') {
  return new Promise((resolve, reject) => {
    const session = snmp.createSession(ip, community, { timeout: 2000, retries: 1 });
    
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
function snmpWalk(ip, oid, community = 'public') {
  return new Promise((resolve, reject) => {
    const session = snmp.createSession(ip, community, { timeout: 2000, retries: 1 });
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
    lastUpdate: new Date().toISOString(),
    online: false
  };
  
  try {
    // Get description
    const desc = await snmpGet(ip, PRINTER_OIDS.description, community);
    if (desc) {
      printerData.online = true;
      printerData.name = desc.substring(0, 50);
      printerData.model = desc.substring(0, 50);
    } else {
      printerData.status = 'offline';
      return printerData;
    }
    
    // Get serial number
    const serial = await snmpGet(ip, PRINTER_OIDS.serial, community);
    if (serial) {
      printerData.serial = serial;
    }
    
    // Get status
    const status = await snmpGet(ip, PRINTER_OIDS.deviceStatus, community);
    if (status && !isNaN(status)) {
      const statusCode = parseInt(status);
      printerData.status = DEVICE_STATUS[statusCode] || 'unknown';
    }
    
    // Get page count
    const pages = await snmpGet(ip, PRINTER_OIDS.totalPages, community);
    if (pages && !isNaN(pages)) {
      printerData.totalPages = parseInt(pages);
    }
    
    // Get supply levels
    const supplyNames = await snmpWalk(ip, PRINTER_OIDS.supplyDesc, community);
    const supplyMax = await snmpWalk(ip, PRINTER_OIDS.supplyMax, community);
    const supplyCurrent = await snmpWalk(ip, PRINTER_OIDS.supplyCurrent, community);
    
    if (supplyNames.length > 0 && supplyMax.length > 0 && supplyCurrent.length > 0) {
      for (let i = 0; i < supplyNames.length; i++) {
        if (i < supplyMax.length && i < supplyCurrent.length) {
          const maxVal = parseInt(supplyMax[i]);
          const currentVal = parseInt(supplyCurrent[i]);
          
          if (!isNaN(maxVal) && !isNaN(currentVal) && maxVal > 0) {
            printerData.supplies.push({
              name: supplyNames[i],
              current: currentVal,
              max: maxVal,
              type: supplyNames[i].toLowerCase().includes('toner') ? 'toner' : 'other'
            });
          }
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

// Background auto-refresh (every 60 seconds)
setInterval(async () => {
  if (printers.size > 0 && !scanStatus.scanning) {
    console.log(`Auto-refreshing ${printers.size} printers...`);
    const ips = Array.from(printers.keys());
    for (const ip of ips) {
      const printerData = await queryPrinter(ip);
      printers.set(ip, printerData);
    }
  }
}, 60000);

// Start server
app.listen(PORT, '0.0.0.0', () => {
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
  console.log(`\nServer running on http://localhost:${PORT}`);
  console.log('='.repeat(60));
});