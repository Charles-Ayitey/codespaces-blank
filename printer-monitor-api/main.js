/**
 * Printer Monitor - Electron Main Process
 * 
 * This file handles the desktop application lifecycle including:
 * - Creating and managing the main browser window
 * - Starting the embedded Express server
 * - System tray integration
 * - Auto-launch on startup (optional)
 * - IPC communication with renderer
 */

// ============================================
// CRASH LOGGING - Must be first!
// Captures any startup errors before they vanish
// ============================================
const fs = require('fs');
const pathModule = require('path');

// Get a writable log location (works before app.getPath is available)
const userDataFallback = process.env.APPDATA || 
  (process.platform === 'darwin' 
    ? pathModule.join(process.env.HOME || '/tmp', 'Library', 'Application Support')
    : pathModule.join(process.env.HOME || '/tmp', '.config'));
const crashLogDir = pathModule.join(userDataFallback, 'printer-monitor');
const crashLogPath = pathModule.join(crashLogDir, 'crash-log.txt');

// Ensure crash log directory exists
try {
  if (!fs.existsSync(crashLogDir)) {
    fs.mkdirSync(crashLogDir, { recursive: true });
  }
} catch (e) {
  // Ignore - we'll try to write anyway
}

// Log startup attempt
try {
  fs.appendFileSync(crashLogPath, `\n\n=== APP START: ${new Date().toISOString()} ===\n`);
  fs.appendFileSync(crashLogPath, `Process: ${process.execPath}\n`);
  fs.appendFileSync(crashLogPath, `Args: ${process.argv.join(' ')}\n`);
  fs.appendFileSync(crashLogPath, `CWD: ${process.cwd()}\n`);
  fs.appendFileSync(crashLogPath, `__dirname: ${__dirname}\n`);
} catch (e) {
  // Ignore logging errors
}

// Global error trap - catches crashes before window appears
process.on('uncaughtException', (err) => {
  const msg = `UNCAUGHT EXCEPTION: ${err.message}\n${err.stack}\n`;
  console.error(msg);
  
  try {
    fs.appendFileSync(crashLogPath, `\n${new Date().toISOString()} - ${msg}`);
  } catch (e) {
    // Can't write log
  }
  
  // Try to show dialog if Electron is ready
  try {
    const { dialog } = require('electron');
    dialog.showErrorBox('Critical Startup Error', 
      `The application crashed during startup.\n\n${err.message}\n\nCheck log at:\n${crashLogPath}`);
  } catch (dialogErr) {
    // Dialog not available yet
  }
  
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  const msg = `UNHANDLED REJECTION: ${reason}\n`;
  console.error(msg);
  
  try {
    fs.appendFileSync(crashLogPath, `\n${new Date().toISOString()} - ${msg}`);
  } catch (e) {
    // Can't write log
  }
});

// ============================================
// MAIN APPLICATION CODE
// ============================================

const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell, dialog } = require('electron');
const path = pathModule; // Reuse the already-imported path module
const http = require('http');
const net = require('net');

// Log that we got past initial requires
try {
  fs.appendFileSync(crashLogPath, `Electron modules loaded successfully\n`);
} catch (e) {}

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

let mainWindow = null;
let tray = null;
let isQuitting = false;
let serverStarted = false;

// Configuration
let PORT = 5050;
let SERVER_URL = `http://localhost:${PORT}`;
const isDev = process.env.NODE_ENV === 'development';

/**
 * Find an available port starting from a preferred value
 */
function findAvailablePort(startPort = 5050, range = 100) {
  return new Promise((resolve, reject) => {
    let currentPort = startPort;

    const checkPort = () => {
      if (currentPort > startPort + range) {
        reject(new Error('Unable to find available port'));
        return;
      }

      const tester = net.createServer();
      tester.once('error', (err) => {
        if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
          currentPort += 1;
          checkPort();
        } else {
          reject(err);
        }
      });

      tester.once('listening', () => {
        tester.close(() => resolve(currentPort));
      });

      tester.listen(currentPort, '127.0.0.1');
    };

    checkPort();
  });
}

/**
 * Start the Express server directly in this process
 */
