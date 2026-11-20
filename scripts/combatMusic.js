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
const LS_STANDARD_MUSIK_LICHT = 'mers_standard_musik_licht';
const LS_STANDARD_MUSIK_SCHATTEN = 'mers_standard_musik_schatten';

const DUCK_MS = 280;
/** Slider 100 % = max. 60 % effektive Musik-Lautstärke. */
const MUSIC_VOL_CAP = 0.6;
/** Während Krit-Sprache/TTS: Musik auf diesen Anteil der Basislautstärke ducken (0.65 ≈ leise Hintergrundmusik). */
const SPEECH_DUCK_FACTOR = 0.65;
/** Standard-Playlist: Wiederholungen pro Stück, bevor zum nächsten gewechselt wird. */
const STANDARD_LOOPS_PER_TRACK = 3;
/** Überlappender Crossfade beim Stück- oder Trackwechsel (ms). */
const STANDARD_CROSSFADE_MS = 6000;
const VOLUME_SELECT_STEPS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];

let speechHoldCount = 0;
let fadeTimer = null;
let targetEffectiveVol = 0;
let currentSrcKey = '';

/** Standard-Playlists (Präfix standard_licht* / standard_schatten*). Neue Dateien hier ergänzen. */
const STANDARD_LICHT_TRACKS = [
  'standard_licht.mp3',
  'standard_licht_abschied1.mp3',
  'standard_licht_abschied2.mp3',
  'standard_licht_bruchtal.mp3',
  'standard_licht_gondor.mp3',
  'standard_licht_hobbingen1.mp3',
  'standard_licht_hobbingen2.mp3',
  'standard_licht_moria.mp3',
  'standard_licht_reiter.mp3',
  'standard_licht_rohan.mp3',
  'standard_licht_wirtschaft1.mp3'
];

const STANDARD_SCHATTEN_TRACKS = [
  'standard_schatten.mp3',
  'standard_schatten_mordor1.mp3',
  'standard_schatten_mordor2.mp3',
  'standard_schatten_mordor3.mp3'
];

let activeStandardPool = null;
let activeStandardTrack = null;
let activeStandardPlaylist = [];
let activeStandardPlaylistIdx = 0;
let standardTrackLoopCount = 0;
let standardTransitionTimer = null;
let standardCrossfadeScheduled = false;

let audioCtx = null;
let kampfSlot = 'a';
let kampfGainA = null;
let kampfGainB = null;
let kampfConnectedA = false;
let kampfConnectedB = false;

function getKampfElA() {
  return /** @type {HTMLAudioElement | null} */ ($('#kampfMusikAudio'));
}

function getKampfElB() {
  return /** @type {HTMLAudioElement | null} */ ($('#kampfMusikAudioB'));
}

function getActiveKampfEl() {
  return kampfSlot === 'a' ? getKampfElA() : getKampfElB();
}

function getInactiveKampfEl() {
  return kampfSlot === 'a' ? getKampfElB() : getKampfElA();
}

function getKampfGainForSlot(slot) {
  return slot === 'a' ? kampfGainA : kampfGainB;
}

function getActiveKampfGain() {
  return getKampfGainForSlot(kampfSlot);
}

function getInactiveKampfGain() {
  return getKampfGainForSlot(kampfSlot === 'a' ? 'b' : 'a');
}

function getKampfAudio() {
  return getActiveKampfEl();
}

function isKampfAudioElement(el) {
  return !!el && (el.id === 'kampfMusikAudio' || el.id === 'kampfMusikAudioB');
}

function initKampfGainForSlot(el, slot) {
  const connected = slot === 'a' ? kampfConnectedA : kampfConnectedB;
  if (connected) return true;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!el || !Ctx) return false;
  try {
    audioCtx = audioCtx || new Ctx();
    const src = audioCtx.createMediaElementSource(el);
    const gain = audioCtx.createGain();
    src.connect(gain);
    gain.connect(audioCtx.destination);
    if (slot === 'a') {
      kampfGainA = gain;
      kampfConnectedA = true;
    } else {
      kampfGainB = gain;
      kampfConnectedB = true;
    }
    return true;
  } catch (err) {
    return false;
  }
}

function initKampfGainChain() {
  initKampfGainForSlot(getKampfElA(), 'a');
  initKampfGainForSlot(getKampfElB(), 'b');
  return kampfConnectedA || kampfConnectedB;
}

