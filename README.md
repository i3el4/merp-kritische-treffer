# MERS – Angriffs- & Kritische Treffer

Progressive Web App (PWA) für das Mittelerde-Rollenspiel (MERP/MERS). Schnelles Nachschlagen von Angriffswerten und kritischen Treffern, inkl. Kampftracker, Charakter-Stats und Echtzeit-Sync über mehrere Geräte.

> **Du willst direkt loslegen?**
> - **App benutzen / verstehen:** weiter unten unter „Setup".
> - **Eine neue Tabelle digitalisieren:** [docs/HOWTO-NEW-TABLE.md](docs/HOWTO-NEW-TABLE.md).
> - **MP3s vertonen:** [docs/HOWTO-NEW-AUDIO.md](docs/HOWTO-NEW-AUDIO.md).
> - **Wie tickt das Projekt?** [docs/README.md](docs/README.md) ist der Index.

---

## Funktionalität

### Kampf-Simulator
- **Angriff:** Waffenart, RK, Gegnertyp → Trefferbereich ermitteln
- **Kritischer Haupttreffer:** Würfelwurf + Typ/Kategorie → TTS oder MP3-Ausgabe
- **Nebentreffer:** Optionale Zusatztreffer
- **Schaden anwenden:** TP und Status direkt auf gewählte Ziele übertragen

### Kampftracker
- Gegner mit TP, RK, Icon verwalten
- Rundenende: laufende Schäden, Status (`ben`, `benoPar`, `oPar`, `init`, `ko`) automatisch verarbeiten
- TP heilen, Blutung stoppen

### Charakter-Stats
- Spieler und NPCs mit TP, RK, Wahrnehmung
- Gleiche Rundenlogik und Schadensverarbeitung wie bei Gegnern

### Kampagnen
- Kampagnen anlegen, umbenennen, löschen
- **Firebase-Sync:** Kampagnen über Geräte hinweg teilen
- Kampagnen-ID kopieren oder per ID beitreten
- Ohne Firebase: lokale Speicherung (`localStorage`)

### Rollen
- **Spielleiter:** Voller Zugriff (Simulator, Kampftracker, Charakter-Stats, Kampagne)
- **Spieler:** Simulator + Charakter-Stats, Kampagne/Charakter wählbar

---

## Projektstruktur (gross)

```
/
├── index.html, sw.js              # Browser-Einstieg + PWA
├── scripts/                       # RUNTIME (Browser-Module)
├── styles/                        # CSS
├── tools/                         # DATEN-PIPELINE (Node-CLI)
│   ├── pdf-extract/               # PDF → JSON (Gemini)
│   ├── tables/                    # JSON-Transforms
│   ├── audio/                     # MP3-Generierung (Qwen lokal / ElevenLabs)
│   └── _archive/                  # Legacy/Experimente
├── assets/
│   ├── data/                      # Runtime-JSON (gelesen von der App)
│   │   └── _pipeline/             # Zwischenstände der Pipeline
│   ├── source/                    # PDFs als Pipeline-Quelle
│   ├── audio/, fonts/, icons/, img/, templates/, videos/
├── import/                        # Manuelle CSV-Inputs (Waffen)
├── private/                       # Secrets, nicht im Git (ausser README)
├── docs/                          # Doku (Architektur, Pipeline, HOWTOs)
├── package.json
└── _archive_obsolete/             # Tote Daten-JSONs
```

Trennung wichtig: **`scripts/` ist Browser-Code**, **`tools/` ist Pipeline-Tooling**. Niemals vermischen. Mehr dazu in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) und [docs/DATA-PIPELINE.md](docs/DATA-PIPELINE.md).

---

## Setup

### 1. Repository klonen
```bash
git clone <repo-url>
cd merp-kritische-treffer
npm install
```

### 2. Sensible Dateien (optional, für Firebase + Pipeline)
1. Ordner `private/` anlegen (existiert i.d.R. schon).
2. `scripts/firebase-config.example.js` → `private/firebase-config.js` kopieren und Web-Config eintragen (Firebase Console → Projekt-Einstellungen → Web-App).
3. `private/.env` mit API-Keys für die Pipeline:
   ```env
   GEMINI_API_KEY=...
   ELEVENLABS_API_KEY=...
   ELEVENLABS_VOICE_ID=...
   ```
   Details: [`private/README.md`](private/README.md).

Ohne Firebase-Config läuft die App mit `localStorage` (kein Sync, keine Kampagnen-ID, kein Beitreten).

**GitHub Pages:** `scripts/firebase-config.js` ist eingecheckt – Sync funktioniert dort. Der API-Key muss in der Google Cloud Console auf `https://i3el4.github.io/*` (und ggf. `http://localhost/*`) eingeschränkt sein.

### 3. App starten
- **Lokal:** `npm run serve` (Port 3333) oder `python3 -m http.server 8765`.
- **GitHub Pages:** Repo → Settings → Pages → Source: main branch.

### 4. PWA installieren
- iOS/Safari: „Zum Home-Bildschirm hinzufügen"
- Android/Chrome: „App installieren" im Menü

---

## Firebase (Echtzeit-Sync)

- **Realtime Database** speichert Kampagnen unter `/campaigns/{id}` und Krit-Korrekturen unter `/critCorrections`.
- Kostenloser Spark-Plan reicht für Textdaten (1 GB Speicher, 10 GB Transfer/Monat).
- Kampagnen-ID teilen → andere Geräte können beitreten.

**Datenbank-Regeln:** [`firebase-database.rules.json`](firebase-database.rules.json) → Firebase Console → Realtime Database → Regeln.

**API-Key-Einschränkungen** (Pflicht):
- Google Cloud Console → APIs & Services → Credentials → API-Key bearbeiten
- HTTP-Referrer-Einschränkungen: `https://i3el4.github.io/*`, `http://localhost/*`
- API-Restrictions: Nur Firebase Realtime Database (und benötigte APIs)

Probleme? → [docs/FIREBASE-TROUBLESHOOTING.md](docs/FIREBASE-TROUBLESHOOTING.md).

---

## Audio
- Krit-Treffer: MP3s aus `assets/audio/krit/<tableSlug>/<KAT>_<RANGE>.mp3` (z. B. `assets/audio/krit/hieb/E_76-80.mp3`)
- Hintergrundmusik: `assets/audio/musik/`
- Fallback: Browser-TTS (Text-to-Speech)

Neu vertonen: siehe [docs/HOWTO-NEW-AUDIO.md](docs/HOWTO-NEW-AUDIO.md).

---

## Daten & Inhalte erweitern

Komplett dokumentiert in [docs/](docs):

- **Neue Tabelle:** [docs/HOWTO-NEW-TABLE.md](docs/HOWTO-NEW-TABLE.md)
- **Neue MP3s:** [docs/HOWTO-NEW-AUDIO.md](docs/HOWTO-NEW-AUDIO.md)
- **Pipeline-Referenz:** [docs/DATA-PIPELINE.md](docs/DATA-PIPELINE.md)
- **Welche Datei ist welche?** [docs/DATA-FILES.md](docs/DATA-FILES.md)

---

## Kompatibilität
- Desktop und Mobile
- iOS Safari, Android Chrome
- Offline-fähig (PWA)

---

## Viel Spass beim Spielen!
