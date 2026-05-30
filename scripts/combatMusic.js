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
/** Während Krit-Sprache/TTS: Musik auf diesen Anteil der Basislautstärke ducken (0.65 ≈ leise Hintergrundmusik). */
const SPEECH_DUCK_FACTOR = 0.65;
const VOLUME_SELECT_STEPS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];

let speechHoldCount = 0;
let fadeTimer = null;
let targetEffectiveVol = 0;
let currentSrcKey = '';

let audioCtx = null;
let kampfGain = null;
let kampfSourceConnected = false;

function initKampfGainChain() {
  if (kampfSourceConnected) return true;
  const el = getKampfAudio();
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!el || !Ctx) return false;
  try {
    audioCtx = audioCtx || new Ctx();
    const src = audioCtx.createMediaElementSource(el);
    kampfGain = audioCtx.createGain();
    src.connect(kampfGain);
    kampfGain.connect(audioCtx.destination);
    kampfSourceConnected = true;
    return true;
  } catch (err) {
    return false;
  }
}

function resumeKampfAudioContext() {
  if (audioCtx?.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
}

function setKampfOutputVolume(vol) {
  const clamped = Math.max(0, Math.min(1, vol));
  initKampfGainChain();
  resumeKampfAudioContext();
  if (kampfGain) {
    kampfGain.gain.value = clamped;
  } else {
    const el = getKampfAudio();
    if (el) el.volume = clamped;
  }
}

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

function readVolumeNorm(rangeId, _selectId, fallback) {
  const range = /** @type {HTMLInputElement | null} */ ($(rangeId));
  const v = parseFloat(range?.value ?? String(fallback));
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
  const base = scaleMusicVolume(readUserMusicVol());
  if (speechHoldCount > 0) {
    return base * SPEECH_DUCK_FACTOR;
  }
  return base;
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

function applySpeechDucking() {
  applyVolumeRamp({ immediate: true });
}

/** Während Krit-Sprache/TTS: Musik leiser (nicht pausieren). */
export function combatMusicNotifySpeechOrSfxStart() {
  speechHoldCount++;
  applySpeechDucking();
}

/** Nach Krit-Sprache/TTS: Musik-Lautstärke wiederherstellen. */
export function combatMusicNotifySpeechOrSfxEnd() {
  speechHoldCount = Math.max(0, speechHoldCount - 1);
  applySpeechDucking();
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
    targets.forEach((el) => {
      if (el.id === 'kampfMusikAudio') setKampfOutputVolume(targetEffectiveVol);
      else el.volume = targetEffectiveVol;
    });
    return;
  }
  const starts = targets.map((el) => el.volume);
  const end = targetEffectiveVol;
  const t0 = performance.now();
  fadeTimer = setInterval(() => {
    const t = Math.min(1, (performance.now() - t0) / DUCK_MS);
    targets.forEach((el, i) => {
      const v = starts[i] + (end - starts[i]) * t;
      if (el.id === 'kampfMusikAudio') setKampfOutputVolume(v);
      else el.volume = v;
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
  if (kampf && state.kampfModus) setKampfOutputVolume(vol);
  if (bg?.src) bg.volume = vol;
  applyVolumeRamp({ immediate: true });
  updateVolumeLabels();
}

function updateVolumeLabels() {
  const musicNorm = readMusicVolumeNorm();
  const musicEff = scaleMusicVolume(musicNorm);
  const bgLabel = $('#bgVolLabel');
  if (bgLabel) {
    bgLabel.textContent = `${Math.round(musicNorm * 100)}% → ${Math.round(musicEff * 100)}%`;
  }
  const ttsNorm = readTtsVolumeNorm();
  const ttsLabel = $('#ttsVolLabel');
  if (ttsLabel) ttsLabel.textContent = `${Math.round(ttsNorm * 100)}%`;
}

function stepVolume(rangeId, delta, applyFn) {
  const range = /** @type {HTMLInputElement | null} */ ($(rangeId));
  if (!range) return;
  const cur = parseFloat(range.value || '0');
  const next = Math.max(0, Math.min(1, Math.round((cur + delta) * 100) / 100));
  range.value = String(next);
  applyFn();
  updateVolumeLabels();
}

function initVolumeSteppers() {
  document.querySelectorAll('.volume-step-btn').forEach((btn) => {
    if (btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const target = btn.getAttribute('data-target');
      const delta = btn.getAttribute('data-action') === 'up' ? 0.1 : -0.1;
      if (target === 'bgVol') stepVolume('#bgVol', delta, applyMusicVolumeFromSlider);
      else if (target === 'ttsVol') stepVolume('#ttsVol', delta, applyTtsVolumeFromSlider);
    });
  });
}

function initVolumeControlDelegation() {
  const section = document.querySelector('.user-profile-audio-section');
  if (!section || section.dataset.volDelegated === '1') return;
  section.dataset.volDelegated = '1';
  const onAdjust = (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (t.id === 'bgVol') {
      applyMusicVolumeFromSlider();
      updateVolumeLabels();
    } else if (t.id === 'ttsVol') {
      applyTtsVolumeFromSlider();
      updateVolumeLabels();
    }
  };
  section.addEventListener('input', onAdjust);
  section.addEventListener('change', onAdjust);
}

function applyTtsVolumeFromSlider() {
  const vol = readTtsVolumeNorm();
  localStorage.setItem(LS_TTS_VOL, String(vol));
  const range = /** @type {HTMLInputElement | null} */ ($('#ttsVol'));
  if (range) range.value = String(vol);
  syncVolumeSelectFromRange('#ttsVolSelect', '#ttsVol');
  const sfx = /** @type {HTMLAudioElement | null} */ ($('#sfxAudio'));
  if (sfx?.src) sfx.volume = vol;
  updateVolumeLabels();
}

function bindVolumeSlider(id, handler) {
  const el = $(id);
  if (!el || el.dataset.volumeBound === '1') return;
  el.dataset.volumeBound = '1';
  const run = () => {
    handler();
    updateVolumeLabels();
  };
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
    sel.addEventListener('change', () => {
      range.value = sel.value;
      syncVolumeSelectFromRange(selectId, rangeId);
      onChange();
    });
    sel.addEventListener('blur', () => {
      if (range.value !== sel.value) {
        range.value = sel.value;
        onChange();
      }
    });
    const syncSelect = () => syncVolumeSelectFromRange(selectId, rangeId);
    range.addEventListener('input', syncSelect);
    range.addEventListener('change', syncSelect);
  }
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
    initKampfGainChain();
    resumeKampfAudioContext();
    setKampfOutputVolume(computeTargetVolume());
    applyVolumeRamp();
    const bg = /** @type {HTMLAudioElement | null} */ (document.getElementById('bgAudio'));
    if (bg) bg.pause();
    el.play().catch(() => {});
  } else {
    applyVolumeRamp();
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
  updateVolumeLabels();
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
    initKampfGainChain();
    resumeKampfAudioContext();
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
  initVolumeSteppers();
  initVolumeControlDelegation();
  updateVolumeLabels();

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