function resumeKampfAudioContext() {
  if (audioCtx?.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
}

function pauseInactiveKampfEl() {
  const inactive = getInactiveKampfEl();
  const inGain = getInactiveKampfGain();
  if (inactive) {
    inactive.pause();
    inactive.currentTime = 0;
  }
  if (inGain) inGain.gain.value = 0;
}

function setKampfOutputVolume(vol) {
  const clamped = Math.max(0, Math.min(1, vol));
  initKampfGainChain();
  resumeKampfAudioContext();
  const activeGain = getActiveKampfGain();
  const inactiveGain = getInactiveKampfGain();
  if (activeGain && inactiveGain && standardTransitionTimer) {
    const aVal = kampfGainA?.gain.value ?? 0;
    const bVal = kampfGainB?.gain.value ?? 0;
    const sum = aVal + bVal;
    if (sum > 0.001) {
      const scale = clamped / sum;
      if (kampfGainA) kampfGainA.gain.value = aVal * scale;
      if (kampfGainB) kampfGainB.gain.value = bVal * scale;
    } else if (activeGain) {
      activeGain.gain.value = clamped;
    }
    return;
  }
  if (activeGain) activeGain.gain.value = clamped;
  if (inactiveGain) inactiveGain.gain.value = 0;
  const el = getActiveKampfEl();
  if (!activeGain && el) el.volume = clamped;
}

function rampGainNode(gainNode, targetVol, durationMs) {
  if (!gainNode || !audioCtx) return;
  const clamped = Math.max(0, Math.min(1, targetVol));
  const g = gainNode.gain;
  const t0 = audioCtx.currentTime;
  const dur = Math.max(0.05, durationMs / 1000);
  g.cancelScheduledValues(t0);
  g.setValueAtTime(g.value, t0);
  g.linearRampToValueAtTime(clamped, t0 + dur);
}

function rampKampfGain(targetVol, durationMs) {
  rampGainNode(getActiveKampfGain(), targetVol, durationMs);
}

function getBgAudio() {
  return /** @type {HTMLAudioElement | null} */ (document.getElementById('bgAudio'));
}

/** Musik-Elemente, deren Lautstärke gesteuert wird (Kampf-Loop auch kurz vor play()). */
function getMusicVolumeTargets() {
  const out = [];
  const kampfA = getKampfElA();
  const kampfB = getKampfElB();
  if (state.kampfModus) {
    if (kampfA?.src && !kampfA.paused) out.push(kampfA);
    if (kampfB?.src && !kampfB.paused) out.push(kampfB);
    if (!out.length && getActiveKampfEl()?.src) out.push(getActiveKampfEl());
  }
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
      if (isKampfAudioElement(el)) setKampfOutputVolume(targetEffectiveVol);
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
      if (isKampfAudioElement(el)) setKampfOutputVolume(v);
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

function isStandardPoolTrack(filename) {
  return STANDARD_LICHT_TRACKS.includes(filename) || STANDARD_SCHATTEN_TRACKS.includes(filename);
}

function getStandardPoolKey() {
  return state.angreiferSubTab === 'monster' ? 'schatten' : 'licht';
}

function getStandardTracksForPool(poolKey) {
  return poolKey === 'licht' ? STANDARD_LICHT_TRACKS : STANDARD_SCHATTEN_TRACKS;
}

function getFixedStandardTrackLsKey(poolKey) {
  return poolKey === 'licht' ? LS_STANDARD_MUSIK_LICHT : LS_STANDARD_MUSIK_SCHATTEN;
}

function getFixedStandardTrack(poolKey) {
  const saved = localStorage.getItem(getFixedStandardTrackLsKey(poolKey)) || '';
  const pool = getStandardTracksForPool(poolKey);
  return pool.includes(saved) ? saved : '';
}

function persistFixedStandardTrack(poolKey, filename) {
  const lsKey = getFixedStandardTrackLsKey(poolKey);
  if (!filename) localStorage.removeItem(lsKey);
  else localStorage.setItem(lsKey, filename);
}

function isStandardPlaylistMode(poolKey) {
  return !getFixedStandardTrack(poolKey);
}

function formatStandardTrackLabel(filename) {
  let s = filename.replace(/\.mp3$/i, '');
  const lichtP = 'standard_licht_';
  const schattenP = 'standard_schatten_';
  if (s.startsWith(lichtP)) s = s.slice(lichtP.length);
  else if (s.startsWith(schattenP)) s = s.slice(schattenP.length);
  else if (s === 'standard_licht' || s === 'standard_schatten') return 'Standard';
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function rebuildStandardMusikSelect() {
  const sel = /** @type {HTMLSelectElement | null} */ ($('#standardKampfMusikSelect'));
  const badge = $('#standardKampfMusikBadge');
  if (!sel) return;
  const poolKey = getStandardPoolKey();
  const pool = getStandardTracksForPool(poolKey);
  const fixed = getFixedStandardTrack(poolKey);
  sel.innerHTML = '<option value="">Zufällig (Rotation)</option>' +
    pool.map((f) =>
      `<option value="${f}"${f === fixed ? ' selected' : ''}>${formatStandardTrackLabel(f)}</option>`
    ).join('');
  sel.value = fixed || '';
  if (badge) badge.textContent = poolKey === 'licht' ? 'Licht' : 'Schatten';
}

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function cancelStandardTransition() {
  if (standardTransitionTimer) {
    clearTimeout(standardTransitionTimer);
    standardTransitionTimer = null;
  }
  standardCrossfadeScheduled = false;
}

function clearStandardPoolState() {
  cancelStandardTransition();
  activeStandardPool = null;
  activeStandardTrack = null;
  activeStandardPlaylist = [];
  activeStandardPlaylistIdx = 0;
  standardTrackLoopCount = 0;
}

function initStandardSession(poolKey) {
  const pool = poolKey === 'licht' ? STANDARD_LICHT_TRACKS : STANDARD_SCHATTEN_TRACKS;
  activeStandardPool = poolKey;
  activeStandardPlaylist = shuffleArray(pool);
  activeStandardPlaylistIdx = 0;
  activeStandardTrack = activeStandardPlaylist[0] || null;
  standardTrackLoopCount = 0;
}

function resolveStandardTrack(poolKey) {
  const fixed = getFixedStandardTrack(poolKey);
  if (fixed) {
    activeStandardPool = poolKey;
    activeStandardTrack = fixed;
    return fixed;
  }
  if (activeStandardPool !== poolKey || !activeStandardTrack || !activeStandardPlaylist.length) {
    initStandardSession(poolKey);
  }
  return activeStandardTrack;
}

function advanceStandardTrack() {
  if (!activeStandardPool || !activeStandardPlaylist.length) return null;
  activeStandardPlaylistIdx++;
  if (activeStandardPlaylistIdx >= activeStandardPlaylist.length) {
    const pool = activeStandardPool === 'licht' ? STANDARD_LICHT_TRACKS : STANDARD_SCHATTEN_TRACKS;
    activeStandardPlaylist = shuffleArray(pool);
    activeStandardPlaylistIdx = 0;
  }
  activeStandardTrack = activeStandardPlaylist[activeStandardPlaylistIdx];
  standardTrackLoopCount = 0;
  return activeStandardTrack;
}

function overlapCrossfadeStandardTrack(file) {
  cancelStandardTransition();
  initKampfGainChain();
  resumeKampfAudioContext();

  const outEl = getActiveKampfEl();
  const inEl = getInactiveKampfEl();
  const outGain = getActiveKampfGain();
  const inGain = getInactiveKampfGain();
  if (!outEl || !inEl || !outGain || !inGain || !audioCtx) return;

  const targetVol = computeTargetVolume();
  inEl.src = fullUrl(file);
  inEl.loop = false;
  inEl.currentTime = 0;
  inGain.gain.setValueAtTime(0, audioCtx.currentTime);
  inEl.play().catch(() => {});

  const t0 = audioCtx.currentTime;
  const dur = STANDARD_CROSSFADE_MS / 1000;
  outGain.gain.cancelScheduledValues(t0);
  inGain.gain.cancelScheduledValues(t0);
  outGain.gain.setValueAtTime(outGain.gain.value, t0);
  inGain.gain.setValueAtTime(0, t0);
  outGain.gain.linearRampToValueAtTime(0, t0 + dur);
  inGain.gain.linearRampToValueAtTime(targetVol, t0 + dur);

  standardCrossfadeScheduled = true;
  standardTransitionTimer = setTimeout(() => {
    standardTransitionTimer = null;
    standardCrossfadeScheduled = false;
    outEl.pause();
    outEl.currentTime = 0;
    outGain.gain.value = 0;
    kampfSlot = kampfSlot === 'a' ? 'b' : 'a';
    currentSrcKey = file;
  }, STANDARD_CROSSFADE_MS);
}

function startStandardTrackWithFadeIn(file) {
  cancelStandardTransition();
  pauseInactiveKampfEl();
  const el = getActiveKampfEl();
  if (!el) return;
  currentSrcKey = file;
  el.src = fullUrl(file);
  el.loop = false;
  initKampfGainChain();
  resumeKampfAudioContext();
  const activeGain = getActiveKampfGain();
  if (activeGain) activeGain.gain.value = 0;
  else el.volume = 0;
  el.play().catch(() => {});
  rampGainNode(activeGain, computeTargetVolume(), STANDARD_CROSSFADE_MS);
}

function scheduleStandardTransition() {
  if (standardTransitionTimer || standardCrossfadeScheduled) return;
  if (!state.kampfModus) return;
  const currentFile = resolveCombatMusicFilename();
  if (!currentFile || !isStandardPoolTrack(currentFile)) return;

  const poolKey = getStandardPoolKey();
  let nextFile;
  if (!isStandardPlaylistMode(poolKey)) {
    nextFile = activeStandardTrack || currentFile;
  } else {
    const nextLoopCount = standardTrackLoopCount + 1;
    if (nextLoopCount < STANDARD_LOOPS_PER_TRACK) {
      standardTrackLoopCount = nextLoopCount;
      nextFile = activeStandardTrack;
    } else {
      nextFile = advanceStandardTrack();
    }
  }
  if (!nextFile) return;
  overlapCrossfadeStandardTrack(nextFile);
}

function onKampfTimeUpdate(e) {
  const el = /** @type {HTMLAudioElement} */ (e.target);
  if (!isKampfAudioElement(el) || el !== getActiveKampfEl()) return;
  if (!state.kampfModus || standardTransitionTimer || standardCrossfadeScheduled) return;
  if (!currentSrcKey || !isStandardPoolTrack(currentSrcKey)) return;
  const dur = el.duration;
  const remain = dur - el.currentTime;
  const crossfadeSec = STANDARD_CROSSFADE_MS / 1000;
  if (!Number.isFinite(dur) || dur <= 0 || remain > crossfadeSec || remain <= 0.05) return;
  scheduleStandardTransition();
}

function onKampfTrackEnded(e) {
  const el = /** @type {HTMLAudioElement | undefined} */ (e?.target);
  if (el && el !== getActiveKampfEl()) return;
  if (!state.kampfModus || standardTransitionTimer || standardCrossfadeScheduled) return;
  scheduleStandardTransition();
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
      clearStandardPoolState();
      return monsterFilename(getMonsterAngreiferGroesse());
    }
    return resolveStandardTrack('schatten');
  }

  /* Charakterangriff (Licht) */
  const cid = state.kampfAngreiferCharakterId;
  if (!cid) {
    return resolveStandardTrack('licht');
  }
  clearStandardPoolState();
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
  const el = getActiveKampfEl();
  if (!el) return;
  updatePlayBtnUI();
  if (!state.kampfModus) {
    getKampfElA()?.pause();
    getKampfElB()?.pause();
    currentSrcKey = '';
    clearStandardPoolState();
    return;
  }
  const file = resolveCombatMusicFilename();
  if (!file) {
    getKampfElA()?.pause();
    getKampfElB()?.pause();
    getKampfElA()?.removeAttribute('src');
    getKampfElB()?.removeAttribute('src');
    currentSrcKey = '';
    return;
  }
  const key = file;
  if (key !== currentSrcKey) {
    const bg = /** @type {HTMLAudioElement | null} */ (document.getElementById('bgAudio'));
    if (bg) bg.pause();
    if (isStandardPoolTrack(file)) {
      startStandardTrackWithFadeIn(file);
    } else {
      cancelStandardTransition();
      pauseInactiveKampfEl();
      currentSrcKey = key;
      el.src = fullUrl(file);
      el.loop = true;
      initKampfGainChain();
      resumeKampfAudioContext();
      setKampfOutputVolume(computeTargetVolume());
      el.play().catch(() => {});
    }
    applyVolumeRamp();
  } else {
    if (isStandardPoolTrack(file)) {
      getActiveKampfEl().loop = false;
    }
    applyVolumeRamp();
    if (getActiveKampfEl()?.paused) getActiveKampfEl().play().catch(() => {});
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

  [getKampfElA(), getKampfElB()].forEach((kampfEl) => {
    if (!kampfEl || kampfEl.dataset.standardEndedBound === '1') return;
    kampfEl.dataset.standardEndedBound = '1';
    kampfEl.addEventListener('ended', onKampfTrackEnded);
    kampfEl.addEventListener('timeupdate', onKampfTimeUpdate);
  });

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

  rebuildStandardMusikSelect();
  $('#standardKampfMusikSelect')?.addEventListener('change', () => {
    const sel = /** @type {HTMLSelectElement | null} */ ($('#standardKampfMusikSelect'));
    const poolKey = getStandardPoolKey();
    persistFixedStandardTrack(poolKey, sel?.value || '');
    clearStandardPoolState();
    syncCombatMusic();
  });

  $('#kampfMusikProfilOverride')?.addEventListener('change', () => {
    syncCombatMusic();
  });

  document.addEventListener('visibilitychange', () => {
    const el = getActiveKampfEl();
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
