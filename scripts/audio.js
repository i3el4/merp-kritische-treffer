// audio.js
// Dieses Modul verwaltet die Wiedergabe von Audio und TTS.

import { URLS } from './constants.js';
import { state } from './state.js';
import { $ } from './dom.js';

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
    bgAudio.play().then(() => {
        console.log(`[Audio-Debug] Hintergrundmusik erfolgreich gestartet: ${bgAudio.src}`);
    }).catch(err => {
        console.error('[Audio-Debug] Hintergrundmusik konnte nicht abgespielt werden:', err);
    });
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
    console.log(`[Audio-Debug] Versuche, Audio abzuspielen: ${mp3}`);
    if (!mp3) {
        console.warn('[Audio-Debug] Kein MP3-Pfad generiert, verwende TTS-Fallback.');
        speak(fallbackText);
        return;
    }

    sfxAudio.src = mp3;
    sfxAudio.volume = parseFloat($('#ttsVol').value);

    // Promise-basierte Wiedergabe, um Autoplay-Fehler abzufangen
    try {
        await sfxAudio.play();
        console.log('[Audio-Debug] Audio erfolgreich abgespielt.');
    } catch (err) {
        console.error('[Audio-Debug] Fehler beim Abspielen des Audio-Effekts. Versuche TTS-Fallback.', err);
        // Fallback-Logik, die auch den alten onError-Fall abdeckt
        speak(fallbackText);
    }
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
    const safeTyp = String(typ).trim().toLowerCase();
    const capitalTyp = safeTyp.charAt(0).toUpperCase() + safeTyp.slice(1);
    const safeKat = String(kat).trim().toUpperCase();
    const safeRange = sanitizeRangeForFile(rangeKey);
    return `${URLS.AUDIO_BASE_PATH}krit/${capitalTyp}_${safeKat}_${safeRange}.mp3`;
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
    utter.rate = 1.02;
    utter.volume = volume;
    window.speechSynthesis.speak(utter);
}
