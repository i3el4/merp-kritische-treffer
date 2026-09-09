#!/usr/bin/env node
/**
 * Liest assets/source/englische_tabellen.pdf, sendet es an Gemini (gemini-2.5-flash)
 * mit Structured Output und speichert die übersetzten/extrahierten Zeilen als
 * assets/data/_pipeline/english_to_german_tables.json.
 *
 * Große PDFs: ein einzelner JSON-Array-Antwort läuft oft in MAX_TOKENS (~25k+ sichtbare Tokens).
 * Daher: (1) Tabellennamen listen, (2) je Tabelle × Spalte A–E ein eigener Request.
 *
 * Voraussetzung: GEMINI_API_KEY in private/.env oder .env.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../private/.env') });
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const PDF_PATH = path.join(__dirname, '../../assets/source/englische_tabellen.pdf');
const OUTPUT_PATH = path.join(__dirname, '../../assets/data/_pipeline/english_to_german_tables.json');
/** Bei JSON.parse-Fehler: Rohantwort zur Analyse */
const RAW_RESPONSE_DUMP = path.join(__dirname, '../../assets/data/_pipeline/english_to_german_tables.response-raw.txt');

const INLINE_MAX_BYTES = 512 * 1024;

/** Lange Extraktion / viele Chunks (AbortError bei zu kurzem Limit). Env: GEMINI_HTTP_TIMEOUT_MS */
const HTTP_TIMEOUT_MS = parseInt(process.env.GEMINI_HTTP_TIMEOUT_MS || '', 10) || 60 * 60 * 1000;

const GENERATE_MAX_ATTEMPTS = 5;
const GENERATE_RETRY_BASE_MS = 2500;

/** Pause zwischen Chunk-Requests (429/Last schonen). */
const CHUNK_PAUSE_MS = 400;

const MAX_OUTPUT_TOKENS = 65536;

const KATEGORIEN = ['A', 'B', 'C', 'D', 'E'];

const SYSTEM_PROMPT = `Du bist ein Übersetzer und Regel-Experte für das Rollenspiel MERS / Rolemaster. Im Anhang ist ein englisches PDF mit kritischen Treffertabellen. Die Tabellen haben Zeilen (Würfelwürfe wie 01-05) und Spalten (A, B, C, D, E).
Aufgaben:
1. Lies die Tabelle visuell Zeile für Zeile und Spalte für Spalte aus (löse den horizontalen Wortsalat auf).
2. Korrigiere offensichtliche englische OCR-Fehler (z.B. 'mi11111ive' -> 'initiative').
3. ÜBERSETZE die Texte direkt in sauberes Deutsch. 
   Nutze ZWINGEND diese Fachbegriffe:
   - 'hits' -> 'Treffer'
   - 'stunned' -> 'benommen'
   - 'parry' / 'must parry' -> 'muss pariert werden' / 'kann nicht parieren'
   - 'initiative' -> 'Initiative'
   - 'round' / 'md' -> 'Runde'
4. Schreibe alle Zahlen und Symbole als deutschen Fließtext aus ('+2 hits' -> 'Plus zwei Treffer', '-20' -> 'Minus zwanzig').
5. Ordne jeden Text dem richtigen Würfelwurf und der richtigen Spalte (A-E) zu.
6. Die Ausgabe ist gültiges JSON: In tts_text und anderen Strings dürfen keine unmaskierten doppelten Anführungszeichen vorkommen — verwende \\" oder formuliere ohne ".`;

const SYSTEM_PROMPT_LIST = `Du bist ein Experte für MERP/MERS und Rolemaster-kritische Treffertabellen. Im Anhang ist ein englisches PDF.`;

const USER_PROMPT_LIST =
  'Identifiziere alle Namen der kritischen Treffertabellen in diesem PDF (so wie sie im Dokument als Tabellentitel vorkommen, z.B. Slash, Puncture). Ein Eintrag pro Tabelle, ohne Duplikate, Reihenfolge von oben nach unten wie im PDF. Antwort nur als JSON gemäß Schema.';

