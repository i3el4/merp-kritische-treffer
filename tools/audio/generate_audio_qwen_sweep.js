#!/usr/bin/env node
/**
 * generate_audio_qwen_sweep.js
 * Sampler-Raster über Streich (Held) D 67–70. Schreibt NIE nach assets/audio/qwen/ oder krit/.
 *
 *   npm run generate-audio-qwen-sweep -- --preset quick
 *   caffeinate -i npm run generate-audio-qwen-sweep
 *
 * Danach: assets/data/_pipeline/qwen-sweep/index.html öffnen.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

try {
    require('dotenv').config({ path: path.join(__dirname, '../../private/.env') });
    require('dotenv').config();
} catch (_) {
    // dotenv optional
}

const ROOT = path.join(__dirname, '../..');
const DATA_PATH = path.join(ROOT, 'assets/data/tables_processed.json');
const SETTINGS_PATH = path.join(__dirname, 'qwen_tts_settings.json');
const SWEEP_PATH = path.join(__dirname, 'qwen_tts_sweep.json');
const TEMPLATE_PATH = path.join(__dirname, 'qwen_tts_sweep_report.html');
const WORKER = path.join(__dirname, 'qwen_tts_worker.py');
const OUTPUT_DIR = path.join(ROOT, 'assets/data/_pipeline/qwen-sweep');
const MANIFEST_PATH = path.join(OUTPUT_DIR, 'done.json');
const ID_RE = /^[a-zA-Z0-9._-]+$/;

function loadJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function parseArgs(argv, settings) {
    const opts = {
        preset: 'night',
        clipIds: null,
        variantIds: null,
        limit: 0,
        dryRun: false,
        htmlOnly: false,
        force: false,
        voice: process.env.QWEN_TTS_VOICE || settings.voice || 'bud2',
        backend: process.env.QWEN_TTS_BACKEND || settings.backend || 'torch',
        localTts: process.env.LOCAL_TTS_ROOT || path.join(os.homedir(), 'local-tts'),
        help: false,
    };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--help' || a === '-h') opts.help = true;
        else if (a === '--dry-run') opts.dryRun = true;
        else if (a === '--html-only') opts.htmlOnly = true;
        else if (a === '--force') opts.force = true;
        else if (a === '--preset') opts.preset = String(argv[++i] || '').trim() || 'night';
        else if (a.startsWith('--preset=')) opts.preset = a.slice(9).trim() || 'night';
        else if (a === '--clips') opts.clipIds = splitList(argv[++i]);
        else if (a.startsWith('--clips=')) opts.clipIds = splitList(a.slice(8));
        else if (a === '--variants') opts.variantIds = splitList(argv[++i]);
        else if (a.startsWith('--variants=')) opts.variantIds = splitList(a.slice(11));
        else if (a === '--limit') opts.limit = parseInt(argv[++i], 10) || 0;
        else if (a.startsWith('--limit=')) opts.limit = parseInt(a.slice(8), 10) || 0;
        else if (a === '--voice') opts.voice = argv[++i];
        else if (a.startsWith('--voice=')) opts.voice = a.slice(8);
        else if (a === '--backend') opts.backend = argv[++i];
        else if (a.startsWith('--backend=')) opts.backend = a.slice(10);
        else if (a === '--local-tts') opts.localTts = argv[++i];
        else if (a.startsWith('--local-tts=')) opts.localTts = a.slice(12);
        else {
            console.error(`Unbekanntes Argument: ${a}`);
            opts.help = true;
        }
    }
    return opts;
}

function splitList(value) {
    return String(value || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

function printHelp() {
    console.log(`Qwen Sampler-Sweep (Bud2). Gleiche Texte, verschiedene Sampler.

Schreibt nach assets/data/_pipeline/qwen-sweep/ — nicht nach assets/audio/qwen/.
Hörseite: assets/data/_pipeline/qwen-sweep/index.html

Usage:
  npm run generate-audio-qwen-sweep -- [Optionen]

Optionen:
  --preset quick|night   Default: night (1 Text × 25 Varianten).
  --clips id,id          Nur diese Clips (siehe qwen_tts_sweep.json).
  --variants id,id       Nur diese Varianten.
  --limit N              Höchstens N neue MP3s.
  --force                Vorhandene Sweep-MP3s dieser Jobs neu erzeugen.
  --html-only            Nur index.html neu schreiben.
  --dry-run              Plan zeigen, nichts generieren.
  --voice NAME           Default: bud2.
  --backend torch|mlx    Default: torch.
  --local-tts PFAD       Default ~/local-tts.

Nachtlauf:
  caffeinate -i npm run generate-audio-qwen-sweep
Kurztest:
  npm run generate-audio-qwen-sweep -- --preset quick
`);
}

function lookupTts(data, clip) {
    const table = data[clip.table];
    if (!table || typeof table !== 'object') {
        throw new Error(`Clip ${clip.id}: Tabelle fehlt: ${clip.table}`);
    }
    const kat = table[clip.kategorie];
    if (!kat || typeof kat !== 'object') {
        throw new Error(`Clip ${clip.id}: Kategorie fehlt: ${clip.table} / ${clip.kategorie}`);
    }
    const entry = kat[clip.range];
    const text = entry && typeof entry === 'object' ? String(entry.tts || '').trim() : '';
    if (!text) {
        throw new Error(`Clip ${clip.id}: kein tts-Text bei ${clip.table} / ${clip.kategorie} / ${clip.range}`);
    }
    return text;
}

function resolveClipText(data, clip) {
    const fromTable = lookupTts(data, clip);
    const pinned = String(clip.text || '').trim();
    if (!pinned) return fromTable;
    if (pinned !== fromTable) {
        console.warn(`Clip ${clip.id}: gepinnter Text weicht von tables_processed.json ab. Sweep nutzt den gepinnten Text.`);
    }
    return pinned;
}

function pickByIds(items, ids, kind) {
    if (!ids || ids === 'all') return items;
    const list = Array.isArray(ids) ? ids : [];
    const byId = new Map(items.map((item) => [item.id, item]));
    return list.map((id) => {
        const item = byId.get(id);
        if (!item) throw new Error(`Unbekannte ${kind}-id: ${id}`);
        return item;
    });
}

function mergeSampling(base, extra) {
    return { ...base, ...(extra || {}) };
}

function assertSafeId(id, kind) {
    if (!ID_RE.test(id)) throw new Error(`${kind}-id ungültig: ${id}`);
}

function buildJobs({ settings, sweep, data, opts }) {
    const baseSampling = settings.sampling || {};
    const preset = (sweep.presets || {})[opts.preset];
    if (!preset) {
        throw new Error(`Unbekanntes Preset: ${opts.preset}. Vorhanden: ${Object.keys(sweep.presets || {}).join(', ')}`);
    }
    const clipIds = opts.clipIds || preset.clipIds;
    const variantIds = opts.variantIds || preset.variantIds;
    const clips = pickByIds(sweep.clips, clipIds, 'Clip').map((clip) => {
        assertSafeId(clip.id, 'Clip');
        return { ...clip, text: resolveClipText(data, clip) };
    });
    const variants = pickByIds(sweep.variants, variantIds, 'Variante').map((variant) => {
        assertSafeId(variant.id, 'Variante');
        return {
            ...variant,
            sampling: mergeSampling(baseSampling, variant.sampling),
        };
    });

    const jobs = [];
    for (const clip of clips) {
        for (const variant of variants) {
            const rel = path.join('audio', clip.id, `${variant.id}.mp3`);
                jobs.push({
                    text: clip.text,
                    out: path.join(OUTPUT_DIR, rel),
                    rel,
                    variant: variant.id,
                    clip: clip.id,
                    sampling: variant.sampling,
                    sweep: true,
                });
        }
    }
    return { clips, variants, jobs, presetName: opts.preset };
}

function writeReport({ clips, variants, jobs, presetName, settings }) {
    fs.mkdirSync(path.join(OUTPUT_DIR, 'audio'), { recursive: true });
    const readyByRel = new Set(
        jobs.filter((job) => fs.existsSync(job.out)).map((job) => job.rel)
    );
    const payload = {
        preset: presetName,
        voice: settings.voice || 'bud2',
        seed: settings.seed,
        speed: settings.speed,
        model_id: settings.model_id,
        revision: settings.revision,
        generatedAt: new Date().toISOString(),
        total: jobs.length,
        ready: readyByRel.size,
        clips: clips.map((clip) => ({
            id: clip.id,
            label: clip.label,
            why: clip.why,
            table: clip.table,
            kategorie: clip.kategorie,
            range: clip.range,
            text: clip.text,
        })),
        variants: variants.map((variant) => {
            const files = {};
            const ready = {};
            for (const clip of clips) {
                const rel = `audio/${clip.id}/${variant.id}.mp3`;
                files[clip.id] = rel;
                ready[clip.id] = readyByRel.has(rel);
            }
            return {
                id: variant.id,
                label: variant.label,
                sampling: variant.sampling,
                files,
                ready,
            };
        }),
    };
    const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
    if (!template.includes('__SWEEP_DATA__')) {
        throw new Error(`Platzhalter __SWEEP_DATA__ fehlt in ${TEMPLATE_PATH}`);
    }
    const html = template.replace('__SWEEP_DATA__', JSON.stringify(payload));
    fs.writeFileSync(path.join(OUTPUT_DIR, 'index.html'), html, 'utf8');
    fs.writeFileSync(path.join(OUTPUT_DIR, 'sweep.json'), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    return payload;
}

function estimateSeconds(jobs) {
    return jobs.reduce((sum, job) => sum + Math.max(20, 12 + String(job.text || '').length * 0.08), 0);
}

function formatEta(seconds) {
    const s = Math.max(0, Math.round(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h) return `${h}h ${m}min`;
    if (m) return `${m}min`;
    return `${s}s`;
}

function runWorker(python, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(python, args, { stdio: 'inherit' });
        child.on('error', reject);
        child.on('exit', (code, signal) => {
            if (signal) {
                console.error(`\nQwen-Worker vom System beendet (${signal}).`);
                console.error('Das ist kein Sampler-Fehler — der Prozess ist beim Laden des Modells abgestürzt.');
                console.error("Häufige Ursache: transformers 5 in ~/local-tts. Einmal:");
                console.error("  ~/local-tts/.venv/bin/pip install 'transformers==4.57.3'");
                console.error('Studio schliessen, danach denselben Sweep-Befehl nochmal.');
                resolve(130);
            } else resolve(code ?? 1);
        });
    });
}

async function main() {
    const settings = loadJson(SETTINGS_PATH);
    const opts = parseArgs(process.argv.slice(2), settings);
    if (opts.help) {
        printHelp();
        process.exit(0);
    }

    const sweep = loadJson(SWEEP_PATH);
    const data = loadJson(DATA_PATH);
    const built = buildJobs({ settings, sweep, data, opts });
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    if (opts.force) {
        let removed = 0;
        for (const job of built.jobs) {
            if (fs.existsSync(job.out)) {
                fs.unlinkSync(job.out);
                removed += 1;
            }
        }
        console.log(`--force: ${removed} vorhandene Sweep-MP3s gelöscht`);
    }

    const pending = built.jobs.filter((job) => !fs.existsSync(job.out));
    const report = writeReport({ ...built, settings });
    const htmlPath = path.join(OUTPUT_DIR, 'index.html');

    console.log(`Preset:    ${built.presetName}`);
    console.log(`Clips:     ${built.clips.map((c) => c.id).join(', ')}`);
    console.log(`Varianten: ${built.variants.map((v) => v.id).join(', ')}`);
    console.log(`Jobs:      ${built.jobs.length}  davon fertig ${report.ready}, offen ${pending.length}`);
    console.log(`Ziel:      ${OUTPUT_DIR}`);
    console.log(`Hörseite:  ${htmlPath}`);
    console.log(`ETA offen: ca. ${formatEta(estimateSeconds(pending))} (grobe Schätzung)`);
    console.log('Schreibt nicht nach assets/audio/qwen/ oder assets/audio/krit/.\n');

    if (opts.dryRun) {
        built.jobs.slice(0, 12).forEach((job, i) => {
            const n = job.text.length;
            console.log(`[dry-run ${i + 1}] ${job.rel}  (${n} Zeichen)`);
        });
        if (built.jobs.length > 12) console.log(`… ${built.jobs.length - 12} weitere`);
        process.exit(0);
    }
    if (opts.htmlOnly) {
        console.log('index.html geschrieben.');
        process.exit(0);
    }

    const localTts = path.resolve(opts.localTts);
    const python = path.join(localTts, '.venv/bin/python');
    if (!fs.existsSync(python)) {
        console.error(`local-tts venv fehlt: ${python}`);
        console.error('Diesen Sweep auf dem Mac ausführen (Studio schliessen).');
        process.exit(1);
    }

    const jobsFile = path.join(os.tmpdir(), `merp-qwen-sweep-${process.pid}.json`);
    fs.writeFileSync(jobsFile, JSON.stringify(built.jobs), 'utf8');
    const workerArgs = [
        WORKER,
        '--jobs', jobsFile,
        '--voice', opts.voice,
        '--local-tts', localTts,
        '--manifest', MANIFEST_PATH,
        '--backend', opts.backend,
    ];
    if (opts.limit) workerArgs.push('--limit', String(opts.limit));

    let code = 1;
    try {
        code = await runWorker(python, workerArgs);
    } finally {
        try { fs.unlinkSync(jobsFile); } catch (_) {}
        writeReport({ ...built, settings });
    }
    process.exit(code);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
