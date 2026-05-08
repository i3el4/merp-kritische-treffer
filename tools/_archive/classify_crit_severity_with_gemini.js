#!/usr/bin/env node
/**
 * Ergänzt kritische Treffer um "severity" (normal|incapacitated|lethal).
 * Nutzung:
 *   node scripts/classify_crit_severity_with_gemini.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../private/.env') });
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const INPUT_PATH = path.join(__dirname, '../../assets/data/tables_processed.json');
const OUTPUT_PATH = path.join(__dirname, '../../assets/data/_pipeline/tables_with_severity.json');
const MODEL = 'gemini-2.5-flash';

const SYSTEM_PROMPT = `
Du klassifizierst MERP-Krittexte.
Antwort nur als JSON-Array mit Objekten:
{ "id": "<id>", "severity": "normal|incapacitated|lethal" }.
Regeln:
- lethal: sofort tot / tödlich / stirbt sicher
- incapacitated: bewusstlos, kampfunfähig, K.O., nicht handlungsfähig
- normal: alles andere
`;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function classifyBatch(ai, batch) {
  const payload = JSON.stringify(batch, null, 2);
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `Klassifiziere diese Krittexte:\n${payload}`,
    config: { systemInstruction: SYSTEM_PROMPT, responseMimeType: 'application/json' }
  });
  return JSON.parse(response.text || '[]');
}

function collectEntries(data) {
  const entries = [];
  for (const [typ, table] of Object.entries(data || {})) {
    if (!table || typeof table !== 'object') continue;
    for (const [kat, catData] of Object.entries(table)) {
      if (kat === 'audioFile' || !catData || typeof catData !== 'object') continue;
      for (const [id, entry] of Object.entries(catData)) {
        const visual = typeof entry === 'object' ? entry.visual : String(entry || '');
        entries.push({ key: `${typ}__${kat}__${id}`, typ, kat, id, visual });
      }
    }
  }
  return entries;
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY fehlt.');
    process.exit(1);
  }
  const ai = new GoogleGenAI({ apiKey });
  const data = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));
  const entries = collectEntries(data);
  const byKey = new Map(entries.map(e => [e.key, e]));
  const chunkSize = 20;
  for (let i = 0; i < entries.length; i += chunkSize) {
    const chunk = entries.slice(i, i + chunkSize);
    const request = chunk.map(x => ({ id: x.key, text: x.visual }));
    const result = await classifyBatch(ai, request);
    result.forEach(r => {
      const ref = byKey.get(r.id);
      if (!ref) return;
      const cur = data?.[ref.typ]?.[ref.kat]?.[ref.id];
      if (cur && typeof cur === 'object') cur.severity = r.severity || 'normal';
      else data[ref.typ][ref.kat][ref.id] = { visual: String(cur || ''), tts: String(cur || ''), severity: r.severity || 'normal' };
    });
    await sleep(300);
  }
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(data, null, 2), 'utf8');
  console.log(`Fertig: ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
