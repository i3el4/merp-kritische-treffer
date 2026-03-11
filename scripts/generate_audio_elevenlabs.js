#!/usr/bin/env node
/**
 * generate_audio_elevenlabs.js
 * Generiert MP3-Dateien für die MERS-App via ElevenLabs Text-to-Speech API.
 *
 * Verwendung:
 *   npm install axios dotenv
 *   Erstelle .env mit ELEVENLABS_API_KEY und ELEVENLABS_VOICE_ID
 *   node scripts/generate_audio_elevenlabs.js
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID;
const DATA_PATH = path.join(__dirname, '../assets/data/tables_processed.json');
const OUTPUT_DIR = path.join(__dirname, '../assets/audio/krit');

/**
 * Konvertiert Krit-Typ zu dateinamen-tauglichem Präfix.
 */
function sanitizeTypForAudio(typ) {
    let s = String(typ).trim();
    s = s.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
    s = s.replace(/\s+/g, '_');
    return s.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('_');
}

/**
 * Bereinigt den Bereichsschlüssel für den Dateinamen.
 */
function sanitizeRangeForFile(rangeKey) {
    let s = String(rangeKey).trim();
    s = s.replace(/[–—]/g, '-').replace(/\s+/g, '');
    if (s.endsWith('+')) {
        const num = parseInt(s.slice(0, -1), 10);
        return isNaN(num) ? s : num + '+';
    }
    if (s.includes('-')) {
        const [a, b] = s.split('-');
        const nz = (x) => String(parseInt(x, 10) || '0');
        return nz(a) + '-' + nz(b);
    }
    s = s.replace(/[≤≥]/g, '');
    return String(parseInt(s, 10) || s);
}

/**
 * Erstellt den Dateinamen: [Tabelle]_[Kategorie]_[Wertebereich].mp3
 */
function buildFilename(tabelle, kategorie, wertebereich) {
    const safeTyp = sanitizeTypForAudio(tabelle);
    const safeKat = String(kategorie).trim().toUpperCase();
    const safeRange = sanitizeRangeForFile(wertebereich);
    return `${safeTyp}_${safeKat}_${safeRange}.mp3`;
}

/**
 * Ruft ElevenLabs TTS auf und speichert die MP3.
 * Bei 429 (Rate Limit) wird mit Backoff wiederholt.
 */
async function generateAndSave(text, filePath) {
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`;
    const maxRetries = 3;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await axios({
                method: 'POST',
                url,
                headers: {
                    'xi-api-key': API_KEY,
                    'Content-Type': 'application/json',
                },
                data: {
                    text,
                    model_id: 'eleven_multilingual_v2',
                },
                responseType: 'arraybuffer',
                validateStatus: () => true,
                timeout: 60000,
            });

            if (response.status === 429) {
                lastError = new Error('Rate limit exceeded (429)');
                if (attempt < maxRetries) {
                    const waitSec = 60;
                    console.log(`   Rate Limit (429) – warte ${waitSec}s vor Wiederholung (Versuch ${attempt}/${maxRetries})…`);
                    await sleep(waitSec * 1000);
                    continue;
                }
                throw lastError;
            }

            if (response.status !== 200) {
                let msg = `HTTP ${response.status}`;
                try {
                    const errBody = JSON.parse(Buffer.from(response.data).toString('utf8'));
                    const d = errBody.detail;
                    msg = (typeof d === 'object' && d?.message) ? d.message : (errBody.message || msg);
                } catch (_) {}
                throw new Error(msg);
            }

            fs.writeFileSync(filePath, Buffer.from(response.data));
            return;
        } catch (err) {
            lastError = err;
            if (err.code === 'ECONNABORTED' && attempt < maxRetries) {
                console.log(`   Timeout – Wiederholung (Versuch ${attempt}/${maxRetries})…`);
                await sleep(5000);
            } else {
                throw err;
            }
        }
    }
    throw lastError;
}

async function main() {
    if (!API_KEY || !VOICE_ID) {
        console.error('Fehler: ELEVENLABS_API_KEY und ELEVENLABS_VOICE_ID müssen in .env gesetzt sein.');
        process.exit(1);
    }

    if (!fs.existsSync(DATA_PATH)) {
        console.error(`Fehler: ${DATA_PATH} nicht gefunden.`);
        process.exit(1);
    }

    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
        console.log(`Ordner erstellt: ${OUTPUT_DIR}`);
    }

    const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    let generated = 0;
    let skipped = 0;

    for (const [tabelle, tabellenInhalt] of Object.entries(data)) {
        if (tabelle === 'audioFile' || typeof tabellenInhalt !== 'object') continue;

        for (const [kategorie, kategorienInhalt] of Object.entries(tabellenInhalt)) {
            if (kategorie === 'audioFile' || typeof kategorienInhalt !== 'object') continue;

            for (const [wertebereich, eintrag] of Object.entries(kategorienInhalt)) {
                if (typeof eintrag !== 'object' || !eintrag) continue;

                const text = eintrag.tts;
                if (text == null || String(text).trim() === '') continue;

                const filename = buildFilename(tabelle, kategorie, wertebereich);
                const filePath = path.join(OUTPUT_DIR, filename);

                if (fs.existsSync(filePath)) {
                    console.log(`Skipping ${filename} - already exists`);
                    skipped++;
                    continue;
                }

                try {
                    await generateAndSave(String(text).trim(), filePath);
                    console.log(`Generated: ${filename}`);
                    generated++;
                    await sleep(1000);
                } catch (err) {
                    console.error(`Fehler bei ${filename}: ${err.message}`);
                    if (err.message.toLowerCase().includes('invalid api key') || err.message.includes('invalid_api_key')) {
                        console.error('\n→ API-Key ungültig. Prüfe ELEVENLABS_API_KEY in .env');
                        process.exit(1);
                    }
                    if (err.message.includes('quota') || err.message.toLowerCase().includes('credit')) {
                        console.error('\n→ Credits aufgebraucht. Prüfe dein ElevenLabs-Konto.');
                        process.exit(1);
                    }
                }
            }
        }
    }

    console.log(`\nFertig. Generiert: ${generated}, übersprungen: ${skipped}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
