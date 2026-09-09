// critCorrections.js
// Speichert Korrekturen für Krit-Texte (visual/tts).
// Firebase-Sync wenn konfiguriert, sonst localStorage.
// Schlüssel: typ_kat_range (z.B. "Stich_A_1-5")

import { isFirebaseActive, loadCritCorrectionsFromFirebase, saveCritCorrectionsToFirebase, subscribeToCritCorrections } from './firebase-storage.js';

const STORAGE_KEY = 'merp_crit_corrections';

let cache = {};
let unsubFirebase = null;

function correctionKey(typ, kat, range) {
  return `${typ}_${kat}_${range}`;
}

function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveToLocalStorage(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

/**
 * Lädt Korrekturen (Firebase oder localStorage) und abonniert Änderungen.
 * Muss vor der ersten Nutzung aufgerufen werden.
 */
export async function initCritCorrections() {
  cache = {};
  if (isFirebaseActive()) {
    try {
      const fromFb = await loadCritCorrectionsFromFirebase();
      const fromLocal = loadFromLocalStorage();
      const merged = { ...(fromFb || {}), ...fromLocal };
      if (Object.keys(fromLocal).length > 0) {
        saveCritCorrectionsToFirebase(merged);
        try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
      }
      cache = merged;
      unsubFirebase = subscribeToCritCorrections((data) => {
        cache = data || {};
      });
      return;
    } catch (e) {
      console.warn('[MERS] Firebase crit corrections load failed, fallback to localStorage:', e?.message);
    }
  }
  cache = loadFromLocalStorage();
}

export function getCorrection(typ, kat, range) {
  return cache[correctionKey(typ, kat, range)] || null;
}

export function setCorrection(typ, kat, range, { visual, tts }) {
  const key = correctionKey(typ, kat, range);
  if (visual != null || tts != null) {
    cache[key] = { visual: String(visual ?? ''), tts: String(tts ?? '') };
  } else {
    delete cache[key];
  }
  if (isFirebaseActive()) {
    saveCritCorrectionsToFirebase(cache);
  } else {
    saveToLocalStorage(cache);
  }
  return true;
}

export function deleteCorrection(typ, kat, range) {
  return setCorrection(typ, kat, range, { visual: null, tts: null });
}

/** Exportiert alle Korrekturen als JSON (für Backup oder Merge in tables) */
export function exportCorrections() {
  return JSON.stringify(cache, null, 2);
}
