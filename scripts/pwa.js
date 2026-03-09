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
        navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => {});
    }
}