function startServer() {
  return new Promise((resolve, reject) => {
    try {
      // Set environment variables
      process.env.PORT = String(PORT);
      process.env.ELECTRON_APP = 'true';
      process.env.APP_PATH = app.getAppPath();
      
      const startInfo = [
        'Starting server...',
        `App path: ${app.getAppPath()}`,
        `Resource path: ${process.resourcesPath || 'N/A'}`,
        `__dirname: ${__dirname}`,
        `Port: ${PORT}`,
        `Platform: ${process.platform}`,
        `Arch: ${process.arch}`,
        `Node version: ${process.version}`,
        `Electron version: ${process.versions.electron}`
      ].join('\n');
      
      console.log(startInfo);
      
      // Log to crash file for debugging packaged apps
      try {
        fs.appendFileSync(crashLogPath, `\n${startInfo}\n`);
      } catch (e) {}
      
      // Directly require the server - it will start listening
      console.log('Requiring server.js...');
      try {
        fs.appendFileSync(crashLogPath, `Requiring server.js from: ${path.join(__dirname, 'server.js')}\n`);
      } catch (e) {}
      
      require('./server.js');
      
      console.log('Server module loaded successfully');
      try {
        fs.appendFileSync(crashLogPath, `Server module loaded successfully\n`);
      } catch (e) {}
      
      // Wait for server to be ready
      let attempts = 0;
      const maxAttempts = 30;
      
      const checkServer = () => {
        attempts++;
        
        const req = http.get(`${SERVER_URL}/api/health`, (res) => {
          if (res.statusCode === 200) {
            console.log('Server is ready on port', PORT);
            serverStarted = true;
            resolve();
          } else {
            retry();
          }
        });
        
        req.on('error', (err) => {
          console.log(`Checking server... ${attempts}/${maxAttempts} (${err.code})`);
          retry();
        });
        
        req.setTimeout(2000, () => {
          req.destroy();
          retry();
        });
      };

      const retry = () => {
        if (attempts < maxAttempts) {
          setTimeout(checkServer, 1000);
        } else {
          reject(new Error(`Server did not respond after ${maxAttempts} attempts on port ${PORT}`));
        }
      };

      // Give the server a moment to start
      setTimeout(checkServer, 1500);
      
    } catch (error) {
      console.error('Failed to start server:', error);
      reject(new Error(`Failed to load server: ${error.message}\n\n${error.stack}`));
    }
  });
}

/**
 * Create the main application window
 */
function createWindow() {
  // Create icon for the window
  const iconPath = isDev 
    ? path.join(__dirname, 'build', 'icon.png')
    : path.join(process.resourcesPath, 'build', 'icon.png');

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Printer Monitor',
    icon: iconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false, // Don't show until ready
    backgroundColor: '#f3f4f6'
  });

  // Load the dashboard
  mainWindow.loadURL(`${SERVER_URL}/standalone_dashboard.html`);

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Minimize to tray instead of closing
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      
      // Show notification on first minimize
      if (tray && !app.isQuitting) {
        tray.displayBalloon({
          iconType: 'info',
          title: 'Printer Monitor',
          content: 'Application minimized to system tray. Click the tray icon to restore.'
        });
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

/**
 * Create system tray icon and menu
 */
function createTray() {
  const iconPath = isDev 
    ? path.join(__dirname, 'build', 'tray-icon.png')
    : path.join(process.resourcesPath, 'build', 'tray-icon.png');

  // Use a fallback if icon doesn't exist
  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath);
    if (trayIcon.isEmpty()) {
      trayIcon = nativeImage.createEmpty();
    }
  } catch {
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('Printer Monitor');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Printer Monitor',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: 'Dashboard',
      click: () => {
        if (mainWindow) {
          mainWindow.loadURL(`${SERVER_URL}/standalone_dashboard.html`);
          mainWindow.show();
        }
      }
    },
    {
      label: 'Alerts',
      click: () => {
        if (mainWindow) {
          mainWindow.loadURL(`${SERVER_URL}/alerts.html`);
          mainWindow.show();
        }
      }
    },
    {
      label: 'Analytics',
      click: () => {
        if (mainWindow) {
          mainWindow.loadURL(`${SERVER_URL}/analytics.html`);
          mainWindow.show();
        }
      }
    },
    {
      label: 'Settings',
      click: () => {
        if (mainWindow) {
          mainWindow.loadURL(`${SERVER_URL}/settings.html`);
          mainWindow.show();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Open in Browser',
      click: () => {
        shell.openExternal(SERVER_URL);
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
      }
    }
  });

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

