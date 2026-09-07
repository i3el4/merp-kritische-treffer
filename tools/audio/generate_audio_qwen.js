#!/usr/bin/env node
/**
 * generate_audio_qwen.js
 * Lokale Krit-MP3s via Qwen3-TTS (~/local-tts), Setting in qwen_tts_settings.json.
 * Schreibt NIE nach assets/audio/krit/ — Ziel: assets/audio/qwen/<slug>/<KAT>_<RANGE>.mp3
 *
 *   npm run generate-audio-qwen -- --limit 3
 *   caffeinate -i npm run generate-audio-qwen
 *
 * Local TTS Studio wird NICHT benötigt (besser schliessen, GPU freihalten).
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../private/.env') });
require('dotenv').config();

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '../..');
const DATA_PATH = path.join(ROOT, 'assets/data/tables_processed.json');
const AUDIO_BASE = path.join(ROOT, 'assets/audio');
const OUTPUT_DIR = path.join(AUDIO_BASE, 'qwen');
const MANIFEST_PATH = path.join(ROOT, 'assets/data/_pipeline/qwen_audio_done.json');
const SETTINGS_PATH = path.join(__dirname, 'qwen_tts_settings.json');
const WORKER = path.join(__dirname, 'qwen_tts_worker.py');

function loadSettings() {
    try {
        return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    } catch (_) {
        return {};
    }
}

function parseArgs(argv, settings) {
    const opts = {
        limit: 0,
        minChars: 0,
        dryRun: false,
        voice: process.env.QWEN_TTS_VOICE || settings.voice || 'bud2',
        backend: process.env.QWEN_TTS_BACKEND || settings.backend || 'torch',
        localTts: process.env.LOCAL_TTS_ROOT || path.join(os.homedir(), 'local-tts'),
        help: false,
    };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--help' || a === '-h') opts.help = true;
        else if (a === '--dry-run') opts.dryRun = true;
        else if (a === '--limit') opts.limit = parseInt(argv[++i], 10) || 0;
        else if (a.startsWith('--limit=')) opts.limit = parseInt(a.slice(8), 10) || 0;
        else if (a === '--min-chars') opts.minChars = parseInt(argv[++i], 10) || 0;
        else if (a.startsWith('--min-chars=')) opts.minChars = parseInt(a.slice(12), 10) || 0;
        else if (a === '--voice') opts.voice = argv[++i];
        else if (a.startsWith('--voice=')) opts.voice = a.slice(8);
        else if (a === '--backend') opts.backend = argv[++i];
        else if (a === '--local-tts') opts.localTts = argv[++i];
        else {
            console.error(`Unbekanntes Argument: ${a}`);
            opts.help = true;
        }
    }
    return opts;
}

function printHelp() {
    console.log(`Lokale Qwen-Vertonung (Stimme Bud2, Studio-Parameter).

Schreibt nach assets/audio/qwen/<tableSlug>/<KAT>_<RANGE>.mp3.
ElevenLabs unter assets/audio/krit/ bleibt unverändert.
Local TTS Studio nicht starten — der Batch nutzt ~/local-tts.

Usage:
  npm run generate-audio-qwen -- [Optionen]

Optionen:
  --limit N            Höchstens N neue MP3s.
  --min-chars N        Nur Texte mit mindestens N Zeichen.
  --dry-run            Nur Plan zeigen.
  --voice NAME         Default: bud2.
  --backend torch|mlx  Default: torch (wie Studio Base). mlx ist schneller, klingt anders.
  --local-tts PFAD     Default ~/local-tts.

Nachtlauf:
  caffeinate -i npm run generate-audio-qwen
`);
}

async function collectJobs() {
    const { buildCritAudioRelativePath, CRIT_AUDIO_PACK_QWEN } = await import(path.join(ROOT, 'scripts/audioNaming.mjs'));
    if (!fs.existsSync(DATA_PATH)) {
        throw new Error(`Nicht gefunden: ${DATA_PATH}`);
    }
    const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    const jobs = [];
    for (const [tabelle, tabellenInhalt] of Object.entries(data)) {
        if (tabelle === 'audioFile' || typeof tabellenInhalt !== 'object' || !tabellenInhalt) continue;
        for (const [kategorie, kategorienInhalt] of Object.entries(tabellenInhalt)) {
            if (kategorie === 'audioFile' || typeof kategorienInhalt !== 'object' || !kategorienInhalt) continue;
            for (const [wertebereich, eintrag] of Object.entries(kategorienInhalt)) {
                if (typeof eintrag !== 'object' || !eintrag) continue;
                const text = eintrag.tts;
                if (text == null || String(text).trim() === '') continue;
                const relativePath = buildCritAudioRelativePath(tabelle, kategorie, wertebereich, CRIT_AUDIO_PACK_QWEN);
                if (!relativePath) continue;
                jobs.push({
                    text: String(text).trim(),
                    out: path.join(AUDIO_BASE, relativePath),
                    rel: relativePath,
                });
            }
        }
    }
    return jobs;
}

function runWorker(python, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(python, args, { stdio: 'inherit' });
        child.on('error', reject);
        child.on('exit', (code, signal) => {
            if (signal) resolve(130);
            else resolve(code ?? 1);
        });
    });
}

async function main() {
    const settings = loadSettings();
    const opts = parseArgs(process.argv.slice(2), settings);
    if (opts.help) {
        printHelp();
        process.exit(0);
    }

    const localTts = path.resolve(opts.localTts);
    const python = path.join(localTts, '.venv/bin/python');
    if (!fs.existsSync(python)) {
        console.error(`local-tts venv fehlt: ${python}`);
        console.error('In ~/local-tts einmal ./setup.sh ausführen.');
        process.exit(1);
    }
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
        console.log(`Ordner erstellt: ${OUTPUT_DIR}`);
    }

    let jobs = await collectJobs();
    if (opts.minChars) {
        jobs = jobs.filter((j) => j.text.length >= opts.minChars);
    }
    console.log(`Jobs:      ${jobs.length}${opts.minChars ? ` (>= ${opts.minChars} Zeichen)` : ''}`);
    console.log(`Ziel:      ${OUTPUT_DIR}`);
    console.log(`Setting:   ${SETTINGS_PATH}`);
    console.log(`local-tts: ${localTts}`);
    console.log(`Stimme:    ${opts.voice}`);
    console.log(`Backend:   ${opts.backend}\n`);

    const jobsFile = path.join(os.tmpdir(), `merp-qwen-jobs-${process.pid}.json`);
    fs.writeFileSync(jobsFile, JSON.stringify(jobs), 'utf8');

    const workerArgs = [
        WORKER,
        '--jobs', jobsFile,
        '--voice', opts.voice,
        '--local-tts', localTts,
        '--manifest', MANIFEST_PATH,
        '--backend', opts.backend,
    ];
    if (opts.dryRun) workerArgs.push('--dry-run');
    if (opts.limit) workerArgs.push('--limit', String(opts.limit));

    let code = 1;
    try {
        code = await runWorker(python, workerArgs);
    } finally {
        try { fs.unlinkSync(jobsFile); } catch (_) {}
    }
    process.exit(code);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
