#!/usr/bin/env node
/**
 * Liest assets/source/Krit_Patzer.pdf, sendet es an Gemini (gemini-2.5-flash)
 * und speichert die extrahierten Patzertabellen als assets/data/_pipeline/patzer_tables.json.
 *
 * Voraussetzung: GEMINI_API_KEY in private/.env oder .env (siehe clean_tables_with_gemini.js).
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../private/.env') });
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const PDF_PATH = path.join(__dirname, '../../assets/source/Krit_Patzer.pdf');
const OUTPUT_PATH = path.join(__dirname, '../../assets/data/_pipeline/patzer_tables.json');

/** Ab dieser Größe (Bytes) wird die File API statt Inline-Base64 genutzt. */
const INLINE_MAX_BYTES = 18 * 1024 * 1024;

const SYSTEM_PROMPT = `Du bist ein Experte für Datenextraktion und Rollenspiele (MERS). Im Anhang findest du ein PDF mit Patzertabellen (Fumble Tables). Das Dokument ist in vier vertikale Spalten aufgeteilt: 1. Nahkampfwaffen, 2. Fernkampfwaffen, 3. Zauberfehler, 4. Manöver.
Deine Aufgabe ist es, das Dokument visuell zu analysieren, den Spalten-Wortsalat aufzulösen und jeden Eintrag der richtigen Kategorie zuzuordnen.
Regeln:
1. Löse Sätze, die über die Spalten hinweg vermischt wurden, logisch auf.
2. Korrigiere OCR-Fehler (z.B. 'Maglepunkte' -> 'Magiepunkte', 'TretTer' -> 'Treffer').
3. Wandle Abkürzungen für den Vorlesetext um ('Rd.' -> 'Runden', '-30' -> 'Minus dreißig', '+5' -> 'Plus fünf').
4. Formuliere flüssige, vollständige Sätze.
5. Der Wurf (z.B. 05-20) steht meistens ganz links und gilt für die ganze Zeile über alle vier Kategorien hinweg.`;

const USER_PROMPT =
  'Extrahiere alle Zeilen aus dem PDF. Für jede Kombination aus Würfelwurf und Tabellenspalte liefere genau einen Eintrag mit tabelle, wuerfelwurf und tts_text. Die Ausgabe muss dem geforderten JSON-Schema entsprechen.';

const RESPONSE_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      tabelle: {
        type: 'string',
        enum: ['Nahkampfwaffen', 'Fernkampfwaffen', 'Zauberfehler', 'Manöver'],
        description:
          "Eine der vier Kategorien: 'Nahkampfwaffen', 'Fernkampfwaffen', 'Zauberfehler', 'Manöver'"
      },
      wuerfelwurf: {
        type: 'string',
        description: "Würfelbereich oder Einzelwurf, z.B. '05-20', '80', '100'"
      },
      tts_text: {
        type: 'string',
        description: 'Extrahierter, grammatikalisch korrekter Vorlesetext für diese Zelle'
      }
    },
    required: ['tabelle', 'wuerfelwurf', 'tts_text']
  }
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

/** @returns {{ parts: object[], uploadedFile?: object }} */
async function buildPdfParts(ai, pdfBuffer) {
  const base64 = pdfBuffer.toString('base64');

  if (pdfBuffer.length <= INLINE_MAX_BYTES) {
    return {
      parts: [
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: base64
          }
        },
        { text: USER_PROMPT }
      ]
    };
  }

  const tmpPath = path.join(__dirname, '.patzer_upload_tmp.pdf');
  fs.writeFileSync(tmpPath, pdfBuffer);
  try {
    const uploaded = await ai.files.upload({
      file: tmpPath,
      config: { mimeType: 'application/pdf', displayName: 'Krit_Patzer.pdf' }
    });
    if (!uploaded.name) throw new Error('Upload ohne Dateiname');
    const ready = await waitForFileActive(ai, uploaded.name);
    const uri = ready.uri;
    if (!uri) throw new Error('Hochgeladene Datei ohne URI');
    return {
      parts: [
        {
          fileData: {
            fileUri: uri,
            mimeType: 'application/pdf'
          }
        },
        { text: USER_PROMPT }
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

async function extractPatzerTables(ai, pdfBuffer) {
  const { parts, uploadedFile } = await buildPdfParts(ai, pdfBuffer);

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: parts,
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
      throw new Error('Erwartet wurde ein JSON-Array: ' + String(text).slice(0, 300));
    }

    return parsed;
  } finally {
    if (uploadedFile?.name) {
      try {
        await ai.files.delete({ name: uploadedFile.name });
      } catch (_) {
        /* optional cleanup */
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
  const ai = new GoogleGenAI({ apiKey });

  console.log(`PDF: ${PDF_PATH} (${pdfBuffer.length} Bytes)`);
  const rows = await extractPatzerTables(ai, pdfBuffer);

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(rows, null, 2), 'utf8');
  console.log(`Fertig: ${OUTPUT_PATH} (${rows.length} Einträge)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
