#!/usr/bin/env node
/**
 * Übernimmt assets/data/_pipeline/english_to_german_tables.json (flaches Array) nach
 * assets/data/tables_processed.json als verschachtelte Krit-Struktur.
 *
 * Tabellen-Schlüssel: kanonische, sprachneutrale Namen (deutsch).
 * Schreibt tools/tables/.english_zusatz_table_keys.json für npm run minify-visual-english.
 *
 * Usage: node tools/tables/merge_english_german_into_tables.js
 */

const fs = require('fs');
const path = require('path');

const SOURCE = path.join(__dirname, '../../assets/data/_pipeline/english_to_german_tables.json');
const TABLES = path.join(__dirname, '../../assets/data/tables_processed.json');
const KEYS_OUT = path.join(__dirname, '.english_zusatz_table_keys.json');

const CANONICAL_EN_TABLE_KEYS = {
  UNBALANCING: 'Ungleichgewicht',
  TINY_ANIMAL: 'Kleine_Tiere',
  SWEEPS_THROWS: 'Feger_Und_Wuerfe',
  STRIKING: 'Schlaege',
  GRAPPLING: 'Greifen_Ringkampf'
};

function sanitizeRangeForFile(rangeKey) {
  let s = String(rangeKey).trim();
  s = s.replace(/[–—]/g, '-').replace(/\s+/g, '');
  if (s.endsWith('+')) {
    const num = parseInt(s.slice(0, -1), 10);
    return Number.isNaN(num) ? s : `${num}+`;
  }
  if (s.includes('-')) {
    const [a, b] = s.split('-');
    const nz = (x) => String(parseInt(x, 10) || '0');
    return `${nz(a)}-${nz(b)}`;
  }
  s = s.replace(/[≤≥]/g, '');
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? s : String(n);
}

function normalizeForMatch(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[–—]/g, '-')
    .replace(/[_:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toTableKey(germanTitle) {
  const t = normalizeForMatch(germanTitle);
  if (t.includes('aus dem gleichgewicht') || t.includes('ungleichgewicht') || t.includes('ausbalancier')) {
    return CANONICAL_EN_TABLE_KEYS.UNBALANCING;
  }
  if (t.includes('winzige tier') || t.includes('kleine tiere') || t.includes('tiny animal')) {
    return CANONICAL_EN_TABLE_KEYS.TINY_ANIMAL;
  }
  if (t.includes('feger') || t.includes('wuerfe') || t.includes('wurfe') || t.includes('sweeps') || t.includes('throws')) {
    return CANONICAL_EN_TABLE_KEYS.SWEEPS_THROWS;
  }
  if (
    t.includes('kampfsport schlaege') ||
    t.includes('kampfsport schlage') ||
    t.includes('kampfsport-schlaege') ||
    t.includes('kampfsport-schlage') ||
    t.includes('kampfkuenste schlag') ||
    t.includes('kampfkunste schlag') ||
    t.includes('striking')
  ) {
    return CANONICAL_EN_TABLE_KEYS.STRIKING;
  }
  if (t.includes('greifen') || t.includes('ringkampf') || t.includes('ringen') || t.includes('grappling')) {
    return CANONICAL_EN_TABLE_KEYS.GRAPPLING;
  }
  return '';
}

function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error(`Nicht gefunden: ${SOURCE}`);
    process.exit(1);
  }
  const rows = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));
  if (!Array.isArray(rows)) {
    console.error('english_to_german_tables.json muss ein Array sein.');
    process.exit(1);
  }

  const tables = JSON.parse(fs.readFileSync(TABLES, 'utf8'));
  const newKeys = new Set();

  for (const row of rows) {
    const tabelle = row.tabelle;
    const kat = String(row.kategorie || '').trim().toUpperCase();
    const rawRange = row.wuerfelwurf;
    const tts = row.tts_text;
    if (!tabelle || !['A', 'B', 'C', 'D', 'E'].includes(kat) || rawRange == null || tts == null) continue;

    const tableKey = toTableKey(tabelle);
    if (!tableKey) continue;
    newKeys.add(tableKey);

    if (!tables[tableKey]) {
      tables[tableKey] = {
        audioFile: 'stich.mp3',
        A: {},
        B: {},
        C: {},
        D: {},
        E: {}
      };
    }

    const rangeKey = sanitizeRangeForFile(rawRange);
    if (!tables[tableKey][kat]) tables[tableKey][kat] = {};

    tables[tableKey][kat][rangeKey] = {
      tts: String(tts).trim(),
      visual: '',
      needs_review: false
    };
  }

  fs.writeFileSync(TABLES, JSON.stringify(tables, null, 2), 'utf8');
  const keyList = [...newKeys].sort();
  fs.writeFileSync(KEYS_OUT, JSON.stringify(keyList, null, 2), 'utf8');

  console.log(`Aktualisiert: ${TABLES}`);
  console.log(`Neue/aktualisierte Tabellen-Keys (${keyList.length}): ${keyList.join(', ')}`);
  console.log(`Schlüsselliste für Minify: ${KEYS_OUT}`);
  console.log('\nNächste Schritte:');
  console.log('  npm run minify-visual-english   # visual via Gemini');
  console.log('  npm run generate-audio            # MP3 via ElevenLabs');
}

main();
