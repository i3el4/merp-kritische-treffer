#!/usr/bin/env node
/**
 * Übernimmt assets/data/english_to_german_tables.json (flaches Array) nach
 * assets/data/tables_processed.json als verschachtelte Krit-Struktur.
 *
 * Tabellen-Schlüssel: "Englisch_" + dateiname-sicherer Name (wie generate_audio_elevenlabs.js).
 * Schreibt scripts/.english_zusatz_table_keys.json für npm run minify-visual-english.
 *
 * Usage: node scripts/merge_english_german_into_tables.js
 */

const fs = require('fs');
const path = require('path');

const SOURCE = path.join(__dirname, '../assets/data/english_to_german_tables.json');
const TABLES = path.join(__dirname, '../assets/data/tables_processed.json');
const KEYS_OUT = path.join(__dirname, '.english_zusatz_table_keys.json');

/** Gleiche Logik wie generate_audio_elevenlabs.js / audio.js für konsistente MP3-Dateinamen */
function sanitizeTypForAudio(typ) {
  let s = String(typ).trim();
  s = s.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
  s = s.replace(/\s+/g, '_');
  return s.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('_');
}

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

function toTableKey(germanTitle) {
  return `Englisch_${sanitizeTypForAudio(germanTitle)}`;
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
