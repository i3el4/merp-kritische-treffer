# AGENTS – Hinweise für KI-Sessions

Kurze Orientierung, die jede AI-Coding-Session sofort einnorden sollte. **Bei Unklarheiten zuerst [docs/README.md](docs/README.md) lesen.**

---

## Verzeichnis-Verantwortungen (nicht vermischen)

- **`scripts/`** — RUNTIME (Browser-Module). Wird per `<script type="module" src="scripts/main.js">` aus `index.html` geladen. **Keine** Daten-Pipeline-Logik hier ablegen.
- **`tools/`** — DATEN-PIPELINE (Node.js, manuell via `npm run …`). Nie im Browser.
  - `tools/pdf-extract/` PDF → JSON via Gemini
  - `tools/tables/` JSON-Transforms
  - `tools/audio/` MP3-Generierung
  - `tools/_archive/` Legacy ohne npm-Verdrahtung
- **`assets/data/`** — Runtime-JSON, das die App liest. **Pfade nicht ändern**, sonst muss `scripts/constants.js` und `sw.js` mit.
- **`assets/data/_pipeline/`** — Pipeline-Zwischenstände. Wird vom Browser nicht geladen.
- **`assets/source/`** — Quellmaterial der Pipeline (PDFs).
- **`_archive_obsolete/`** — Tote Daten-JSONs, nicht mehr referenziert.

---

## Goldene Regeln

1. **Vor neuem Skript prüfen, ob es schon eine Vorlage gibt.** Siehe [docs/DATA-PIPELINE.md](docs/DATA-PIPELINE.md) und [tools/README.md](tools/README.md). Meistens reicht: vorhandenes Skript kopieren, anpassen, in `package.json` als `npm run …` verdrahten.
2. **App-Verhalten nicht ändern**, wenn der User „aufräumen / refactor / dokumentieren" sagt. Funktionalität bleibt gleich.
3. **Pipeline-Skripte verwenden `path.join(__dirname, '../../assets/...')`** (zwei Ebenen hoch, weil sie unter `tools/<unterordner>/` liegen).
4. **Pipeline-Skripte laden Secrets via `dotenv` aus `../../private/.env`** (Fallback: root `.env`).
5. **Nach Runtime-Änderungen `CACHE_NAME` in [`sw.js`](sw.js) hochzählen** (`mers-vN` → `mers-v(N+1)`), sonst lädt der Browser alte Dateien aus dem Service-Worker-Cache.
6. **Niemals Dateien in `private/` einchecken** (ausser `private/README.md`).
7. **`_archive_obsolete/` und `tools/_archive/` nicht löschen.** Sie sind absichtliche Referenzen.

---

## Lookup-Hilfe

| Frage | Datei |
|---|---|
| „Wo wird `tables_processed.json` gelesen?" | [`scripts/data.js`](scripts/data.js) und [`scripts/constants.js`](scripts/constants.js) (`URLS.TABLES_URL`) |
| „Welcher Pipeline-Schritt produziert was?" | [docs/DATA-PIPELINE.md](docs/DATA-PIPELINE.md) |
| „Welche Datei ist runtime, welche nicht?" | [docs/DATA-FILES.md](docs/DATA-FILES.md) |
| „Wie hängen die Module zusammen?" | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| „Neue Tabelle digitalisieren – was ist die Reihenfolge?" | [docs/HOWTO-NEW-TABLE.md](docs/HOWTO-NEW-TABLE.md) |
| „MP3 vertonen – wie?" | [docs/HOWTO-NEW-AUDIO.md](docs/HOWTO-NEW-AUDIO.md) |
| „Firebase tut nicht" | [docs/FIREBASE-TROUBLESHOOTING.md](docs/FIREBASE-TROUBLESHOOTING.md) |
