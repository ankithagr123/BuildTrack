/** BuildTrack PWA install prompt, service worker registration, and connectivity notice. */
(function () {
  'use strict';

  let installPrompt = null;
  const installButton = document.getElementById('installAppBtn');

  function showConnectionState() {
    if (!window.BuildTrack) return;
    if (!navigator.onLine) {
      window.BuildTrack.showToast('You are offline. Saved site data remains available on this device.', 'warning', 5000);
    } else if (showConnectionState.wasOffline) {
      window.BuildTrack.showToast('Connection restored.', 'success', 2500);
    }
    showConnectionState.wasOffline = !navigator.onLine;
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    if (installButton) installButton.hidden = false;
  });

  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    if (installButton) installButton.hidden = true;
    window.BuildTrack?.showToast('BuildTrack is installed and ready for your next site visit.', 'success');
  });

  if (installButton) {
    installButton.addEventListener('click', async () => {
      if (!installPrompt) return;
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
      installButton.hidden = true;
    });
  }

  window.addEventListener('offline', showConnectionState);
  window.addEventListener('online', showConnectionState);
  showConnectionState.wasOffline = !navigator.onLine;
  if (!navigator.onLine) showConnectionState();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js', { updateViaCache: 'none' })
        .catch(error => console.warn('BuildTrack offline support could not start:', error));
    });
  }
})();