const RESPONSE_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      tabelle: {
        type: 'string',
        description:
          "Der Name der Tabelle, z.B. 'Slash', 'Puncture', auf Deutsch übersetzt z.B. 'Hieb', 'Stich'"
      },
      kategorie: {
        type: 'string',
        enum: ['A', 'B', 'C', 'D', 'E'],
        description: "Nur 'A', 'B', 'C', 'D' oder 'E'"
      },
      wuerfelwurf: {
        type: 'string',
        description: "z.B. '01-05', '66', '100'"
      },
      tts_text: {
        type: 'string',
        description: 'Der übersetzte, flüssige deutsche Vorlesetext'
      }
    },
    required: ['tabelle', 'kategorie', 'wuerfelwurf', 'tts_text']
  }
};

const TABLE_LIST_SCHEMA = {
  type: 'object',
  properties: {
    tabellen: {
      type: 'array',
      items: { type: 'string' },
      description: 'Alle Tabellentitel aus dem PDF'
    }
  },
  required: ['tabellen']
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableNetworkError(err) {
  if (!err) return false;
  if (err.name === 'AbortError') return true;
  const code = err.code || err.cause?.code;
  if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'EPIPE' || code === 'ECONNABORTED') return true;
  const msg = String(err.message || err);
  if (/fetch failed/i.test(msg)) return true;
  const status = err.status ?? err.cause?.status;
  if (status === 429 || status === 503 || status === 502) return true;
  return false;
}

async function generateContentWithRetry(ai, params) {
  let lastErr;
  for (let attempt = 1; attempt <= GENERATE_MAX_ATTEMPTS; attempt++) {
    try {
      return await ai.models.generateContent(params);
    } catch (e) {
      lastErr = e;
      const retry = isRetryableNetworkError(e) && attempt < GENERATE_MAX_ATTEMPTS;
      const detail = e?.cause?.code || e?.message || e;
      if (!retry) throw e;
      const wait = GENERATE_RETRY_BASE_MS * 2 ** (attempt - 1);
      console.warn(
        `generateContent Versuch ${attempt}/${GENERATE_MAX_ATTEMPTS} fehlgeschlagen (${detail}), erneut in ${Math.round(wait / 1000)} s …`
      );
      await sleep(wait);
    }
  }
  throw lastErr;
}

function parseJsonArrayOrThrow(text, response) {
  const trimmed = text.trim();
  const finishReason = response?.candidates?.[0]?.finishReason;
  const meta = response?.usageMetadata;

  const attempts = [trimmed];
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) attempts.push(fence[1].trim());

  let lastErr;
  for (const s of attempts) {
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed;
      throw new Error('Top-Level ist kein JSON-Array.');
    } catch (e) {
      lastErr = e;
    }
  }

  fs.writeFileSync(RAW_RESPONSE_DUMP, trimmed, 'utf8');
  const frStr = finishReason != null ? String(finishReason) : '';
  const hint = frStr.includes('MAX_TOKENS')
    ? ' finishReason=MAX_TOKENS — Antwort wurde am Token-Limit abgeschnitten.'
    : frStr
      ? ` finishReason=${frStr}.`
      : '';
  const usageHint = meta ? ` (outputTokenCount≈${meta.candidatesTokenCount ?? '?'})` : '';
  throw new Error(
    `JSON.parse fehlgeschlagen:${hint}${usageHint} Rohantwort unter ${RAW_RESPONSE_DUMP} gespeichert. ` +
      `Letzter Fehler: ${lastErr?.message || lastErr}`
  );
}

function parseJsonObjectOrThrow(text, response) {
  const trimmed = text.trim();
  const finishReason = response?.candidates?.[0]?.finishReason;
  const meta = response?.usageMetadata;

  const attempts = [trimmed];
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) attempts.push(fence[1].trim());

  let lastErr;
  for (const s of attempts) {
    try {
      const parsed = JSON.parse(s);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
      throw new Error('Top-Level ist kein JSON-Objekt.');
    } catch (e) {
      lastErr = e;
    }
  }

  fs.writeFileSync(RAW_RESPONSE_DUMP, trimmed, 'utf8');
  const frStr = finishReason != null ? String(finishReason) : '';
  const hint = frStr.includes('MAX_TOKENS') ? ' finishReason=MAX_TOKENS.' : frStr ? ` finishReason=${frStr}.` : '';
  const usageHint = meta ? ` (outputTokenCount≈${meta.candidatesTokenCount ?? '?'})` : '';
  throw new Error(
    `JSON.parse (Objekt) fehlgeschlagen:${hint}${usageHint} Rohantwort unter ${RAW_RESPONSE_DUMP} gespeichert. ` +
      `Letzter Fehler: ${lastErr?.message || lastErr}`
  );
}

