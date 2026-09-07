# Daten-Dateien – Cheat Sheet

Welche Datei wird wo gelesen oder geschrieben? Diese Übersicht hilft, vor dem Erstellen einer neuen Datei oder Funktion zu prüfen, ob es schon etwas Passendes gibt.

---

## Runtime-Daten (vom Browser geladen)

| Datei | Inhalt | Geladen von |
|---|---|---|
| `assets/data/treffer_tabellen_strukturiert.json` | `Angriffstabellen` (Spieler/Naturangriffe, RK 1–20) und `GegnerAngriffstabellen` (Monster, Spalten PL–OR) | `scripts/data.js` über `URLS.TREFFER_URL` in `scripts/constants.js` |
| `assets/data/tables_processed.json` | Krit-Tabellen (Typ × Kategorie × Würfelbereich → tts_text + visual). Enthält auch „Allgemeine Patzer" und englische Zusatztabellen. | `scripts/data.js` über `URLS.TABLES_URL` |
| `assets/data/patzer_default.json` | Patzer-Defaults / Overlay | `scripts/data.js` über `URLS.PATZER_URL` |

> **Pfade nicht ändern**, ohne `scripts/constants.js` und `sw.js` mitzuziehen.

---

## Runtime-Audio

| Pfad | Inhalt |
|---|---|
| `assets/audio/krit/<tableSlug>/<KAT>_<RANGE>.mp3` | Original-TTS (ElevenLabs). Beispiel: `assets/audio/krit/hieb/E_76-80.mp3`. |
| `assets/audio/qwen/<tableSlug>/<KAT>_<RANGE>.mp3` | Zweite Stimme (Qwen/Bud2). In der App: Profil → Krit-Stimme. |
| `assets/audio/krit/_archive_englisch_non_canonical/<Datum>/` | Archivordner für nicht mehr passende Englisch-MP3s (siehe `englisch-mp3-archive`). |
| `assets/audio/musik/` | Hintergrundmusik (manuell beigetragen). |

---

## Pipeline-Zwischenstände (`assets/data/_pipeline/`)

Diese Dateien werden **nicht** vom Browser geladen, nur von Pipeline-Skripten geschrieben/gelesen.

| Datei | Typ | Geschrieben von | Konsumiert von |
|---|---|---|---|
| `english_to_german_tables.json` | Pipeline-Intermediate (behalten) | `tools/pdf-extract/extract_english_pdf.js` | `tools/tables/merge_english_german_into_tables.js` |
| `english_to_german_tables.response-raw.txt` | Debug-Artefakt (optional) | `extract_english_pdf.js` (Debug-Dump) | – (nur zur Fehlersuche) |
| `patzer_tables.json` | Pipeline-Intermediate (behalten) | `tools/pdf-extract/extract_patzer_pdf.js` | `tools/tables/minify_patzer_visual.js`, `merge_patzer_into_tables_processed.js`, `apply_patzer_range_labels.js` |
| `tables_final.json` | Optionales Pipeline-Output | `tools/tables/minify_visual_text.js` (ohne `MINIFY_ENGLISH_ZUSATZ_ONLY`) | – (Inspektion) |
| `tables_with_severity.json` | Archiviertes Experiment | `tools/_archive/classify_crit_severity_with_gemini.js` | – (archiviert) |

---

## Quellmaterial (`assets/source/`)

| Datei | Verwendet von |
|---|---|
| `Krit_Patzer.pdf` | `npm run extract-patzer` |
| `englische_tabellen.pdf` | `npm run extract-english` |

> Weitere PDFs (Stoss, Hieb, Streich, Stich etc.) liegen unter `assets/templates/` als Spielleiter-Bögen zum Drucken – sie sind **nicht** Quelle der Pipeline.

---

## Manuelle Inputs (`import/`)

| Datei | Verwendet von |
|---|---|
| `import/<waffe>.csv` (z.B. `beissen.csv`, `pieksen.csv`) | `npm run import-tables` (`tools/tables/import_and_fix_tables.js`) – wird in `treffer_tabellen_strukturiert.json` gemerged |
| `assets/templates/ANGRIFFSTABELLEN_GEGNER.xlsx` | `npm run import-gegner-tables` (`tools/tables/import_gegner_tables.js`) → `GegnerAngriffstabellen` im gleichen JSON |

CSV-Format: siehe `TABLE_CONFIG` in `tools/tables/import_and_fix_tables.js`. Trennzeichen ist `;`.

---

## Konfig-Dateien

| Datei | Zweck |
|---|---|
| `private/firebase-config.js` | **Lokal** vorhandene Firebase-Web-Config (überschreibt das Repo-Default) |
| `scripts/firebase-config.js` | **Im Repo eingecheckt** für GitHub-Pages-Deployment |
| `scripts/firebase-config.example.js` | Vorlage zum Kopieren nach `private/firebase-config.js` |
| `private/.env` | API-Keys für Pipeline (`GEMINI_API_KEY`, `ELEVENLABS_*`; optional `LOCAL_TTS_ROOT` / `QWEN_TTS_VOICE`) |
| `firebase-database.rules.json` | Firebase-Realtime-Database-Regeln (manuell in Firebase Console einsetzen) |

---

## Hilfs-/Status-Dateien (Pipeline)

| Datei | Zweck |
|---|---|
| `tools/tables/.english_zusatz_table_keys.json` | Wird von `merge-english-tables` geschrieben, von `minify-visual-english` gelesen. Enthält die Liste der Zusatz-Tabellen für gezielte Minify. |

---

## Archiviert / obsolet (`_archive_obsolete/`)

| Datei | Status |
|---|---|
| `_archive_obsolete/tables.json` | Alte Krit-Daten, nur von der Legacy-`app.js` (`tools/_archive/`) gelesen. |
| `_archive_obsolete/tables_v1.json` / `tables_v2.json` | Snapshots aus früheren Pipeline-Stadien. |
| `_archive_obsolete/patzer_manoever_arms_law_deutsch.json` | Aufgegebener Patzer-Ansatz. |
| `_archive_obsolete/pipeline_optional/patzer_modifiers.json` | Optionales Referenz-Output aus `merge-patzer`; nicht runtime-kritisch. |
| `_archive_obsolete/pipeline_optional/tables_clean.json` | Optionales Cleanup-Output; nicht runtime-kritisch. |

> Werden nirgends mehr referenziert, dürfen bei Bedarf gelöscht werden – Git-Historie reicht.
