import { app, BrowserWindow, ipcMain, session } from 'electron';
import * as path from 'path';
import * as url from 'url';
import logger from './utils/logger';
import { registerIPCHandlers } from './ipc/handlers';

class Application {
  private mainWindow: BrowserWindow | null = null;
  private isQuitting = false;

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    // Handle app events
    app.on('ready', () => {
      this.setupCSP();
      this.createWindow();
    });

    app.on('window-all-closed', () => {
      // On macOS, keep app running even when all windows are closed
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    app.on('activate', () => {
      // On macOS, re-create window when dock icon is clicked
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createWindow();
      }
    });

    app.on('before-quit', () => {
      this.isQuitting = true;
    });

    // Register IPC handlers
    registerIPCHandlers();

    logger.info('Application initialized');
  }

  private setupCSP(): void {
    // Set up Content Security Policy for renderer processes
    const CSP = "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://www.googleapis.com https://analyticsdata.googleapis.com https://localhost:3000;";
    
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [CSP]
        }
      });
    });
  }

  private createWindow(): void {
    try {
      logger.info('Creating main window...');

      // Create browser window
      this.mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 700,
        backgroundColor: '#ffffff',
        show: false, // Don't show until ready
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          preload: path.join(__dirname, '../preload/preload.js'),
          webSecurity: true,
        },
      });

      // Load the app
      if (process.env.NODE_ENV === 'development') {
        // In development, load from Vite dev server
        this.mainWindow.loadURL('http://localhost:3000');
        this.mainWindow.webContents.openDevTools();
      } else {
        // In production, load from built files
        this.mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
      }

      // Show window when ready
      this.mainWindow.once('ready-to-show', () => {
        this.mainWindow?.show();
        logger.info('Main window shown');
      });

      // Handle window closed
      this.mainWindow.on('close', (event) => {
        // Prevent close if not quitting and hide window instead
        if (!this.isQuitting && process.platform === 'darwin') {
          event.preventDefault();
          this.mainWindow?.hide();
        }
      });

      this.mainWindow.on('closed', () => {
        this.mainWindow = null;
        logger.info('Main window closed');
      });

      // Handle navigation errors
      this.mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        logger.error(`Failed to load: ${errorCode} - ${errorDescription}`);
      });

      logger.info('Main window created');
    } catch (error) {
      logger.error('Failed to create window:', error);
    }
  }

  public getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }
}

// Create and export application instance
const application = new Application();

export default application;
