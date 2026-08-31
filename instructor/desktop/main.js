/*
 * main.js — Instructor Workbench as a desktop application.
 *
 * The web build needs a terminal window open and a port that nothing else is
 * using. This removes both: a real window, a taskbar entry, and no server.
 *
 * Files are served through a custom `workbench://` scheme rather than a
 * localhost port. That is the load-bearing decision here. Browser storage is
 * keyed by origin, so a port-based app that fell back to a different port —
 * or picked a free one at random — would present the instructor with an
 * empty gradebook and no explanation. `workbench://app` is the same origin on
 * every launch, on every machine, forever.
 */
const { app, BrowserWindow, protocol, net, shell, dialog, Menu } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, 'app');

/* `standard` gives it an origin (so localStorage and IndexedDB work at all);
   `secure` lets it use APIs the browser restricts to secure contexts. */
protocol.registerSchemesAsPrivileged([{
  scheme: 'workbench',
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
}]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 960,
    minHeight: 620,
    title: 'Instructor Workbench',
    backgroundColor: '#f6f7f9',
    show: false,
    webPreferences: {
      /* The app is ordinary web code and needs no Node access. Keeping the
         renderer sandboxed means a malformed thesis cannot reach the disk. */
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  win.once('ready-to-show', () => win.show());
  win.loadURL('workbench://app/index.html');

  /* External links open in the real browser, not inside the app window —
     otherwise a DOI link would replace the workbench with a journal page. */
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) { shell.openExternal(url); return { action: 'deny' }; }
    return { action: 'allow' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('workbench://')) { event.preventDefault(); shell.openExternal(url); }
  });

  return win;
}

app.whenReady().then(() => {
  protocol.handle('workbench', (request) => {
    const url = new URL(request.url);
    let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    const resolved = path.normalize(path.join(ROOT, rel));

    /* Nothing outside the bundled folder, separator included so a sibling
       directory with a matching prefix cannot slip through. */
    if (resolved !== ROOT && !resolved.startsWith(ROOT + path.sep)) {
      return new Response('Forbidden', { status: 403 });
    }
    return net.fetch(pathToFileURL(resolved).toString());
  });

  Menu.setApplicationMenu(buildMenu());
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function buildMenu() {
  const isMac = process.platform === 'darwin';
  return Menu.buildFromTemplate([
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Where is my data?',
          click: () => dialog.showMessageBox({
            type: 'info',
            title: 'Where your data is kept',
            message: 'Everything stays on this computer.',
            detail:
              `Grades and thesis texts are stored in this application's own storage, at:\n\n${app.getPath('userData')}\n\n` +
              'Nothing is uploaded. Two features reach the internet, and only when you press their button: ' +
              'verifying that a citation exists, and AI review if you switch it on.\n\n' +
              'This storage is not a backup. Use Settings → Download backup regularly and keep the file somewhere else.'
          })
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' }, { role: 'forceReload' }, { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' }, { role: 'togglefullscreen' },
        { type: 'separator' }, { role: 'toggleDevTools' }
      ]
    },
    { role: 'windowMenu' }
  ]);
}
