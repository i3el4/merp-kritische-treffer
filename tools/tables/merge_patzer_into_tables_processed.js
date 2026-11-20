#!/usr/bin/env node
/**
 * Übernimmt assets/data/_pipeline/patzer_tables.json (tts_text + visual) nach
 * assets/data/tables_processed.json → Abschnitt "Allgemeine Patzer".
 *
 * Die ersten 19 Zeilen pro PDF-Spalte werden auf die bestehenden Bereichs-Schlüssel
 * (wie bisher im Simulator) gemappt. Weitere Zeilen (Modifikatoren) landen in
 * assets/data/_pipeline/patzer_modifiers.json — dort nicht per Würfelbereich, nur Referenz.
 */

const fs = require('fs');
const path = require('path');

const PATZER_PATH = path.join(__dirname, '../../assets/data/_pipeline/patzer_tables.json');
const TABLES_PATH = path.join(__dirname, '../../assets/data/tables_processed.json');
const MODIFIERS_OUT = path.join(__dirname, '../../assets/data/_pipeline/patzer_modifiers.json');

/**
 * Kanonische Würfelbereiche (Patzer-Tabelle) — Reihenfolge = Reihenfolge der Zeilen in patzer_tables.
 * Entspricht: -100…5, 6–20, …, 120+
 */
const PATZER_MAIN_KEYS = [
  '-100-5',
  '6-20',
  '21-35',
  '36-50',
  '51-65',
  '66-79',
  '80',
  '81-86',
  '87-89',
  '90',
  '91-96',
  '97-99',
  '100',
  '101-106',
  '107-109',
  '110',
  '111-116',
  '117-119',
  '120+'
];

const TAB_TO_CAT = {
  Nahkampfwaffen: 'Nahkampf',
  Fernkampfwaffen: 'Fernkampf',
  Zauberfehler: 'Zauber',
  Manöver: 'Manöver'
};

function rowsInOrder(rows) {
  const byCat = { Nahkampfwaffen: [], Fernkampfwaffen: [], Zauberfehler: [], Manöver: [] };
  for (const row of rows) {
    if (byCat[row.tabelle]) byCat[row.tabelle].push(row);
  }
  return byCat;
}

function main() {
  const patzer = JSON.parse(fs.readFileSync(PATZER_PATH, 'utf8'));
  if (!Array.isArray(patzer)) {
    console.error('patzer_tables.json muss ein Array sein.');
    process.exit(1);
  }

  const missing = patzer.filter((r) => typeof r.visual !== 'string' || !r.visual.trim());
  if (missing.length > 0) {
    console.error(
      `${missing.length} Einträge ohne "visual". Zuerst: npm run minify-patzer`
    );
    process.exit(1);
  }

  const byCat = rowsInOrder(patzer);
  const modifiersOut = {};

  for (const [tab, cat] of Object.entries(TAB_TO_CAT)) {
    const list = byCat[tab];
    if (!list || list.length < PATZER_MAIN_KEYS.length) {
      console.error(
        `Zu wenige Zeilen für ${tab}: ${list?.length ?? 0}, mindestens ${PATZER_MAIN_KEYS.length} nötig.`
      );
      process.exit(1);
    }

    const mainRows = list.slice(0, PATZER_MAIN_KEYS.length);
    const modRows = list.slice(PATZER_MAIN_KEYS.length);

    modifiersOut[cat] = modRows.map((r) => ({
      wuerfelwurf: r.wuerfelwurf,
      tts: r.tts_text,
      visual: r.visual
    }));
  }

  fs.writeFileSync(MODIFIERS_OUT, JSON.stringify(modifiersOut, null, 2), 'utf8');
  console.log(`Modifikator-Zeilen: ${MODIFIERS_OUT}`);

  const tables = JSON.parse(fs.readFileSync(TABLES_PATH, 'utf8'));
  if (!tables['Allgemeine Patzer'] || typeof tables['Allgemeine Patzer'] !== 'object') {
    tables['Allgemeine Patzer'] = { audioFile: 'patzer.mp3' };
    console.warn('Hinweis: "Allgemeine Patzer" fehlte — Block wurde neu angelegt.');
  }
  const block = tables['Allgemeine Patzer'];

  for (const cat of Object.values(TAB_TO_CAT)) {
    if (!block[cat] || typeof block[cat] !== 'object') {
      block[cat] = {};
      console.warn(`Hinweis: Kategorie "${cat}" fehlte — wurde neu angelegt.`);
    }
  }

  for (const [tab, cat] of Object.entries(TAB_TO_CAT)) {
    const list = byCat[tab];
    const mainRows = list.slice(0, PATZER_MAIN_KEYS.length);

    for (let i = 0; i < PATZER_MAIN_KEYS.length; i++) {
      const key = PATZER_MAIN_KEYS[i];
      const row = mainRows[i];
      block[cat][key] = {
        tts: row.tts_text,
        visual: row.visual,
        needs_review: false
      };
    }
  }

  if (!block.audioFile) block.audioFile = 'patzer.mp3';

  fs.writeFileSync(TABLES_PATH, JSON.stringify(tables, null, 2), 'utf8');
  console.log(`Allgemeine Patzer aktualisiert: ${TABLES_PATH}`);
  console.log(
    `(${PATZER_MAIN_KEYS.length} Bereiche × ${Object.keys(TAB_TO_CAT).length} Kategorien)`
  );
}

main();