async function waitForFileActive(ai, fileName, maxWaitMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const f = await ai.files.get({ name: fileName });
    if (f.state === 'ACTIVE') return f;
    if (f.state === 'FAILED') {
      throw new Error(`Datei-Upload fehlgeschlagen: ${fileName} (${JSON.stringify(f.error)})`);
    }
    await sleep(2000);
  }
  throw new Error(`Timeout: Datei ${fileName} wurde nicht ACTIVE.`);
}

/**
 * Einmalig PDF einbinden (Inline oder File API), dann nur noch Text pro Request tauschen.
 * @returns {Promise<{ makeParts: (userText: string) => object[], uploadedFile?: object }>}
 */
async function preparePdfParts(ai, pdfBuffer) {
  const base64 = pdfBuffer.toString('base64');

  if (pdfBuffer.length <= INLINE_MAX_BYTES) {
    console.log(`PDF-Übertragung: Inline-Base64 (≤ ${INLINE_MAX_BYTES} Bytes)`);
    return {
      makeParts: (userText) => [
        { inlineData: { mimeType: 'application/pdf', data: base64 } },
        { text: userText }
      ],
      uploadedFile: null
    };
  }

  console.log(`PDF-Übertragung: File API (>${INLINE_MAX_BYTES} Bytes, stabiler bei großen Dateien)`);
  const tmpPath = path.join(__dirname, '.englisch_upload_tmp.pdf');
  fs.writeFileSync(tmpPath, pdfBuffer);
  try {
    const uploaded = await ai.files.upload({
      file: tmpPath,
      config: { mimeType: 'application/pdf', displayName: 'englische_tabellen.pdf' }
    });
    if (!uploaded.name) throw new Error('Upload ohne Dateiname');
    const ready = await waitForFileActive(ai, uploaded.name);
    const uri = ready.uri;
    if (!uri) throw new Error('Hochgeladene Datei ohne URI');
    return {
      makeParts: (userText) => [
        { fileData: { fileUri: uri, mimeType: 'application/pdf' } },
        { text: userText }
      ],
      uploadedFile: ready
    };
  } finally {
    try {
      fs.unlinkSync(tmpPath);
    } catch (_) {
      /* ignore */
    }
  }
}

const genConfigBase = {
  maxOutputTokens: MAX_OUTPUT_TOKENS,
  thinkingConfig: { thinkingBudget: 0 }
};

function chunkUserPrompt(tableTitleEn, kategorie, extraHint = '') {
  const hint = extraHint ? ` ${extraHint}` : '';
  return (
    `Extrahiere aus dem PDF ausschließlich die kritische Treffertabelle, deren Titel "${tableTitleEn}" entspricht (oder eindeutig diese Tabelle meint). ` +
    `Nur Spalte ${kategorie} (Kategorie ${kategorie}). Für jeden Würfelbereich/Zeile dieser Spalte genau ein Objekt im JSON-Array: ` +
    `tabelle = deutscher Name der Tabelle (Übersetzung des Titels), kategorie = "${kategorie}", wuerfelwurf, tts_text. ` +
    `Keine Einträge für andere Spalten. Keine Duplikate.${hint}`
  );
}

/** @param {string} half 'lower' | 'upper' */
function diceHalfHint(half) {
  if (half === 'lower') {
    return 'Nur Zeilen mit Würfelbereich/Wurf 01–50 (bzw. die erste Hälfte der Spalte von oben nach unten).';
  }
  return 'Nur Zeilen mit Würfelbereich/Wurf 51–100 (bzw. die zweite Hälfte der Spalte von oben nach unten).';
}

