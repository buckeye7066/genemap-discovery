// Main-process updater. Network checks never download or restart the app.
function createDesktopUpdater({ app, autoUpdater, dialog, getWindow, intervalMs = 60 * 60 * 1000 }) {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowDowngrade = false;
  let checking = false;
  let downloading = false;
  let downloaded = false;
  let promptedVersion = '';
  let timer;
  const show = (options) => {
    const owner = getWindow();
    return owner && !owner.isDestroyed()
      ? dialog.showMessageBox(owner, options)
      : dialog.showMessageBox(options);
  };
  const failure = () => show({
    type: 'error', title: 'Update unavailable',
    message: 'The update could not be completed. Your current version is unchanged.',
    detail: 'Check your connection and use Check for updates to try again.',
  });
  async function installPrompt() {
    const result = await show({
      type: 'info', title: 'Update ready',
      message: 'The update is downloaded. Save your work before restarting.',
      buttons: ['Restart and install', 'Later'], defaultId: 1, cancelId: 1,
    });
    if (result.response === 0) autoUpdater.quitAndInstall(false, true);
  }
  async function check(manual = false) {
    if (!app.isPackaged) {
      if (manual) await show({ message: 'Updates are available in the installed application.' });
      return;
    }
    if (downloaded) { if (manual) await installPrompt(); return; }
    if (checking || downloading) return;
    checking = true;
    try {
      const result = await autoUpdater.checkForUpdates();
      const version = result?.updateInfo?.version;
      // electron-updater owns semver and artifact verification; this comparison
      // only suppresses a repeat prompt after the user chose Later.
      if (!result?.isUpdateAvailable) {
        if (manual) await show({ message: 'You are running the latest available version.', detail: app.getVersion() });
        return;
      }
      if (!manual && version === promptedVersion) return;
      promptedVersion = version;
      const choice = await show({
        type: 'info', title: 'Update available',
        message: `Version ${version} is available.`,
        detail: 'Download the update now. You choose when to restart and install it.',
        buttons: ['Update', 'Later'], defaultId: 1, cancelId: 1,
      });
      if (choice.response !== 0) return;
      downloading = true;
      await autoUpdater.downloadUpdate();
      downloaded = true;
      await installPrompt();
    } catch {
      // Background outages must not interrupt editing or report false success.
      if (manual || downloading) await failure();
    } finally {
      checking = false;
      downloading = false;
    }
  }
  // electron-updater emits errors in addition to rejecting its promises.
  autoUpdater.on('error', () => {});
  const resume = () => void check();
  function start() {
    if (!app.isPackaged || timer) return;
    timer = setInterval(resume, intervalMs);
    timer.unref?.();
    app.on('browser-window-focus', resume);
    void check();
  }
  function stop() {
    clearInterval(timer);
    timer = undefined;
    app.removeListener('browser-window-focus', resume);
  }
  app.once('before-quit', stop);
  return { check, start, stop };
}
module.exports = { createDesktopUpdater };
