#!/usr/bin/env node
/**
 * Importiert semikolon-getrennte Angriffstabellen-CSV aus:
 *  - import/ (Priorität)
 *  - assets/templates/
 * und merged sie in assets/data/treffer_tabellen_strukturiert.json,
 * ohne bestehende Tabellen zu löschen.
 *
 * Zusätzlich:
 *  - verarbeitet "Maximum Results ..." als Sub-Tabellen (z.B. BEISSEN_SMALL)
 *  - setzt fehlende krit_typ auf Default pro Tabelle
 *  - führt Monotonie-/OCR-Bereinigung für importierte (Sub-)Tabellen durch
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const JSON_PATH = path.join(ROOT, 'assets', 'data', 'treffer_tabellen_strukturiert.json');
const SOURCE_DIRS = [
  path.join(ROOT, 'import'),
  path.join(ROOT, 'assets', 'templates'),
];

// Dateiname (lowercase) -> Ziel-Key + Default-Krit-Typ
const TABLE_CONFIG = {
  'sweeps.csv': { key: 'FEGEN', defaultCrit: 'MS' },
  'fegen.csv': { key: 'FEGEN', defaultCrit: 'MS' },
  'striking.csv': { key: 'SCHLAGEN', defaultCrit: 'MA' },
  'schlagen.csv': { key: 'SCHLAGEN', defaultCrit: 'MA' },
  'grapple.csv': { key: 'GREIFEN', defaultCrit: 'G' },
  'greifen.csv': { key: 'GREIFEN', defaultCrit: 'G' },
  'tiny_animal.csv': { key: 'KLEINTIERE', defaultCrit: 'TA' },
  'kleintiere.csv': { key: 'KLEINTIERE', defaultCrit: 'TA' },
  'unbalancing.csv': { key: 'UNBALANCING', defaultCrit: 'U' },
  'bite.csv': { key: 'BEISSEN', defaultCrit: 'P' },
  'beissen.csv': { key: 'BEISSEN', defaultCrit: 'P' },
  'claw.csv': { key: 'KRATZEN', defaultCrit: 'S' },
  'kratzen.csv': { key: 'KRATZEN', defaultCrit: 'S' },
  'horn.csv': { key: 'HORN', defaultCrit: 'P' },
  'ram.csv': { key: 'RAMMEN', defaultCrit: 'K' },
  'rammen.csv': { key: 'RAMMEN', defaultCrit: 'K' },
  'stinger.csv': { key: 'PIEKSEN', defaultCrit: 'P' },
  'pieksen.csv': { key: 'PIEKSEN', defaultCrit: 'P' },
  'fall.csv': { key: 'QUETSCHEN', defaultCrit: 'K' },
  'quetschen.csv': { key: 'QUETSCHEN', defaultCrit: 'K' },
  'stechen.csv': { key: 'STECHEN', defaultCrit: 'P' },
  'trampel.csv': { key: 'TRAMPEL', defaultCrit: 'K' },
};

const RANK_SEVERITY = { A: 1, B: 2, C: 3, D: 4, E: 5 };
const SEVERITY_TO_KAT = { 1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'E' };

function parseArgs() {
  const dryRun = process.argv.includes('--dry-run');
  return { dryRun };
}

function parseCsvLine(line) {
  // CSVs hier sind semikolon-separiert und ohne komplexe Escapes.
  return String(line).split(';').map((s) => s.trim());
}

function readCsvRows(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  return raw
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .map(parseCsvLine);
}

function expandAttackRange(value) {
  const s = String(value || '').trim();
  const m = s.match(/^(\d+)\s*-\s*(\d+)$/);
  if (m) {
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const out = [];
    for (let i = lo; i <= hi; i += 1) out.push(i);
    return out;
  }
  if (/^\d+$/.test(s)) return [parseInt(s, 10)];
  return [];
}

function normalizeSubCategory(text) {
  // "Maximum Results for Small Attacks" -> "_SMALL"
  // "Maximum Results for Rank 1" -> "_RANK1"
  // "Normal Maximum Results for an Attack" -> "_NORMAL"
  const s = String(text).toUpperCase();
  if (s.includes('NORMAL MAXIMUM RESULTS')) return '_NORMAL';
  if (s.includes('THREE OR MORE CONSECUTIVE')) return '_RANK3';
  if (s.includes('TWO CONSECUTIVE')) return '_RANK2';
  if (s.includes('ROUND AFTER A CRITICAL RESULT')) return '_RANK1';
  const rank = s.match(/RANK\s*([0-9]+)/);
  if (rank) return `_RANK${rank[1]}`;
  if (s.includes('SMALL')) return '_SMALL';
  if (s.includes('MEDIUM')) return '_MEDIUM';
  if (s.includes('LARGE')) return '_LARGE';
  if (s.includes('HUGE')) return '_HUGE';
  return '';
}

function parseCell(cell, defaultCrit) {
  const raw = String(cell ?? '').trim();
  if (!raw) return null;
  if (/^F$/i.test(raw)) {
    return { trefferpunkte: 0, krit_typ: null, krit_kat: null, fumble: true };
  }
  if (/^0$/.test(raw)) {
    return { trefferpunkte: 0, krit_typ: null, krit_kat: null };
  }
  const m = raw.match(/^(\d+)([A-E])?([A-Z]{1,2})?$/i);
  if (!m) return null;
  const trefferpunkte = parseInt(m[1], 10);
  const krit_kat = m[2] ? m[2].toUpperCase() : null;
  const krit_typ = m[3] ? m[3].toUpperCase() : (krit_kat ? defaultCrit : null);
  return { trefferpunkte, krit_kat, krit_typ };
}

function ensureTable(data, key) {
  if (!data.Angriffstabellen[key]) data.Angriffstabellen[key] = { RK: {} };
  if (!data.Angriffstabellen[key].RK) data.Angriffstabellen[key].RK = {};
  return data.Angriffstabellen[key];
}

function parseCsvIntoTables(filePath, config) {
  const rows = readCsvRows(filePath);
  if (!rows.length) return { tables: {}, stats: { rowsParsed: 0 } };

  const header = rows[0];
  const rkColumns = [];
  header.forEach((h, idx) => {
    if (/^\d+$/.test(String(h))) {
      const rk = parseInt(h, 10);
      if (rk >= 1 && rk <= 20) rkColumns.push({ idx, rk: String(rk) });
    }
  });
  rkColumns.sort((a, b) => Number(b.rk) - Number(a.rk));

  const out = {};
  let currentSubCategory = '';
  let rowsParsed = 0;

  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r];
    const first = String(row[0] || '').trim();
    if (!first) continue;

    if (/maximum\s+results/i.test(first)) {
      currentSubCategory = normalizeSubCategory(first);
      continue;
    }

    const attacks = expandAttackRange(first);
    if (!attacks.length) continue;
    rowsParsed += 1;

    const tableKey = `${config.key}${currentSubCategory}`;
    if (!out[tableKey]) out[tableKey] = { defaultCrit: config.defaultCrit, RK: {} };

    for (const { idx, rk } of rkColumns) {
      if (!out[tableKey].RK[rk]) out[tableKey].RK[rk] = {};
      const cellParsed = parseCell(row[idx], config.defaultCrit);
      if (!cellParsed) continue;
      for (const attack of attacks) {
        out[tableKey].RK[rk][String(attack)] = cellParsed;
      }
    }
  }

  return { tables: out, stats: { rowsParsed } };
}

function severityOf(kat) {
  if (!kat) return 0;
  return RANK_SEVERITY[kat] || 0;
}

function sanitizeCritType(entry, defaultCrit, counters) {
  if (!entry || entry.fumble) return;
  if (entry.krit_kat == null && entry.trefferpunkte === 0) {
    entry.krit_typ = null;
    return;
  }

  const raw = entry.krit_typ == null ? '' : String(entry.krit_typ).trim().toUpperCase();
  const invalid = !/^[A-Z]{1,2}$/.test(raw);
  if (invalid || !raw) {
    entry.krit_typ = defaultCrit;
    counters.typeFixed += 1;
  } else {
    entry.krit_typ = raw;
  }
}

function applyMonotonicFixesToTable(tableObj, defaultCrit, counters) {
  if (!tableObj?.RK || typeof tableObj.RK !== 'object') return;
  const rkKeys = Object.keys(tableObj.RK).sort((a, b) => Number(b) - Number(a));

  for (const rk of rkKeys) {
    const byAttack = tableObj.RK[rk];
    const attackKeys = Object.keys(byAttack).sort((a, b) => Number(b) - Number(a));
    let prevTp = null;
    let prevSeverity = null;

    for (const a of attackKeys) {
      const entry = byAttack[a];
      if (!entry || typeof entry !== 'object') continue;

      sanitizeCritType(entry, defaultCrit, counters);

      if (typeof entry.trefferpunkte === 'number') {
        if (prevTp !== null && entry.trefferpunkte > prevTp) {
          entry.trefferpunkte = prevTp;
          counters.tpFixed += 1;
        }
        prevTp = entry.trefferpunkte;
      }

      const sev = severityOf(entry.krit_kat);
      if (prevSeverity !== null && sev > prevSeverity) {
        entry.krit_kat = prevSeverity > 0 ? SEVERITY_TO_KAT[prevSeverity] : null;
        counters.katFixed += 1;
      }
      prevSeverity = severityOf(entry.krit_kat);
    }
  }
}

function collectCsvCandidates() {
  // Priorität: import/ vor assets/templates/
  const byBaseName = new Map();
  for (const dir of SOURCE_DIRS) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.csv'));
    for (const f of files) {
      const lower = f.toLowerCase();
      if (!TABLE_CONFIG[lower]) continue;
      if (!byBaseName.has(lower)) byBaseName.set(lower, path.join(dir, f));
    }
  }
  return [...byBaseName.entries()].map(([name, filePath]) => ({ name, filePath, config: TABLE_CONFIG[name] }));
}

function main() {
  const { dryRun } = parseArgs();
  if (!fs.existsSync(JSON_PATH)) {
    console.error(`JSON nicht gefunden: ${JSON_PATH}`);
    process.exit(1);
  }

  const jsonRaw = fs.readFileSync(JSON_PATH, 'utf8');
  const data = JSON.parse(jsonRaw);
  if (!data.Angriffstabellen) data.Angriffstabellen = {};

  const candidates = collectCsvCandidates();
  if (!candidates.length) {
    console.log('Keine passenden CSV-Dateien gefunden.');
    return;
  }

  const stats = {
    filesProcessed: 0,
    baseTables: new Set(),
    subTables: new Set(),
    rowsParsed: 0,
    tpFixed: 0,
    katFixed: 0,
    typeFixed: 0,
  };

  const importedTableDefaults = new Map(); // tableKey -> defaultCrit

  for (const c of candidates) {
    const { tables, stats: s } = parseCsvIntoTables(c.filePath, c.config);
    stats.filesProcessed += 1;
    stats.rowsParsed += s.rowsParsed;

    for (const [tableKey, payload] of Object.entries(tables)) {
      const table = ensureTable(data, tableKey);
      importedTableDefaults.set(tableKey, payload.defaultCrit);

      if (tableKey.includes('_')) stats.subTables.add(tableKey);
      else stats.baseTables.add(tableKey);

      for (const [rk, attacks] of Object.entries(payload.RK)) {
        if (!table.RK[rk]) table.RK[rk] = {};
        for (const [attack, entry] of Object.entries(attacks)) {
          table.RK[rk][attack] = entry;
        }
      }
    }
  }

  for (const [tableKey, defaultCrit] of importedTableDefaults.entries()) {
    const table = data.Angriffstabellen[tableKey];
    applyMonotonicFixesToTable(table, defaultCrit, stats);
  }

  if (!dryRun) {
    fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2), 'utf8');
  }

  console.log('\nImport abgeschlossen');
  console.log(`Dry-run: ${dryRun ? 'ja' : 'nein'}`);
  console.log(`Verarbeitete CSV-Dateien: ${stats.filesProcessed}`);
  console.log(`Importierte Basis-Tabellen: ${stats.baseTables.size}`);
  console.log(`Importierte Sub-Tabellen: ${stats.subTables.size}`);
  console.log(`Verarbeitete Datenzeilen: ${stats.rowsParsed}`);
  console.log(`Monotonie-Korrekturen TP: ${stats.tpFixed}`);
  console.log(`Monotonie-Korrekturen Krit-Kat: ${stats.katFixed}`);
  console.log(`OCR/Typ-Korrekturen: ${stats.typeFixed}`);
  if (stats.baseTables.size) {
    console.log(`Basis-Keys: ${[...stats.baseTables].sort().join(', ')}`);
  }
  if (stats.subTables.size) {
    console.log(`Sub-Keys: ${[...stats.subTables].sort().join(', ')}`);
  }
}

main();
