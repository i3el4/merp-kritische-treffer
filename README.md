# MERS • Angriffs- & Kritische Treffer

Progressive Web App (PWA) für das Mittelerde-Rollenspiel (MERP/MERS). Ermöglicht schnelles Nachschlagen von Angriffswerten und kritischen Treffern, inklusive Kampftracker, Charakter-Stats und Echtzeit-Sync über mehrere Geräte.

---

## ✨ Funktionalität

### Kampf-Simulator
- **Angriff:** Waffenart, RK, Gegnertyp → Trefferbereich ermitteln
- **Kritischer Haupttreffer:** Würfelwurf + Typ/Kategorie → TTS oder MP3-Ausgabe
- **Nebentreffer:** Optionale Zusatztreffer
- **Schaden anwenden:** TP und Status direkt auf gewählte Ziele übertragen

### Kampftracker
- Gegner mit TP, RK, Icon verwalten
- Rundenende: laufende Schäden, Status (ben, benoPar, oPar, init, ko) automatisch verarbeiten
- TP heilen, Blutung stoppen

### Charakter-Stats
- Spieler und NPCs mit TP, RK, Wahrnehmung
- Gleiche Rundenlogik und Schadensverarbeitung wie bei Gegnern

### Kampagnen
- Kampagnen anlegen, umbenennen, löschen
- **Firebase-Sync:** Kampagnen über Geräte hinweg teilen
- Kampagnen-ID kopieren oder per ID beitreten
- Ohne Firebase: lokale Speicherung (localStorage)

### Rollen
- **Spielleiter:** Voller Zugriff (Simulator, Kampftracker, Charakter-Stats, Kampagne)
- **Spieler:** Simulator + Charakter-Stats, Kampagne/Charakter wählbar

---

## 📦 Projektstruktur

```plaintext
/
├── index.html              # Haupt-HTML
├── sw.js                   # Service Worker (PWA)
├── scripts/
│   ├── main.js             # Einstieg, Rollenwahl, Tabs
│   ├── app.js              # Simulator-Logik, Waffen, RK
│   ├── kampftracker.js     # Kampftracker, Kampagnen-UI, Ziele
│   ├── campaigns.js        # Kampagnen-Daten, Gegner, Spieler, NPCs
│   ├── firebase-storage.js # Firebase Realtime Database / localStorage
│   ├── firebase-config.example.js  # Vorlage für Firebase-Konfiguration
│   ├── events.js           # Event-Listener, Schaden anwenden
│   ├── logic.js            # Angriffs- und Krit-Berechnung
│   ├── data.js             # JSON-Daten laden
│   ├── audio.js            # TTS, Hintergrundmusik
│   └── ...
├── styles/
│   ├── base.css
│   └── overrides.css
├── assets/
│   ├── audio/krit/         # Krit-Treffer MP3s
│   ├── audio/musik/         # Hintergrundmusik
│   ├── data/               # tables.json, treffer_tabellen_strukturiert.json
│   ├── fonts/
│   ├── icons/
│   └── img/
└── private/                # Sensible Dateien (nicht in Git)
    ├── README.md           # Einrichtungsanleitung
    ├── firebase-config.js  # Firebase Web-Client-Config
    └── .env                # API-Keys für Node-Skripte
```

---

## 🚀 Setup

### 1. Repository klonen

```bash
git clone <repo-url>
cd merp-kritische-treffer
```

### 2. Sensible Dateien (optional, für Firebase)

1. Ordner `private/` anlegen (falls nicht vorhanden)
2. `scripts/firebase-config.example.js` nach `private/firebase-config.js` kopieren
3. Firebase Console → Projekt-Einstellungen → Web-App → Config eintragen

Ohne `private/firebase-config.js` läuft die App mit **localStorage** (kein Sync).

### 3. App starten

- **Lokal:** `python3 -m http.server 8765` oder beliebiger HTTP-Server
- **GitHub Pages:** Repo → Settings → Pages → Source: main branch

### 4. PWA installieren

- iOS/Safari: „Zum Home-Bildschirm hinzufügen“
- Android/Chrome: „App installieren“ im Menü

---

## 🔥 Firebase (Echtzeit-Sync)

- **Realtime Database** speichert Kampagnen unter `/campaigns/{id}`
- Kostenloser Spark-Plan (1 GB Speicher, 10 GB Transfer/Monat) reicht für Textdaten
- Kampagnen-ID teilen → andere Geräte können beitreten
- Firebase Console: Kampagnen-IDs einsehbar, falls Geräte verloren gehen

---

## 🎧 Audio

- Krit-Treffer: MP3s aus `assets/audio/krit/` (Format: `Typ_Kat_Bereich.mp3`)
- Hintergrundmusik: `assets/audio/musik/`
- Fallback: Browser-TTS (Text-to-Speech)

---

## 🛠 Entwickler

- **Node-Skripte** (Gemini, ElevenLabs): `private/.env` mit API-Keys, siehe `private/README.md`
- **Daten:** `assets/data/tables.json`, `treffer_tabellen_strukturiert.json`
- **PWA:** `sw.js`

---

## 📱 Kompatibilität

- Desktop und Mobile
- iOS Safari, Android Chrome
- Offline-fähig (PWA)

---

## ⚔️ Viel Spaß beim Spielen!
