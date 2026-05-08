# Naming Conventions

Projektweite Konventionen fuer Dateinamen, Ordner und Daten-Keys.

## 1) Dateinamen und Ordner

- **Code-Dateien (`.js`, `.py`, `.md`)**: `kebab-case` oder bestehendes Muster beibehalten.
  - Bestehende Runtime-Namen in `scripts/` bleiben stabil (z. B. `main.js`, `audio.js`).
- **Daten-Ordner-Slugs**: `lowercase_snake_case`.
  - Beispiel: `assets/audio/krit/allgemeine_patzer/`
- **Audio-Dateien (krit)**:
  - Kanonisch: `assets/audio/krit/<tableSlug>/<CATEGORY>_<RANGE>.mp3`
  - Beispiele: `hieb/E_76-80.mp3`, `allgemeine_patzer/FERNKAMPF_97-99.mp3`

## 2) JSON-Keys

- **Anzeige-Keys** (UI-lesbar) duerfen deutsch bleiben, z. B. `Grosse Wesen`.
- **Technische IDs** fuer Dateisystem / Tooling werden daraus abgeleitet:
  - `tableSlug = tableKeyToSlug(anzeigeKey)` aus `scripts/audioNaming.mjs`
- Kategorie-Keys:
  - Klassische Krit-Kategorien: `A` bis `E`
  - Sonderkategorien (z. B. Patzer): ASCII-normalisiert, `UPPER_SNAKE_CASE`

## 3) Bereichsnotation (`range`)

- Bindestrich-Bereiche: `x-y` (z. B. `76-80`)
- Offene Obergrenze: `120+`
- Sonderfall legacy `-100-5` wird kanonisch auf `0-100` abgebildet.

## 4) Single Source of Truth

Audio-Namensbildung wird nicht mehr ad-hoc pro Datei implementiert.
Verbindlich ist:

- `scripts/audioNaming.mjs`
  - `tableKeyToSlug()`
  - `normalizeCategory()`
  - `normalizeRange()`
  - `buildCritAudioRelativePath()`
  - `buildLegacyCritAudioFilename()` (nur Migration/Legacy)

## 5) Do / Don't

- Do: Neue Pipeline-Skripte sollen diese Builder-Funktionen verwenden.
- Do: Vor einem Massen-Rename immer `npm run migrate-audio-layout-dry`.
- Do: Nach Migration immer `npm run validate-audio-index`.
- Don't: Dateien manuell im Finder umbenennen.
- Don't: Kategorie-/Range-Strings lokal neu formatieren (immer ueber Builder).

