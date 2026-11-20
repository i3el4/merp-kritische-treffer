#!/usr/bin/env node
/**
 * Importiert Monster-Angriffstabellen aus assets/templates/ANGRIFFSTABELLEN_GEGNER.xlsx
 * in assets/data/treffer_tabellen_strukturiert.json → GegnerAngriffstabellen.
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const ROOT = path.join(__dirname, '../..');
const JSON_PATH = path.join(ROOT, 'assets', 'data', 'treffer_tabellen_strukturiert.json');
const DEFAULT_XLSX = path.join(ROOT, 'assets', 'templates', 'ANGRIFFSTABELLEN_GEGNER.xlsx');

const RUESTUNG_COLUMNS = ['PL', 'KE', 'VL', 'LE', 'OR'];

const SHEET_CONFIG = {
  '1HKW': { key: 'GEGNER_1HKW', defaultCrit: 'K', hasSize: false },
  '1HSW': { key: 'GEGNER_1HSW', defaultCrit: 'S', hasSize: false },
  '2HW': { key: 'GEGNER_2HW', defaultCrit: 'K', hasSize: false },
  'FKW': { key: 'GEGNER_FKW', defaultCrit: 'P', hasSize: false },
  'ZuK': { key: 'GEGNER_ZUK', defaultCrit: 'P', hasSize: true },
  'RuS': { key: 'GEGNER_RUS', defaultCrit: 'S', hasSize: true },
};

const RANK_SEVERITY = { A: 1, B: 2, C: 3, D: 4, E: 5 };
const SEVERITY_TO_KAT = { 1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'E' };

function parseArgs() {
  const dryRun = process.argv.includes('--dry-run');
  const fileArg = process.argv.find((a) => a.endsWith('.xlsx'));
  return { dryRun, xlsxPath: fileArg ? path.resolve(fileArg) : DEFAULT_XLSX };
}

function expandAttackRange(value) {
  const s = String(value || '').trim();
  const m = s.match(/^(\d+)\s*-\s*(\d+)$/);
  if (m) {
    const lo = Math.min(parseInt(m[1], 10), parseInt(m[2], 10));
    const hi = Math.max(parseInt(m[1], 10), parseInt(m[2], 10));
    const out = [];
    for (let i = lo; i <= hi; i += 1) out.push(i);
    return out;
  }
  if (/^\d+$/.test(s)) return [parseInt(s, 10)];
  return [];
}

function normalizeGegnerSizeSection(text) {
  const s = String(text).toUpperCase();
  if (s.includes('KLEINE ANGRIFFE')) return '_KLEIN';
  if (s.includes('MITTLERE ANGRIFFE')) return '_MITTEL';
  if (s.includes('GROSSE ANGRIFFE') || s.includes('GROßE ANGRIFFE')) return '_GROSS';
  if (s.includes('GEWALTIGE ANGRIFFE')) return '_GEWALTIG';
  return '';
}

function parseGegnerCell(cell, defaultCrit) {
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
  const letter2 = m[2] ? m[2].toUpperCase() : null;
  const letter3 = m[3] ? m[3].toUpperCase() : null;
  if (letter2 && !letter3) {
    return { trefferpunkte, krit_kat: letter2, krit_typ: defaultCrit };
  }
  if (letter3 && !letter2) {
    return { trefferpunkte, krit_kat: null, krit_typ: letter3 };
  }
  if (letter2 && letter3) {
    return { trefferpunkte, krit_kat: letter2, krit_typ: letter3 };
  }
  return { trefferpunkte, krit_kat: null, krit_typ: null };
}

function sheetToRows(ws) {
  const ref = ws['!ref'];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  const rows = [];
  for (let r = range.s.r; r <= range.e.r; r += 1) {
    const row = [];
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      row.push(cell != null && cell.v != null ? cell.v : '');
    }
    if (row.some((v) => String(v).trim() !== '')) rows.push(row);
  }
  return rows;
}

function parseSheetRows(rows, config) {
  if (!rows.length) return { tables: {}, stats: { rowsParsed: 0 } };

  const header = rows[0].map((h) => String(h).trim().toUpperCase());
  const ruestungCols = [];
  header.forEach((h, idx) => {
    if (RUESTUNG_COLUMNS.includes(h)) {
      ruestungCols.push({ idx, col: h });
    }
  });

  const out = {};
  let currentSuffix = '';
  let rowsParsed = 0;

  const ensureTable = (tableKey) => {
    if (!out[tableKey]) {
      out[tableKey] = { defaultCrit: config.defaultCrit, Ruestung: {} };
    }
    return out[tableKey];
  };

  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r];
    const first = String(row[0] ?? '').trim();
    if (!first) continue;

    if (/höchstergebnis/i.test(first)) {
      const suffix = normalizeGegnerSizeSection(first);
      if (suffix === '_GEWALTIG') {
        currentSuffix = suffix;
        continue;
      }
      currentSuffix = suffix || currentSuffix;
      continue;
    }

    const attacks = expandAttackRange(first);
    if (!attacks.length) continue;

    const tableKey = `${config.key}${currentSuffix}`;
    const table = ensureTable(tableKey);
    let rowHasData = false;

    for (const { idx, col } of ruestungCols) {
      const cellParsed = parseGegnerCell(row[idx], config.defaultCrit);
      if (!cellParsed) continue;
      if (!table.Ruestung[col]) table.Ruestung[col] = {};
      for (const attack of attacks) {
        table.Ruestung[col][String(attack)] = cellParsed;
        rowHasData = true;
      }
    }
    if (rowHasData) rowsParsed += 1;
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
    if (entry.krit_kat) {
      entry.krit_typ = defaultCrit;
      counters.typeFixed += 1;
    }
  } else {
    entry.krit_typ = raw;
  }
}

function applyMonotonicFixesToGegnerTable(tableObj, defaultCrit, counters) {
  if (!tableObj?.Ruestung || typeof tableObj.Ruestung !== 'object') return;

  for (const col of RUESTUNG_COLUMNS) {
    const byAttack = tableObj.Ruestung[col];
    if (!byAttack) continue;
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

function isEmptyTable(table) {
  if (!table?.Ruestung) return true;
  return RUESTUNG_COLUMNS.every((col) => {
    const block = table.Ruestung[col];
    return !block || Object.keys(block).length === 0;
  });
}

function main() {
  const { dryRun, xlsxPath } = parseArgs();
  if (!fs.existsSync(xlsxPath)) {
    console.error(`Excel nicht gefunden: ${xlsxPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(JSON_PATH)) {
    console.error(`JSON nicht gefunden: ${JSON_PATH}`);
    process.exit(1);
  }

  const wb = XLSX.readFile(xlsxPath);
  const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  if (!data.GegnerAngriffstabellen) data.GegnerAngriffstabellen = {};

  const stats = {
    sheetsProcessed: 0,
    tablesImported: 0,
    rowsParsed: 0,
    tpFixed: 0,
    katFixed: 0,
    typeFixed: 0,
    skippedEmpty: [],
  };

  const importedKeys = [];

  for (const sheetName of wb.SheetNames) {
    const config = SHEET_CONFIG[sheetName];
    if (!config) {
      console.warn(`Sheet "${sheetName}" übersprungen (kein SHEET_CONFIG).`);
      continue;
    }

    const rows = sheetToRows(wb.Sheets[sheetName]);
    const { tables, stats: s } = parseSheetRows(rows, config);
    stats.sheetsProcessed += 1;
    stats.rowsParsed += s.rowsParsed;

    for (const [tableKey, payload] of Object.entries(tables)) {
      if (isEmptyTable(payload)) {
        stats.skippedEmpty.push(tableKey);
        continue;
      }
      applyMonotonicFixesToGegnerTable(payload, payload.defaultCrit, stats);
      data.GegnerAngriffstabellen[tableKey] = {
        defaultCrit: payload.defaultCrit,
        Ruestung: payload.Ruestung,
      };
      importedKeys.push(tableKey);
      stats.tablesImported += 1;
    }
  }

  if (!dryRun) {
    fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2), 'utf8');
  }

  console.log('\nGegner-Import abgeschlossen');
  console.log(`Dry-run: ${dryRun ? 'ja' : 'nein'}`);
  console.log(`Excel: ${xlsxPath}`);
  console.log(`Sheets: ${stats.sheetsProcessed}`);
  console.log(`Tabellen: ${stats.tablesImported}`);
  console.log(`Zeilen: ${stats.rowsParsed}`);
  console.log(`Monotonie TP: ${stats.tpFixed}, Krit-Kat: ${stats.katFixed}, Typ: ${stats.typeFixed}`);
  if (importedKeys.length) console.log(`Keys: ${importedKeys.sort().join(', ')}`);
  if (stats.skippedEmpty.length) console.log(`Leer übersprungen: ${stats.skippedEmpty.join(', ')}`);
}

main();
