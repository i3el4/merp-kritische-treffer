#!/usr/bin/env node
/**
 * Bereinigt RPG-Tabellendaten mit der Gemini API.
 * Liest tables_processed.json, sendet Texte an Gemini zur Korrektur,
 * wendet Visual-Regeln an und speichert tables_clean.json.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../private/.env') });
require('dotenv').config(); // Fallback: .env im Projektroot
const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const INPUT_PATH = path.join(__dirname, '../assets/data/tables_processed.json');
const OUTPUT_PATH = path.join(__dirname, '../assets/data/tables_clean.json');
const ENGLISH_TABLE_PREFIX = 'Englisch_';

const SYSTEM_PROMPT = `Du bist ein Lektor für ein deutsches Fantasy-Rollenspiel (Rolemaster). Deine Aufgabe ist es, fehlerhafte OCR-Texte von kritischen Treffern in perfekt lesbaren Vorlesetext (TTS) zu übersetzen.
Regeln:
1. Korrigiere alle Grammatik- und Rechtschreibfehler.
2. Formuliere ALLE Zahlen, Abkürzungen und Symbole in sauberen Fließtext um.
   - '2 Rd benopar' -> 'Zwei Runden benommen und keine Parade möglich.'
   - '1 T/Rd' -> 'Ein Treffer pro Runde.'
   - '+20T' -> 'Plus zwanzig Treffer.'
   - '+15' (am Ende) -> 'Plus fünfzehn auf den nächsten Angriff.'
   - '1,5m' -> 'Eineinhalb Meter.'
3. Achte auf logischen Satzbau. Mache aus Stichworten sinnvolle, kurze Sätze.
4. Setze 'needs_review' auf true, falls der Originaltext völlig unleserlich ist oder du raten musstest, was gemeint ist.`;

const RESPONSE_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Der Wertebereich, z.B. 61-65' },
      tts_text: { type: 'string', description: 'Der korrigierte, ausformulierte Vorlesetext' },
      needs_review: { type: 'boolean', description: 'True, wenn der Originaltext extrem zweideutig, unlogisch oder stark fehlerhaft war' }
    },
    required: ['id', 'tts_text', 'needs_review']
  }
};

// --- Zahlwörter zu Ziffern (für Visual) ---
const ZAHLWOERTER = {
  'null': '0', 'eins': '1', 'ein': '1', 'einen': '1', 'eine': '1', 'einer': '1',
  'zwei': '2', 'drei': '3', 'vier': '4', 'fünf': '5', 'sechs': '6', 'sieben': '7',
  'acht': '8', 'neun': '9', 'zehn': '10', 'elf': '11', 'zwölf': '12', 'dreizehn': '13',
  'vierzehn': '14', 'fünfzehn': '15', 'sechzehn': '16', 'siebzehn': '17', 'achtzehn': '18',
  'neunzehn': '19', 'zwanzig': '20', 'dreißig': '30', 'vierzig': '40', 'fünfzig': '50',
  'sechzig': '60', 'siebzig': '70', 'achtzig': '80', 'neunzig': '90', 'hundert': '100',
  'fünfundzwanzig': '25', 'fünfundneunzig': '95', 'fünfundachtzig': '85',
  'neunundneunzig': '99', 'einhundert': '100', 'eineinhalb': '1,5', 'anderthalb': '1,5'
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  return {
    all: argv.includes('--all')
  };
}

const PAUSE_BETWEEN_CALLS_MS = 500;
const RATE_LIMIT_WAIT_MS = 5000;
const MAX_RETRIES = 5;
const MAX_ENTRIES_PER_CALL = 10;

/**
 * Wendet die Visual-Regeln auf den bereinigten TTS-Text an.
 */