/**
 * Create application menu
 */
function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Refresh All Printers',
          accelerator: 'CmdOrCtrl+R',
          click: async () => {
            if (mainWindow) {
              try {
                const http = require('http');
                const options = {
                  hostname: 'localhost',
                  port: PORT,
                  path: '/api/printers/refresh',
                  method: 'POST'
                };
                const req = http.request(options);
                req.end();
              } catch (err) {
                console.error('Failed to refresh printers:', err);
              }
              mainWindow.webContents.reload();
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Settings',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            if (mainWindow) {
              mainWindow.loadURL(`${SERVER_URL}/settings.html`);
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Alt+F4',
          click: () => {
            isQuitting = true;
            app.quit();
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Dashboard',
          accelerator: 'CmdOrCtrl+1',
          click: () => {
            if (mainWindow) {
              mainWindow.loadURL(`${SERVER_URL}/standalone_dashboard.html`);
            }
          }
        },
        {
          label: 'Alerts',
          accelerator: 'CmdOrCtrl+2',
          click: () => {
            if (mainWindow) {
              mainWindow.loadURL(`${SERVER_URL}/alerts.html`);
            }
          }
        },
        {
          label: 'Analytics',
          accelerator: 'CmdOrCtrl+3',
          click: () => {
            if (mainWindow) {
              mainWindow.loadURL(`${SERVER_URL}/analytics.html`);
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Toggle Full Screen',
          accelerator: process.platform === 'darwin' ? 'Ctrl+Cmd+F' : 'F11',
          click: () => {
            if (mainWindow) {
              mainWindow.setFullScreen(!mainWindow.isFullScreen());
            }
          }
        },
        {
          label: 'Toggle Developer Tools',
          accelerator: 'CmdOrCtrl+Shift+I',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.toggleDevTools();
            }
          }
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Printer Monitor',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About Printer Monitor',
              message: 'Printer Monitor',
              detail: `Version: ${app.getVersion()}\n\nSNMP-based printer monitoring system for tracking printer status, supply levels, and usage analytics.`
            });
          }
        },
        {
          label: 'Open in Browser',
          click: () => {
            shell.openExternal(SERVER_URL);
          }
        }
      ]
    }
  ];

  // macOS specific menu adjustments
  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        { label: 'About Printer Monitor', role: 'about' },
        { type: 'separator' },
        { label: 'Settings', accelerator: 'Cmd+,', click: () => mainWindow?.loadURL(`${SERVER_URL}/settings.html`) },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'Cmd+Q', click: () => { isQuitting = true; app.quit(); } }
      ]
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

/**
 * Handle IPC messages from renderer
 */
function setupIPC() {
  ipcMain.handle('get-server-url', () => SERVER_URL);
  
  ipcMain.handle('get-app-version', () => app.getVersion());
  
  ipcMain.handle('open-external', (event, url) => {
    shell.openExternal(url);
  });
  
  ipcMain.handle('show-notification', (event, { title, body }) => {
    if (tray) {
      tray.displayBalloon({
        iconType: 'info',
        title,
        content: body
      });
    }
  });
}

// Handle second instance
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // App ready
  app.whenReady().then(async () => {
    try {
      console.log('Starting Printer Monitor...');
      
      // Find an available port to avoid conflicts on user systems
      PORT = await findAvailablePort(5050, 200);
      SERVER_URL = `http://localhost:${PORT}`;
      console.log('Selected API port:', PORT);
      
      // Start the server first
      await startServer();
      console.log('Server started successfully on port', PORT);
      
      // Then create UI
      createTray();
      createMenu();
      createWindow();
      setupIPC();
      
      console.log('Application ready');
    } catch (error) {
      console.error('Failed to start application:', error);
      dialog.showErrorBox('Startup Error', `Failed to start the application: ${error.message}`);
      app.quit();
    }
  });

  // macOS: re-create window when dock icon clicked
  app.on('activate', () => {
    if (mainWindow === null) {
      createWindow();
    } else {
      mainWindow.show();
    }
  });
}

// Cleanup on quit
app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', () => {
  console.log('Application quitting...');
});

// Handle window all closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Don't quit on Windows/Linux, minimize to tray instead
    // app.quit();
  }
});

// Note: uncaughtException handler is at the top of the file for early crash catching
