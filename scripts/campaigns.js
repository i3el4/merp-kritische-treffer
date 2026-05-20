// campaigns.js
// Verwaltet Kampagnen und Gegner.
// Speicher: Firebase Realtime Database (wenn konfiguriert) oder localStorage.

import { loadAll, saveAll } from './firebase-storage.js';
import {
  coerceGegnerTypStored,
  coerceRuestungTyp,
  ruestungTypFromRk,
  coerceIstHeld,
  coerceMusikProfil,
  defaultMusikProfilForEntityTyp
} from './constants.js';

function uuid() {
  return crypto.randomUUID?.() ?? 'x' + Math.random().toString(36).slice(2, 12);
}

export function getKampagnenListe() {
  const { kampagnen } = loadAll();
  return Object.entries(kampagnen).map(([id, k]) => ({ id, name: k.name }));
}

export function getCurrentKampagneId() {
  return loadAll().currentId;
}

export function getCurrentKampagne() {
  const { currentId, kampagnen } = loadAll();
  if (!currentId || !kampagnen[currentId]) return null;
  return { id: currentId, ...kampagnen[currentId] };
}

export function getGegner() {
  const k = getCurrentKampagne();
  return k?.gegner ?? [];
}

/** Gegner, die aktuell als Kampfziele sichtbar sind (aktive Gruppe + im Kampf + nicht ausgeblendet). */
export function getGegnerFuerKampf() {
  const k = getCurrentKampagne();
  const gegner = k?.gegner ?? [];
  const aktiveId = k?.aktiveGruppeId || null;
  const imKampf = gegner.filter(g => g.imKampf !== false && g.sichtbar !== false);
  const inGruppe = aktiveId ? imKampf.filter(g => g.gruppeId === aktiveId) : imKampf;
  /* Fallback: Gruppe gewählt, aber keine Gegner darin → alle im Kampf zeigen */
  return inGruppe.length > 0 ? inGruppe : imKampf;
}

export function getSpieler() {
  const k = getCurrentKampagne();
  return k?.spieler ?? [];
}

export function getNpcs() {
  const k = getCurrentKampagne();
  return k?.npcs ?? [];
}

export function getNpcsVisible() {
  return getNpcs().filter(n => n.sichtbar !== false);
}

/** Alle wählbaren Charaktere (Spieler + NPCs) für Schadenszuordnung */
export function getCharaktere() {
  const spieler = getSpieler();
  const npcs = getNpcs();
  return [
    ...spieler.map(s => ({ ...s, typ: 'spieler' })),
    ...npcs.map(n => ({ ...n, typ: 'npc' }))
  ];
}

/** Charaktere, die im Simulator als Ziele angezeigt werden sollen */
export function getCharaktereFuerKampf() {
  const spieler = getSpieler().filter(s => s.sichtbar !== false);
  const npcs = getNpcsVisible();
  return [
    ...spieler.map(s => ({ ...s, typ: 'spieler' })),
    ...npcs.map(n => ({ ...n, typ: 'npc' }))
  ];
}

export function addSpieler(name, icon = null, maxTp = 100, rk = 20, wahrnehmung = null, gegnerTyp = 'normal') {
  const k = getCurrentKampagne();
  if (!k) return null;
  const id = uuid();
  const tpVal = Math.max(0, parseInt(maxTp, 10) || 100);
  const rkNum = Math.max(1, Math.min(20, parseInt(rk, 10) || 20));
  const gStored = coerceGegnerTypStored(gegnerTyp);
  const data = loadAll();
  data.kampagnen[k.id].spieler = data.kampagnen[k.id].spieler || [];
  const rDefault = ruestungTypFromRk(rkNum);
  data.kampagnen[k.id].spieler.push({
    id, name: name || 'Spieler', icon: icon || null,
    maxTp: tpVal, tp: tpVal, rk: rkNum, ruestungTyp: rDefault, ruestungAnRKKoppeln: true, istHeld: false, gegnerTyp: gStored,
    musikProfil: defaultMusikProfilForEntityTyp('spieler'),
    wahrnehmung: wahrnehmung != null ? String(wahrnehmung) : null,
    sichtbar: true,
    defensivBonus: 0, bm: 0, gruppeId: null,
    historie: [], status: [], laufendeSchaden: []
  });
  data.kampagnen[k.id].updatedAt = new Date().toISOString();
  saveAll(data);
  return id;
}

export function removeSpieler(spielerId) {
  const k = getCurrentKampagne();
  if (!k) return false;
  const data = loadAll();
  const spieler = data.kampagnen[k.id].spieler || [];
  const idx = spieler.findIndex(s => s.id === spielerId);
  if (idx < 0) return false;
  spieler.splice(idx, 1);
  data.kampagnen[k.id].spieler = spieler;
  data.kampagnen[k.id].updatedAt = new Date().toISOString();
  saveAll(data);
  return true;
}

export function updateSpieler(spielerId, updates) {
  const k = getCurrentKampagne();
  if (!k) return false;
  const data = loadAll();
  const spieler = data.kampagnen[k.id].spieler || [];
  const idx = spieler.findIndex(s => s.id === spielerId);
  if (idx < 0) return false;
  if (updates.name != null) spieler[idx].name = updates.name;
  if (updates.icon !== undefined) spieler[idx].icon = updates.icon || null;
  if (updates.rk != null) spieler[idx].rk = Math.max(1, Math.min(20, parseInt(updates.rk, 10) || 20));
  if (updates.ruestungTyp != null) spieler[idx].ruestungTyp = coerceRuestungTyp(updates.ruestungTyp);
  if (updates.ruestungAnRKKoppeln !== undefined) spieler[idx].ruestungAnRKKoppeln = !!updates.ruestungAnRKKoppeln;
  if (updates.istHeld !== undefined) spieler[idx].istHeld = coerceIstHeld(updates.istHeld);
  if (updates.gegnerTyp != null) spieler[idx].gegnerTyp = coerceGegnerTypStored(updates.gegnerTyp);
  if (updates.musikProfil != null) {
    spieler[idx].musikProfil = coerceMusikProfil(updates.musikProfil, 'spieler');
  }
  if (updates.wahrnehmung !== undefined) spieler[idx].wahrnehmung = updates.wahrnehmung != null ? String(updates.wahrnehmung) : null;
  if (updates.defensivBonus !== undefined) spieler[idx].defensivBonus = parseInt(updates.defensivBonus, 10) || 0;
  if (updates.bm !== undefined) spieler[idx].bm = parseInt(updates.bm, 10) || 0;
  if (updates.sichtbar !== undefined) spieler[idx].sichtbar = !!updates.sichtbar;
  if (updates.gruppeId !== undefined) spieler[idx].gruppeId = updates.gruppeId || null;
  if (updates.maxTp != null) {
    const v = Math.max(0, parseInt(updates.maxTp, 10) || 0);
    spieler[idx].maxTp = v;
    spieler[idx].tp = Math.min(spieler[idx].tp ?? v, v);
  }
  if (updates.tp != null) spieler[idx].tp = Math.max(0, Math.min(spieler[idx].maxTp ?? 100, parseInt(updates.tp, 10) ?? spieler[idx].tp));
  data.kampagnen[k.id].updatedAt = new Date().toISOString();
  saveAll(data);
  return true;
}

