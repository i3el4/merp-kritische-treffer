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

let duckDepth = 0;
let fadeTimer = null;
let targetEffectiveVol = 0;
let currentSrcKey = '';

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

function readUserMusicVol() {
  const el = /** @type {HTMLInputElement | null} */ ($('#bgVol'));
  const v = parseFloat(el?.value ?? '0.35');
  if (Number.isNaN(v)) return 0.35;
  return Math.max(0, Math.min(1, v));
}

/** Tatsächliche Musik-Lautstärke aus Slider (0 … MUSIC_VOL_CAP). */
export function scaleMusicVolume(sliderNorm = readUserMusicVol()) {
  return Math.max(0, Math.min(MUSIC_VOL_CAP, sliderNorm * MUSIC_VOL_CAP));
}

/** Je höher der Slider, desto stärker ducken (relativ zur Basislautstärke). */
function duckFactorForSlider(sliderNorm) {
  const load = Math.max(0, Math.min(1, sliderNorm));
  return 0.14 - load * 0.10;
}

function computeTargetVolume() {
  const slider = readUserMusicVol();
  const base = scaleMusicVolume(slider);
  if (duckDepth > 0) {
    return base * duckFactorForSlider(slider);
  }
  return base;
}

function applyVolumeRamp({ immediate = false } = {}) {
  const targets = getMusicVolumeTargets();
  if (!targets.length) return;
  targetEffectiveVol = computeTargetVolume();
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

/** Lautstärke-Slider: Kampf- und Tabellen-Musik inkl. Ducking. */
export function applyMusicVolumeFromSlider() {
  applyVolumeRamp({ immediate: duckDepth > 0 });
}

function applyTtsVolumeFromSlider() {
  const el = /** @type {HTMLInputElement | null} */ ($('#ttsVol'));
  if (!el) return;
  localStorage.setItem(LS_TTS_VOL, el.value);
  const sfx = /** @type {HTMLAudioElement | null} */ ($('#sfxAudio'));
  if (sfx && !sfx.paused && sfx.src) {
    sfx.volume = parseFloat(el.value || '1');
  }
}

function bindVolumeSlider(id, handler) {
  const el = $(id);
  if (!el || el.dataset.volumeBound === '1') return;
  el.dataset.volumeBound = '1';
  const run = () => handler();
  el.addEventListener('input', run);
  el.addEventListener('change', run);
}

/** Öffentlich: TTS oder Krit-SFX startet — Musik ducken. */
export function combatMusicNotifySpeechOrSfxStart() {
  duckDepth++;
  applyVolumeRamp({ immediate: true });
}

/** Öffentlich: TTS oder Krit-SFX endet. */
export function combatMusicNotifySpeechOrSfxEnd() {
  duckDepth = Math.max(0, duckDepth - 1);
  applyVolumeRamp({ immediate: duckDepth === 0 });
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
    const el = /** @type {HTMLInputElement | null} */ ($('#bgVol'));
    if (el) localStorage.setItem(LS_MUSIK_VOL, el.value);
    applyMusicVolumeFromSlider();
  });
  bindVolumeSlider('#ttsVol', applyTtsVolumeFromSlider);

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
