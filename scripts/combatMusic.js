// combatMusic.js — Kampf-Loop-Musik (getrennt von Krit-Tabellen-Hintergrund #bgAudio).

import { KAMPF_AUDIO_BASE_PATH, MUSIK_PROFIL_LABELS, MUSIK_PROFIL_VALUES, coerceMusikProfil } from './constants.js';
import { state } from './state.js';
import { $ } from './dom.js';
import { getGegnerById, getCharakterById } from './campaigns.js';

const LS_KAMPF_MODUS = 'mers_kampf_modus';
const LS_MUSIK_VOL = 'mers_musik_vol';
const LS_TTS_VOL = 'mers_tts_vol';
const LS_SCHATTEN_KAT = 'mers_kampf_schatten_kategorie';
const LS_ANGRIFFSMODUS = 'mers_kampf_angriffsmodus';

const DUCK_MS = 280;
/** Slider 100 % = max. 60 % effektive Musik-Lautstärke. */
const MUSIC_VOL_CAP = 0.6;
const VOLUME_SELECT_STEPS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];

let speechHoldCount = 0;
let fadeTimer = null;
let targetEffectiveVol = 0;
let currentSrcKey = '';

// #region agent log
function volDebug(hypothesisId, location, message, data = {}) {
  const payload = { sessionId: '12695f', hypothesisId, location, message, data, timestamp: Date.now() };
  fetch('http://127.0.0.1:7427/ingest/d58061c1-b39b-4472-a4f9-d5ac8d39fcbb', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '12695f' },
    body: JSON.stringify(payload)
  }).catch(() => {});
  try {
    const host = window.location.hostname;
    if (host && host !== '127.0.0.1' && host !== 'localhost') {
      fetch(`http://${host}:7427/ingest/d58061c1-b39b-4472-a4f9-d5ac8d39fcbb`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '12695f' },
        body: JSON.stringify(payload)
      }).catch(() => {});
    }
  } catch (_) { /* ignore */ }
  try {
    const buf = JSON.parse(localStorage.getItem('mers_vol_debug') || '[]');
    buf.push(payload);
    localStorage.setItem('mers_vol_debug', JSON.stringify(buf.slice(-40)));
  } catch (_) { /* ignore */ }
}
// #endregion

function getKampfAudio() {
  return /** @type {HTMLAudioElement | null} */ ($('#kampfMusikAudio'));
}

function getBgAudio() {
  return /** @type {HTMLAudioElement | null} */ (document.getElementById('bgAudio'));
}

/** Musik-Elemente, deren Lautstärke gesteuert wird (Kampf-Loop auch kurz vor play()). */
function getMusicVolumeTargets() {
  const out = [];
  const kampf = getKampfAudio();
  if (kampf && state.kampfModus && kampf.src) out.push(kampf);
  const bg = getBgAudio();
  if (bg && bg.src && !bg.paused) out.push(bg);
  return out;
}

function usesMobileVolumeSelect() {
  return window.matchMedia('(max-width: 768px)').matches;
}

function readVolumeNorm(rangeId, selectId, fallback) {
  const mobile = usesMobileVolumeSelect();
  if (mobile) {
    const sel = /** @type {HTMLSelectElement | null} */ ($(selectId));
    if (sel?.value !== '') {
      const v = parseFloat(sel.value);
      if (!Number.isNaN(v)) {
        // #region agent log
        volDebug('H2', 'combatMusic.js:readVolumeNorm', 'read from mobile select', { selectId, selValue: sel.value, parsed: v, mobile });
        // #endregion
        return Math.max(0, Math.min(1, v));
      }
    }
  }
  const range = /** @type {HTMLInputElement | null} */ ($(rangeId));
  const v = parseFloat(range?.value ?? String(fallback));
  // #region agent log
  volDebug('H2', 'combatMusic.js:readVolumeNorm', 'read from range fallback', { rangeId, rangeValue: range?.value, parsed: v, mobile });
  // #endregion
  if (Number.isNaN(v)) return fallback;
  return Math.max(0, Math.min(1, v));
}

