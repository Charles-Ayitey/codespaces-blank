/**
 * Printer Monitor - Preload Script
 * 
 * This script runs in the renderer process before the web page loads.
 * It exposes a limited set of Electron APIs to the renderer via contextBridge.
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Get the server URL
  getServerUrl: () => ipcRenderer.invoke('get-server-url'),
  
  // Get app version
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  
  // Open external URL in default browser
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  
  // Show native notification
  showNotification: (title, body) => ipcRenderer.invoke('show-notification', { title, body }),
  
  // Platform detection
  platform: process.platform,
  
  // Check if running in Electron
  isElectron: true
});

// Optional: Add a class to the document to indicate Electron environment
window.addEventListener('DOMContentLoaded', () => {
  document.documentElement.classList.add('electron-app');
});
