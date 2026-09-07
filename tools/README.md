# Daten-Pipeline (Node.js)

Hier liegt **Build-Zeit-Tooling**. Alles, was unter `tools/` läuft, **gehört nicht** in den Browser. Die Browser-App liegt unter [`../scripts/`](../scripts).

Vor neuem Skript: **immer prüfen**, ob die Funktion nicht schon existiert. Siehe [`../docs/DATA-PIPELINE.md`](../docs/DATA-PIPELINE.md) (vollständige Übersicht inkl. Mermaid-Diagramm).

---

## Ordnerstruktur

| Ordner | Zweck |
|---|---|
| [`pdf-extract/`](pdf-extract) | PDF → strukturiertes JSON via Gemini |
| [`tables/`](tables) | JSON-Transforms (cleanup, minify, merge) |
| [`audio/`](audio) | MP3-Generierung (Qwen lokal / ElevenLabs) und Audio-Archivierung |
| [`_archive/`](_archive) | Legacy-/Experiment-Skripte – nicht in `package.json` verdrahtet |

---

## Voraussetzungen

```bash
npm install
```

und in [`../private/.env`](../private/README.md):

```env
GEMINI_API_KEY=...
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...
```

---

## Wer macht was?

| `npm run …` | Was es tut | Skript |
|---|---|---|
| `extract-patzer` | PDF → `_pipeline/patzer_tables.json` | `pdf-extract/extract_patzer_pdf.js` |
| `extract-english` | PDF → `_pipeline/english_to_german_tables.json` | `pdf-extract/extract_english_pdf.js` |
| `minify-patzer` | Patzer `tts_text` → `visual` | `tables/minify_patzer_visual.js` |
| `sync-patzer-ranges` | Würfelbereich-Labels synchronisieren | `tables/apply_patzer_range_labels.js` |
| `merge-patzer` | Patzer in `tables_processed.json` einbauen | `tables/merge_patzer_into_tables_processed.js` |
| `merge-english-tables` | Englische Krit-Übersetzungen einbauen | `tables/merge_english_german_into_tables.js` |
| `minify-visual` | `tables_processed.json` → `_pipeline/tables_final.json` | `tables/minify_visual_text.js` |
| `minify-visual-english` | nur Englisch-Zusatz, in-place | dasselbe Skript mit Env-Var |
| `clean-tables` / `-all` | Cleanup-Pass über `tables_processed.json` | `tables/clean_tables_with_gemini.js` |
| `import-tables` | CSV → `treffer_tabellen_strukturiert.json` | `tables/import_and_fix_tables.js` |
| `generate-audio-qwen` | TTS-MP3s lokal mit Qwen3-TTS nach `assets/audio/qwen/` (Bud2) | `audio/generate_audio_qwen.js` |
| `generate-audio-qwen-sweep` | Sampler-Raster (wenige Texte × Varianten) nach `_pipeline/qwen-sweep/` | `audio/generate_audio_qwen_sweep.js` |
| `generate-audio` | TTS-MP3s via ElevenLabs | `audio/generate_audio_elevenlabs.js` |
| `migrate-audio-layout-dry` / `migrate-audio-layout` | Flat-Audio → kanonisches Unterordner-Layout | `audio/migrate_audio_layout.js` |
| `validate-audio-index` | Prüft erwartete vs vorhandene kanonische MP3-Dateien | `audio/validate_audio_index.js` |
| `englisch-mp3-archive` / `-report` | Englisch-MP3-Aufräumtool | `audio/englisch_krit_audio_tool.js` |

---

## Reihenfolgen je Use-Case

### Patzer aus PDF
```
extract-patzer → minify-patzer → (sync-patzer-ranges) → merge-patzer
```

### Englische Krit-Tabellen aus PDF
```
extract-english → merge-english-tables → minify-visual-english
```

### Neue Waffe (CSV)
```
CSV in import/<waffe>.csv → TABLE_CONFIG anpassen → import-tables
```

### Audio nach jeder Tabellen-Änderung
```
generate-audio-qwen   # lokal; Cloud-Alternative: generate-audio
migrate-audio-layout
validate-audio-index
```

(Service Worker `CACHE_NAME` in `sw.js` hochzählen, sonst lädt der Browser alte Dateien.)

---

## Schreibstil bei neuen Skripten

- Pfade **immer** über `path.join(__dirname, '../../assets/...')` (zwei Ebenen hoch).
- Inputs/Outputs am Anfang als `const` definieren und sofort ins Console loggen, sodass man Pfad-Fehler beim ersten Run sieht.
- API-Keys aus `../../private/.env` mit Fallback auf root `.env`:
  ```js
  require('dotenv').config({ path: require('path').join(__dirname, '../../private/.env') });
  require('dotenv').config();
  ```
- In `package.json` als `npm run …`-Skript verdrahten – **keine** Aufrufe direkt mit `node tools/...` in der Doku, immer das `npm`-Wrapper-Skript dokumentieren.