function generateVisual(ttsText) {
  let v = ttsText;

  // A. Zahlen-Normalisierung: Zahlwörter -> Ziffern
  const zahlRegex = new RegExp(
    '\\b(' + Object.keys(ZAHLWOERTER).join('|') + ')\\b',
    'gi'
  );
  v = v.replace(zahlRegex, (match) => ZAHLWOERTER[match.toLowerCase()] ?? match);

  // B. Treffer-Formatierung (VOR den Kürzeln, damit "Treffer pro Runde" nicht betroffen)
  // "Null Treffer" -> "0T"
  v = v.replace(/\b0\s+Treffer\b/gi, '0T');
  v = v.replace(/\bNull\s+Treffer\b/gi, '0T');
  // "(Zahl) Treffer pro Runde" -> "+$1 T/Rd"
  v = v.replace(/(\d+)\s+Treffer\s+pro\s+Runde\b/gi, '+$1 T/Rd');
  // "(Zahl) Treffer" -> "+(Zahl)T" (nicht "Treffer pro Runde")
  v = v.replace(/(\d+)\s+Treffer\b/gi, '+$1T');
  v = v.replace(/Plus\s+(\d+)\s+Treffer\b/gi, '+$1T');

  // C. Kürzel (Case-Insensitive)
  v = v.replace(/(\d+)\s+Treffer\/Runde\b/gi, '+$1 T/Rd');
  v = v.replace(/\bTreffer\s+pro\s+Runde\b/gi, 'T/Rd');
  v = v.replace(/\bTreffer\/Runde\b/gi, 'T/Rd');
  v = v.replace(/(\d+)\s+Runde(n?)\s+benommen\b/gi, '$1 Rd ben');
  v = v.replace(/\bRunde(n?)\s+benommen\b/gi, 'Rd ben');
  v = v.replace(/(\d+)\s+Runde(n?)\s+(muss|muß)\s+pariert\s+werden\b/gi, '$1 Rd par');
  v = v.replace(/\bRunde(n?)\s+(muss|muß)\s+pariert\s+werden\b/gi, 'Rd par');
  v = v.replace(/\b(muss|muß)\s+pariert\s+werden\b/gi, 'par');
  v = v.replace(/\bkann\s+(eine|einer?|\d+)\s+Runde(n?)\s+nicht\s+parieren\b/gi, (_, num) => {
    const n = ZAHLWOERTER[String(num).toLowerCase()] ?? num;
    return n + ' Rd oPar';
  });
  v = v.replace(/\bkann\s+nicht\s+parieren\b/gi, 'oPar');
  v = v.replace(/\bkeine\s+Parade\s+möglich\b/gi, 'oPar');
  v = v.replace(/\bohne\s+Parade\b/gi, 'oPar');
  v = v.replace(/\bkeine\s+Parade\b/gi, 'oPar');
  v = v.replace(/\bInitiativeverlust\b/gi, 'Ini-Malus');
  v = v.replace(/\bPlus\s+(\d+)\b/gi, '+$1');
  v = v.replace(/\bMinus\s+(\d+)\s+auf\s+Kampfwürfe\b/gi, '-$1');
  v = v.replace(/\bMinus\s+(\d+)\s+auf\s+alle\s+Handlungen\b/gi, '-$1');
  v = v.replace(/\b(bewusstlos|bewußtlos)\b/gi, 'K.O.');
  v = v.replace(/\bProzent\b/gi, '%');
  v = v.replace(/\bein\s+Monat\b/gi, '1 Monat');

  // "Runde" -> "Rd" (allgemein, wo es Sinn macht)
  v = v.replace(/\b(\d+)\s+Runde(n?)\b/gi, '$1 Rd');
  v = v.replace(/\bRunde(n?)\b/gi, 'Rd');

  return v;
}

/**
 * Sendet einen Batch von Texten an Gemini und gibt das bereinigte Array zurück.
 * Bei 429 (Rate Limit) / 503 / 500: Wartet 5s und versucht erneut (max. 5 Retries).
 */
async function cleanBatchWithGemini(ai, entries) {
  const payload = JSON.stringify(entries.map(e => ({ id: e.id, text: e.text })));
  const userPrompt = `Bereinige folgende OCR-Texte. Gib ein JSON-Array mit id, tts_text und needs_review zurück.\n\n${payload}`;

  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: userPrompt,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          responseMimeType: 'application/json',
          responseJsonSchema: RESPONSE_SCHEMA
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
      const isQuotaExceeded = status === 429 || /RESOURCE_EXHAUSTED|quota|rate limit/i.test(String(err.message ?? ''));
      const isRetryable = isQuotaExceeded || status === 503 || status === 500;

      if (!isRetryable || attempt >= MAX_RETRIES) throw err;

      if (isQuotaExceeded) {
        console.warn('  ⚠ Rate Limit erreicht. Pausiere für 5 Sekunden...');
      } else {
        console.warn(`  ⚠ API-Fehler ${status}, erneuter Versuch in 5s (${attempt}/${MAX_RETRIES})`);
      }
      await sleep(RATE_LIMIT_WAIT_MS);
    }
  }
}

