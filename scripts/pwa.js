// pwa.js
// Dieses Modul verwaltet die PWA-Funktionalitäten.

import { $ } from './dom.js';

let deferredPrompt = null;

/**
 * Initialisiert die PWA-Funktionalitäten.
 */
export function initPWA() {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        $('#installBtn').hidden = false;
    });

    $('#installBtn').addEventListener('click', async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null;
        $('#installBtn').hidden = true;
    });

    if ('serviceWorker' in navigator) {
        const isLocalDev =
            location.hostname === 'localhost' ||
            location.hostname === '127.0.0.1' ||
            location.hostname === '[::1]';
        if (isLocalDev) {
            navigator.serviceWorker.getRegistrations().then((regs) => {
                regs.forEach((reg) => reg.unregister());
            });
            // eslint-disable-next-line no-console
            console.info('[MERS] Service Worker auf localhost deaktiviert — bei Bedarf einmal hart neu laden (Cache leeren).');
        } else {
            navigator.serviceWorker.register('sw.js', { scope: './' }).then((reg) => {
                reg.update().catch(() => {});
            }).catch(() => {});
            let reloaded = false;
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (reloaded) return;
                reloaded = true;
                window.location.reload();
            });
        }
    }
}
