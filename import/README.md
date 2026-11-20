# `import/` – Manuelle CSV-Inputs

Hier liegen **Eingabedateien** für [`tools/tables/import_and_fix_tables.js`](../tools/tables/import_and_fix_tables.js) (`npm run import-tables`).

## Format

- Eine CSV pro Waffen-/Angriffsart, semikolon-getrennt.
- Dateiname (ohne `.csv`) wird per `TABLE_CONFIG` im Import-Skript auf einen Top-Level-Key in `assets/data/treffer_tabellen_strukturiert.json` gemappt.
- Das Import-Skript priorisiert Dateien aus diesem Ordner gegenüber `assets/templates/`.

## Beispiel

`pieksen.csv` → wird beim Lauf von `npm run import-tables` zum Schlüssel `PIEKSEN` (oder gemäss `TABLE_CONFIG`) gemerged.

## Workflow

Siehe [HOWTO-NEW-TABLE.md](../docs/HOWTO-NEW-TABLE.md) → Variante B.