/**
 * Sammelt alle Einträge pro Tabelle/Kategorie und gibt Batches zurück.
 * Jeder Batch enthält maximal MAX_ENTRIES_PER_CALL Einträge (z.B. 10).
 */
function collectBatches(data, options = {}) {
  const { all = false } = options;
  const batches = [];
  for (const [tableName, tableData] of Object.entries(data)) {
    if (!all && !String(tableName).startsWith(ENGLISH_TABLE_PREFIX)) continue;
    if (typeof tableData !== 'object' || tableData === null) continue;
    for (const [catKey, catData] of Object.entries(tableData)) {
      if (catKey === 'audioFile' || typeof catData !== 'object' || catData === null) continue;
      const entries = [];
      for (const [id, entry] of Object.entries(catData)) {
        if (entry && typeof entry.tts === 'string') {
          entries.push({ tableName, catKey, id, text: entry.tts });
        }
      }
      for (let i = 0; i < entries.length; i += MAX_ENTRIES_PER_CALL) {
        const chunk = entries.slice(i, i + MAX_ENTRIES_PER_CALL);
        batches.push({ tableName, catKey, entries: chunk });
      }
    }
  }
  return batches;
}

function saveOutput(output) {
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf8');
}

function isBatchComplete(output, tableName, catKey, entries) {
  const cat = output[tableName]?.[catKey];
  if (!cat || typeof cat !== 'object') return false;
  return entries.every((e) => cat[e.id]);
}

async function main() {
  const { all } = parseArgs(process.argv.slice(2));
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY fehlt in .env');
    process.exit(1);
  }

  const raw = fs.readFileSync(INPUT_PATH, 'utf8');
  const data = JSON.parse(raw);

  let output = {};
  if (fs.existsSync(OUTPUT_PATH)) {
    output = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'));
    console.log(`Fortsetzung: ${OUTPUT_PATH} geladen.\n`);
  }

  const ai = new GoogleGenAI({ apiKey });
  const batches = collectBatches(data, { all });
  const modeLabel = all ? 'alle Tabellen' : `nur Tabellen mit Prefix "${ENGLISH_TABLE_PREFIX}"`;
  console.log(`Bereinigungsmodus: ${modeLabel}\n`);

  if (!batches.length) {
    console.log('Keine passenden Tabellen/Batches gefunden. Nichts zu tun.');
    return;
  }

  for (const batch of batches) {
    const { tableName, catKey, entries } = batch;

    if (isBatchComplete(output, tableName, catKey, entries)) {
      console.log(`Überspringe (bereits vorhanden): ${tableName} / ${catKey}`);
      continue;
    }

    console.log(`Verarbeite: ${tableName} / ${catKey} (${entries.length} Einträge)`);

    let results;
    try {
      results = await cleanBatchWithGemini(ai, entries);
    } catch (err) {
      console.error(`Fehler bei ${tableName}/${catKey}:`, err.message);
      throw err;
    }

    if (!output[tableName]) {
      output[tableName] = { ...(data[tableName].audioFile && { audioFile: data[tableName].audioFile }) };
    }
    if (!output[tableName][catKey]) output[tableName][catKey] = {};

    for (const r of results) {
      const tts = r.tts_text ?? '';
      const visual = generateVisual(tts);
      output[tableName][catKey][r.id] = { tts, visual, needs_review: !!r.needs_review };
    }

    saveOutput(output);
    console.log(`  → Gespeichert.`);

    await sleep(PAUSE_BETWEEN_CALLS_MS);
  }

  const needsReviewList = [];
  for (const [tableName, tableData] of Object.entries(output)) {
    if (typeof tableData !== 'object') continue;
    for (const [catKey, catData] of Object.entries(tableData)) {
      if (catKey === 'audioFile' || typeof catData !== 'object') continue;
      for (const [id, entry] of Object.entries(catData)) {
        if (entry?.needs_review) needsReviewList.push({ table: tableName, id });
      }
    }
  }

  console.log(`\nFertig. Ausgabe: ${OUTPUT_PATH}`);

  if (needsReviewList.length > 0) {
    console.log('\n--- Einträge mit needs_review: true ---');
    console.log(JSON.stringify(needsReviewList, null, 2));
  } else {
    console.log('\nKeine Einträge mit needs_review: true.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
