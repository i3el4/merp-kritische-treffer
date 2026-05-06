#!/usr/bin/env node
/**
 * EN-Zusatz-Krit: verschieben oder kopieren (nicht löschen).
 * Siehe scripts/constants.js ENGLISH_SUPPLEMENT_CANONICAL_KEY — MP3-Namen:
 * Englisch_Kampfkunst_Feger_Und_Wuerfe_Kritische_Treffertabelle_<KAT>_<bereich>.mp3
 *
 * Commands:
 *   archive [--dry-run]
 *     Verschiebt krit/Englisch_*.mp3 ohne dieses Präfix nach krit/_archive_englisch_non_canonical/<datum>/
 *   hydrate --from DIR [--dry-run]
 *     Rekursive Suche: kopiert passende Dateien auf den kanonischen Namen (existierende Ziele bleiben).
 *   report
 *     Erwartete MP3 laut tables_processed vs Dateisystem.
 */

const fs = require('fs');
const path = require('path');

const CANON = 'Englisch_Kampfkunst_Feger_Und_Wuerfe_Kritische_Treffertabelle';
const CRIT_DIR = path.join(__dirname, '../assets/audio/krit');
const TABLES = path.join(__dirname, '../assets/data/tables_processed.json');
const SUFFIX_RE = /^(.+)_([A-E])_(.+)\.mp3$/i;

function isCanonBase(b) {
  return b.startsWith(CANON + '_') && /\.mp3$/i.test(b);
}

function mkdir(p) { fs.mkdirSync(p, { recursive: true }); }

function archiveNonCanonical(dry) {
  const destRoot = path.join(CRIT_DIR, '_archive_englisch_non_canonical', new Date().toISOString().slice(0, 10));
  let n = 0;
  if (!fs.existsSync(CRIT_DIR)) return console.log('Kein Verzeichnis:', CRIT_DIR);
  for (const name of fs.readdirSync(CRIT_DIR)) {
    if (name.startsWith('_archive') || name.startsWith('.')) continue;
    if (!/^Englisch_/i.test(name) || !name.endsWith('.mp3')) continue;
    if (isCanonBase(name)) continue;
    const src = path.join(CRIT_DIR, name);
    if (!fs.statSync(src).isFile()) continue;
    mkdir(destRoot);
    const dst = path.join(destRoot, name);
    if (dry) console.log('[dry-run] mv', src, '->', dst);
    else fs.renameSync(src, dst);
    n++;
  }
  console.log((dry ? 'Dry-run ' : '') + n + ' MP3(s) -> ' + destRoot);
}

function walkMp3(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walkMp3(full, acc);
    else if (/\.mp3$/i.test(name)) acc.push(full);
  }
  return acc;
}

function hydrate(from, dry) {
  const files = walkMp3(path.resolve(from)).filter((p) => /^Englisch_/i.test(path.basename(p)));
  let ok = 0, skip = 0, bad = 0;
  mkdir(CRIT_DIR);
  for (const src of files.sort()) {
    const m = path.basename(src).match(SUFFIX_RE);
    if (!m) { bad++; continue; }
    const kat = m[2];
    const rangeRaw = m[3];
    const dst = path.join(CRIT_DIR, `${CANON}_${kat}_${rangeRaw}.mp3`);
    if (fs.existsSync(dst)) { skip++; continue; }
    if (dry) console.log('[dry-run] cp', src, '->', dst);
    else fs.copyFileSync(src, dst);
    ok++;
  }
  console.log(`${dry ? 'Dry-run ' : ''}hydrate: ${ok} kopiert, ${skip} vorhanden, ${bad} unparsbar.`);
}

function report() {
  const tables = JSON.parse(fs.readFileSync(TABLES, 'utf8'));
  const tab = tables[CANON];
  if (!tab) throw new Error('Keine Tabelle ' + CANON);
  const expected = [];
  for (const cat of ['A', 'B', 'C', 'D', 'E']) {
    for (const range of Object.keys(tab[cat] || {}).sort())
      expected.push(`${CANON}_${cat}_${range}.mp3`);
  }
  const missing = expected.filter((b) => !fs.existsSync(path.join(CRIT_DIR, b)));
  console.log('Erwartet:', expected.length, '| vorhanden:', expected.length - missing.length, '| fehlend:', missing.length);
  if (missing.length) console.log(missing.slice(0, 45).join('\n') + (missing.length > 45 ? '\n…' : ''));
}

function usage() {
  console.error(
    'Usage:\n' +
      '  node scripts/englisch_krit_audio_tool.js archive [--dry-run]\n' +
      '  node scripts/englisch_krit_audio_tool.js hydrate --from <DIR> [--dry-run]\n' +
      '  node scripts/englisch_krit_audio_tool.js report'
  );
}

function main() {
  const argv = process.argv.slice(2);
  const dry = argv.includes('--dry-run');
  const cmd = argv[0];
  if (cmd === 'archive') return archiveNonCanonical(dry);
  if (cmd === 'hydrate') {
    const i = argv.indexOf('--from');
    if (i < 0 || !argv[i + 1]) return usage(), process.exit(1);
    return hydrate(argv[i + 1], dry);
  }
  if (cmd === 'report') return report();
  usage();
  process.exit(1);
}

main();
