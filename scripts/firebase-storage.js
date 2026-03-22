// firebase-storage.js
// Speicher-Schicht: Firebase Realtime Database mit localStorage-Fallback.
// Wenn firebase-config.js konfiguriert ist, wird Firebase für Sync verwendet.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
  getDatabase,
  ref,
  set,
  get,
  onValue
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';

const LOCAL_KEY = 'merp_kampagnen';
const LOCAL_KNOWN_IDS = 'merp_known_campaign_ids';
const LOCAL_CURRENT_ID = 'merp_current_campaign_id';

let firebaseApp = null;
let firebaseDb = null;
let currentUnsubscribe = null;
let cache = { currentId: null, kampagnen: {} };
let onDataChanged = null;

function migrateKampagne(k) {
  if (!k) return k;
  if (!Array.isArray(k.spieler)) k.spieler = [];
  if (!Array.isArray(k.npcs)) k.npcs = [];
  (k.spieler || []).forEach(s => {
    if (s.icon === undefined) s.icon = null;
    if (s.maxTp === undefined) s.maxTp = 100;
    if (s.tp === undefined) s.tp = s.maxTp ?? 100;
    if (s.rk === undefined) s.rk = 20;
    if (s.wahrnehmung === undefined) s.wahrnehmung = null;
    if (!Array.isArray(s.historie)) s.historie = [];
    if (!Array.isArray(s.status)) s.status = [];
    if (!Array.isArray(s.laufendeSchaden)) s.laufendeSchaden = [];
  });
  (k.npcs || []).forEach(n => {
    if (n.icon === undefined) n.icon = null;
    if (n.maxTp === undefined) n.maxTp = 100;
    if (n.tp === undefined) n.tp = n.maxTp ?? 100;
    if (n.rk === undefined) n.rk = 20;
    if (!Array.isArray(n.historie)) n.historie = [];
    if (!Array.isArray(n.status)) n.status = [];
    if (!Array.isArray(n.laufendeSchaden)) n.laufendeSchaden = [];
  });
  if (!Array.isArray(k.gegnerGruppen)) k.gegnerGruppen = [];
  if (k.aktiveGruppeId === undefined) k.aktiveGruppeId = null;
  (k.gegner || []).forEach(g => {
    if (g.icon === undefined) g.icon = null;
    if (g.imKampf === undefined) g.imKampf = true;
    if (g.gruppeId === undefined) g.gruppeId = null;
  });
  return k;
}

/**
 * Initialisiert Firebase.
 * @param {object} config - Firebase-Konfiguration
 * @returns {boolean} true wenn Firebase aktiv
 */
export async function initFirebase(config) {
  if (!config?.apiKey || config.apiKey === 'DEIN_API_KEY') return false;
  try {
    firebaseApp = initializeApp(config);
    firebaseDb = getDatabase(firebaseApp);
    return true;
  } catch (e) {
    console.warn('[MERS] Firebase init failed:', e?.message || e);
    return false;
  }
}

export function isFirebaseActive() {
  return !!firebaseDb;
}

export function subscribeToChanges(callback) {
  onDataChanged = callback;
}

function notifyChange() {
  if (onDataChanged) onDataChanged();
}

// --- localStorage ---