/** Musik-Lautstärke 0–1 (Slider oder Mobile-Select). */
export function readMusicVolumeNorm() {
  return readVolumeNorm('#bgVol', '#bgVolSelect', 0.35);
}

/** TTS-Lautstärke 0–1 (Slider oder Mobile-Select). */
export function readTtsVolumeNorm() {
  return readVolumeNorm('#ttsVol', '#ttsVolSelect', 1);
}

function readUserMusicVol() {
  return readMusicVolumeNorm();
}

/** Tatsächliche Musik-Lautstärke aus Slider (0 … MUSIC_VOL_CAP). */
export function scaleMusicVolume(sliderNorm = readUserMusicVol()) {
  return Math.max(0, Math.min(MUSIC_VOL_CAP, sliderNorm * MUSIC_VOL_CAP));
}

function computeTargetVolume() {
  return scaleMusicVolume(readUserMusicVol());
}

function nearestVolumeStep(value) {
  const v = Math.max(0, Math.min(1, Number(value) || 0));
  return VOLUME_SELECT_STEPS.reduce(
    (best, step) => (Math.abs(step - v) < Math.abs(best - v) ? step : best),
    VOLUME_SELECT_STEPS[0]
  );
}

function syncVolumeSelectFromRange(selectId, rangeId) {
  const sel = /** @type {HTMLSelectElement | null} */ ($(selectId));
  const range = /** @type {HTMLInputElement | null} */ ($(rangeId));
  if (!sel || !range) return;
  sel.value = String(nearestVolumeStep(range.value));
}

function buildVolumeSelect(selectEl) {
  if (!selectEl) return;
  selectEl.innerHTML = VOLUME_SELECT_STEPS.map((v) =>
    `<option value="${v}">${Math.round(v * 100)} %</option>`
  ).join('');
}

function pauseAllMusicForSpeech() {
  const kampf = getKampfAudio();
  if (kampf && !kampf.paused) {
    kampf.dataset.speechPaused = '1';
    kampf.pause();
  }
  const bg = getBgAudio();
  if (bg && !bg.paused) {
    bg.dataset.speechPaused = '1';
    bg.pause();
  }
}

function resumeMusicAfterSpeech() {
  const kampf = getKampfAudio();
  if (kampf?.dataset.speechPaused === '1') {
    delete kampf.dataset.speechPaused;
    if (state.kampfModus) syncCombatMusic();
  }
  const bg = getBgAudio();
  if (bg?.dataset.speechPaused === '1') {
    delete bg.dataset.speechPaused;
    if (state.isBgMusicPlaying && !state.kampfModus && bg.src) {
      bg.volume = scaleMusicVolume();
      bg.play().catch(() => {});
    }
  }
}

function applyVolumeRamp({ immediate = false } = {}) {
  const targets = getMusicVolumeTargets();
  targetEffectiveVol = computeTargetVolume();
  const kampf = getKampfAudio();
  if (kampf && state.kampfModus && kampf.src && !targets.includes(kampf)) {
    targets.push(kampf);
  }
  if (!targets.length) return;
  if (fadeTimer) clearInterval(fadeTimer);
  fadeTimer = null;
  if (immediate) {
    targets.forEach((el) => { el.volume = targetEffectiveVol; });
    return;
  }
  const starts = targets.map((el) => el.volume);
  const end = targetEffectiveVol;
  const t0 = performance.now();
  fadeTimer = setInterval(() => {
    const t = Math.min(1, (performance.now() - t0) / DUCK_MS);
    targets.forEach((el, i) => {
      el.volume = starts[i] + (end - starts[i]) * t;
    });
    if (t >= 1) {
      clearInterval(fadeTimer);
      fadeTimer = null;
    }
  }, 16);
}

/** Lautstärke-Slider: Kampf- und Tabellen-Musik. */
export function applyMusicVolumeFromSlider() {
  const vol = computeTargetVolume();
  const norm = readMusicVolumeNorm();
  localStorage.setItem(LS_MUSIK_VOL, String(norm));
  const kampf = getKampfAudio();
  const bg = getBgAudio();
  const kampfVolBefore = kampf?.volume;
  if (kampf?.src) kampf.volume = vol;
  if (bg?.src) bg.volume = vol;
  // #region agent log
  volDebug('H3', 'combatMusic.js:applyMusicVolumeFromSlider', 'volume applied', {
    norm,
    effectiveVol: vol,
    kampfModus: state.kampfModus,
    kampfHasSrc: !!kampf?.src,
    kampfPaused: kampf?.paused,
    kampfVolBefore,
    kampfVolAfter: kampf?.volume,
    bgHasSrc: !!bg?.src,
    bgVol: bg?.volume
  });
  // #endregion
}

