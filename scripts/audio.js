// audio.js
// Dieses Modul verwaltet die Wiedergabe von Audio und TTS.

import { URLS } from './constants.js';
import { state } from './state.js';
import { $ } from './dom.js';

/** Vorlese-Tempo (Web Speech API, 0.1–10; ~1 = normal) */
const TTS_UTTER_RATE = 1.22;
/** Tempo für vorproduzierte Krit-MP3s (HTMLAudioElement.playbackRate) */
const CRIT_MP3_PLAYBACK_RATE = 1.12;

const bgAudio = $('#bgAudio');
const sfxAudio = $('#sfxAudio');

/**
 * Versucht, Hintergrundmusik zu starten, basierend auf dem Krit-Typ.
 * @param {string} tableKey Der Schlüssel der Tabelle.
 */
export function tryStartBgAudio(tableKey) {
    if (!state.tables || !state.isBgMusicPlaying) return;
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
    bgAudio.volume = parseFloat($('#bgVol').value || '0.2');
    bgAudio.play().catch(() => {});
}

/**
 * Spielt den Krit-Audio-Effekt ab oder verwendet TTS als Fallback.
 * @param {string} typ Krit-Typ.
 * @param {string} kat Kategorie.
 * @param {string} rangeKey Bereichsschlüssel.
 * @param {string} fallbackText Text für TTS.
 */
export async function playCritAudio(typ, kat, rangeKey, fallbackText) {
    const mp3 = buildCritAudioFilename(typ, kat, rangeKey);
    if (!mp3) {
        speak(fallbackText);
        return;
    }

    sfxAudio.src = mp3;
    sfxAudio.volume = parseFloat($('#ttsVol').value);
    sfxAudio.playbackRate = CRIT_MP3_PLAYBACK_RATE;

    try {
        await sfxAudio.play();
    } catch (err) {
        speak(fallbackText);
    }
}

/**
 * Konvertiert Krit-Typ zu dateinamen-tauglichem Präfix (Leerzeichen → _, Umlaute → ae/oe/ue).
 * @param {string} typ Krit-Typ (z.B. "Grosse Wesen", "Kälte").
 * @returns {string} Dateinamen-sicherer String.
 */
function sanitizeTypForAudio(typ) {
    let s = String(typ).trim();
    s = s.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
    s = s.replace(/\s+/g, '_');
    return s.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('_');
}

/**
 * Erstellt den Dateinamen für eine Krit-MP3.
 * @param {string} typ Krit-Typ.
 * @param {string} kat Kategorie.
 * @param {string} rangeKey Bereichsschlüssel.
 * @returns {string|null} Der Dateipfad oder null.
 */
function buildCritAudioFilename(typ, kat, rangeKey) {
    if (!typ || !kat || !rangeKey) return null;
    const safeTyp = sanitizeTypForAudio(typ);
    const safeKat = String(kat).trim().toUpperCase();
    const safeRange = sanitizeRangeForFile(rangeKey);
    return `${URLS.AUDIO_BASE_PATH}krit/${safeTyp}_${safeKat}_${safeRange}.mp3`;
}

/**
 * Bereinigt den Bereichsschlüssel für den Dateinamen.
 * @param {string} rangeKey Der Bereichsschlüssel.
 * @returns {string} Der bereinigte Schlüssel.
 */
function sanitizeRangeForFile(rangeKey) {
    let s = String(rangeKey).trim();
    s = s.replace(/[–—]/g, '-').replace(/\s+/g, '');
    if (s.includes('-')) {
        const [a, b] = s.split('-');
        const nz = (x) => String(parseInt(x, 10));
        return nz(a) + '-' + nz(b);
    }
    s = s.replace(/[≤≥]/g, '');
    return String(parseInt(s, 10));
}

/**
 * Gibt Text über die Web Speech API aus.
 * @param {string} text Der auszugebende Text.
 */
function speak(text) {
    if (!('speechSynthesis' in window)) return;
    const volume = parseFloat($('#ttsVol')?.value ?? '1.0');
    if (volume === 0) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'de-DE';
    utter.rate = TTS_UTTER_RATE;
    utter.volume = volume;
    window.speechSynthesis.speak(utter);
}
