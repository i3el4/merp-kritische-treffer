#!/usr/bin/env node
/**
 * Setzt kanonische Patzer-Würfelbereiche (siehe merge_patzer_into_tables_processed.js).
 * - patzer_tables.json: wuerfelwurf der ersten 19 Zeilen pro Spalte
 * - tables_processed.json: Schlüssel unter "Allgemeine Patzer" (Migration alter Namen)
 */

const fs = require('fs');
const path = require('path');

const PATZER_PATH = path.join(__dirname, '../assets/data/patzer_tables.json');
const TABLES_PATH = path.join(__dirname, '../assets/data/tables_processed.json');

/** Muss mit merge_patzer_into_tables_processed.js übereinstimmen. */
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

/** Vorherige JSON-Schlüssel → kanonische Schlüssel (gleicher Inhalt, korrigierter Bereich). */
const LEGACY_TO_CANONICAL = {
  '-100-5': '-100-5',
  '5-20': '6-20',
  '21-35': '21-35',
  '36-50': '36-50',
  '51-60': '51-65',
  '61-79': '66-79',
  '80-80': '80',
  '81-86': '81-86',
  '87-89': '87-89',
  '90-90': '90',
  '91-96': '91-96',
  '97-99': '97-99',
  '100-100': '100',
  '101-106': '101-106',
  '107-109': '107-109',
  '110-110': '110',
  '111-116': '111-116',
  '117-119': '117-119',
  '120-999': '120+'
};

function normalizePatzerTables() {
  const rows = JSON.parse(fs.readFileSync(PATZER_PATH, 'utf8'));
  if (!Array.isArray(rows)) throw new Error('patzer_tables.json muss ein Array sein');

  const byCat = {
    Nahkampfwaffen: [],
    Fernkampfwaffen: [],
    Zauberfehler: [],
    Manöver: []
  };
  for (const row of rows) {
    if (byCat[row.tabelle]) byCat[row.tabelle].push(row);
  }

  for (const list of Object.values(byCat)) {
    for (let i = 0; i < PATZER_MAIN_KEYS.length && i < list.length; i++) {
      list[i].wuerfelwurf = PATZER_MAIN_KEYS[i];
    }
  }

  fs.writeFileSync(PATZER_PATH, JSON.stringify(rows, null, 2), 'utf8');
  console.log(`Aktualisiert: ${PATZER_PATH} (wuerfelwurf, je ${PATZER_MAIN_KEYS.length} Hauptzeilen)`);
}

function migrateTablesProcessedPatzer() {
  const tables = JSON.parse(fs.readFileSync(TABLES_PATH, 'utf8'));
  const block = tables['Allgemeine Patzer'];
  if (!block || typeof block !== 'object') {
    console.warn('Kein Block "Allgemeine Patzer" — übersprungen.');
    return;
  }

  const cats = ['Nahkampf', 'Fernkampf', 'Zauber', 'Manöver'];
  for (const cat of cats) {
    const obj = block[cat];
    if (!obj || typeof obj !== 'object') continue;

    const renamed = {};
    for (const [oldKey, entry] of Object.entries(obj)) {
      const newKey = LEGACY_TO_CANONICAL[oldKey] ?? oldKey;
      renamed[newKey] = entry;
    }

    const ordered = {};
    for (const key of PATZER_MAIN_KEYS) {
      if (renamed[key] !== undefined) ordered[key] = renamed[key];
    }
    for (const [k, v] of Object.entries(renamed)) {
      if (!PATZER_MAIN_KEYS.includes(k)) ordered[k] = v;
    }
    block[cat] = ordered;
  }

  fs.writeFileSync(TABLES_PATH, JSON.stringify(tables, null, 2), 'utf8');
  console.log(`Aktualisiert: ${TABLES_PATH} (Schlüssel Allgemeine Patzer)`);
}

function main() {
  normalizePatzerTables();
  migrateTablesProcessedPatzer();
}

main();