function applyTtsVolumeFromSlider() {
  const vol = readTtsVolumeNorm();
  localStorage.setItem(LS_TTS_VOL, String(vol));
  const range = /** @type {HTMLInputElement | null} */ ($('#ttsVol'));
  if (range) range.value = String(vol);
  syncVolumeSelectFromRange('#ttsVolSelect', '#ttsVol');
  const sfx = /** @type {HTMLAudioElement | null} */ ($('#sfxAudio'));
  if (sfx?.src) sfx.volume = vol;
}

function bindVolumeSlider(id, handler) {
  const el = $(id);
  if (!el || el.dataset.volumeBound === '1') return;
  el.dataset.volumeBound = '1';
  const run = () => handler();
  el.addEventListener('input', run);
  el.addEventListener('change', run);
}

function initVolumeSelects() {
  const pairs = [
    {
      selectId: '#bgVolSelect',
      rangeId: '#bgVol',
      onChange: () => {
        const vol = readMusicVolumeNorm();
        const range = /** @type {HTMLInputElement | null} */ ($('#bgVol'));
        if (range) range.value = String(vol);
        localStorage.setItem(LS_MUSIK_VOL, String(vol));
        applyMusicVolumeFromSlider();
      }
    },
    {
      selectId: '#ttsVolSelect',
      rangeId: '#ttsVol',
      onChange: applyTtsVolumeFromSlider
    }
  ];

  for (const { selectId, rangeId, onChange } of pairs) {
    const sel = /** @type {HTMLSelectElement | null} */ ($(selectId));
    const range = /** @type {HTMLInputElement | null} */ ($(rangeId));
    if (!sel || !range || sel.dataset.volumeBound === '1') continue;
    sel.dataset.volumeBound = '1';
    buildVolumeSelect(sel);
    syncVolumeSelectFromRange(selectId, rangeId);
    // #region agent log
    volDebug('H5', 'combatMusic.js:initVolumeSelects', 'select bound', {
      selectId,
      optionCount: sel.options.length,
      initialValue: sel.value,
      mobile: usesMobileVolumeSelect()
    });
    // #endregion
    sel.addEventListener('change', () => {
      // #region agent log
      volDebug('H1', 'combatMusic.js:selectChange', 'select change fired', {
        selectId,
        selValue: sel.value,
        rangeBefore: range.value
      });
      // #endregion
      range.value = sel.value;
      syncVolumeSelectFromRange(selectId, rangeId);
      onChange();
    });
    const syncSelect = () => syncVolumeSelectFromRange(selectId, rangeId);
    range.addEventListener('input', syncSelect);
    range.addEventListener('change', syncSelect);
  }
}

/** Während Krit-Sprache/TTS: Musik kurz pausieren. */
export function combatMusicNotifySpeechOrSfxStart() {
  speechHoldCount++;
  if (speechHoldCount === 1) pauseAllMusicForSpeech();
}

/** Nach Krit-Sprache/TTS: Musik fortsetzen. */
export function combatMusicNotifySpeechOrSfxEnd() {
  speechHoldCount = Math.max(0, speechHoldCount - 1);
  if (speechHoldCount === 0) resumeMusicAfterSpeech();
}

function tierFromZiel(ziel) {
  if (!ziel) return 'standard';
  const t = String(ziel.gegnerTyp || 'normal').toLowerCase();
  if (t === 'klein') return 'standard';
  if (t === 'gewaltig') return 'bossfight';
  return 'kampf';
}

function monsterFilename(gegnerTyp) {
  const t = String(gegnerTyp || 'normal').toLowerCase();
  if (t === 'klein') return 'Klein_Gegner.mp3';
  if (t === 'gross') return 'Gross_Gegner.mp3';
  if (t === 'gewaltig') return 'Gewaltig_Gegner.mp3';
  return 'Normal_Gegner.mp3';
}