export function addNpc(name, icon = null, maxTp = 100, rk = 20, gegnerTyp = 'normal', wahrnehmung = null) {
  const k = getCurrentKampagne();
  if (!k) return null;
  const id = uuid();
  const tpVal = Math.max(0, parseInt(maxTp, 10) || 100);
  const rkNum = Math.max(1, Math.min(20, parseInt(rk, 10) || 20));
  const gStored = coerceGegnerTypStored(gegnerTyp);
  const data = loadAll();
  data.kampagnen[k.id].npcs = data.kampagnen[k.id].npcs || [];
  data.kampagnen[k.id].npcs.push({
    id,
    name: name || 'NPC',
    icon: icon || null,
    maxTp: tpVal,
    tp: tpVal,
    rk: rkNum,
    ruestungTyp: ruestungTypFromRk(rkNum),
    ruestungAnRKKoppeln: true,
    istHeld: false,
    gegnerTyp: gStored,
    musikProfil: defaultMusikProfilForEntityTyp('npc'),
    wahrnehmung: wahrnehmung != null ? String(wahrnehmung) : null,
    sichtbar: true,
    defensivBonus: 0,
    bm: 0,
    gruppeId: null,
    historie: [],
    status: [],
    laufendeSchaden: []
  });
  data.kampagnen[k.id].updatedAt = new Date().toISOString();
  saveAll(data);
  return id;
}

export function addNpcBatch(count, namePrefix, maxTp = 100, rk = 20, icon = null, gegnerTyp = 'normal', wahrnehmung = null) {
  const k = getCurrentKampagne();
  if (!k || !count || count < 1) return [];
  const n = Math.min(100, Math.max(1, parseInt(count, 10) || 1));
  const prefix = String(namePrefix || 'NPC').trim() || 'NPC';
  const ids = [];
  for (let i = 1; i <= n; i++) {
    const name = n > 1 ? `${prefix} ${i}` : prefix;
    ids.push(addNpc(name, icon, maxTp, rk, gegnerTyp, wahrnehmung));
  }
  return ids;
}

export function removeNpc(npcId) {
  const k = getCurrentKampagne();
  if (!k) return false;
  const data = loadAll();
  const npcs = data.kampagnen[k.id].npcs || [];
  const idx = npcs.findIndex(n => n.id === npcId);
  if (idx < 0) return false;
  npcs.splice(idx, 1);
  data.kampagnen[k.id].npcs = npcs;
  data.kampagnen[k.id].updatedAt = new Date().toISOString();
  saveAll(data);
  return true;
}

export function updateNpc(npcId, updates) {
  const k = getCurrentKampagne();
  if (!k) return false;
  const data = loadAll();
  const npcs = data.kampagnen[k.id].npcs || [];
  const idx = npcs.findIndex(n => n.id === npcId);
  if (idx < 0) return false;
  if (updates.name != null) npcs[idx].name = updates.name;
  if (updates.icon !== undefined) npcs[idx].icon = updates.icon || null;
  if (updates.rk != null) npcs[idx].rk = Math.max(1, Math.min(20, parseInt(updates.rk, 10) || 20));
  if (updates.ruestungTyp != null) npcs[idx].ruestungTyp = coerceRuestungTyp(updates.ruestungTyp);
  if (updates.ruestungAnRKKoppeln !== undefined) npcs[idx].ruestungAnRKKoppeln = !!updates.ruestungAnRKKoppeln;
  if (updates.istHeld !== undefined) npcs[idx].istHeld = coerceIstHeld(updates.istHeld);
  if (updates.gegnerTyp != null) npcs[idx].gegnerTyp = coerceGegnerTypStored(updates.gegnerTyp);
  if (updates.musikProfil != null) {
    npcs[idx].musikProfil = coerceMusikProfil(updates.musikProfil, 'npc');
  }
  if (updates.wahrnehmung !== undefined) npcs[idx].wahrnehmung = updates.wahrnehmung != null ? String(updates.wahrnehmung) : null;
  if (updates.sichtbar !== undefined) npcs[idx].sichtbar = !!updates.sichtbar;
  if (updates.defensivBonus !== undefined) npcs[idx].defensivBonus = parseInt(updates.defensivBonus, 10) || 0;
  if (updates.bm !== undefined) npcs[idx].bm = parseInt(updates.bm, 10) || 0;
  if (updates.gruppeId !== undefined) npcs[idx].gruppeId = updates.gruppeId || null;
  if (updates.maxTp != null) {
    const v = Math.max(0, parseInt(updates.maxTp, 10) || 0);
    npcs[idx].maxTp = v;
    npcs[idx].tp = Math.min(npcs[idx].tp ?? v, v);
  }
  if (updates.tp != null) npcs[idx].tp = Math.max(0, Math.min(npcs[idx].maxTp ?? 100, parseInt(updates.tp, 10) ?? npcs[idx].tp));
  data.kampagnen[k.id].updatedAt = new Date().toISOString();
  saveAll(data);
  return true;
}

export function createKampagne(name) {
  const data = loadAll();
  const id = uuid();
  data.kampagnen[id] = {
    name: name || 'Neue Kampagne',
    spieler: [],
    npcs: [],
    gegner: [],
    gegnerGruppen: [],
    gegnerVorlagen: [],
    vorlagen: [],
    kampfHistorieArchiv: [],
    removedGegnerHistorie: [],
    initiative: [],
    aktiveGruppeId: null,
    aktuelleRunde: 1,
    updatedAt: new Date().toISOString()
  };
  data.currentId = id;
  saveAll(data);
  return id;
}

export function switchKampagne(id) {
  const data = loadAll();
  if (data.kampagnen[id]) {
    data.currentId = id;
    saveAll(data);
    return true;
  }
  return false;
}

export function renameKampagne(id, name) {
  const data = loadAll();
  if (data.kampagnen[id]) {
    data.kampagnen[id].name = name || 'Unbenannt';
    data.kampagnen[id].updatedAt = new Date().toISOString();
    saveAll(data);
    return true;
  }
  return false;
}

export function deleteKampagne(id) {
  const data = loadAll();
  if (!data.kampagnen[id]) return false;
  delete data.kampagnen[id];
  if (data.currentId === id) {
    data.currentId = Object.keys(data.kampagnen)[0] || null;
  }
  saveAll(data);
  return true;
}