function getKnownCampaignIds() {
  try {
    const raw = localStorage.getItem(LOCAL_KNOWN_IDS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setKnownCampaignIds(ids) {
  localStorage.setItem(LOCAL_KNOWN_IDS, JSON.stringify(ids));
}

function addKnownCampaignId(id) {
  const ids = getKnownCampaignIds();
  if (!ids.includes(id)) {
    ids.push(id);
    setKnownCampaignIds(ids);
  }
}

function getStoredCurrentId() {
  return localStorage.getItem(LOCAL_CURRENT_ID);
}

function setStoredCurrentId(id) {
  if (id) localStorage.setItem(LOCAL_CURRENT_ID, id);
  else localStorage.removeItem(LOCAL_CURRENT_ID);
}

// --- Firebase ---

function campaignRef(campaignId) {
  return ref(firebaseDb, `campaigns/${campaignId}`);
}

async function loadCampaignFromFirebase(campaignId) {
  const snap = await get(campaignRef(campaignId));
  const data = snap.exists() ? snap.val() : null;
  return data ? migrateKampagne(data) : null;
}

function saveCampaignToFirebase(campaignId, data) {
  set(campaignRef(campaignId), data).catch(e => console.error('Firebase save error:', e));
}

function subscribeToCampaign(campaignId) {
  if (currentUnsubscribe) {
    currentUnsubscribe();
    currentUnsubscribe = null;
  }
  if (!campaignId || !firebaseDb) return;
  const r = campaignRef(campaignId);
  currentUnsubscribe = onValue(r, (snap) => {
    const data = snap.val();
    if (data) {
      cache.kampagnen[campaignId] = migrateKampagne(data);
      notifyChange();
    }
  });
}

// --- Öffentliche API ---

export function loadAll() {
  if (firebaseDb) {
    const currentId = getStoredCurrentId() || cache.currentId;
    const kampagnen = {};
    Object.keys(cache.kampagnen).forEach(id => {
      kampagnen[id] = { ...cache.kampagnen[id] };
    });
    return { currentId, kampagnen };
  }
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    const data = raw ? JSON.parse(raw) : { currentId: null, kampagnen: {} };
    Object.values(data.kampagnen || {}).forEach(k => migrateKampagne(k));
    return data;
  } catch {
    return { currentId: null, kampagnen: {} };
  }
}

export function saveAll(data) {
  if (firebaseDb) {
    cache.currentId = data.currentId;
    setStoredCurrentId(data.currentId);
    const ids = Object.keys(data.kampagnen || {});
    setKnownCampaignIds(ids);
    ids.forEach(id => {
      cache.kampagnen[id] = data.kampagnen[id];
      saveCampaignToFirebase(id, data.kampagnen[id]);
    });
    if (data.currentId) subscribeToCampaign(data.currentId);
    return;
  }
  localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
}

export async function loadCampaign(campaignId) {
  if (firebaseDb) {
    const data = await loadCampaignFromFirebase(campaignId);
    if (data) {
      cache.kampagnen[campaignId] = data;
      addKnownCampaignId(campaignId);
      return data;
    }
    return null;
  }
  const all = loadAll();
  return all.kampagnen[campaignId] || null;
}

export async function startSync() {
  if (!firebaseDb) return;
  let knownIds = getKnownCampaignIds();
  if (knownIds.length === 0) {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        const ids = Object.keys(data.kampagnen || {});
        for (const id of ids) {
          const k = migrateKampagne(data.kampagnen[id]);
          cache.kampagnen[id] = k;
          saveCampaignToFirebase(id, k);
          addKnownCampaignId(id);
        }
        if (data.currentId) setStoredCurrentId(data.currentId);
        cache.currentId = data.currentId;
        knownIds = getKnownCampaignIds();
      }
    } catch (e) {
      console.warn('Migration localStorage → Firebase:', e);
    }
  }
  for (const id of knownIds) {
    const data = await loadCampaignFromFirebase(id);
    if (data) cache.kampagnen[id] = data;
  }
  cache.currentId = getStoredCurrentId() || knownIds[0];
  if (cache.currentId) subscribeToCampaign(cache.currentId);
  notifyChange();
}

export function getKnownCampaignIdsList() {
  return getKnownCampaignIds();
}

export function joinCampaign(campaignId) {
  addKnownCampaignId(campaignId);
}

// --- Krit-Korrekturen (Firebase-Sync) ---

const CRIT_CORRECTIONS_PATH = 'critCorrections';

function critCorrectionsRef() {
  return ref(firebaseDb, CRIT_CORRECTIONS_PATH);
}

export async function loadCritCorrectionsFromFirebase() {
  if (!firebaseDb) return null;
  const snap = await get(critCorrectionsRef());
  return snap.exists() ? snap.val() : {};
}

export function saveCritCorrectionsToFirebase(data) {
  if (!firebaseDb) return;
  set(critCorrectionsRef(), data).catch(e => console.error('[MERS] Firebase crit corrections save:', e?.message));
}

export function subscribeToCritCorrections(callback) {
  if (!firebaseDb) return () => {};
  const r = critCorrectionsRef();
  return onValue(r, (snap) => {
    callback(snap.exists() ? snap.val() : {});
  });
}
