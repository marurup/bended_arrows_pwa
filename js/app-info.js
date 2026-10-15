// Footer of the menu: which version is running, whether a newer one is out,
// and a button to install the game as an app.

import { BUILD } from './version.js';

const $ = (id) => document.getElementById(id);

export function initAppInfo({ showIosInstall }) {
  showVersion();
  watchForUpdate();
  setupInstall(showIosInstall);
  $('update-btn').addEventListener('click', updateApp);
}

function showVersion() {
  const el = $('version');
  if (!BUILD.sha) {
    el.textContent = 'Udviklingsversion';
    return;
  }
  const date = new Date(BUILD.date).toLocaleString('da-DK', { dateStyle: 'medium', timeStyle: 'short' });
  el.textContent = `Version ${BUILD.sha.slice(0, 7)} · ${date}`;
  el.href = `${BUILD.repo}/commit/${BUILD.sha}`;
}

// A newer release is spotted two ways: version.json, which is never cached,
// names another commit, or the browser has installed the new release's
// service worker while this page was open.
function watchForUpdate() {
  if (!BUILD.sha) return;
  const show = () => {
    $('update-btn').hidden = false;
  };
  if (navigator.serviceWorker?.controller) navigator.serviceWorker.addEventListener('controllerchange', show);
  fetch('version.json', { cache: 'no-store' })
    .then((res) => (res.ok ? res.json() : null))
    .then((latest) => {
      if (latest?.sha && latest.sha !== BUILD.sha) show();
    })
    .catch(() => {
      // Offline: nothing to compare with.
    });
}

// Start over from the server: drop the service worker and every cached
// file, then reload. The page installs a fresh service worker as it loads.
async function updateApp() {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations()) ?? [];
    await Promise.all(regs.map((reg) => reg.unregister()));
    await Promise.all((await caches.keys()).map((key) => caches.delete(key)));
  } catch {
    // Reload anyway.
  }
  location.reload();
}

// Chrome and Edge offer an install prompt the page can trigger; Safari on
// iPhone and iPad only installs from the share menu, so there the button
// explains how instead.
function setupInstall(showIosInstall) {
  const btn = $('install-btn');
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (standalone) return;
  const ios =
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let prompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    prompt = e;
    btn.hidden = false;
  });
  window.addEventListener('appinstalled', () => {
    prompt = null;
    btn.hidden = true;
  });
  if (ios) btn.hidden = false;
  btn.addEventListener('click', async () => {
    if (prompt) {
      const p = prompt;
      prompt = null;
      p.prompt();
      const { outcome } = await p.userChoice;
      if (outcome === 'accepted') btn.hidden = true;
    } else if (ios) {
      showIosInstall();
    }
  });
}
