#!/usr/bin/env node
/**
 * Validiert, ob fuer alle Krit-Eintraege (mit tts) eine MP3 im
 * kanonischen Layout existiert.
 *
 * Usage:
 *   node tools/audio/validate_audio_index.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const TABLES_PATH = path.join(ROOT, 'assets/data/tables_processed.json');
const AUDIO_BASE = path.join(ROOT, 'assets/audio');

async function main() {
  const { buildCritAudioRelativePath } = await import(path.join(ROOT, 'scripts/audioNaming.mjs'));
  const tables = JSON.parse(fs.readFileSync(TABLES_PATH, 'utf8'));

  let expected = 0;
  const missing = [];
  for (const [tableKey, tableObj] of Object.entries(tables)) {
    if (!tableObj || typeof tableObj !== 'object') continue;
    for (const [kat, katObj] of Object.entries(tableObj)) {
      if (kat === 'audioFile' || !katObj || typeof katObj !== 'object') continue;
      for (const [range, entry] of Object.entries(katObj)) {
        if (!entry || typeof entry !== 'object') continue;
        const tts = String(entry.tts ?? '').trim();
        if (!tts) continue;
        const relPath = buildCritAudioRelativePath(tableKey, kat, range);
        if (!relPath) continue;
        expected++;
        const absPath = path.join(AUDIO_BASE, relPath);
        if (!fs.existsSync(absPath)) {
          missing.push({ tableKey, kat, range, relPath });
        }
      }
    }
  }

  console.log(`Expected audio files: ${expected}`);
  console.log(`Missing audio files: ${missing.length}`);
  if (missing.length) {
    console.log('\nMissing sample:');
    missing.slice(0, 100).forEach((m) => {
      console.log(` - ${m.relPath}  (${m.tableKey} / ${m.kat} / ${m.range})`);
    });
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

