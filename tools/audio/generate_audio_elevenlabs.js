#!/usr/bin/env node
/**
 * generate_audio_elevenlabs.js
 * Generiert MP3-Dateien für die MERS-App via ElevenLabs Text-to-Speech API.
 *
 * Verwendung:
 *   npm install axios dotenv
 *   Erstelle .env mit ELEVENLABS_API_KEY und ELEVENLABS_VOICE_ID
 *   Optional: ELEVENLABS_SPEECH_SPEED (Standard 1.1) — 1.0 = normal, >1 schneller (typ. bis ca. 1.2)
 *   npm run generate-audio
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../private/.env') });
require('dotenv').config(); // Fallback: .env im Projektroot
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID;
/** Sprechtempo (ElevenLabs voice_settings.speed): 1.0 = Standard, >1 etwas schneller */
const SPEECH_SPEED = (() => {
    const raw = parseFloat(process.env.ELEVENLABS_SPEECH_SPEED ?? '1.1');
    if (Number.isNaN(raw)) return 1.1;
    return Math.min(1.2, Math.max(0.7, raw));
})();
const DATA_PATH = path.join(__dirname, '../../assets/data/tables_processed.json');
const OUTPUT_DIR = path.join(__dirname, '../../assets/audio/krit');

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
                    voice_settings: {
                        speed: SPEECH_SPEED,
                    },
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
    const { buildCritAudioRelativePath } = await import(path.join(__dirname, '../../scripts/audioNaming.mjs'));

    if (!API_KEY || !VOICE_ID) {
        console.error('Fehler: ELEVENLABS_API_KEY und ELEVENLABS_VOICE_ID müssen in .env gesetzt sein.');
        process.exit(1);
    }

    console.log(`Sprechtempo (speed): ${SPEECH_SPEED} (ELEVENLABS_SPEECH_SPEED in .env überschreibbar)\n`);

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

                const relativePath = buildCritAudioRelativePath(tabelle, kategorie, wertebereich);
                if (!relativePath) continue;
                const filePath = path.join(__dirname, '../../assets/audio', relativePath);
                const filename = relativePath.replace(/^krit\//, '');
                fs.mkdirSync(path.dirname(filePath), { recursive: true });

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
