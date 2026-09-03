/**
 * Traceable Progressive Web App (PWA) Manager
 * 
 * Handles Service Worker registration, native installation prompt lifecycle,
 * iOS Safari Add-to-Home-Screen guidance, standalone mode detection,
 * and user-friendly dismissal cooldowns.
 */

(function () {
  'use strict';

  const STORAGE_INSTALLED_KEY = 'traceable_pwa_installed';
  const STORAGE_DISMISSED_KEY = 'traceable_pwa_dismissed_until';
  const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days cooldown if dismissed

  let deferredInstallPrompt = null;
  let isStandalone = false;
  let isIosDevice = false;

  // --- 1. Detect Standalone Mode & Platform ---
  function checkEnvironment() {
    // Check standard display-mode: standalone
    const standaloneMedia = window.matchMedia('(display-mode: standalone)').matches;
    // Check iOS Safari standalone property
    const iosStandalone = window.navigator.standalone === true;
    // Check if launched from android intent or TWA
    const isTwa = document.referrer.includes('android-app://');

    isStandalone = standaloneMedia || iosStandalone || isTwa;

    // Detect iOS (iPhone / iPad / iPod)
    const ua = window.navigator.userAgent.toLowerCase();
    isIosDevice = /iphone|ipad|ipod/.test(ua) && !window.MSStream;

    if (isStandalone) {
      localStorage.setItem(STORAGE_INSTALLED_KEY, 'true');
      document.body.classList.add('pwa-standalone');
      console.log('[Traceable PWA] Running in standalone installed mode');
    }
  }

  // --- 2. Register Production Service Worker ---
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      console.log('[Traceable PWA] Service Worker not supported in this browser');
      return;
    }

    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => {
          console.log('[Traceable PWA] Service Worker registered with scope:', reg.scope);

          // Listen for available updates
          reg.addEventListener('updatefound', () => {
            const installingWorker = reg.installing;
            if (!installingWorker) return;

            installingWorker.addEventListener('statechange', () => {
              if (
                installingWorker.state === 'installed' &&
                navigator.serviceWorker.controller
              ) {
                console.log('[Traceable PWA] New update available');
                notifyUserOfUpdate();
              }
            });
          });
        })
        .catch((err) => {
          console.warn('[Traceable PWA] Service Worker registration failed:', err);
        });

      // Handle controller change (seamless reload on update)
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('[Traceable PWA] New controller active');
      });
    });
  }

  function notifyUserOfUpdate() {
    // Non-intrusive update notification toast if toast function exists
    if (typeof window.showToast === 'function') {
      window.showToast('App updated! Refresh to load the latest studio features.');
    }
  }

  // --- 3. Manage Native Installation Prompts ---
  function initInstallPromptListeners() {
    // Standard Chromium / Edge / Android event
    window.addEventListener('beforeinstallprompt', (e) => {
      // Prevent browser default mini-infobar
      e.preventDefault();
      deferredInstallPrompt = e;
      console.log('[Traceable PWA] beforeinstallprompt event captured');

      // Check if user is eligible to see the custom install banner
      scheduleInstallBanner();
    });

    // App successfully installed listener
    window.addEventListener('appinstalled', () => {
      deferredInstallPrompt = null;
      localStorage.setItem(STORAGE_INSTALLED_KEY, 'true');
      hideInstallBanner(true);
      if (typeof window.showToast === 'function') {
        window.showToast('Traceable added to your home screen!');
      }
      console.log('[Traceable PWA] Application installed successfully');
    });

    // For iOS Safari: beforeinstallprompt never fires, so check and show iOS instructions
    if (isIosDevice && !isStandalone) {
      scheduleInstallBanner();
    }
  }

  // --- 4. Smart Banner Eligibility & Timing ---
  function shouldShowBanner() {
    if (isStandalone) return false;
    if (localStorage.getItem(STORAGE_INSTALLED_KEY) === 'true') return false;

    const dismissedUntil = localStorage.getItem(STORAGE_DISMISSED_KEY);
    if (dismissedUntil && Date.now() < Number(dismissedUntil)) {
      return false;
    }

    // Must have either native prompt available OR be iOS Safari
    return deferredInstallPrompt !== null || isIosDevice;
  }

  function scheduleInstallBanner() {
    if (!shouldShowBanner()) return;

    // Do NOT annoy user immediately; wait 3.5 seconds after page load
    setTimeout(() => {
      if (shouldShowBanner()) {
        showInstallBanner();
      }
    }, 3500);
  }

  // --- 5. DOM Manipulation for Install UI ---
  function showInstallBanner() {
    const banner = document.getElementById('pwa-install-banner');
    if (!banner) return;

    banner.classList.remove('hidden');
    // Force reflow for smooth animation
    void banner.offsetHeight;
    banner.classList.add('visible');

    // Setup action button text depending on platform
    const btnInstall = document.getElementById('pwa-btn-install');
    if (btnInstall) {
      if (isIosDevice) {
        btnInstall.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
            <polyline points="16 6 12 2 8 6"></polyline>
            <line x1="12" y1="2" x2="12" y2="15"></line>
          </svg>
          <span>How to Install</span>
        `;
      } else {
        btnInstall.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          <span>Install App</span>
        `;
      }
    }
  }

  function hideInstallBanner(permanent = false) {
    const banner = document.getElementById('pwa-install-banner');
    if (!banner) return;

    banner.classList.remove('visible');
    setTimeout(() => {
      banner.classList.add('hidden');
    }, 350);

    if (permanent) {
      localStorage.setItem(STORAGE_INSTALLED_KEY, 'true');
    } else {
      // Set 7-day cooldown
      localStorage.setItem(STORAGE_DISMISSED_KEY, String(Date.now() + COOLDOWN_MS));
    }
  }

  function showIosInstructions() {
    const modal = document.getElementById('pwa-ios-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    void modal.offsetHeight;
    modal.classList.add('visible');
  }

  function hideIosInstructions() {
    const modal = document.getElementById('pwa-ios-modal');
    if (!modal) return;
    modal.classList.remove('visible');
    setTimeout(() => {
      modal.classList.add('hidden');
    }, 300);
  }

  // --- 6. Event Handlers ---
  function bindUiEvents() {
    // Primary Action Button (Install or View iOS Steps)
    const btnInstall = document.getElementById('pwa-btn-install');
    if (btnInstall) {
      btnInstall.addEventListener('click', async () => {
        if (isIosDevice) {
          showIosInstructions();
          return;
        }

        if (!deferredInstallPrompt) {
          console.warn('[Traceable PWA] No deferred install prompt available');
          return;
        }

        // Trigger native install dialog
        deferredInstallPrompt.prompt();
        const choiceResult = await deferredInstallPrompt.userChoice;

        if (choiceResult.outcome === 'accepted') {
          console.log('[Traceable PWA] User accepted native install prompt');
          hideInstallBanner(true);
        } else {
          console.log('[Traceable PWA] User dismissed native install prompt');
          hideInstallBanner(false);
        }
        deferredInstallPrompt = null;
      });
    }

    // Dismiss / Not Now Button
    const btnDismiss = document.getElementById('pwa-btn-dismiss');
    if (btnDismiss) {
      btnDismiss.addEventListener('click', () => {
        hideInstallBanner(false);
      });
    }

    // Close Icon Button
    const btnClose = document.getElementById('pwa-btn-close');
    if (btnClose) {
      btnClose.addEventListener('click', () => {
        hideInstallBanner(false);
      });
    }

    // iOS Modal Close Button
    const btnCloseIos = document.getElementById('pwa-ios-close');
    if (btnCloseIos) {
      btnCloseIos.addEventListener('click', () => {
        hideIosInstructions();
        hideInstallBanner(false);
      });
    }

    // iOS Backdrop Click to Close
    const iosBackdrop = document.getElementById('pwa-ios-modal');
    if (iosBackdrop) {
      iosBackdrop.addEventListener('click', (e) => {
        if (e.target === iosBackdrop) {
          hideIosInstructions();
        }
      });
    }

    // Keyboard navigation (Escape key to dismiss)
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const iosModal = document.getElementById('pwa-ios-modal');
        if (iosModal && iosModal.classList.contains('visible')) {
          hideIosInstructions();
          return;
        }
        const banner = document.getElementById('pwa-install-banner');
        if (banner && banner.classList.contains('visible')) {
          hideInstallBanner(false);
        }
      }
    });
  }

  // --- 7. Initialization ---
  function init() {
    checkEnvironment();
    registerServiceWorker();
    initInstallPromptListeners();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bindUiEvents);
    } else {
      bindUiEvents();
    }
  }

  init();
})();
