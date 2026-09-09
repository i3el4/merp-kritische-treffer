# Audio Naming Schema

Kanonische Konvention fuer Krit-Audio-Dateien.

## Zielpfad

- Format Original: `assets/audio/krit/<tableSlug>/<category>_<range>.mp3`
- Format Qwen: `assets/audio/qwen/<tableSlug>/<category>_<range>.mp3`
- Beispiel: `assets/audio/krit/hieb/E_76-80.mp3` und `assets/audio/qwen/hieb/E_76-80.mp3`

## Normalisierung

- **tableSlug**
  - Quelle: Tabellen-Key aus `assets/data/tables_processed.json`
  - Regel: lowercase snake_case, ASCII normalisiert
  - Beispiele:
    - `Hieb` -> `hieb`
    - `Grosse Wesen` -> `grosse_wesen`
    - `Allgemeine Patzer` -> `allgemeine_patzer`
- **category**
  - `A-E` bleiben `A-E`
  - sonst: uppercase snake_case
  - Beispiel: `Manoever` -> `MANOEVER`
- **range**
  - Unicode dashes -> `-`
  - Leerzeichen entfernen
  - `-100-5` wird kanonisch zu `0-100`
  - `<=`/`>=` Varianten werden numerisch kanonisiert

## Single Source of Truth

Die Regeln werden zentral in `scripts/audioNaming.mjs` gepflegt:

- `tableKeyToSlug()`
- `normalizeCategory()`
- `normalizeRange()`
- `buildCritAudioRelativePath(tableKey, category, rangeKey, pack?)` — `pack` ist `'krit'` (Default) oder `'qwen'`
- `buildLegacyCritAudioFilename()`

Runtime (`scripts/audio.js`) und Tooling (`tools/audio/*.js`) muessen diese Funktionen verwenden.