/**
 * Ein Spalten-Chunk; bei MAX_TOKENS / abgeschnittenem JSON zweimal mit Würfel-Hälften.
 */
async function extractColumnChunkOrSplit(ai, makeParts, tName, kat) {
  const run = async (extraHint) => {
    const resp = await generateContentWithRetry(ai, {
      model: 'gemini-2.5-flash',
      contents: makeParts(chunkUserPrompt(String(tName).trim(), kat, extraHint)),
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        responseJsonSchema: RESPONSE_SCHEMA,
        ...genConfigBase
      }
    });
    const text = resp.text?.trim();
    if (!text) return [];
    return parseJsonArrayOrThrow(text, resp);
  };

  try {
    return await run('');
  } catch (e) {
    const msg = String(e?.message || e);
    const split =
      /MAX_TOKENS|Unterminated string|JSON\.parse/i.test(msg) ||
      msg.includes('abgeschnitten');
    if (!split) throw e;
    console.warn(`  Antwort zu groß/kaputt — teile Spalte „${kat}“ für „${tName}“ in zwei Würfelbereiche …`);
    const lower = await run(diceHalfHint('lower'));
    const upper = await run(diceHalfHint('upper'));
    return [...lower, ...upper];
  }
}

async function extractEnglishTablesChunked(ai, pdfBuffer) {
  const { makeParts, uploadedFile } = await preparePdfParts(ai, pdfBuffer);

  try {
    console.log('Schritt 1/2: Tabellennamen ermitteln …');
    const listResp = await generateContentWithRetry(ai, {
      model: 'gemini-2.5-flash',
      contents: makeParts(USER_PROMPT_LIST),
      config: {
        systemInstruction: SYSTEM_PROMPT_LIST,
        responseMimeType: 'application/json',
        responseJsonSchema: TABLE_LIST_SCHEMA,
        ...genConfigBase
      }
    });

    const listText = listResp.text?.trim();
    if (!listText) throw new Error('Leere Antwort (Tabellenliste).');
    const listObj = parseJsonObjectOrThrow(listText, listResp);
    const tabellen = listObj.tabellen;
    if (!Array.isArray(tabellen) || tabellen.length === 0) {
      throw new Error('Keine Tabellennamen erkannt — Tabellenliste leer.');
    }
    console.log(`${tabellen.length} Tabelle(n): ${tabellen.join(', ')}`);

    const allRows = [];
    let chunkIndex = 0;
    const totalChunks = tabellen.length * KATEGORIEN.length;

    for (const tName of tabellen) {
      for (const kat of KATEGORIEN) {
        chunkIndex += 1;
        console.log(`Schritt 2/2: Chunk ${chunkIndex}/${totalChunks} — „${tName}“, Spalte ${kat} …`);

        const rows = await extractColumnChunkOrSplit(ai, makeParts, tName, kat);
        for (const row of rows) {
          if (row && typeof row === 'object') allRows.push(row);
        }

        if (chunkIndex < totalChunks) await sleep(CHUNK_PAUSE_MS);
      }
    }

    return allRows;
  } finally {
    if (uploadedFile?.name) {
      try {
        await ai.files.delete({ name: uploadedFile.name });
      } catch (_) {
        /* ignore */
      }
    }
  }
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY fehlt (private/.env oder .env im Projektroot).');
    process.exit(1);
  }

  if (!fs.existsSync(PDF_PATH)) {
    console.error(`PDF nicht gefunden: ${PDF_PATH}`);
    process.exit(1);
  }

  const pdfBuffer = fs.readFileSync(PDF_PATH);
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { timeout: HTTP_TIMEOUT_MS }
  });

  console.log(`PDF: ${PDF_PATH} (${pdfBuffer.length} Bytes)`);
  console.log(
    `Modus: chunked (Tabellenliste + je Tabelle×Spalte A–E); HTTP-Timeout ${Math.round(HTTP_TIMEOUT_MS / 60000)} min`
  );
  const rows = await extractEnglishTablesChunked(ai, pdfBuffer);

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(rows, null, 2), 'utf8');
  console.log(`Fertig: ${OUTPUT_PATH} (${rows.length} Einträge)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
