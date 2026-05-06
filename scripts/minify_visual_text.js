#!/usr/bin/env node
/**
 * Minifiziert die "visual" Texte in tables_processed.json via Gemini API.
 * Standard: tables_final.json. Mit MINIFY_ENGLISH_ZUSATZ_ONLY=1 nur Keys aus
 * merge_english_german_into_tables.js → Schreibt tables_processed.json.
 *
 * Für Allgemeine Patzer (patzer_tables.json → Allgemeine Patzer) dieselbe Crunch-Logik:
 * scripts/minify_patzer_visual.js, danach scripts/merge_patzer_into_tables_processed.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../private/.env') });
require('dotenv').config(); // Fallback: .env im Projektroot
const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const INPUT_PATH = path.join(__dirname, '../assets/data/tables_processed.json');
const KEYLIST_PATH = path.join(__dirname, '.english_zusatz_table_keys.json');

/** Wenn gesetzt: nur Tabellen aus .english_zusatz_table_keys.json, Ausgabe direkt in tables_processed.json */
const ENGLISH_ZUSATZ_ONLY = process.env.MINIFY_ENGLISH_ZUSATZ_ONLY === '1';
/** Standard: nur fehlende/leer visual neu minifizieren. Mit FORCE_MINIFY_ALL=1 alles neu. */
const FORCE_MINIFY_ALL = process.env.FORCE_MINIFY_ALL === '1';

function resolveOutputPath() {
  if (!ENGLISH_ZUSATZ_ONLY) {
    return path.join(__dirname, '../assets/data/tables_final.json');
  }
  if (fs.existsSync(KEYLIST_PATH)) {
    try {
      const list = JSON.parse(fs.readFileSync(KEYLIST_PATH, 'utf8'));
      if (Array.isArray(list) && list.length > 0) return INPUT_PATH;
    } catch (_) { /* ignore */ }
  }
  console.error('MINIFY_ENGLISH_ZUSATZ_ONLY=1 erfordert scripts/.english_zusatz_table_keys.json (nach merge).');
  process.exit(1);
}

const OUTPUT_PATH = ENGLISH_ZUSATZ_ONLY ? resolveOutputPath() : path.join(__dirname, '../assets/data/tables_final.json');

const SYSTEM_PROMPT = `Du bist ein strenger Regel-Analyst für ein deutsches Tabletop-Rollenspiel. Deine einzige Aufgabe ist es, aus längeren Vorlesetexten ALLEIN die harten Spielmechaniken (Crunch) zu extrahieren und extrem abzukürzen.
Regeln:
1. LÖSCHE jeglichen Fluff und erzählerischen Text (z.B. 'Der Treffer verdreht das Knie', 'Das ist dein Glück', 'Guter Schlag').
2. BEHALTE besondere Statusänderungen bei (z.B. 'Gegenstand fallengelassen', 'K.O.', 'Niedergeschlagen', 'Arm unbrauchbar').
3. Verwende ZWINGEND folgende Abkürzungen:
   - '[Zahl] Treffer' -> '+[Zahl]T'
   - '[Zahl] Runden benommen' -> '[Zahl] Rd ben'
   - 'keine Parade möglich' / 'kann nicht parieren' -> 'oPar'
   - KOMBINIERT: '[Zahl] Runden benommen und keine Parade' -> '[Zahl] Rd benoPar'
   - '[Zahl] Treffer pro Runde' -> '+[Zahl] T/Rd'
   - 'Plus [Zahl] auf Angriff/Würfe' -> '+[Zahl]'
   - 'Minus [Zahl] auf Aktionen/Würfe' -> '-[Zahl]'
4. Formatiere das Ergebnis als extrem kompakte Liste, getrennt durch Punkte oder Kommas.

Beispiel 1:
Input: 'Der Gegner hebt seinen Arm, um deinen Angriff zu blocken. Dabei verletzt er sich selbst. Das ist dein Glück. Er erleidet sechs Treffer und ist eine Runde lang benommen. Du erhältst plus fünf auf deinen nächsten Angriff.'
Output: '+6T. 1 Rd ben. +5 auf nächsten Angriff.'

Beispiel 2:
Input: 'Der Treffer verdreht das Knie. Plus zehn Treffer. Das Opfer ist zwei Runden benommen, und keine Parade ist möglich. Es erleidet ein Minus von vierzig auf alle weiteren Aktionen.'
Output: '+10T. 2 Rd benoPar. -40 auf alle weiteren Aktionen.'`;

const RESPONSE_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Der Wertebereich, z.B. 1-5 oder 61-65' },
      visual_text: { type: 'string', description: 'Der extrem gekürzte Crunch-Text' }
    },
    required: ['id', 'visual_text']
  }
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const PAUSE_BETWEEN_CALLS_MS = 500;
const MAX_ENTRIES_PER_CALL = 15;
const MAX_RETRIES = 5;
const RATE_LIMIT_WAIT_MS = 5000;

/**
 * Sendet einen Batch an Gemini und gibt das Array mit id + visual_text zurück.
 */
