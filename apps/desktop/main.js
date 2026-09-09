const { app, BrowserWindow, shell, Menu, dialog } = require('electron');
const { createDesktopUpdater } = require('./updates.cjs');
const path = require('path');

const isDev = !app.isPackaged;

// Hosts the user can open in their default browser. Anything outside this
// list is denied, even when it uses an https: scheme.
const ALLOWED_EXTERNAL_HOSTS = new Set([
  // Published advertiser destinations resolve server-side without session tokens.
  'genemap-api-production.up.railway.app',
  'clinicaltrials.gov',
  'www.clinicaltrials.gov',
  'www.ncbi.nlm.nih.gov',
  'eutils.ncbi.nlm.nih.gov',
  'rest.ensembl.org',
  'myvariant.info',
  'ontology.jax.org',
  'genemap-discovery.com',
  'www.genemap-discovery.com',
]);

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'GeneMap Discovery',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Run the renderer in the OS sandbox so a compromised renderer
      // cannot read arbitrary files or spawn subprocesses.
      sandbox: true,
    },
    icon: path.join(__dirname, 'icons', 'icon.png'),
    autoHideMenuBar: true,
  });

  // Always deny window.open. Allow-listed https: URLs are forwarded to the
  // OS browser; anything else (custom schemes, file:, http:, unknown hosts)
  // is dropped. This is the equivalent of a target=_blank allow-list.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (error) {
      console.error('Failed to parse URL:', url, error);
      return { action: 'deny' };
    }
    if (parsed.protocol === 'https:' && ALLOWED_EXTERNAL_HOSTS.has(parsed.hostname)) {
      shell.openExternal(parsed.toString());
    }
    return { action: 'deny' };
  });

  // Block unexpected in-app navigations to non-app origins. Without this,
  // a renderer compromise (XSS in the bundled SPA) could navigate the
  // BrowserWindow itself to an attacker-controlled origin and persist.
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    let parsed;
    try {
      parsed = new URL(navigationUrl);
    } catch {
      event.preventDefault();
      return;
    }
    const allowedDevOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
    if (allowedDevOrigins.includes(parsed.origin)) return;
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      event.preventDefault();
    }
    event.preventDefault();
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    const appPath = path.join(process.resourcesPath, 'app', 'index.html');
    mainWindow.loadFile(appPath);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  let updater = null;
  if (process.platform === 'win32') {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.setFeedURL({ provider: 'generic', url: 'https://github.com/buckeye7066/genemap-discovery/releases/download/desktop-updates/' });
    updater = createDesktopUpdater({ app, autoUpdater, dialog, getWindow: () => mainWindow });
    updater.start();
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'GeneMap Discovery', submenu: [
      { label: 'Check for updates...', click: () => updater ? void updater.check(true) : void dialog.showMessageBox({ message: 'Installer updates are not configured for this platform yet.' }) },
      { role: 'quit' },
    ] },
    { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' },
  ]));
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
