const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

try {
  if (require('electron-squirrel-startup')) app.quit();
} catch (e) {}

let mainWindow;
const isDev = !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    show: false,
    backgroundColor: '#1a1a1a',
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    const devUrl = 'http://localhost:5173';
    const checkServer = () => {
      mainWindow.loadURL(devUrl).catch(() => setTimeout(checkServer, 1000));
    };
    checkServer();
    mainWindow.webContents.openDevTools();
  } else {
    // In production, use app.getAppPath() for correct asar paths
    const appPath = app.getAppPath();
    const indexPath = path.join(appPath, 'dist', 'index.html');
    mainWindow.loadFile(indexPath);
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
