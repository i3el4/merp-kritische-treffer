// audio.js
// Dieses Modul verwaltet die Wiedergabe von Audio und TTS.

import { URLS } from './constants.js';
import { state } from './state.js';
import { $ } from './dom.js';
import {
    buildCritAudioRelativePath,
    CRIT_AUDIO_PACK_KRIT,
    CRIT_AUDIO_PACK_QWEN,
} from './audioNaming.mjs';
import { combatMusicNotifySpeechOrSfxStart, combatMusicNotifySpeechOrSfxEnd, scaleMusicVolume, readMusicVolumeNorm, readTtsVolumeNorm } from './combatMusic.js';

/** Vorlese-Tempo (Web Speech API, 0.1–10; ~1 = normal) */
const TTS_UTTER_RATE = 1.22;
/** Tempo für ElevenLabs-Krit-MP3s (HTMLAudioElement.playbackRate) */
const CRIT_MP3_PLAYBACK_RATE = 1.12;
/** Qwen-MP3s sind bereits mit Studio-Speed 1.10× gerendert. */
const QWEN_MP3_PLAYBACK_RATE = 1.0;

const LS_CRIT_VOICE = 'mers_crit_voice_pack';

const bgAudio = $('#bgAudio');
const sfxAudio = $('#sfxAudio');

export function getCritVoicePack() {
    const v = localStorage.getItem(LS_CRIT_VOICE);
    return v === CRIT_AUDIO_PACK_QWEN ? CRIT_AUDIO_PACK_QWEN : CRIT_AUDIO_PACK_KRIT;
}

export function initCritVoicePackSelect() {
    const sel = /** @type {HTMLSelectElement | null} */ ($('#critVoicePackSelect'));
    if (!sel) return;
    sel.value = getCritVoicePack();
    sel.addEventListener('change', () => {
        const pack = sel.value === CRIT_AUDIO_PACK_QWEN ? CRIT_AUDIO_PACK_QWEN : CRIT_AUDIO_PACK_KRIT;
        localStorage.setItem(LS_CRIT_VOICE, pack);
    });
}

/**
 * Versucht, Hintergrundmusik zu starten, basierend auf dem Krit-Typ.
 * @param {string} tableKey Der Schlüssel der Tabelle.
 */
export function tryStartBgAudio(tableKey) {
    if (!state.tables || !state.isBgMusicPlaying || state.kampfModus) return;
    const t = state.tables[tableKey];
    const file = t?.audioFile;
    if (!file) {
        bgAudio.pause();
        state.currentBgKey = null;
        return;
    }
    if (state.currentBgKey === tableKey && !bgAudio.paused) return;
    state.currentBgKey = tableKey;
    bgAudio.src = URLS.AUDIO_BASE_PATH + `musik/${file}`;
    bgAudio.volume = scaleMusicVolume(readMusicVolumeNorm());
    bgAudio.play().catch(() => {});
}

function packOrderForPlayback() {
    const preferred = getCritVoicePack();
    if (preferred === CRIT_AUDIO_PACK_QWEN) {
        return [CRIT_AUDIO_PACK_QWEN, CRIT_AUDIO_PACK_KRIT];
    }
    return [CRIT_AUDIO_PACK_KRIT];
}

function tryPlaySrc(src, playbackRate) {
    sfxAudio.pause();
    sfxAudio.src = src;
    sfxAudio.volume = readTtsVolumeNorm();
    sfxAudio.playbackRate = playbackRate;
    return sfxAudio.play().then(() => new Promise((resolve, reject) => {
        const done = () => resolve(undefined);
        const fail = () => reject(new Error('audio error'));
        sfxAudio.addEventListener('ended', done, { once: true });
        sfxAudio.addEventListener('error', fail, { once: true });
    }));
}

/**
 * Spielt den Krit-Audio-Effekt ab oder verwendet TTS als Fallback.
 * @param {string} typ Krit-Typ.
 * @param {string} kat Kategorie.
 * @param {string} rangeKey Bereichsschlüssel.
 * @param {string} fallbackText Text für TTS.
 */
export async function playCritAudio(typ, kat, rangeKey, fallbackText) {
    combatMusicNotifySpeechOrSfxStart();
    for (const pack of packOrderForPlayback()) {
        const relativePath = buildCritAudioRelativePath(typ, kat, rangeKey, pack);
        if (!relativePath) continue;
        const rate = pack === CRIT_AUDIO_PACK_QWEN ? QWEN_MP3_PLAYBACK_RATE : CRIT_MP3_PLAYBACK_RATE;
        try {
            await tryPlaySrc(URLS.AUDIO_BASE_PATH + relativePath, rate);
            combatMusicNotifySpeechOrSfxEnd();
            return;
        } catch (_) {
            /* nächstes Pack oder Browser-TTS */
        }
    }
    combatMusicNotifySpeechOrSfxEnd();
    speak(fallbackText);
}

/**
 * Gibt Text über die Web Speech API aus.
 * @param {string} text Der auszugebende Text.
 */
function speak(text) {
    if (!('speechSynthesis' in window)) return;
    const volume = readTtsVolumeNorm();
    if (volume === 0) return;
    window.speechSynthesis.cancel();
    combatMusicNotifySpeechOrSfxStart();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'de-DE';
    utter.rate = TTS_UTTER_RATE;
    utter.volume = volume;
    utter.onend = () => combatMusicNotifySpeechOrSfxEnd();
    utter.onerror = () => combatMusicNotifySpeechOrSfxEnd();
    window.speechSynthesis.speak(utter);
}
