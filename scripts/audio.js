// audio.js
// Dieses Modul verwaltet die Wiedergabe von Audio und TTS.

import { URLS } from './constants.js';
import { state } from './state.js';
import { $ } from './dom.js';
import { buildCritAudioRelativePath } from './audioNaming.mjs';
import { combatMusicNotifySpeechOrSfxStart, combatMusicNotifySpeechOrSfxEnd } from './combatMusic.js';

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
    const relativePath = buildCritAudioRelativePath(typ, kat, rangeKey);
    if (!relativePath) {
        speak(fallbackText);
        return;
    }

    sfxAudio.src = URLS.AUDIO_BASE_PATH + relativePath;
    sfxAudio.volume = parseFloat($('#ttsVol').value);
    sfxAudio.playbackRate = CRIT_MP3_PLAYBACK_RATE;

    combatMusicNotifySpeechOrSfxStart();
    try {
        await sfxAudio.play();
        await new Promise((resolve) => {
            const done = () => resolve(undefined);
            sfxAudio.addEventListener('ended', done, { once: true });
            sfxAudio.addEventListener('error', done, { once: true });
        });
    } catch (err) {
        combatMusicNotifySpeechOrSfxEnd();
        speak(fallbackText);
        return;
    }
    combatMusicNotifySpeechOrSfxEnd();
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
    combatMusicNotifySpeechOrSfxStart();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'de-DE';
    utter.rate = TTS_UTTER_RATE;
    utter.volume = volume;
    utter.onend = () => combatMusicNotifySpeechOrSfxEnd();
    utter.onerror = () => combatMusicNotifySpeechOrSfxEnd();
    window.speechSynthesis.speak(utter);
}