export function addGegner(name, maxTp, gegnerTyp = 'normal', rk = 20, icon = null, gruppeId = null, wahrnehmung = null) {
  const k = getCurrentKampagne();
  if (!k) return null;
  const id = uuid();
  const rkNum = Math.max(1, Math.min(20, parseInt(rk, 10) || 20));
  const gStored = coerceGegnerTypStored(gegnerTyp);
  const gegner = {
    id,
    name: name || 'Gegner',
    maxTp: Math.max(0, parseInt(maxTp, 10) || 0),
    tp: Math.max(0, parseInt(maxTp, 10) || 0),
    gegnerTyp: gStored,
    musikProfil: defaultMusikProfilForEntityTyp('gegner'),
    rk: rkNum,
    ruestungTyp: ruestungTypFromRk(rkNum),
    ruestungAnRKKoppeln: true,
    icon: icon || null,
    imKampf: true,
    sichtbar: true,
    gruppeId: gruppeId || null,
    wahrnehmung: wahrnehmung != null ? String(wahrnehmung) : null,
    defensivBonus: 0,
    bm: 0,
    status: [],
    laufendeSchaden: [],
    historie: []
  };
  const data = loadAll();
  data.kampagnen[k.id].gegner = data.kampagnen[k.id].gegner || [];
  data.kampagnen[k.id].gegner.push(gegner);
  data.kampagnen[k.id].updatedAt = new Date().toISOString();
  saveAll(data);
  return id;
}

/** Erstellt mehrere Gegner auf einmal (z.B. 50 Orks). */
export function addGegnerBatch(count, namePrefix, maxTp, gegnerTyp = 'normal', rk = 20, icon = null, gruppeId = null, wahrnehmung = null) {
  const k = getCurrentKampagne();
  if (!k || !count || count < 1) return [];
  const n = Math.min(100, Math.max(1, parseInt(count, 10) || 1));
  const prefix = String(namePrefix || 'Gegner').trim() || 'Gegner';
  const ids = [];
  for (let i = 1; i <= n; i++) {
    const name = n > 1 ? `${prefix} ${i}` : prefix;
    ids.push(addGegner(name, maxTp, gegnerTyp, rk, icon, gruppeId, wahrnehmung));
  }
  return ids;
}

export function removeGegner(gegnerId) {
  const k = getCurrentKampagne();
  if (!k) return false;
  const data = loadAll();
  const gegner = data.kampagnen[k.id].gegner || [];
  const idx = gegner.findIndex(g => g.id === gegnerId);
  if (idx < 0) return false;
  const removed = gegner[idx];
  if ((removed.historie || []).length > 0) {
    data.kampagnen[k.id].removedGegnerHistorie = data.kampagnen[k.id].removedGegnerHistorie || [];
    data.kampagnen[k.id].removedGegnerHistorie.push({
      entityId: removed.id,
      entityName: removed.name,
      entityTyp: 'gegner',
      historie: [...removed.historie]
    });
  }
  gegner.splice(idx, 1);
  data.kampagnen[k.id].gegner = gegner;
  data.kampagnen[k.id].updatedAt = new Date().toISOString();
  saveAll(data);
  return true;
}

export function getGegnerById(gegnerId) {
  return getGegner().find(g => g.id === gegnerId);
}

export function getSpielerById(spielerId) {
  return getSpieler().find(s => s.id === spielerId);
}

export function getNpcById(npcId) {
  return getNpcs().find(n => n.id === npcId);
}

/** Findet Charakter (Spieler oder NPC) anhand ID. Gibt { char, typ } zurück. */
export function getCharakterById(charId) {
  const s = getSpielerById(charId);
  if (s) return { char: s, typ: 'spieler' };
  const n = getNpcById(charId);
  if (n) return { char: n, typ: 'npc' };
  return null;
}

export function updateGegner(gegnerId, updates) {
  const k = getCurrentKampagne();
  if (!k) return false;
  const data = loadAll();
  const gegner = data.kampagnen[k.id].gegner || [];
  const idx = gegner.findIndex(g => g.id === gegnerId);
  if (idx < 0) return false;
  if (updates.gegnerTyp != null) gegner[idx].gegnerTyp = coerceGegnerTypStored(updates.gegnerTyp);
  if (updates.musikProfil != null) {
    gegner[idx].musikProfil = coerceMusikProfil(updates.musikProfil, 'gegner');
  }
  if (updates.rk != null) gegner[idx].rk = Math.max(1, Math.min(20, parseInt(updates.rk, 10) || 20));
  if (updates.ruestungTyp != null) gegner[idx].ruestungTyp = coerceRuestungTyp(updates.ruestungTyp);
  if (updates.ruestungAnRKKoppeln !== undefined) gegner[idx].ruestungAnRKKoppeln = !!updates.ruestungAnRKKoppeln;
  if (updates.name != null) gegner[idx].name = updates.name;
  if (updates.icon !== undefined) gegner[idx].icon = updates.icon || null;
  if (updates.maxTp != null) {
    const v = Math.max(0, parseInt(updates.maxTp, 10) || 0);
    gegner[idx].maxTp = v;
    gegner[idx].tp = Math.min(gegner[idx].tp, v);
  }
  if (updates.tp != null) gegner[idx].tp = Math.max(0, Math.min(gegner[idx].maxTp, parseInt(updates.tp, 10) ?? gegner[idx].tp));
  if (updates.imKampf !== undefined) gegner[idx].imKampf = !!updates.imKampf;
  if (updates.sichtbar !== undefined) gegner[idx].sichtbar = !!updates.sichtbar;
  if (updates.gruppeId !== undefined) gegner[idx].gruppeId = updates.gruppeId || null;
  if (updates.wahrnehmung !== undefined) gegner[idx].wahrnehmung = updates.wahrnehmung != null ? String(updates.wahrnehmung) : null;
  if (updates.defensivBonus !== undefined) gegner[idx].defensivBonus = parseInt(updates.defensivBonus, 10) || 0;
  if (updates.bm !== undefined) gegner[idx].bm = parseInt(updates.bm, 10) || 0;
  data.kampagnen[k.id].gegner = gegner;
  data.kampagnen[k.id].updatedAt = new Date().toISOString();
  saveAll(data);
  return true;
}

export function getGegnerVorlagen() {
  const k = getCurrentKampagne();
  return k?.gegnerVorlagen ?? [];
}

