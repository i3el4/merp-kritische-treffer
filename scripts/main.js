// main.js
// Dies ist der neue Einstiegspunkt Ihrer App. Er importiert alle Module und startet die Anwendung.

import { loadData } from './data.js';
import { setupEventListeners } from './events.js';
import { initPWA } from './pwa.js';

// Initialisiert die Anwendung, wenn die Seite vollständig geladen ist.
window.addEventListener('load', () => {
    // Ruft die Funktion zum Laden der Daten und Befüllen der UI auf.
    loadData().catch(err => {
        console.error(err);
        // Gibt eine Fehlermeldung aus, falls das Laden fehlschlägt.
        alert('Fehler beim Laden der JSON-Dateien. Bitte sicherstellen, dass sich assets/data/tables.json und assets/data/treffer_tabellen_strukturiert.json im gleichen Repo befinden.');
    });

    // Richtet alle Event-Listener für die Benutzeroberfläche ein.
    setupEventListeners();

    // Initialisiert die PWA-Funktionalitäten.
    initPWA();
});