function archetypeFilename(profil, tier) {
  if (profil === 'npc_verbündet') return 'NPC_Verbuendet.mp3';
  const map = {
    barde: 'Barde',
    nordling: 'Nordling',
    hobbit: 'Hobbit',
    zwerg: 'Zwerg',
    gondorian: 'Gondorian',
    gegner: null
  };
  const stem = map[profil];
  if (!stem) return null;
  const pref = tier === 'standard' ? 'Standard' : tier === 'bossfight' ? 'Bossfight' : 'Kampf';
  return `${pref}_${stem}.mp3`;
}

function getOverrideProfil() {
  const sel = /** @type {HTMLSelectElement | null} */ ($('#kampfMusikProfilOverride'));
  const v = sel?.value?.trim() || '';
  return v && MUSIK_PROFIL_VALUES.includes(v) ? v : null;
}

/** Grösse des Schatten-Angreifers aus gewähltem Monster (Fallback: klein). */
export function getMonsterAngreiferGroesse() {
  const g = state.monsterAngreiferGegnerId ? getGegnerById(state.monsterAngreiferGegnerId) : null;
  const t = String(g?.gegnerTyp || '').toLowerCase();
  if (t === 'klein' || t === 'normal' || t === 'gross' || t === 'gewaltig') return t;
  return 'klein';
}

export function resolveCombatMusicFilename() {
  if (!state.kampfModus) return null;

  const override = getOverrideProfil();
  const firstZielId = (state.selectedGegnerIds || [])[0] || null;
  const zielG = firstZielId ? getGegnerById(firstZielId) : null;
  const zielC = !zielG && firstZielId ? getCharakterById(firstZielId) : null;
  const ziel = zielG || zielC?.char || null;

  if (state.angreiferSubTab === 'monster') {
    if (state.monsterAngreiferGegnerId) {
      return monsterFilename(getMonsterAngreiferGroesse());
    }
    return 'standard_schatten.mp3';
  }

  /* Charakterangriff (Licht) */
  const cid = state.kampfAngreiferCharakterId;
  if (!cid) {
    return 'standard_licht.mp3';
  }
  const ch = getCharakterById(cid);
  if (!ch) return null;
  const entityTyp = ch.typ === 'npc' ? 'npc' : 'spieler';
  const profil = coerceMusikProfil((override || ch.char.musikProfil), entityTyp);
  if (profil === 'gegner') {
    return monsterFilename(ziel?.gegnerTyp || 'normal');
  }
  const tier = tierFromZiel(ziel);
  return archetypeFilename(profil, tier);
}

function fullUrl(relativeFile) {
  if (!relativeFile) return '';
  return new URL(KAMPF_AUDIO_BASE_PATH + relativeFile, window.location.href).href;
}

function updatePlayBtnUI() {
  const btn = $('#bgToggleBtn');
  if (!btn) return;
  const on = !!state.kampfModus;
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  btn.setAttribute('aria-label', on ? 'Kampfmusik pausieren' : 'Kampfmusik starten');
  btn.title = on ? 'Kampfmusik pausieren' : 'Kampfmusik starten';
  btn.textContent = on ? 'Musik ⏸︎' : 'Musik ▶︎';
  btn.classList.toggle('active', on);
}

export function syncCombatMusic() {
  const el = getKampfAudio();
  if (!el) return;
  updatePlayBtnUI();
  if (!state.kampfModus) {
    el.pause();
    currentSrcKey = '';
    return;
  }
  const file = resolveCombatMusicFilename();
  if (!file) {
    el.pause();
    el.removeAttribute('src');
    currentSrcKey = '';
    return;
  }
  const key = file;
  if (key !== currentSrcKey) {
    currentSrcKey = key;
    el.src = fullUrl(file);
    el.loop = true;
    applyVolumeRamp();
    const bg = /** @type {HTMLAudioElement | null} */ (document.getElementById('bgAudio'));
    if (bg) bg.pause();
    el.play().catch(() => {});
  } else {
    applyVolumeRamp();
    // #region agent log
    volDebug('H4', 'combatMusic.js:syncCombatMusic', 'same track volume ramp', {
      key,
      targetVol: targetEffectiveVol,
      kampfVolume: el.volume,
      kampfPaused: el.paused
    });
    // #endregion
    if (el.paused) el.play().catch(() => {});
  }
}