export function addGegnerVorlage(dataIn) {
  const k = getCurrentKampagne();
  if (!k) return null;
  const data = loadAll();
  const id = uuid();
  const tpl = {
    id,
    name: String(dataIn?.name || 'Vorlage').trim(),
    maxTp: Math.max(1, parseInt(dataIn?.maxTp, 10) || 100),
    gegnerTyp: coerceGegnerTypStored(dataIn?.gegnerTyp),
    rk: Math.max(1, Math.min(20, parseInt(dataIn?.rk, 10) || 20)),
    icon: dataIn?.icon || null,
    defensivBonus: parseInt(dataIn?.defensivBonus, 10) || 0,
    bm: parseInt(dataIn?.bm, 10) || 0,
    musikProfil: defaultMusikProfilForEntityTyp('gegner')
  };
  data.kampagnen[k.id].gegnerVorlagen = data.kampagnen[k.id].gegnerVorlagen || [];
  data.kampagnen[k.id].gegnerVorlagen.push(tpl);
  data.kampagnen[k.id].updatedAt = new Date().toISOString();
  saveAll(data);
  return id;
}

export function updateGegnerVorlage(vorlageId, updates) {
  const k = getCurrentKampagne();
  if (!k) return false;
  const data = loadAll();
  const list = data.kampagnen[k.id].gegnerVorlagen || [];
  const idx = list.findIndex(v => v.id === vorlageId);
  if (idx < 0) return false;
  if (updates.name != null) list[idx].name = String(updates.name || list[idx].name).trim();
  if (updates.maxTp != null) list[idx].maxTp = Math.max(1, parseInt(updates.maxTp, 10) || 100);
  if (updates.gegnerTyp != null) list[idx].gegnerTyp = coerceGegnerTypStored(updates.gegnerTyp);
  if (updates.rk != null) list[idx].rk = Math.max(1, Math.min(20, parseInt(updates.rk, 10) || 20));
  if (updates.icon !== undefined) list[idx].icon = updates.icon || null;
  if (updates.defensivBonus !== undefined) list[idx].defensivBonus = parseInt(updates.defensivBonus, 10) || 0;
  if (updates.bm !== undefined) list[idx].bm = parseInt(updates.bm, 10) || 0;
  if (updates.musikProfil != null) {
    list[idx].musikProfil = coerceMusikProfil(updates.musikProfil, 'gegner');
  }
  data.kampagnen[k.id].updatedAt = new Date().toISOString();
  saveAll(data);
  return true;
}

export function removeGegnerVorlage(vorlageId) {
  const k = getCurrentKampagne();
  if (!k) return false;
  const data = loadAll();
  const old = data.kampagnen[k.id].gegnerVorlagen || [];
  data.kampagnen[k.id].gegnerVorlagen = old.filter(v => v.id !== vorlageId);
  data.kampagnen[k.id].updatedAt = new Date().toISOString();
  saveAll(data);
  return old.length !== data.kampagnen[k.id].gegnerVorlagen.length;
}

/** Universelle Vorlagen (Gegner, NPCs, Spieler). */
export function getVorlagen() {
  const k = getCurrentKampagne();
  return k?.vorlagen ?? [];
}

export function addVorlage(dataIn) {
  const k = getCurrentKampagne();
  if (!k) return null;
  const data = loadAll();
  const id = uuid();
  const tplTyp = ['spieler', 'npc', 'gegner'].includes(dataIn?.typ) ? dataIn.typ : 'gegner';
  const rkTpl = Math.max(1, Math.min(20, parseInt(dataIn?.rk, 10) || 10));
  const tpl = {
    id,
    name: String(dataIn?.name || 'Vorlage').trim(),
    typ: tplTyp,
    maxTp: Math.max(1, parseInt(dataIn?.maxTp, 10) || 100),
    gegnerTyp: coerceGegnerTypStored(dataIn?.gegnerTyp),
    rk: rkTpl,
    ruestungTyp: coerceRuestungTyp(dataIn?.ruestungTyp ?? ruestungTypFromRk(rkTpl)),
    ruestungAnRKKoppeln: dataIn?.ruestungAnRKKoppeln !== false,
    icon: dataIn?.icon || null,
    defensivBonus: parseInt(dataIn?.defensivBonus, 10) || 0,
    bm: parseInt(dataIn?.bm, 10) || 0,
    wahrnehmung: dataIn?.wahrnehmung != null ? String(dataIn.wahrnehmung) : null,
    musikProfil: coerceMusikProfil(dataIn?.musikProfil, tplTyp)
  };
  data.kampagnen[k.id].vorlagen = data.kampagnen[k.id].vorlagen || [];
  data.kampagnen[k.id].vorlagen.push(tpl);
  data.kampagnen[k.id].updatedAt = new Date().toISOString();
  saveAll(data);
  return id;
}

export function updateVorlage(vorlageId, updates) {
  const k = getCurrentKampagne();
  if (!k) return false;
  const data = loadAll();
  const list = data.kampagnen[k.id].vorlagen || [];
  const idx = list.findIndex(v => v.id === vorlageId);
  if (idx < 0) return false;
  if (updates.name != null) list[idx].name = String(updates.name || list[idx].name).trim();
  if (updates.typ != null) list[idx].typ = ['spieler', 'npc', 'gegner'].includes(updates.typ) ? updates.typ : list[idx].typ;
  if (updates.maxTp != null) list[idx].maxTp = Math.max(1, parseInt(updates.maxTp, 10) || 100);
  if (updates.gegnerTyp != null) list[idx].gegnerTyp = coerceGegnerTypStored(updates.gegnerTyp);
  if (updates.rk != null) list[idx].rk = Math.max(1, Math.min(20, parseInt(updates.rk, 10) || 10));
  if (updates.ruestungTyp != null) list[idx].ruestungTyp = coerceRuestungTyp(updates.ruestungTyp);
  if (updates.ruestungAnRKKoppeln !== undefined) list[idx].ruestungAnRKKoppeln = !!updates.ruestungAnRKKoppeln;
  if (updates.icon !== undefined) list[idx].icon = updates.icon || null;
  if (updates.defensivBonus !== undefined) list[idx].defensivBonus = parseInt(updates.defensivBonus, 10) || 0;
  if (updates.bm !== undefined) list[idx].bm = parseInt(updates.bm, 10) || 0;
  if (updates.wahrnehmung !== undefined) list[idx].wahrnehmung = updates.wahrnehmung != null ? String(updates.wahrnehmung) : null;
  if (updates.musikProfil != null) {
    const et = list[idx].typ === 'spieler' ? 'spieler' : list[idx].typ === 'npc' ? 'npc' : 'gegner';
    list[idx].musikProfil = coerceMusikProfil(updates.musikProfil, et);
  }
  data.kampagnen[k.id].updatedAt = new Date().toISOString();
  saveAll(data);
  return true;
}

export function removeVorlage(vorlageId) {
  const k = getCurrentKampagne();
  if (!k) return false;
  const data = loadAll();
  const old = data.kampagnen[k.id].vorlagen || [];
  data.kampagnen[k.id].vorlagen = old.filter(v => v.id !== vorlageId);
  data.kampagnen[k.id].updatedAt = new Date().toISOString();
  saveAll(data);
  return old.length !== data.kampagnen[k.id].vorlagen.length;
}

