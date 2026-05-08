# Doku-Index

Alles, was man über das Projekt wissen muss, ist hier verlinkt. Die Reihenfolge entspricht „lies das, wenn du das tun willst".

---

## „Wer bin ich, was will ich?"

| Du willst … | Lies … |
|---|---|
| Verstehen, wie die App im Browser tickt | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Eine neue Tabelle (Krit, Patzer, Angriff) digitalisieren | [HOWTO-NEW-TABLE.md](HOWTO-NEW-TABLE.md) |
| MP3s für eine bestehende Tabelle generieren | [HOWTO-NEW-AUDIO.md](HOWTO-NEW-AUDIO.md) |
| Audio-Slugging und Dateinamen verstehen | [AUDIO-NAMING-SCHEMA.md](AUDIO-NAMING-SCHEMA.md) |
| Projektweite Benennungskonventionen | [NAMING-CONVENTIONS.md](NAMING-CONVENTIONS.md) |
| Wissen, welcher Pipeline-Befehl was macht | [DATA-PIPELINE.md](DATA-PIPELINE.md) |
| Wissen, welche Datei was bedeutet | [DATA-FILES.md](DATA-FILES.md) |
| Firebase debuggen | [FIREBASE-TROUBLESHOOTING.md](FIREBASE-TROUBLESHOOTING.md) |

---

## Konventionen

- **`scripts/`** = Browser-Runtime. Wird per `<script type="module">` aus `index.html` geladen. **Niemals** Daten-Pipeline-Code dort einchecken.
- **`tools/`** = Daten-Pipeline (Node.js). Läuft nur lokal/manuell, nie im Browser. Unterteilung: `tools/pdf-extract/`, `tools/tables/`, `tools/audio/`, `tools/_archive/` (alt, ohne npm-Verdrahtung).
- **`assets/data/`** = Runtime-JSON, das die App liest. Kein Pipeline-Zwischenstand hier ablegen.
- **`assets/data/_pipeline/`** = Zwischenstände der Pipeline. Werden vom Browser nicht geladen.
- **`assets/source/`** = Quellmaterial (PDFs, etc.) der Pipeline.
- **`assets/templates/`** = Referenz-/Print-Assets für Menschen (nicht der kanonische Pipeline-Input).
- **`_archive_obsolete/`** = veraltete Daten, nicht mehr in Verwendung.

### Decision Note: `source` vs `templates`

- `assets/source` bleibt **canonical machine input** für Extract-Skripte.
- `assets/templates` bleibt **print/reference** für manuelle Nutzung.
- Keine Zusammenlegung: so werden versehentliche Pipeline-Inputs aus Print-Dateien vermieden.

---

## Wo liegt was?

```
/
├── index.html, sw.js                 # Browser-Einstieg + PWA
├── scripts/                          # Runtime-Module (siehe ARCHITECTURE.md)
├── styles/                           # CSS
├── tools/                            # Daten-Pipeline (siehe DATA-PIPELINE.md)
│   ├── pdf-extract/                  # PDF → JSON
│   ├── tables/                       # JSON-Transforms / Merges
│   ├── audio/                        # MP3-Generierung & -Archivierung
│   └── _archive/                     # Legacy/Experimente
├── assets/
│   ├── data/                         # Runtime-JSON (siehe DATA-FILES.md)
│   │   └── _pipeline/                # Pipeline-Zwischenstände
│   ├── source/                       # PDFs als Pipeline-Quelle
│   ├── audio/, fonts/, icons/, img/, templates/
├── import/                           # Manuelle CSV-Inputs für Waffen-Tabellen
├── private/                          # Secrets (nicht im Git, ausser README)
├── docs/                             # ← du bist hier
└── _archive_obsolete/                # Tote JSONs
```

---

## Vor jedem grösseren Eingriff

1. Lies das passende HOWTO oben.
2. Schau in [DATA-FILES.md](DATA-FILES.md) ob es nicht schon eine Datei oder ein Skript für das gibt, was du tun willst.
3. Wenn du ein neues Skript schreiben willst: vergleiche mit den Vorlagen in `tools/`. Meistens reicht **kopieren + anpassen**.
4. Nach Änderungen an Runtime-Dateien: `CACHE_NAME` in [`sw.js`](../sw.js) hochzählen.