/** Licht/Schatten aus localStorage; Standard Licht. */
export function loadAngreiferModusFromStorage() {
  const saved = localStorage.getItem(LS_ANGRIFFSMODUS);
  state.angreiferSubTab = saved === 'charakter' || saved === 'monster' ? saved : 'charakter';
}

export function persistAngreiferModus() {
  localStorage.setItem(LS_ANGRIFFSMODUS, state.angreiferSubTab === 'monster' ? 'monster' : 'charakter');
}

export function loadKampfModusFromStorage() {
  state.kampfModus = localStorage.getItem(LS_KAMPF_MODUS) === '1';
  const vol = parseFloat(localStorage.getItem(LS_MUSIK_VOL) || '');
  const vEl = /** @type {HTMLInputElement | null} */ ($('#bgVol'));
  if (vEl && !Number.isNaN(vol) && vol >= 0 && vol <= 1) {
    vEl.value = String(vol);
    const bg = /** @type {HTMLAudioElement | null} */ (document.getElementById('bgAudio'));
    if (bg) bg.volume = scaleMusicVolume(vol);
  }
  const ttsVol = parseFloat(localStorage.getItem(LS_TTS_VOL) || '');
  const ttsEl = /** @type {HTMLInputElement | null} */ ($('#ttsVol'));
  if (ttsEl && !Number.isNaN(ttsVol) && ttsVol >= 0 && ttsVol <= 1) {
    ttsEl.value = String(ttsVol);
  }
  const savedKat = localStorage.getItem(LS_SCHATTEN_KAT) || '';
  state.schattenMusikKategorie = savedKat || 'klein';
  loadAngreiferModusFromStorage();
  updatePlayBtnUI();
}

export function persistKampfModus() {
  localStorage.setItem(LS_KAMPF_MODUS, state.kampfModus ? '1' : '0');
}

export function persistSchattenKategorie() {
  localStorage.setItem(LS_SCHATTEN_KAT, state.schattenMusikKategorie || 'klein');
}

export function initCombatMusic() {
  loadKampfModusFromStorage();

  $('#bgToggleBtn')?.addEventListener('click', () => {
    state.kampfModus = !state.kampfModus;
    persistKampfModus();
    syncCombatMusic();
  });

  bindVolumeSlider('#bgVol', () => {
    syncVolumeSelectFromRange('#bgVolSelect', '#bgVol');
    applyMusicVolumeFromSlider();
  });
  bindVolumeSlider('#ttsVol', () => {
    syncVolumeSelectFromRange('#ttsVolSelect', '#ttsVol');
    applyTtsVolumeFromSlider();
  });
  initVolumeSelects();

  $('#kampfMusikProfilOverride')?.addEventListener('change', () => {
    syncCombatMusic();
  });

  document.addEventListener('visibilitychange', () => {
    const el = getKampfAudio();
    if (!el) return;
    if (document.visibilityState === 'hidden') {
      el.pause();
    } else {
      syncCombatMusic();
    }
  });

  const sel = $('#kampfMusikProfilOverride');
  if (sel && !sel.dataset.built) {
    sel.dataset.built = '1';
    sel.innerHTML = '<option value="">(Auto)</option>' +
      MUSIK_PROFIL_VALUES.map((id) =>
        `<option value="${id}">${MUSIK_PROFIL_LABELS[id] || id}</option>`
      ).join('');
  }
}

export function fillMusikProfilSelect(selectEl, value, entityTyp) {
  if (!selectEl) return;
  const v = coerceMusikProfil(value, entityTyp);
  selectEl.innerHTML = MUSIK_PROFIL_VALUES.map((id) =>
    `<option value="${id}"${id === v ? ' selected' : ''}>${MUSIK_PROFIL_LABELS[id] || id}</option>`
  ).join('');
}