export function setAktuelleRunde(runde) {
  const k = getCurrentKampagne();
  if (!k) return false;
  const data = loadAll();
  const val = parseInt(runde, 10);
  data.kampagnen[k.id].aktuelleRunde = isNaN(val) ? 1 : Math.max(0, val);
  data.kampagnen[k.id].updatedAt = new Date().toISOString();
  saveAll(data);
  return true;
}

export function getAktuelleRunde() {
  const k = getCurrentKampagne();
  return k?.aktuelleRunde ?? 1;
}

/** Gruppen der Kampagne (z.B. Bereiche in einem Dungeon). */
export function getGegnerGruppen() {
  const k = getCurrentKampagne();
  return k?.gegnerGruppen ?? [];
}

export function addGegnerGruppe(name) {
  const k = getCurrentKampagne();
  if (!k || !name?.trim()) return null;
  const id = uuid();
  const data = loadAll();
  data.kampagnen[k.id].gegnerGruppen = data.kampagnen[k.id].gegnerGruppen || [];
  data.kampagnen[k.id].gegnerGruppen.push({ id, name: String(name).trim() });
  data.kampagnen[k.id].updatedAt = new Date().toISOString();
  saveAll(data);
  return id;
}

export function updateGegnerGruppe(gruppeId, name) {
  const k = getCurrentKampagne();
  if (!k) return false;
  const data = loadAll();
  const gruppen = data.kampagnen[k.id].gegnerGruppen || [];
  const idx = gruppen.findIndex(g => g.id === gruppeId);
  if (idx < 0) return false;
  gruppen[idx].name = String(name || gruppen[idx].name).trim();
  data.kampagnen[k.id].updatedAt = new Date().toISOString();
  saveAll(data);
  return true;
}

export function removeGegnerGruppe(gruppeId) {
  const k = getCurrentKampagne();
  if (!k) return false;
  const data = loadAll();
  const gruppen = (data.kampagnen[k.id].gegnerGruppen || []).filter(g => g.id !== gruppeId);
  data.kampagnen[k.id].gegnerGruppen = gruppen;
  const gegner = data.kampagnen[k.id].gegner || [];
  gegner.forEach(g => { if (g.gruppeId === gruppeId) g.gruppeId = null; });
  (data.kampagnen[k.id].spieler || []).forEach(s => { if (s.gruppeId === gruppeId) s.gruppeId = null; });
  (data.kampagnen[k.id].npcs || []).forEach(n => { if (n.gruppeId === gruppeId) n.gruppeId = null; });
  if (data.kampagnen[k.id].aktiveGruppeId === gruppeId) {
    data.kampagnen[k.id].aktiveGruppeId = null;
  }
  data.kampagnen[k.id].updatedAt = new Date().toISOString();
  saveAll(data);
  return true;
}

export function getAktiveGruppeId() {
  const k = getCurrentKampagne();
  const id = k?.aktiveGruppeId;
  return id || null;
}

export function setAktiveGruppeId(gruppeId) {
  const k = getCurrentKampagne();
  if (!k) return false;
  const data = loadAll();
  data.kampagnen[k.id].aktiveGruppeId = gruppeId || null;
  data.kampagnen[k.id].updatedAt = new Date().toISOString();
  saveAll(data);
  return true;
}

/**
 * Wendet Schaden und ggf. Status auf einen Gegner an.
 * @param {string} gegnerId
 * @param {number} tp Schadenspunkte (werden von aktuellen TP abgezogen)
 * @param {string} quelle 'angriff' | 'krit' | 'manuell'
 * @param {string} [beschreibung] Optionale Beschreibung (z.B. Krit-Text)
 * @param {{ tpPerRound?: number, ben?: number, benoPar?: number, oPar?: number, init?: number, ko?: boolean }} [extracted] Extrahierter Status aus Krit (nur bei quelle='krit')
 * @param {{ id: string, name: string }} [vonCharakter] Charakter, der den Schaden zugefügt hat (für Historie)
 * @returns {boolean} true wenn erfolgreich
 */
export function applySchaden(gegnerId, tp, quelle, beschreibung = '', extracted = null, vonCharakter = null) {
  const k = getCurrentKampagne();
  if (!k) return false;
  const data = loadAll();
  const gegner = data.kampagnen[k.id].gegner || [];
  const idx = gegner.findIndex(g => g.id === gegnerId);
  if (idx < 0) return false;
  const g = gegner[idx];
  const schaden = Math.max(0, parseInt(tp, 10) || 0);
  const runde = k.aktuelleRunde;
  const isKrit = quelle === 'krit' || quelle === 'crit';
  const hasStatus = isKrit && extracted && (
    (extracted.ben || 0) + (extracted.benoPar || 0) + (extracted.oPar || 0) +
    (extracted.par || 0) + (extracted.init || 0) + (extracted.tpPerRound || 0) > 0 || extracted.ko
  );
  const manuellMitBeschreibung = quelle === 'manuell' && beschreibung && beschreibung.trim();
  if (schaden <= 0 && !hasStatus && !manuellMitBeschreibung) return false;

  const von = vonCharakter ? { id: vonCharakter.id, name: vonCharakter.name } : null;
  if (schaden > 0) {
    g.tp = Math.max(0, g.tp - schaden);
    g.historie = g.historie || [];
    g.historie.push({
      runde,
      tp: schaden,
      quelle,
      beschreibung: beschreibung || `${quelle}: ${schaden} TP`,
      von
    });
  }

  // Status aus Krit anwenden und in Historie erfassen
  if (isKrit && extracted) {
    g.historie = g.historie || [];
    const statusParts = [];
    g.status = g.status || [];
    if (extracted.benoPar > 0) {
      g.status.push({ typ: 'benoPar', runden: extracted.benoPar, startRunde: runde });
      statusParts.push(`${extracted.benoPar} Rd benoPar`);
    }
    if (extracted.ben > 0) {
      g.status.push({ typ: 'ben', runden: extracted.ben, startRunde: runde });
      statusParts.push(`${extracted.ben} Rd ben`);
    }
    if (extracted.oPar > 0) {
      g.status.push({ typ: 'oPar', runden: extracted.oPar, startRunde: runde });
      statusParts.push(`${extracted.oPar} Rd oPar`);
    }
    if (extracted.par > 0) {
      g.status.push({ typ: 'par', runden: extracted.par, startRunde: runde });
      statusParts.push(`${extracted.par} Rd Par`);
    }
    if (extracted.init > 0) {
      g.status.push({ typ: 'init', runden: extracted.init, startRunde: runde });
      statusParts.push(`${extracted.init} Rd Init`);
    }
    if (extracted.ko) {
      g.status.push({ typ: 'ko', runden: 999, startRunde: runde });
      statusParts.push('K.O.');
    }
    if (extracted.severity === 'lethal') {
      g.tp = 0;
      statusParts.push('Tödlich');
    } else if (extracted.severity === 'incapacitated') {
      g.status.push({ typ: 'ko', runden: 999, startRunde: runde });
      statusParts.push('Kampfunfähig');
    }
    if (extracted.tpPerRound > 0) {
      g.laufendeSchaden = g.laufendeSchaden || [];
      g.laufendeSchaden.push({ tp: extracted.tpPerRound, startRunde: runde });
      statusParts.push(`+${extracted.tpPerRound} T/Rd`);
    }
    if (statusParts.length > 0) {
      g.historie.push({
        runde,
        tp: 0,
        quelle: 'krit',
        beschreibung: `Status: ${statusParts.join(', ')}`,
        von
      });
    }
  }

  if (manuellMitBeschreibung && schaden <= 0) {
    g.historie = g.historie || [];
    g.historie.push({ runde, tp: 0, quelle: 'manuell', beschreibung: beschreibung.trim(), von });
  }

  data.kampagnen[k.id].gegner = gegner;
  data.kampagnen[k.id].updatedAt = new Date().toISOString();
  saveAll(data);
  return true;
}