async function minifyBatchWithGemini(ai, entries) {
  const payload = JSON.stringify(entries.map((e) => ({ id: e.id, tts: e.tts })));
  const userPrompt = `Extrahiere aus folgenden Vorlesetexten NUR die Spielmechaniken (Crunch) und kürze extrem. Gib ein JSON-Array mit id und visual_text zurück.\n\n${payload}`;

  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: userPrompt,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          responseMimeType: 'application/json',
          responseJsonSchema: RESPONSE_SCHEMA,
          maxOutputTokens: 8192,
          thinkingConfig: { thinkingBudget: 0 }
        }
      });

      const text = response.text?.trim();
      if (!text) throw new Error('Leere Antwort von Gemini');

      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        parsed = JSON.parse(jsonMatch ? jsonMatch[1].trim() : text);
      }

      if (!Array.isArray(parsed)) {
        throw new Error('Gemini hat kein Array zurückgegeben: ' + text.slice(0, 200));
      }

      return parsed;
    } catch (err) {
      attempt++;
      const status = err.status ?? err.statusCode;
      const isRetryable = status === 429 || status === 503 || status === 500 ||
        /RESOURCE_EXHAUSTED|quota|rate limit/i.test(String(err.message ?? ''));

      if (!isRetryable || attempt >= MAX_RETRIES) throw err;

      console.warn(`  ⚠ API-Fehler ${status}, erneuter Versuch in 5s (${attempt}/${MAX_RETRIES})`);
      await sleep(RATE_LIMIT_WAIT_MS);
    }
  }
}

/**
 * Sammelt alle Einträge in Batches (max. MAX_ENTRIES_PER_CALL pro Batch).
 * @param {string[] | null} onlyTableNames nur diese Top-Level-Tabellen (null = alle)
 */
function collectBatches(data, onlyTableNames) {
  const batches = [];
  let skippedExisting = 0;
  for (const [tableName, tableData] of Object.entries(data)) {
    if (onlyTableNames && onlyTableNames.length && !onlyTableNames.includes(tableName)) continue;
    if (typeof tableData !== 'object' || tableData === null) continue;
    for (const [catKey, catData] of Object.entries(tableData)) {
      if (catKey === 'audioFile' || typeof catData !== 'object' || catData === null) continue;
      const entries = [];
      for (const [id, entry] of Object.entries(catData)) {
        if (entry && typeof entry.tts === 'string') {
          const hasVisual = typeof entry.visual === 'string' && entry.visual.trim().length > 0;
          if (!FORCE_MINIFY_ALL && hasVisual) {
            skippedExisting += 1;
            continue;
          }
          entries.push({ tableName, catKey, id, tts: entry.tts });
        }
      }
      for (let i = 0; i < entries.length; i += MAX_ENTRIES_PER_CALL) {
        batches.push({ tableName, catKey, entries: entries.slice(i, i + MAX_ENTRIES_PER_CALL) });
      }
    }
  }
  return { batches, skippedExisting };
}

function saveOutput(output) {
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf8');
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY fehlt in .env');
    process.exit(1);
  }

  let onlyTableNames = null;
  if (ENGLISH_ZUSATZ_ONLY) {
    if (!fs.existsSync(KEYLIST_PATH)) {
      console.error(`Schlüsselliste fehlt: ${KEYLIST_PATH} (zuerst: npm run merge-english-tables)`);
      process.exit(1);
    }
    onlyTableNames = JSON.parse(fs.readFileSync(KEYLIST_PATH, 'utf8'));
    if (!Array.isArray(onlyTableNames) || onlyTableNames.length === 0) {
      console.error('Schlüsselliste leer.');
      process.exit(1);
    }
    console.log(`Modus: nur Englisch-Zusatz-Tabellen (${onlyTableNames.length}): ${onlyTableNames.join(', ')}\n`);
  }

  const raw = fs.readFileSync(INPUT_PATH, 'utf8');
  const data = JSON.parse(raw);
  const output = JSON.parse(JSON.stringify(data));

  const ai = new GoogleGenAI({ apiKey });
  const { batches, skippedExisting } = collectBatches(data, onlyTableNames);
  console.log(`Modus: ${FORCE_MINIFY_ALL ? 'alles neu minifizieren' : 'nur fehlende visual-Einträge'}\n`);
  if (!FORCE_MINIFY_ALL) {
    console.log(`Übersprungen (bereits visual vorhanden): ${skippedExisting}`);
  }
  if (batches.length === 0) {
    console.log('Keine offenen Einträge zu minifizieren. Nichts zu tun.');
    return;
  }
  let processed = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const { tableName, catKey, entries } = batch;

    const batchNum = i + 1;
    console.log(`[${batchNum}/${batches.length}] ${tableName} / ${catKey} (${entries.length} Einträge)`);

    let results;
    try {
      results = await minifyBatchWithGemini(ai, entries);
    } catch (err) {
      console.error(`Fehler bei ${tableName}/${catKey}:`, err.message);
      throw err;
    }

    for (const r of results) {
      if (output[tableName]?.[catKey]?.[r.id]) {
        output[tableName][catKey][r.id].visual = (r.visual_text ?? '').trim();
        processed++;
      }
    }

    saveOutput(output);
    await sleep(PAUSE_BETWEEN_CALLS_MS);
  }

  console.log(`\nFertig. ${processed} Einträge minifiziert.`);
  console.log(`Gespeichert: ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
