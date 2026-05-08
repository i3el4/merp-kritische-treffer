#!/usr/bin/env node
/**
 * Erzeugt kompakte "visual"-Texte aus _pipeline/patzer_tables.json (tts_text) — gleiche Crunch-Regeln
 * wie tools/tables/minify_visual_text.js (System-Prompt bewusst synchron halten).
 *
 * Schreibt assets/data/_pipeline/patzer_tables.json um (Feld "visual" pro Eintrag).
 * Anschließend: npm run merge-patzer
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../private/.env') });
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const INPUT_OUTPUT_PATH = path.join(__dirname, '../../assets/data/_pipeline/patzer_tables.json');

/** Gleiche Regeln wie minify_visual_text.js — bei Änderungen dort hier nachziehen. */
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
      id: {
        type: 'string',
        description: 'Eindeutiger Schlüssel im Format "Tabelle|wuerfelwurf", z.B. "Nahkampfwaffen|21-35"'
      },
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

function rowId(row) {
  return `${row.tabelle}|${row.wuerfelwurf}`;
}

async function minifyBatchWithGemini(ai, entries) {
  const payload = JSON.stringify(
    entries.map((e) => ({ id: e.id, tts: e.tts }))
  );
  const userPrompt = `Extrahiere aus folgenden Vorlesetexten NUR die Spielmechaniken (Crunch) und kürze extrem. Gib ein JSON-Array mit id und visual_text zurück. Das Feld id muss exakt so bleiben wie im Input.\n\n${payload}`;

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
      const isRetryable =
        status === 429 ||
        status === 503 ||
        status === 500 ||
        /RESOURCE_EXHAUSTED|quota|rate limit/i.test(String(err.message ?? ''));

      if (!isRetryable || attempt >= MAX_RETRIES) throw err;

      console.warn(`  ⚠ API-Fehler ${status}, erneuter Versuch in 5s (${attempt}/${MAX_RETRIES})`);
      await sleep(RATE_LIMIT_WAIT_MS);
    }
  }
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY fehlt in .env');
    process.exit(1);
  }

  const raw = fs.readFileSync(INPUT_OUTPUT_PATH, 'utf8');
  const rows = JSON.parse(raw);
  if (!Array.isArray(rows)) {
    console.error('patzer_tables.json muss ein Array sein.');
    process.exit(1);
  }

  const toProcess = rows
    .map((row, index) => ({
      index,
      id: rowId(row),
      tts: row.tts_text,
      hasVisual: typeof row.visual === 'string' && row.visual.length > 0
    }))
    .filter((e) => !e.hasVisual);

  if (toProcess.length === 0) {
    console.log('Alle Einträge haben bereits "visual". Nichts zu tun.');
    return;
  }

  const ai = new GoogleGenAI({ apiKey });
  const byId = new Map(rows.map((r, i) => [rowId(r), i]));

  for (let i = 0; i < toProcess.length; i += MAX_ENTRIES_PER_CALL) {
    const chunk = toProcess.slice(i, i + MAX_ENTRIES_PER_CALL);
    const batchNum = Math.floor(i / MAX_ENTRIES_PER_CALL) + 1;
    const totalBatches = Math.ceil(toProcess.length / MAX_ENTRIES_PER_CALL);
    console.log(`[${batchNum}/${totalBatches}] ${chunk.length} Einträge …`);

    const results = await minifyBatchWithGemini(
      ai,
      chunk.map((c) => ({ id: c.id, tts: c.tts }))
    );

    for (const r of results) {
      const idx = byId.get(r.id);
      if (idx === undefined) {
        console.warn(`  Unbekannte id in Antwort: ${r.id}`);
        continue;
      }
      rows[idx].visual = (r.visual_text ?? '').trim();
    }

    fs.writeFileSync(INPUT_OUTPUT_PATH, JSON.stringify(rows, null, 2), 'utf8');
    await sleep(PAUSE_BETWEEN_CALLS_MS);
  }

  console.log(`\nFertig. ${toProcess.length} visual-Felder gesetzt.`);
  console.log(`Gespeichert: ${INPUT_OUTPUT_PATH}`);
  console.log('Als Nächstes: npm run merge-patzer');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