/**
 * Heilt laufenden Schaden (T/Rd) bei einem Gegner – z.B. nach Wundheilung.
 * @param {string} gegnerId
 * @param {number} tpZuHeilen Anzahl T/Rd, die geheilt werden sollen
 * @returns {boolean} true wenn erfolgreich
 */
export function heilenLaufendeSchaden(gegnerId, tpZuHeilen) {
  const k = getCurrentKampagne();
  if (!k) return false;
  const data = loadAll();
  const gegner = data.kampagnen[k.id].gegner || [];
  const idx = gegner.findIndex(g => g.id === gegnerId);
  if (idx < 0) return false;
  const g = gegner[idx];
  const laufend = g.laufendeSchaden || [];
  const toHeal = Math.max(0, parseInt(tpZuHeilen, 10) || 0);
  if (toHeal <= 0 || laufend.length === 0) return false;

  let rest = toHeal;
  const newLaufend = [];
  for (const l of laufend) {
    if (rest <= 0) {
      newLaufend.push(l);
      continue;
    }
    if (l.tp <= rest) {
      rest -= l.tp;
      // Eintrag vollständig geheilt, nicht übernehmen
    } else {
      newLaufend.push({ ...l, tp: l.tp - rest });
      rest = 0;
    }
  }
  g.laufendeSchaden = newLaufend;
  data.kampagnen[k.id].gegner = gegner;
  data.kampagnen[k.id].updatedAt = new Date().toISOString();
  saveAll(data);
  return true;
}

/**
 * Stellt Trefferpunkte eines Gegners wieder her (z.B. Zaubertrank, Heilung).
 * @param {string} gegnerId
 * @param {number} tp Anzahl TP, die wiederhergestellt werden
 * @returns {boolean} true wenn erfolgreich
 */
export function heilenTp(gegnerId, tp) {
  const k = getCurrentKampagne();
  if (!k) return false;
  const data = loadAll();
  const gegner = data.kampagnen[k.id].gegner || [];
  const idx = gegner.findIndex(g => g.id === gegnerId);
  if (idx < 0) return false;
  const g = gegner[idx];
  const toHeal = Math.max(0, parseInt(tp, 10) || 0);
  if (toHeal <= 0) return false;

  const oldTp = g.tp;
  g.tp = Math.min(g.maxTp, g.tp + toHeal);
  const actualHeal = g.tp - oldTp;
  if (actualHeal > 0) {
    g.historie = g.historie || [];
    g.historie.push({
      runde: k.aktuelleRunde,
      tp: 0,
      quelle: 'heilung',
      beschreibung: `+${actualHeal} TP (Heilung)`
    });
  }
  data.kampagnen[k.id].gegner = gegner;
  data.kampagnen[k.id].updatedAt = new Date().toISOString();
  saveAll(data);
  return true;
}

function undoLastHistorieEntry(entity) {
  const hist = entity.historie || [];
  if (hist.length === 0) return null;
  const last = hist.pop();
  if (last.tp > 0 && last.quelle !== 'heilung') {
    entity.tp = Math.min(entity.maxTp ?? 9999, entity.tp + last.tp);
  }
  if (last.quelle === 'heilung' && last.beschreibung) {
    const m = last.beschreibung.match(/\+(\d+)\s*TP/);
    if (m) entity.tp = Math.max(0, entity.tp - parseInt(m[1], 10));
  }
  if (last.quelle === 'krit' && last.tp === 0 && last.beschreibung?.startsWith('Status:')) {
    const statusArr = entity.status || [];
    entity.status = statusArr.filter(s => s.startRunde !== last.runde);
    const laufend = entity.laufendeSchaden || [];
    entity.laufendeSchaden = laufend.filter(l => l.startRunde !== last.runde);
  }
  if (last.quelle === 'laufend' && last.tp > 0) {
    entity.tp = Math.min(entity.maxTp ?? 9999, entity.tp + last.tp);
  }
  return last;
}

export function undoLastGegnerHistorie(gegnerId) {
  const k = getCurrentKampagne();
  if (!k) return false;
  const data = loadAll();
  const gegner = data.kampagnen[k.id].gegner || [];
  const g = gegner.find(x => x.id === gegnerId);
  if (!g) return false;
  const undone = undoLastHistorieEntry(g);
  if (!undone) return false;
  data.kampagnen[k.id].updatedAt = new Date().toISOString();
  saveAll(data);
  return undone;
}

export function undoLastCharakterHistorie(charId) {
  const k = getCurrentKampagne();
  if (!k) return false;
  const data = loadAll();
  let entity = (data.kampagnen[k.id].spieler || []).find(s => s.id === charId);
  if (!entity) entity = (data.kampagnen[k.id].npcs || []).find(n => n.id === charId);
  if (!entity) return false;
  const undone = undoLastHistorieEntry(entity);
  if (!undone) return false;
  data.kampagnen[k.id].updatedAt = new Date().toISOString();
  saveAll(data);
  return undone;
}

