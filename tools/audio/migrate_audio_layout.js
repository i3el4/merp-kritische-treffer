#!/usr/bin/env node
/**
 * Migriert Krit-Audio-Dateien vom Legacy-Flat-Layout:
 *   assets/audio/krit/<Typ>_<Kat>_<Range>.mp3
 * zum kanonischen Layout:
 *   assets/audio/krit/<tableSlug>/<Kat>_<Range>.mp3
 *
 * Usage:
 *   node tools/audio/migrate_audio_layout.js --dry-run
 *   node tools/audio/migrate_audio_layout.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const TABLES_PATH = path.join(ROOT, 'assets/data/tables_processed.json');
const AUDIO_ROOT = path.join(ROOT, 'assets/audio/krit');
const DRY_RUN = process.argv.includes('--dry-run');

function walkMp3Files(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkMp3Files(full, out);
    else if (entry.isFile() && /\.mp3$/i.test(entry.name)) out.push(full);
  }
  return out;
}

async function main() {
  const naming = await import(path.join(ROOT, 'scripts/audioNaming.mjs'));
  const { buildCritAudioRelativePath, buildLegacyCritAudioFilename } = naming;

  const tables = JSON.parse(fs.readFileSync(TABLES_PATH, 'utf8'));
  const expected = new Map();
  for (const [tableKey, tableObj] of Object.entries(tables)) {
    if (!tableObj || typeof tableObj !== 'object') continue;
    for (const [kat, katObj] of Object.entries(tableObj)) {
      if (kat === 'audioFile' || !katObj || typeof katObj !== 'object') continue;
      for (const [range, entry] of Object.entries(katObj)) {
        if (!entry || typeof entry !== 'object') continue;
        const tts = String(entry.tts ?? '').trim();
        if (!tts) continue;
        const relNew = buildCritAudioRelativePath(tableKey, kat, range);
        const oldName = buildLegacyCritAudioFilename(tableKey, kat, range);
        if (!relNew || !oldName) continue;
        expected.set(relNew, { oldName, tableKey, kat, range });
      }
    }
  }

  const allMp3 = walkMp3Files(AUDIO_ROOT);
  const flatMp3 = allMp3.filter((f) => path.dirname(f) === AUDIO_ROOT);
  const report = {
    expected: expected.size,
    moved: 0,
    alreadyCanonical: 0,
    missingLegacySource: 0,
    conflicts: 0,
    orphanFlatFiles: [],
  };

  const usedFlatNames = new Set();
  for (const [relNew, info] of expected.entries()) {
    const oldPath = path.join(AUDIO_ROOT, info.oldName);
    const newPath = path.join(ROOT, 'assets/audio', relNew);
    if (fs.existsSync(newPath)) {
      report.alreadyCanonical++;
      continue;
    }
    if (!fs.existsSync(oldPath)) {
      report.missingLegacySource++;
      continue;
    }
    if (fs.existsSync(newPath) && oldPath !== newPath) {
      report.conflicts++;
      console.warn(`[CONFLICT] ${newPath} existiert bereits`);
      continue;
    }
    usedFlatNames.add(info.oldName);
    if (!DRY_RUN) fs.mkdirSync(path.dirname(newPath), { recursive: true });
    if (!DRY_RUN) fs.renameSync(oldPath, newPath);
    report.moved++;
  }

  for (const full of flatMp3) {
    const base = path.basename(full);
    if (!usedFlatNames.has(base)) report.orphanFlatFiles.push(base);
  }

  console.log(`Dry run: ${DRY_RUN ? 'yes' : 'no'}`);
  console.log(`Expected canonical files: ${report.expected}`);
  console.log(`Moved from flat -> canonical: ${report.moved}`);
  console.log(`Already canonical: ${report.alreadyCanonical}`);
  console.log(`Missing legacy source: ${report.missingLegacySource}`);
  console.log(`Conflicts: ${report.conflicts}`);
  console.log(`Orphan flat files: ${report.orphanFlatFiles.length}`);
  if (report.orphanFlatFiles.length > 0) {
    console.log('\nOrphan flat file sample:');
    report.orphanFlatFiles.slice(0, 50).forEach((n) => console.log(` - ${n}`));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

