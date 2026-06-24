const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

const isDev = !app.isPackaged;

// Hosts the user can open in their default browser. Anything outside this
// list is denied, even when it uses an https: scheme.
const ALLOWED_EXTERNAL_HOSTS = new Set([
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
    } catch {
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
    if (parsed.protocol === 'file:') return;
    if (isDev && allowedDevOrigins.includes(parsed.origin)) return;
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

app.whenReady().then(createWindow);

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