function applySchadenToCharakterArray(arr, idx, schaden, runde, quelle, beschreibung, von, extracted) {
  const g = arr[idx];
  const hasStatus = extracted && (
    (extracted.ben || 0) + (extracted.benoPar || 0) + (extracted.oPar || 0) +
    (extracted.par || 0) + (extracted.init || 0) + (extracted.tpPerRound || 0) > 0 || extracted.ko
  );
  const manuellMitBeschreibung = quelle === 'manuell' && beschreibung && beschreibung.trim();
  if (schaden <= 0 && !hasStatus && !manuellMitBeschreibung) return false;
  const vonObj = von ? { id: von.id, name: von.name } : null;
  if (schaden > 0) {
    g.tp = Math.max(0, g.tp - schaden);
    g.historie = g.historie || [];
    g.historie.push({ runde, tp: schaden, quelle, beschreibung: beschreibung || `${quelle}: ${schaden} TP`, von: vonObj });
  }
  if (extracted) {
    g.historie = g.historie || [];
    g.status = g.status || [];
    const statusParts = [];
    if (extracted.benoPar > 0) { g.status.push({ typ: 'benoPar', runden: extracted.benoPar, startRunde: runde }); statusParts.push(`${extracted.benoPar} Rd benoPar`); }
    if (extracted.ben > 0) { g.status.push({ typ: 'ben', runden: extracted.ben, startRunde: runde }); statusParts.push(`${extracted.ben} Rd ben`); }
    if (extracted.oPar > 0) { g.status.push({ typ: 'oPar', runden: extracted.oPar, startRunde: runde }); statusParts.push(`${extracted.oPar} Rd oPar`); }
    if (extracted.par > 0) { g.status.push({ typ: 'par', runden: extracted.par, startRunde: runde }); statusParts.push(`${extracted.par} Rd Par`); }
    if (extracted.init > 0) { g.status.push({ typ: 'init', runden: extracted.init, startRunde: runde }); statusParts.push(`${extracted.init} Rd Init`); }
    if (extracted.ko) { g.status.push({ typ: 'ko', runden: 999, startRunde: runde }); statusParts.push('K.O.'); }
    if (extracted.severity === 'lethal') {
      g.tp = 0;
      statusParts.push('Tödlich');
    } else if (extracted.severity === 'incapacitated') {
      g.status.push({ typ: 'ko', runden: 999, startRunde: runde });
      statusParts.push('Kampfunfähig');
    }
    if (extracted.tpPerRound > 0) {
      g.laufendeSchaden = g.laufendeSchaden || [];
      g.laufendeSchaden.push({ tp: extracted.tpPerRound, startRunde: runde });
      statusParts.push(`+${extracted.tpPerRound} T/Rd`);
    }
    if (statusParts.length > 0) g.historie.push({ runde, tp: 0, quelle: 'krit', beschreibung: `Status: ${statusParts.join(', ')}`, von: vonObj });
  }
  if (manuellMitBeschreibung && schaden <= 0) {
    g.historie = g.historie || [];
    g.historie.push({ runde, tp: 0, quelle: 'manuell', beschreibung: beschreibung.trim(), von: von ? { id: von.id, name: von.name } : null });
  }
  return true;
}

export function applySchadenCharakter(charId, tp, quelle, beschreibung = '', extracted = null, vonCharakter = null) {
  const k = getCurrentKampagne();
  if (!k) return false;
  const data = loadAll();
  let arr, idx;
  idx = (data.kampagnen[k.id].spieler || []).findIndex(s => s.id === charId);
  if (idx >= 0) arr = data.kampagnen[k.id].spieler;
  else {
    idx = (data.kampagnen[k.id].npcs || []).findIndex(n => n.id === charId);
    if (idx >= 0) arr = data.kampagnen[k.id].npcs;
  }
  if (!arr || idx < 0) return false;
  const schaden = Math.max(0, parseInt(tp, 10) || 0);
  const runde = k.aktuelleRunde;
  const ok = applySchadenToCharakterArray(arr, idx, schaden, runde, quelle, beschreibung, vonCharakter, extracted);
  if (ok) {
    data.kampagnen[k.id].updatedAt = new Date().toISOString();
    saveAll(data);
  }
  return ok;
}

export function heilenTpCharakter(charId, tp) {
  const k = getCurrentKampagne();
  if (!k) return false;
  const data = loadAll();
  let arr, idx;
  idx = (data.kampagnen[k.id].spieler || []).findIndex(s => s.id === charId);
  if (idx >= 0) arr = data.kampagnen[k.id].spieler;
  else {
    idx = (data.kampagnen[k.id].npcs || []).findIndex(n => n.id === charId);
    if (idx >= 0) arr = data.kampagnen[k.id].npcs;
  }
  if (!arr || idx < 0) return false;
  const g = arr[idx];
  const toHeal = Math.max(0, parseInt(tp, 10) || 0);
  if (toHeal <= 0) return false;
  const oldTp = g.tp;
  g.tp = Math.min(g.maxTp ?? 100, g.tp + toHeal);
  const actualHeal = g.tp - oldTp;
  if (actualHeal > 0) {
    g.historie = g.historie || [];
    g.historie.push({ runde: k.aktuelleRunde, tp: 0, quelle: 'heilung', beschreibung: `+${actualHeal} TP (Heilung)` });
  }
  data.kampagnen[k.id].updatedAt = new Date().toISOString();
  saveAll(data);
  return true;
}

export function heilenLaufendeSchadenCharakter(charId, tpZuHeilen) {
  const k = getCurrentKampagne();
  if (!k) return false;
  const data = loadAll();
  let arr, idx;
  idx = (data.kampagnen[k.id].spieler || []).findIndex(s => s.id === charId);
  if (idx >= 0) arr = data.kampagnen[k.id].spieler;
  else {
    idx = (data.kampagnen[k.id].npcs || []).findIndex(n => n.id === charId);
    if (idx >= 0) arr = data.kampagnen[k.id].npcs;
  }
  if (!arr || idx < 0) return false;
  const g = arr[idx];
  const laufend = g.laufendeSchaden || [];
  const toHeal = Math.max(0, parseInt(tpZuHeilen, 10) || 0);
  if (toHeal <= 0 || laufend.length === 0) return false;
  let rest = toHeal;
  const newLaufend = [];
  for (const l of laufend) {
    if (rest <= 0) { newLaufend.push(l); continue; }
    if (l.tp <= rest) rest -= l.tp;
    else { newLaufend.push({ ...l, tp: l.tp - rest }); rest = 0; }
  }
  g.laufendeSchaden = newLaufend;
  data.kampagnen[k.id].updatedAt = new Date().toISOString();
  saveAll(data);
  return true;
}

/**
 * Verarbeitet Rundenende: Status ablaufen lassen, laufende Schäden anwenden.
 */
export function processRundenende() {
  const k = getCurrentKampagne();
  if (!k) return;
  const data = loadAll();
  const gegner = data.kampagnen[k.id].gegner || [];
  const spieler = data.kampagnen[k.id].spieler || [];
  const npcs = data.kampagnen[k.id].npcs || [];
  const runde = k.aktuelleRunde;

  const processArr = (arr) => {
    arr.forEach(g => {
      const laufend = g.laufendeSchaden || [];
      let totalLaufend = laufend.reduce((a, l) => a + l.tp, 0);
      if (totalLaufend > 0) {
        g.tp = Math.max(0, g.tp - totalLaufend);
        g.historie = g.historie || [];
        g.historie.push({ runde, tp: totalLaufend, quelle: 'laufend', beschreibung: `Laufender Schaden: ${totalLaufend} TP` });
      }
      const status = g.status || [];
      g.status = status.map(s => ({ ...s, runden: s.runden - 1 })).filter(s => s.runden > 0 && s.typ !== 'ko');
    });
  };

  processArr(gegner);
  processArr(spieler);
  processArr(npcs);

  data.kampagnen[k.id].gegner = gegner;
  data.kampagnen[k.id].spieler = spieler;
  data.kampagnen[k.id].npcs = npcs;
  data.kampagnen[k.id].updatedAt = new Date().toISOString();
  saveAll(data);
}

export function toggleNpcSichtbarkeit(npcId) {
  const k = getCurrentKampagne();
  if (!k) return false;
  const data = loadAll();
  const npcs = data.kampagnen[k.id].npcs || [];
  const idx = npcs.findIndex(n => n.id === npcId);
  if (idx < 0) return false;
  npcs[idx].sichtbar = npcs[idx].sichtbar === false ? true : false;
  data.kampagnen[k.id].updatedAt = new Date().toISOString();
  saveAll(data);
  return true;
}

export function toggleSpielerSichtbarkeit(spielerId) {
  const k = getCurrentKampagne();
  if (!k) return false;
  const data = loadAll();
  const spieler = data.kampagnen[k.id].spieler || [];
  const idx = spieler.findIndex(s => s.id === spielerId);
  if (idx < 0) return false;
  spieler[idx].sichtbar = spieler[idx].sichtbar === false ? true : false;
  data.kampagnen[k.id].updatedAt = new Date().toISOString();
  saveAll(data);
  return true;
}

export function toggleGegnerSichtbarkeit(gegnerId) {
  const k = getCurrentKampagne();
  if (!k) return false;
  const data = loadAll();
  const gegner = data.kampagnen[k.id].gegner || [];
  const idx = gegner.findIndex(g => g.id === gegnerId);
  if (idx < 0) return false;
  gegner[idx].sichtbar = gegner[idx].sichtbar === false ? true : false;
  data.kampagnen[k.id].updatedAt = new Date().toISOString();
  saveAll(data);
  return true;
}

export function setInitiativeOrder(order) {
  const k = getCurrentKampagne();
  if (!k) return false;
  const data = loadAll();
  data.kampagnen[k.id].initiative = Array.isArray(order) ? order : [];
  data.kampagnen[k.id].updatedAt = new Date().toISOString();
  saveAll(data);
  return true;
}

export function getInitiativeOrder() {
  const k = getCurrentKampagne();
  return k?.initiative ?? [];
}

export function archiveKampfHistorie(name = '') {
  const k = getCurrentKampagne();
  if (!k) return null;
  const data = loadAll();
  const kamp = data.kampagnen[k.id];
  const entry = {
    id: uuid(),
    name: String(name || `Kampf ${new Date().toLocaleString('de-CH')}`).trim(),
    datum: new Date().toISOString(),
    runden: kamp.aktuelleRunde ?? 1,
    eintraege: []
  };
  const collect = (arr, typ) => {
    (arr || []).forEach(e => {
      if ((e.historie || []).length > 0) {
        entry.eintraege.push({
          entityId: e.id,
          entityName: e.name,
          entityTyp: typ,
          historie: [...(e.historie || [])]
        });
      }
      e.historie = [];
      e.status = [];
      e.laufendeSchaden = [];
    });
  };
  collect(kamp.gegner, 'gegner');
  collect(kamp.spieler, 'spieler');
  collect(kamp.npcs, 'npc');
  const removedHist = kamp.removedGegnerHistorie || [];
  removedHist.forEach(r => {
    if ((r.historie || []).length > 0) {
      entry.eintraege.push({
        entityId: r.entityId,
        entityName: r.entityName + ' (entfernt)',
        entityTyp: r.entityTyp || 'gegner',
        historie: [...r.historie]
      });
    }
  });
  kamp.removedGegnerHistorie = [];
  if (entry.eintraege.length === 0) return null;
  kamp.kampfHistorieArchiv = kamp.kampfHistorieArchiv || [];
  kamp.kampfHistorieArchiv.unshift(entry);
  kamp.aktuelleRunde = 1;
  kamp.initiative = [];
  kamp.updatedAt = new Date().toISOString();
  saveAll(data);
  return entry.id;
}

export function getKampfHistorieArchiv() {
  const k = getCurrentKampagne();
  return k?.kampfHistorieArchiv ?? [];
}

export function restoreKampfHistorie(archivId) {
  const k = getCurrentKampagne();
  if (!k) return false;
  const data = loadAll();
  const kamp = data.kampagnen[k.id];
  const archiv = kamp.kampfHistorieArchiv || [];
  const idx = archiv.findIndex(a => a.id === archivId);
  if (idx < 0) return false;
  const entry = archiv[idx];

  const findEntity = (entityId, entityTyp) => {
    if (entityTyp === 'gegner') return (kamp.gegner || []).find(g => g.id === entityId);
    if (entityTyp === 'spieler') return (kamp.spieler || []).find(s => s.id === entityId);
    if (entityTyp === 'npc') return (kamp.npcs || []).find(n => n.id === entityId);
    return null;
  };

  (entry.eintraege || []).forEach(e => {
    const entity = findEntity(e.entityId, e.entityTyp);
    if (!entity) return;
    entity.tp = entity.maxTp ?? 100;
    entity.historie = [...(e.historie || [])];
    entity.status = [];
    entity.laufendeSchaden = [];
    (e.historie || []).forEach(h => {
      if (h.tp > 0 && h.quelle !== 'heilung') {
        entity.tp = Math.max(0, entity.tp - h.tp);
      }
      if (h.quelle === 'heilung' && h.beschreibung) {
        const m = h.beschreibung.match(/\+(\d+)\s*TP/);
        if (m) entity.tp = Math.min(entity.maxTp ?? 9999, entity.tp + parseInt(m[1], 10));
      }
    });
  });

  kamp.aktuelleRunde = entry.runden || 1;
  kamp.initiative = [];
  archiv.splice(idx, 1);
  kamp.updatedAt = new Date().toISOString();
  saveAll(data);
  return true;
}

export function deleteKampfHistorieArchivEintrag(archivId) {
  const k = getCurrentKampagne();
  if (!k) return false;
  const data = loadAll();
  const old = data.kampagnen[k.id].kampfHistorieArchiv || [];
  data.kampagnen[k.id].kampfHistorieArchiv = old.filter(e => e.id !== archivId);
  data.kampagnen[k.id].updatedAt = new Date().toISOString();
  saveAll(data);
  return old.length !== data.kampagnen[k.id].kampfHistorieArchiv.length;
}
