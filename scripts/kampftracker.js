// kampftracker.js
// UI-Logik für den Kampftracker (Kampagnen, Gegner).

import { $, $$ } from './dom.js';
import {
  CHARAKTER_ICONS,
  URLS,
  GEGNER_TYP_ALLOWED,
  GEGNER_TYP_LABELS,
  RUESTUNG_TYP_ALLOWED,
  RUESTUNG_TYP_LABELS,
  coerceRuestungTyp,
  ruestungTypFromRk,
  coerceIstHeld,
  gegnerTypForGameRules
} from './constants.js';
import { populateWeapons } from './data.js';
import {
  getKampagnenListe,
  getCurrentKampagne,
  getCurrentKampagneId,
  getGegner,
  getGegnerFuerKampf,
  getGegnerById,
  getSpielerById,
  getNpcById,
  getCharakterById,
  getAktuelleRunde,
  createKampagne,
  switchKampagne,
  renameKampagne,
  deleteKampagne,
  addGegner,
  addGegnerBatch,
  removeGegner,
  updateGegner,
  getGegnerGruppen,
  addGegnerGruppe,
  updateGegnerGruppe,
  removeGegnerGruppe,
  getAktiveGruppeId,
  setAktiveGruppeId,
  applySchaden,
  setAktuelleRunde,
  processRundenende,
  heilenLaufendeSchaden,
  heilenTp,
  applySchadenCharakter,
  getSpieler,
  getNpcs,
  getCharaktere,
  getCharaktereFuerKampf,
  addSpieler,
  removeSpieler,
  updateSpieler,
  addNpc,
  addNpcBatch,
  removeNpc,
  updateNpc,
  toggleNpcSichtbarkeit,
  toggleSpielerSichtbarkeit,
  toggleGegnerSichtbarkeit,
  heilenTpCharakter,
  heilenLaufendeSchadenCharakter,
  getGegnerVorlagen,
  addGegnerVorlage,
  updateGegnerVorlage,
  removeGegnerVorlage,
  getVorlagen,
  addVorlage,
  updateVorlage,
  removeVorlage,
  getKampfHistorieArchiv,
  archiveKampfHistorie,
  restoreKampfHistorie,
  deleteKampfHistorieArchivEintrag,
  undoLastGegnerHistorie,
  undoLastCharakterHistorie
} from './campaigns.js';
import { state } from './state.js';
import { getRole, ROLES, setCharakter, getCharakter } from './role.js';
import { fillMusikProfilSelect, syncCombatMusic, persistAngreiferModus } from './combatMusic.js';
import { isFirebaseActive, loadCampaign, joinCampaign } from './firebase-storage.js';

const CHARAKTERTRACKER_PANEL = '#charaktertrackerPanel';
const CHARAKTER_PANEL = '#charakterPanel';
const ERFASSUNG_PANEL = '#erfassungPanel';
const SIMULATOR_PANEL = '#simulatorPanel';

function initCharAddRuestungFields() {
  const form = document.getElementById('charAddForm');
  const sel = document.getElementById('charRuestungTyp');
  const rkEl = document.getElementById('charRk');
  const koppel = document.getElementById('charRuestungKoppel');
  if (!form || !sel || !rkEl || !koppel) return;
  if (!form.dataset.ruestungBound) {
    form.dataset.ruestungBound = '1';
    sel.innerHTML = RUESTUNG_TYP_ALLOWED.map((rt) =>
      `<option value="${rt}">${RUESTUNG_TYP_LABELS[rt]} (${rt})</option>`).join('');
    const sync = () => {
      const rk = parseInt(rkEl.value, 10) || 10;
      if (koppel.checked) {
        sel.value = ruestungTypFromRk(rk);
        sel.disabled = true;
      } else {
        sel.disabled = false;
      }
    };
    koppel.addEventListener('change', sync);
    rkEl.addEventListener('change', sync);
    sync();
  } else {
    rkEl.dispatchEvent(new Event('change'));
  }
}

/** Offene Archiv-<details> über render()-Zyklen hinweg merken */
const openHistorieArchivIds = new Set();

export function getIconUrl(icon) {
  const base = URLS.ICONS_BASE_PATH || 'assets/icons/';
  const filename = icon && Object.keys(CHARAKTER_ICONS).includes(icon) ? icon : 'gegner_normal.png';
  return base + filename;
}

function renderIconPicker(containerEl, selectedIcon, onSelect) {
  if (!containerEl) return;
  containerEl.innerHTML = '';
  const icons = Object.entries(CHARAKTER_ICONS);
  icons.forEach(([filename, label]) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'icon-picker-btn' + (selectedIcon === filename ? ' selected' : '');
    btn.title = label;
    btn.dataset.icon = filename;
    const img = document.createElement('img');
    img.src = getIconUrl(filename);
    img.alt = label;
    btn.appendChild(img);
    btn.addEventListener('click', () => {
      containerEl.querySelectorAll('.icon-picker-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      onSelect?.(filename);
    });
    containerEl.appendChild(btn);
  });
}

function getSelectedIconFromPicker(containerEl) {
  const sel = containerEl?.querySelector('.icon-picker-btn.selected');
  return sel?.dataset.icon || null;
}

function prependPopoverCloseButton(popover) {
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn ghost gegner-edit-close';
  closeBtn.textContent = '×';
  closeBtn.title = 'Schliessen';
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    popover.remove();
  });
  popover.prepend(closeBtn);
}

/** An document.body — damit position:fixed zum Viewport passt (nicht zu transformierten Chips/Karten). */
function mountGegnerEditPopover(popover) {
  document.body.appendChild(popover);
}

/** Aktiver Initiativeverlust (Kritische Treffer), solange Rd Init > 0 */
function hasInitiativeVerlust(charObj) {
  return (charObj?.status || []).some(s => s.typ === 'init' && parseInt(s.runden, 10) > 0);
}

/**
 * Reihenfolge ohne Würfel: nach B&M ( höher = früher ), alle mit Init-Verlust
 * vom Krit ans Ende (darin wieder nach B&M).
 */
function buildInitiativeOrderFromKampf() {
  const entries = [];
  getGegnerFuerKampf().forEach(g => {
    if ((g.tp ?? 0) <= 0) return;
    const bm = parseInt(g.bm, 10) || 0;
    entries.push({
      id: g.id,
      typ: 'gegner',
      name: g.name,
      icon: g.icon,
      bm,
      initVerlust: hasInitiativeVerlust(g)
    });
  });
  getCharaktereFuerKampf().forEach(c => {
    if ((c.tp ?? c.maxTp ?? 100) <= 0) return;
    const bm = parseInt(c.bm, 10) || 0;
    entries.push({
      id: c.id,
      typ: c.typ,
      name: c.name,
      icon: c.icon,
      bm,
      initVerlust: hasInitiativeVerlust(c)
    });
  });
  entries.sort((a, b) => {
    if (a.initVerlust !== b.initVerlust) return a.initVerlust ? 1 : -1;
    return b.bm - a.bm;
  });
  return entries;
}

function showCharakterEditPopoverForChip(chipEl, char) {
  const existing = document.querySelector('.gegner-edit-popover:not(.gegner-schaden-popover)');
  if (existing) existing.remove();
  const popover = document.createElement('div');
  popover.className = 'gegner-edit-popover';
  const rkVal = char.rk != null ? char.rk : 20;
  const gTyp = char.gegnerTyp || 'normal';
  const rkOpts = Array.from({ length: 20 }, (_, i) => i + 1).map(n =>
    `<option value="${n}"${rkVal === n ? ' selected' : ''}>${n}</option>`
  ).join('');
  const sichtbarHtml = `<div class="gegner-edit-row">
        <label><input type="checkbox" class="gegner-edit-sichtbar" ${(char.sichtbar !== false) ? 'checked' : ''} /> Im Kampf sichtbar</label>
      </div>`;
  const gruppen = getGegnerGruppen();
  const gruppeOptsHtml = '<option value="">— Keine —</option>' +
    gruppen.map(g => `<option value="${g.id}"${g.id === (char.gruppeId || '') ? ' selected' : ''}>${escapeHtml(g.name)}</option>`).join('');
  popover.innerHTML = `
    <div class="gegner-edit-row">
      <label>Name</label>
      <input type="text" class="gegner-edit-name" value="${escapeHtml(char.name || '')}" placeholder="Name" />
    </div>
    <div class="gegner-edit-row">
      <label>Gruppe</label>
      <select class="gegner-edit-gruppe">${gruppeOptsHtml}</select>
    </div>
    <div class="gegner-edit-row">
      <label>Grösse</label>
      <select class="gegner-edit-groesse">${gegnerGroesseOptionsHtml(gTyp)}</select>
    </div>
    ${getRole() === ROLES.SPIELLEITER ? `<div class="gegner-edit-row">
      <label>Kampf-Musik</label>
      <select class="gegner-edit-musik"></select>
    </div>` : ''}
    <div class="gegner-edit-row">
      <label>Rüstungsklasse</label>
      <select class="gegner-edit-rk">${rkOpts}</select>
    </div>
    ${ruestungKoppelCheckboxHtml(char.ruestungAnRKKoppeln)}
    <div class="gegner-edit-row">
      <label>Rüstung</label>
      <select class="gegner-edit-ruestung">${ruestungTypOptionsHtml(char.ruestungTyp)}</select>
    </div>
    <div class="gegner-edit-row">
      <label>Held</label>
      <select class="gegner-edit-held">${istHeldOptionsHtml(char.istHeld)}</select>
    </div>
    <div class="gegner-edit-row">
      <label>TP (aktuell)</label>
      <input type="number" class="gegner-edit-tp" min="0" max="${char.maxTp ?? 100}" value="${char.tp ?? char.maxTp ?? 100}" />
    </div>
    <div class="gegner-edit-row">
      <label>TP (max)</label>
      <input type="number" class="gegner-edit-maxTp" min="1" value="${char.maxTp ?? 100}" />
    </div>
    <div class="gegner-edit-row">
      <label>Defensivbonus</label>
      <input type="number" class="gegner-edit-db" value="${char.defensivBonus ?? 0}" />
    </div>
    <div class="gegner-edit-row">
      <label>B&M</label>
      <input type="number" class="gegner-edit-bm" value="${char.bm ?? 0}" />
    </div>
    <div class="gegner-edit-row">
      <label>Wahrnehmung</label>
      <input type="text" class="gegner-edit-wahrnehmung" value="${escapeHtml(char.wahrnehmung || '')}" placeholder="z. B. 72" />
    </div>
    ${sichtbarHtml}
    <div class="gegner-edit-row">
      <label>Icon</label>
      <div class="gegner-edit-icon-picker"></div>
    </div>
    <button type="button" class="btn primary gegner-edit-apply">Übernehmen</button>
  `;
  prependPopoverCloseButton(popover);
  popover.dataset.selectedIcon = char.icon || '';
  const iconPickerEl = popover.querySelector('.gegner-edit-icon-picker');
  renderIconPicker(iconPickerEl, char.icon, (filename) => { popover.dataset.selectedIcon = filename; });
  const musikEl = popover.querySelector('.gegner-edit-musik');
  if (musikEl) fillMusikProfilSelect(musikEl, char.musikProfil, char.typ === 'npc' ? 'npc' : 'spieler');
  wireRuestungKoppelPopover(popover);
  popover.querySelector('.gegner-edit-apply').addEventListener('click', () => {
    const name = popover.querySelector('.gegner-edit-name')?.value?.trim();
    const rk = parseInt(popover.querySelector('.gegner-edit-rk').value, 10);
    const ruestungKoppel = popover.querySelector('.gegner-edit-ruestung-koppel')?.checked !== false;
    const ruestungTyp = popover.querySelector('.gegner-edit-ruestung')?.value || 'LE';
    const tp = parseInt(popover.querySelector('.gegner-edit-tp').value, 10);
    const maxTp = Math.max(1, parseInt(popover.querySelector('.gegner-edit-maxTp').value, 10));
    const defensivBonus = parseInt(popover.querySelector('.gegner-edit-db').value, 10) || 0;
    const bm = parseInt(popover.querySelector('.gegner-edit-bm').value, 10) || 0;
    const gegnerTyp = popover.querySelector('.gegner-edit-groesse')?.value || 'normal';
    const wahrnehmung = popover.querySelector('.gegner-edit-wahrnehmung')?.value?.trim() || null;
    const icon = popover.dataset.selectedIcon || char.icon;
    const gruppeId = popover.querySelector('.gegner-edit-gruppe')?.value?.trim() || null;
    const sichtbar = popover.querySelector('.gegner-edit-sichtbar')?.checked !== false;
    const istHeld = popover.querySelector('.gegner-edit-held')?.value === '1';
    const updates = { name: name || char.name, rk, ruestungAnRKKoppeln: ruestungKoppel, ruestungTyp: coerceRuestungTyp(ruestungTyp), istHeld, tp: Math.min(tp, maxTp), maxTp, icon, defensivBonus, bm, gruppeId, gegnerTyp, wahrnehmung, sichtbar };
    const musikSel = popover.querySelector('.gegner-edit-musik');
    if (musikSel && getRole() === ROLES.SPIELLEITER) updates.musikProfil = musikSel.value;
    if (char.typ === 'spieler') {
      updateSpieler(char.id, updates);
    } else {
      updateNpc(char.id, updates);
    }
    popover.remove();
    render();
  });
  mountGegnerEditPopover(popover);
}

function showGegnerEditPopover(cardEl, gegner) {
  const existing = document.querySelector('.gegner-edit-popover:not(.gegner-schaden-popover)');
  if (existing && existing.dataset.editTargetId === gegner.id) {
    existing.remove();
    return;
  }
  if (existing) existing.remove();
  const popover = document.createElement('div');
  popover.className = 'gegner-edit-popover';
  const rkVal = gegner.rk != null ? gegner.rk : 20;
  const imKampfVal = gegner.imKampf !== false;
  const gTyp = gegner.gegnerTyp || 'normal';
  const gruppen = getGegnerGruppen();
  const gruppeOpts = '<option value="">— Keine —</option>' +
    gruppen.map(g => `<option value="${g.id}"${g.id === (gegner.gruppeId || '') ? ' selected' : ''}>${escapeHtml(g.name)}</option>`).join('');
  const rkOpts = Array.from({ length: 20 }, (_, i) => i + 1).map(n =>
    `<option value="${n}"${rkVal === n ? ' selected' : ''}>${n}</option>`
  ).join('');
  popover.innerHTML = `
    <div class="gegner-edit-row gegner-edit-gruppe-row">
      <label>Gruppe</label>
      <select class="gegner-edit-gruppe" title="Gegner dieser Gruppe zuweisen (z. B. Kerker)">
        ${gruppeOpts}
      </select>
    </div>
    <div class="gegner-edit-row">
      <label>Grösse</label>
      <select class="gegner-edit-groesse">${gegnerGroesseOptionsHtml(gTyp)}</select>
    </div>
    ${getRole() === ROLES.SPIELLEITER ? `<div class="gegner-edit-row">
      <label>Kampf-Musik</label>
      <select class="gegner-edit-musik"></select>
    </div>` : ''}
    <div class="gegner-edit-row">
      <label>Rüstungsklasse</label>
      <select class="gegner-edit-rk">${rkOpts}</select>
    </div>
    ${ruestungKoppelCheckboxHtml(gegner.ruestungAnRKKoppeln)}
    <div class="gegner-edit-row">
      <label>Rüstungsart (Schatten, PL–OR)</label>
      <select class="gegner-edit-ruestung">${ruestungTypOptionsHtml(gegner.ruestungTyp)}</select>
    </div>
    <div class="gegner-edit-row">
      <label>TP (aktuell)</label>
      <input type="number" class="gegner-edit-tp" min="0" max="${gegner.maxTp}" value="${gegner.tp}" />
    </div>
    <div class="gegner-edit-row">
      <label>TP (max)</label>
      <input type="number" class="gegner-edit-maxTp" min="1" value="${gegner.maxTp}" />
    </div>
    <div class="gegner-edit-row">
      <label>Defensivbonus</label>
      <input type="number" class="gegner-edit-db" value="${gegner.defensivBonus ?? 0}" />
    </div>
    <div class="gegner-edit-row">
      <label>B&M</label>
      <input type="number" class="gegner-edit-bm" value="${gegner.bm ?? 0}" />
    </div>
    <div class="gegner-edit-row">
      <label>Wahrnehmung</label>
      <input type="text" class="gegner-edit-wn" value="${gegner.wahrnehmung || ''}" placeholder="z. B. 72" />
    </div>
    <div class="gegner-edit-row">
      <label><input type="checkbox" class="gegner-edit-imkampf" ${imKampfVal ? 'checked' : ''} /> Im Kampf anzeigen</label>
    </div>
    <div class="gegner-edit-row">
      <label><input type="checkbox" class="gegner-edit-sichtbar" ${(gegner.sichtbar !== false) ? 'checked' : ''} /> In Status &amp; Zielen sichtbar</label>
    </div>
    <div class="gegner-edit-row">
      <label>Icon</label>
      <div class="gegner-edit-icon-picker"></div>
    </div>
    <button type="button" class="btn primary gegner-edit-apply">Übernehmen</button>
  `;
  prependPopoverCloseButton(popover);
  popover.dataset.selectedIcon = gegner.icon || '';
  const iconPickerEl = popover.querySelector('.gegner-edit-icon-picker');
  renderIconPicker(iconPickerEl, gegner.icon, (filename) => {
    popover.dataset.selectedIcon = filename;
  });
  const musikElG = popover.querySelector('.gegner-edit-musik');
  if (musikElG) fillMusikProfilSelect(musikElG, gegner.musikProfil, 'gegner');
  wireRuestungKoppelPopover(popover);
  popover.querySelector('.gegner-edit-apply').addEventListener('click', () => {
    const rk = parseInt(popover.querySelector('.gegner-edit-rk').value, 10);
    const ruestungKoppel = popover.querySelector('.gegner-edit-ruestung-koppel')?.checked !== false;
    const ruestungTyp = popover.querySelector('.gegner-edit-ruestung')?.value || 'LE';
    const tp = parseInt(popover.querySelector('.gegner-edit-tp').value, 10);
    const maxTp = Math.max(1, parseInt(popover.querySelector('.gegner-edit-maxTp').value, 10));
    const defensivBonus = parseInt(popover.querySelector('.gegner-edit-db').value, 10) || 0;
    const bm = parseInt(popover.querySelector('.gegner-edit-bm').value, 10) || 0;
    const gegnerTyp = popover.querySelector('.gegner-edit-groesse')?.value || 'normal';
    const wahrnehmung = popover.querySelector('.gegner-edit-wn')?.value?.trim() || null;
    const icon = popover.dataset.selectedIcon || gegner.icon;
    const imKampf = popover.querySelector('.gegner-edit-imkampf')?.checked !== false;
    const sichtbar = popover.querySelector('.gegner-edit-sichtbar')?.checked !== false;
    const gruppeSel = popover.querySelector('.gegner-edit-gruppe');
    const gruppeId = gruppeSel?.value?.trim() || null;
    const updates = { rk, ruestungAnRKKoppeln: ruestungKoppel, ruestungTyp: coerceRuestungTyp(ruestungTyp), tp: Math.min(tp, maxTp), maxTp, icon, imKampf, sichtbar, gruppeId, defensivBonus, bm, gegnerTyp, wahrnehmung };
    const musikSel = popover.querySelector('.gegner-edit-musik');
    if (musikSel && getRole() === ROLES.SPIELLEITER) updates.musikProfil = musikSel.value;
    updateGegner(gegner.id, updates);
    popover.remove();
    render();
  });
  popover.dataset.editTargetId = gegner.id;
  mountGegnerEditPopover(popover);
}

function showGegnerSchadenPopover(cardEl, gegner) {
  const existing = document.querySelector('.gegner-schaden-popover');
  if (existing) existing.remove();
  const popover = document.createElement('div');
  popover.className = 'gegner-edit-popover gegner-schaden-popover';
  popover.innerHTML = `
    <div class="gegner-edit-row">
      <label>Schaden (TP abziehen)</label>
      <input type="number" class="gegner-schaden-tp" min="0" placeholder="0" value="" />
    </div>
    <div class="gegner-edit-row">
      <label>oder Heilung (TP hinzufügen)</label>
      <input type="number" class="gegner-heilung-tp" min="0" placeholder="0" value="" />
    </div>
    <div class="gegner-edit-row">
      <label>Beschreibung (optional)</label>
      <input type="text" class="gegner-schaden-desc" placeholder="z. B. Fallschaden" />
    </div>
    <button type="button" class="btn primary gegner-schaden-apply">Anwenden</button>
  `;
  prependPopoverCloseButton(popover);
  popover.querySelector('.gegner-schaden-apply').addEventListener('click', () => {
    const schadenVal = parseInt(popover.querySelector('.gegner-schaden-tp').value, 10) || 0;
    const heilVal = parseInt(popover.querySelector('.gegner-heilung-tp').value, 10) || 0;
    const desc = popover.querySelector('.gegner-schaden-desc').value?.trim() || '';
    if (schadenVal > 0) {
      applySchaden(gegner.id, schadenVal, 'manuell', desc || `${schadenVal} TP (manuell)`);
    }
    if (heilVal > 0) {
      heilenTp(gegner.id, heilVal);
    }
    if (schadenVal > 0 || heilVal > 0) {
      popover.remove();
      render();
    }
  });
  mountGegnerEditPopover(popover);
}

function gegnerGroesseOptionsHtml(selected) {
  return GEGNER_TYP_ALLOWED.map((v) =>
    `<option value="${v}"${selected === v ? ' selected' : ''}>${GEGNER_TYP_LABELS[v]}</option>`
  ).join('');
}

function ruestungTypOptionsHtml(selected) {
  const v = coerceRuestungTyp(selected);
  return RUESTUNG_TYP_ALLOWED.map((rt) =>
    `<option value="${rt}"${v === rt ? ' selected' : ''}>${RUESTUNG_TYP_LABELS[rt]} (${rt})</option>`
  ).join('');
}

function ruestungKoppelCheckboxHtml(checked) {
  const on = checked !== false;
  return `<div class="gegner-edit-row">
      <label title="Schatten: Rüstungsspalte (PL–OR) aus der Rüstungsklasse ableiten, sofern angehakt">
        <input type="checkbox" class="gegner-edit-ruestung-koppel" ${on ? 'checked' : ''} /> Rüstung an RK koppeln (Schatten)
      </label>
    </div>`;
}

function wireRuestungKoppelPopover(popover) {
  const rkEl = popover.querySelector('.gegner-edit-rk');
  const koppelEl = popover.querySelector('.gegner-edit-ruestung-koppel');
  const rustEl = popover.querySelector('.gegner-edit-ruestung');
  if (!koppelEl || !rustEl) return;
  const sync = () => {
    const rk = parseInt(rkEl?.value, 10) || 20;
    if (koppelEl.checked) {
      rustEl.value = ruestungTypFromRk(rk);
      rustEl.disabled = true;
    } else {
      rustEl.disabled = false;
    }
  };
  koppelEl.addEventListener('change', sync);
  rkEl?.addEventListener('change', sync);
  sync();
}

function istHeldOptionsHtml(selected) {
  const held = coerceIstHeld(selected);
  return `<option value="0"${!held ? ' selected' : ''}>Nicht-Held</option><option value="1"${held ? ' selected' : ''}>Held</option>`;
}

function applyZielToSimulator() {
  const ids = state.selectedGegnerIds || [];
  const firstId = ids[0] || null;
  const g = firstId ? getGegnerById(firstId) : null;
  const charInfo = !g && firstId ? getCharakterById(firstId) : null;
  const ziel = g || charInfo?.char;
  if (!ziel) return;
  const typ = gegnerTypForGameRules(ziel.gegnerTyp || 'normal');
  if (typ === 'gross') $('#critType').value = 'Grosse Wesen';
  else if (typ === 'gewaltig') $('#critType').value = 'Gewaltige Wesen';
  else $('#critType').value = (state.autoCrit && state.autoCrit.typ) || '';
  $('#critType').dispatchEvent(new Event('change'));
  syncCombatMusic();
}

function renderKampagnenDropdown() {
  const sel = $(`${ERFASSUNG_PANEL} #kampagneSelect`);
  if (!sel) return;
  const liste = getKampagnenListe();
  let currentId = getCurrentKampagneId();
  if (liste.length > 0 && !currentId) {
    switchKampagne(liste[0].id);
    currentId = liste[0].id;
  }
  sel.innerHTML = '';
  if (liste.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '(Keine Kampagne)';
    sel.appendChild(opt);
  } else {
    liste.forEach(({ id, name }) => {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = name;
      if (id === currentId) opt.selected = true;
      sel.appendChild(opt);
    });
  }
  renderKampagneSyncUI(sel);
}

function renderKampagneSyncUI(sel) {
  const wrap = $(`${ERFASSUNG_PANEL} #kampagneSyncWrap`);
  const idDisplay = $(`${ERFASSUNG_PANEL} #kampagneIdDisplay`);
  if (!wrap || !idDisplay) return;
  if (!isFirebaseActive()) {
    wrap.classList.add('hidden');
    return;
  }
  wrap.classList.remove('hidden');
  const currentId = getCurrentKampagneId() || (sel?.value || '').trim();
  idDisplay.value = currentId;
}

function renderGegnerListe() {
  const container = document.getElementById('gegnerListe');
  if (!container) return;
  let gegner = getGegner();
  const aktiveGruppe = getAktiveGruppeId() || null;
  if (aktiveGruppe) {
    gegner = gegner.filter(g => g.gruppeId === aktiveGruppe);
  }
  gegner = gegner.filter(g => g.sichtbar !== false);
  const selectedIds = state.selectedGegnerIds || [];

  container.innerHTML = '';
  if (gegner.length === 0) {
    container.innerHTML = '<p class="muted">Noch keine Gegner' + (aktiveGruppe ? ' in dieser Gruppe' : '') + ' (oder alle ausgeblendet).</p>';
    return;
  }

  gegner.forEach(g => {
    const card = document.createElement('div');
    const isTot = g.tp <= 0;
    card.className = 'gegner-card' + (isTot ? ' tot' : '');
    const pct = g.maxTp > 0 ? Math.round((g.tp / g.maxTp) * 100) : 100;
    const historie = g.historie || [];
    const historieHtml = historie.length > 0
      ? `<details class="gegner-historie"><summary>Historie (${historie.length})</summary><ul>${historie.slice().reverse().slice(0, 10).map(h => {
        const vonSuffix = h.von ? ` von ${escapeHtml(h.von.name)}` : '';
        if (h.tp > 0) return `<li>Rd ${h.runde}: −${h.tp} TP (${h.quelle}${vonSuffix})</li>`;
        if (h.beschreibung) return `<li>Rd ${h.runde}: ${escapeHtml(h.beschreibung)}${vonSuffix}</li>`;
        return `<li>Rd ${h.runde}: ${h.quelle}${vonSuffix}</li>`;
      }).join('')}</ul></details>`
      : '';
    const status = g.status || [];
    const statusLabels = { ben: 'ben', benoPar: 'benoPar', oPar: 'oPar', par: 'Par', init: 'Init', ko: 'K.O.' };
    const statusBadges = status.map(s => {
      const label = statusLabels[s.typ] || s.typ;
      return s.typ === 'ko' ? `<span class="gegner-status ko">${label}</span>` : `<span class="gegner-status">${label} ${s.runden} Rd</span>`;
    }).join('');
    const laufend = g.laufendeSchaden || [];
    const laufendSum = laufend.reduce((a, l) => a + l.tp, 0);
    const laufendBadge = laufendSum > 0 ? `<span class="gegner-status laufend">+${laufendSum} T/Rd</span>` : '';
    const laufendHeilenRow = laufendSum > 0
      ? `<div class="gegner-heilen-row gegner-blutung-row" data-id="${g.id}">
          <button type="button" class="btn gegner-heilen-btn" data-id="${g.id}" title="1 T/Rd Blutung stoppen (mehrmals klicken für mehr)">1 T/Rd Blutung stoppen</button>
        </div>`
      : '';
    const imKampf = g.imKampf !== false;
    const iconUrl = getIconUrl(g.icon);
    const rk = g.rk != null ? g.rk : 20;
    const db = parseInt(g.defensivBonus, 10) || 0;
    const isSelected = selectedIds.includes(g.id);
    const gruppen = getGegnerGruppen();
    const gruppeName = g.gruppeId ? gruppen.find(gr => gr.id === g.gruppeId)?.name : null;
    const gruppeOpts = gruppen.length > 0
      ? '<option value="">— Keine —</option>' + gruppen.map(gr =>
        `<option value="${gr.id}"${gr.id === (g.gruppeId || '') ? ' selected' : ''}>${escapeHtml(gr.name)}</option>`
      ).join('')
      : '';
    const gruppeSelect = gruppen.length > 0
      ? `<select class="gegner-card-gruppe-select" data-id="${g.id}" title="Gruppe zuweisen">${gruppeOpts}</select>`
      : '';
    card.innerHTML = `
      <div class="gegner-card-header">
        <img class="gegner-icon" src="${iconUrl}" alt="${escapeHtml(g.name)}" />
        <span class="gegner-name">${isTot ? '† ' : ''}${escapeHtml(g.name)}</span>
        ${gruppeSelect}
        <span class="gegner-rk-tp">RK ${rk}${db ? ` · DB ${db}` : ''} · ${g.tp}/${g.maxTp} TP</span>
        <div class="tp-step-row">
          <button type="button" class="btn ghost tp-step-btn" data-step="-5" data-id="${g.id}" title="-5 TP">-5</button>
          <button type="button" class="btn ghost tp-step-btn" data-step="-3" data-id="${g.id}" title="-3 TP">-3</button>
          <button type="button" class="btn ghost tp-step-btn" data-step="3" data-id="${g.id}" title="+3 TP">+3</button>
          <button type="button" class="btn ghost tp-step-btn" data-step="5" data-id="${g.id}" title="+5 TP">+5</button>
        </div>
        <button type="button" class="btn ghost gegner-select-toggle ${isSelected ? 'active' : ''}" data-id="${g.id}" title="${isSelected ? 'Abwählen' : 'Als Ziel auswählen'}">${isSelected ? '✓' : '○'}</button>
        <button type="button" class="btn ghost gegner-edit" data-id="${g.id}" title="Bearbeiten">✎</button>
        <button type="button" class="btn ghost gegner-schaden-btn" data-id="${g.id}" title="Treffer manuell">±</button>
        ${(g.historie || []).length > 0 ? `<button type="button" class="btn ghost gegner-undo-btn" data-id="${g.id}" title="Letzten Eintrag rückgängig">↩</button>` : ''}
        ${!isTot ? `<button type="button" class="btn ghost gegner-tod-btn" data-id="${g.id}" title="Als tot markieren">†</button>` : ''}
        <button type="button" class="btn ghost gegner-kampf-toggle ${imKampf ? 'active' : ''}" data-id="${g.id}" title="${imKampf ? 'Im Kampf' : 'Nicht im Kampf'}">${imKampf ? '⚔' : '—'}</button>
        <button type="button" class="btn ghost gegner-remove" data-id="${g.id}" title="Entfernen">×</button>
      </div>
      ${statusBadges || laufendBadge ? `<div class="gegner-status-row">${statusBadges}${laufendBadge}</div>` : ''}
      ${laufendHeilenRow}
      <div class="gegner-tp-bar">
        <div class="gegner-tp-fill" style="width: ${Math.max(0, pct)}%"></div>
      </div>
      ${historieHtml}
      ${isTot ? '<span class="gegner-tot">TOT</span>' : ''}
    `;
    card.querySelector('.gegner-select-toggle')?.addEventListener('click', (e) => {
      e.stopPropagation();
      let ids = [...(state.selectedGegnerIds || [])];
      if (ids.includes(g.id)) ids = ids.filter(id => id !== g.id);
      else ids.push(g.id);
      state.selectedGegnerIds = ids;
      applyZielToSimulator();
      render();
    });

    const gruppeSelEl = card.querySelector('.gegner-card-gruppe-select');
    gruppeSelEl?.addEventListener('change', (e) => {
      e.stopPropagation();
      const val = gruppeSelEl.value?.trim() || null;
      updateGegner(g.id, { gruppeId: val });
      render();
    });

    card.querySelector('.gegner-edit')?.addEventListener('click', (e) => {
      e.stopPropagation();
      showGegnerEditPopover(card, g);
    });
    card.querySelector('.gegner-schaden-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      showGegnerSchadenPopover(card, g);
    });
    card.querySelector('.gegner-undo-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const undone = undoLastGegnerHistorie(g.id);
      if (undone) render();
    });
    card.querySelector('.gegner-tod-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      updateGegner(g.id, { tp: 0 });
      state.selectedGegnerIds = (state.selectedGegnerIds || []).filter(id => id !== g.id);
      applyZielToSimulator();
      render();
    });
    card.querySelector('.gegner-kampf-toggle')?.addEventListener('click', (e) => {
      e.stopPropagation();
      updateGegner(g.id, { imKampf: !imKampf });
      render();
    });
    card.querySelectorAll('.tp-step-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const step = parseInt(btn.dataset.step, 10) || 0;
        if (step < 0) applySchaden(g.id, Math.abs(step), 'manuell', `${Math.abs(step)} TP (Schnellaktion)`);
        if (step > 0) heilenTp(g.id, step);
        render();
      });
    });
    card.querySelector('.gegner-remove')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`${g.name} wirklich entfernen?`)) {
        removeGegner(g.id);
        state.selectedGegnerIds = (state.selectedGegnerIds || []).filter(id => id !== g.id);
        render();
      }
    });
    const heilenBtn = card.querySelector('.gegner-blutung-row .gegner-heilen-btn');
    heilenBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (heilenLaufendeSchaden(g.id, 1)) {
        render();
      }
    });
    container.appendChild(card);
  });
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function renderZielAnzeige() {
  const imKampfGegner = getGegnerFuerKampf();
  const charaktere = getCharaktereFuerKampf();
  const verbuendete = charaktere.map(c => ({ ...c, zielTyp: c.typ }));
  const gegnerZiele = imKampfGegner.map(g => ({ ...g, zielTyp: 'gegner' }));
  const zielSection = $('#simulatorZielSection');
  const zielListe = $('#simulatorZielListe');
  const zielInfo = $('#simulatorZielInfo');
  if (zielSection && zielListe) {
    zielSection.hidden = verbuendete.length === 0 && gegnerZiele.length === 0;
    zielListe.innerHTML = '';
    const renderZielBtn = (z) => {
      const tp = z.tp ?? z.maxTp ?? 100;
      const isTot = tp <= 0;
      const isSelected = (state.selectedGegnerIds || []).includes(z.id);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ziel-select-btn ziel-select-btn-round' + (isTot ? ' tot' : '') + (isSelected ? ' active' : '');
      btn.dataset.id = z.id;
      btn.dataset.zielTyp = z.zielTyp;
      btn.disabled = false;
      const iconWrap = document.createElement('div');
      iconWrap.className = 'ziel-icon-wrap';
      const iconImg = document.createElement('img');
      iconImg.className = 'ziel-icon';
      iconImg.src = getIconUrl(z.icon);
      iconImg.alt = z.name;
      iconWrap.appendChild(iconImg);
      const nameSpan = document.createElement('span');
      nameSpan.className = 'ziel-name';
      nameSpan.textContent = (isTot ? '† ' : '') + z.name + (isTot ? ' (tot)' : '');
      btn.title = z.name;
      btn.appendChild(iconWrap);
      btn.appendChild(nameSpan);
      btn.addEventListener('click', () => {
        let ids = [...(state.selectedGegnerIds || [])];
        if (ids.includes(z.id)) ids = ids.filter(id => id !== z.id);
        else ids.push(z.id);
        state.selectedGegnerIds = ids;
        applyZielToSimulator();
        render();
      });
      return btn;
    };
    const addGroup = (label, ziele, groupType) => {
      if (ziele.length === 0) return;
      const group = document.createElement('div');
      group.className = 'ziel-group';
      group.dataset.groupType = groupType;
      const heading = document.createElement('div');
      heading.className = 'ziel-group-heading';
      heading.textContent = label;
      group.appendChild(heading);
      const row = document.createElement('div');
      row.className = 'ziel-group-row';
      ziele.forEach(z => row.appendChild(renderZielBtn(z)));
      group.appendChild(row);
      zielListe.appendChild(group);
    };
    const isMonsterModus = state.angreiferSubTab === 'monster';
    if (isMonsterModus) {
      addGroup('Gegner', verbuendete, 'gegner');
      addGroup('Verbündete', gegnerZiele, 'verbuendete');
    } else {
      addGroup('Gegner', gegnerZiele, 'gegner');
      addGroup('Verbündete', verbuendete, 'verbuendete');
    }
    requestAnimationFrame(() => adjustZielNameFontSizes());
    if (zielInfo) zielInfo.textContent = '';
  }
  syncRkFallbackSichtbarkeit();
}

/** Früher: RK-/Gegnertyp ohne Ziel — UI entfernt, Platzhalter für Aufrufe aus dem Renderer. */
function syncRkFallbackSichtbarkeit() {}

function adjustZielNameFontSizes() {
  const btns = $$('.ziel-select-btn-round');
  btns.forEach(btn => {
    const nameSpan = btn.querySelector('.ziel-name');
    if (!nameSpan) return;
    nameSpan.style.fontSize = '';
    nameSpan.style.lineHeight = '';
    const baseSize = 10;
    const maxWidth = 70;
    if (nameSpan.scrollWidth > maxWidth) {
      let fs = baseSize;
      while (nameSpan.scrollWidth > maxWidth && fs > 6) {
        fs -= 1;
        nameSpan.style.fontSize = `${fs}px`;
        nameSpan.style.lineHeight = `${fs * 1.1}px`;
      }
    }
  });
}

function renderRunde() {
  const r = getAktuelleRunde();
  const text = `Runde ${r}`;
  const el = $(`${SIMULATOR_PANEL} #rundeAnzeige`);
  if (el) el.textContent = text;
  const elStatus = document.getElementById('rundeAnzeigeStatus');
  if (elStatus) elStatus.textContent = text;
  const prevBtn = $(`${SIMULATOR_PANEL} #rundePrev`);
  if (prevBtn) prevBtn.disabled = r <= 0;
  const prevBtnS = document.getElementById('rundePrevStatus');
  if (prevBtnS) prevBtnS.disabled = r <= 0;
}

function renderDbAnzeige() {
  const el = document.getElementById('dbAnzeige');
  if (!el) return;
  const ids = state.selectedGegnerIds || [];
  if (ids.length === 0) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  const parts = ids.map(id => {
    const g = getGegnerById(id);
    if (g) {
      const db = parseInt(g.defensivBonus, 10) || 0;
      return `<span class="db-anzeige-item">${escapeHtml(g.name)}: <strong>DB\u00a0=\u00a0${db}</strong></span>`;
    }
    const ci = getCharakterById(id);
    if (ci) {
      const db = parseInt(ci.char.defensivBonus, 10) || 0;
      return `<span class="db-anzeige-item">${escapeHtml(ci.char.name)}: <strong>DB\u00a0=\u00a0${db}</strong></span>`;
    }
    return null;
  }).filter(Boolean);
  if (parts.length === 0) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  el.hidden = false;
  el.innerHTML = parts.join(' · ');
}

function selectAngreiferCharakter(c) {
  state.selectedCharakterId = c?.id || null;
  state.selectedCharakterName = c?.name || null;
  if (getRole() === ROLES.SPIELLER && getCurrentKampagneId()) {
    setCharakter(getCurrentKampagneId(), c || null);
  }
  syncCombatMusic();
}

function selectAngreiferMonster(gegnerId) {
  state.monsterAngreiferGegnerId = gegnerId || null;
  syncCombatMusic();
}

function renderAngreiferAnzeige() {
  const section = $('#simulatorAngreiferSection');
  const liste = $('#simulatorAngreiferListe');
  if (!section || !liste) return;

  const isMonsterModus = state.angreiferSubTab === 'monster';
  let entities = [];
  if (isMonsterModus) {
    entities = getGegnerFuerKampf().map((g) => ({ ...g, entityTyp: 'gegner' }));
    if (entities.length > 0) {
      const hasSel = state.monsterAngreiferGegnerId && entities.some((g) => g.id === state.monsterAngreiferGegnerId);
      if (!hasSel) selectAngreiferMonster(entities[0].id);
    } else {
      state.monsterAngreiferGegnerId = null;
    }
  } else {
    entities = getCharaktereFuerKampf().map((c) => ({
      ...c,
      entityTyp: c.typ,
      displayName: c.typ === 'npc' ? `${c.name} (NPC)` : c.name
    }));
    if (entities.length > 0) {
      const hasSel = state.selectedCharakterId && entities.some((c) => c.id === state.selectedCharakterId);
      if (!hasSel && getRole() === ROLES.SPIELLEITER) {
        selectAngreiferCharakter(entities[0]);
      }
    }
  }

  section.hidden = entities.length === 0;
  liste.innerHTML = '';

  const renderBtn = (entity) => {
    const isSelected = isMonsterModus
      ? entity.id === state.monsterAngreiferGegnerId
      : entity.id === state.selectedCharakterId;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ziel-select-btn ziel-select-btn-round' + (isSelected ? ' active' : '');
    btn.dataset.id = entity.id;
    btn.title = entity.displayName || entity.name;
    const iconWrap = document.createElement('div');
    iconWrap.className = 'ziel-icon-wrap';
    const iconImg = document.createElement('img');
    iconImg.className = 'ziel-icon';
    iconImg.src = getIconUrl(entity.icon);
    iconImg.alt = entity.name;
    iconWrap.appendChild(iconImg);
    const nameSpan = document.createElement('span');
    nameSpan.className = 'ziel-name';
    nameSpan.textContent = entity.displayName || entity.name;
    btn.appendChild(iconWrap);
    btn.appendChild(nameSpan);
    btn.addEventListener('click', () => {
      if (isMonsterModus) {
        selectAngreiferMonster(entity.id);
      } else {
        selectAngreiferCharakter(entity);
      }
      render();
    });
    return btn;
  };

  const group = document.createElement('div');
  group.className = 'ziel-group';
  const heading = document.createElement('div');
  heading.className = 'ziel-group-heading';
  heading.textContent = isMonsterModus ? 'Monster' : 'Angreifer';
  group.appendChild(heading);
  const row = document.createElement('div');
  row.className = 'ziel-group-row';
  entities.forEach((e) => row.appendChild(renderBtn(e)));
  group.appendChild(row);
  liste.appendChild(group);
  requestAnimationFrame(() => adjustZielNameFontSizes());
}

function renderSimulatorKampfToolbar() {
  const modusToggle = $('#simulatorAngriffsmodus');
  const angreiferModus = state.angreiferSubTab === 'monster' ? 'monster' : 'charakter';
  document.body.setAttribute('data-angriffsmodus', angreiferModus);
  if (modusToggle) {
    modusToggle.hidden = false;
    modusToggle.setAttribute('data-pos', angreiferModus);
  }
}

let simulatorKampfToolbarBound = false;
function initSimulatorKampfToolbar() {
  if (simulatorKampfToolbarBound) return;
  simulatorKampfToolbarBound = true;
  document.querySelectorAll('[data-angriffsmodus]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const t = btn.getAttribute('data-angriffsmodus') || 'charakter';
      state.angreiferSubTab = t === 'monster' ? 'monster' : 'charakter';
      persistAngreiferModus();
      render();
    });
  });
  $('#angriffsmodusTrack')?.addEventListener('click', () => {
    state.angreiferSubTab = state.angreiferSubTab === 'monster' ? 'charakter' : 'monster';
    persistAngreiferModus();
    render();
  });
}

function renderUserProfileIcon() {
  const iconEl = $('#userProfileIcon');
  const charItem = $('#userProfileCharakter');
  if (!iconEl) return;
  const role = getRole();
  if (role === ROLES.SPIELLEITER) {
    iconEl.src = URLS.ICONS_BASE_PATH + 'wizard.png';
    iconEl.alt = 'Spielleiter';
    if (charItem) charItem.hidden = true;
  } else {
    const charaktere = getCharaktere();
    const c = charaktere.find(x => x.id === state.selectedCharakterId);
    iconEl.src = getIconUrl(c?.icon);
    iconEl.alt = state.selectedCharakterName || 'Spieler';
    if (charItem) charItem.hidden = false;
  }
}

function renderGegnerCharListe() {
  const container = document.getElementById('gegnerCharListe');
  if (!container) return;
  const gegner = getGegner();
  container.innerHTML = '';
  gegner.forEach(g => {
    const div = document.createElement('div');
    const isVisible = g.sichtbar !== false;
    div.className = 'charakter-chip' + (isVisible ? '' : ' hidden-npc');
    const iconUrl = getIconUrl(g.icon);
    const rk = g.rk ?? 1;
    const tp = g.tp ?? g.maxTp ?? 100;
    const maxTp = g.maxTp ?? 100;
    div.innerHTML = `<img class="charakter-chip-icon" src="${iconUrl}" alt="" /><span>${escapeHtml(g.name)} (RK ${rk}, ${tp}/${maxTp} TP)</span><button type="button" class="btn ghost gegner-visible-toggle" data-id="${g.id}" title="${isVisible ? 'Ausblenden' : 'Einblenden'}">${isVisible ? '👁' : '🙈'}</button><button type="button" class="btn ghost char-icon-edit" data-id="${g.id}" title="Bearbeiten">✎</button><button type="button" class="btn ghost char-remove" data-id="${g.id}" title="Entfernen">×</button>`;
    div.querySelector('.gegner-visible-toggle')?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleGegnerSichtbarkeit(g.id);
      const g2 = getGegnerById(g.id);
      if (g2 && g2.sichtbar === false) {
        state.selectedGegnerIds = (state.selectedGegnerIds || []).filter(id => id !== g.id);
        applyZielToSimulator();
      }
      render();
    });
    div.querySelector('.char-icon-edit')?.addEventListener('click', (e) => {
      e.stopPropagation();
      showGegnerEditPopover(div, g);
    });
    div.querySelector('.char-remove')?.addEventListener('click', () => {
      if (confirm(`${g.name} wirklich entfernen?`)) {
        removeGegner(g.id);
        render();
      }
    });
    container.appendChild(div);
  });
}

function renderSpielerListe() {
  const container = document.getElementById('spielerListe');
  if (!container) return;
  const spieler = getSpieler();
  container.innerHTML = '';
  spieler.forEach(s => {
    const div = document.createElement('div');
    const isVisible = s.sichtbar !== false;
    div.className = 'charakter-chip' + (isVisible ? '' : ' hidden-npc');
    const iconUrl = getIconUrl(s.icon);
    div.innerHTML = `<img class="charakter-chip-icon" src="${iconUrl}" alt="" /><span>${escapeHtml(s.name)}</span><button type="button" class="btn ghost spieler-visible-toggle" data-id="${s.id}" title="${isVisible ? 'Ausblenden' : 'Einblenden'}">${isVisible ? '👁' : '🙈'}</button><button type="button" class="btn ghost char-icon-edit" data-id="${s.id}" title="Bearbeiten">✎</button><button type="button" class="btn ghost char-remove" data-id="${s.id}" title="Entfernen">×</button>`;
    div.querySelector('.spieler-visible-toggle')?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleSpielerSichtbarkeit(s.id);
      render();
    });
    div.querySelector('.char-icon-edit')?.addEventListener('click', (e) => {
      e.stopPropagation();
      showCharakterEditPopoverForChip(div, { ...s, typ: 'spieler' });
    });
    div.querySelector('.char-remove')?.addEventListener('click', () => {
      if (confirm(`${s.name} wirklich entfernen?`)) {
        removeSpieler(s.id);
        render();
      }
    });
    container.appendChild(div);
  });
}

function renderNpcListe() {
  const container = document.getElementById('npcListe');
  if (!container) return;
  const npcs = getNpcs();
  container.innerHTML = '';
  npcs.forEach(n => {
    const div = document.createElement('div');
    const isVisible = n.sichtbar !== false;
    div.className = 'charakter-chip' + (isVisible ? '' : ' hidden-npc');
    const iconUrl = getIconUrl(n.icon);
    div.innerHTML = `<img class="charakter-chip-icon" src="${iconUrl}" alt="" /><span>${escapeHtml(n.name)}</span><button type="button" class="btn ghost npc-visible-toggle" data-id="${n.id}" title="${isVisible ? 'Ausblenden' : 'Einblenden'}">${isVisible ? '👁' : '🙈'}</button><button type="button" class="btn ghost char-icon-edit" data-id="${n.id}" title="Bearbeiten">✎</button><button type="button" class="btn ghost char-remove" data-id="${n.id}" title="Entfernen">×</button>`;
    div.querySelector('.npc-visible-toggle')?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleNpcSichtbarkeit(n.id);
      render();
    });
    div.querySelector('.char-icon-edit')?.addEventListener('click', (e) => {
      e.stopPropagation();
      showCharakterEditPopoverForChip(div, { ...n, typ: 'npc' });
    });
    div.querySelector('.char-remove')?.addEventListener('click', () => {
      if (confirm(`${n.name} wirklich entfernen?`)) {
        removeNpc(n.id);
        render();
      }
    });
    container.appendChild(div);
  });
}

function renderAktiveGruppeCharSelect() {
  const sel = document.getElementById('aktiveGruppeCharSelect');
  if (!sel) return;
  const gruppen = getGegnerGruppen();
  const aktiveId = state.aktiveGruppeCharId || '';
  sel.innerHTML = `<option value=""${!aktiveId ? ' selected' : ''}>Alle</option>` +
    gruppen.map(g => `<option value="${g.id}"${g.id === aktiveId ? ' selected' : ''}>${escapeHtml(g.name)}</option>`).join('');
}

function renderCharakterListe() {
  const container = document.getElementById('charakterListe');
  if (!container) return;
  const spieler = getSpieler();
  const npcs = getNpcs();
  let alle = [
    ...spieler.map(s => ({ ...s, typ: 'spieler' })),
    ...npcs.map(n => ({ ...n, typ: 'npc' }))
  ];
  const aktiveGruppeChar = state.aktiveGruppeCharId || null;
  if (aktiveGruppeChar) {
    alle = alle.filter(c => c.gruppeId === aktiveGruppeChar);
  }
  container.innerHTML = '';
  if (alle.length === 0) {
    container.innerHTML = '<p class="muted">Noch keine Spieler oder NPCs' + (aktiveGruppeChar ? ' in dieser Gruppe' : '') + '.</p>';
    return;
  }
  alle.forEach(c => {
    const isHidden = (c.typ === 'npc' || c.typ === 'spieler') && c.sichtbar === false;
    if (isHidden) return;
    const card = document.createElement('div');
    const isTot = (c.tp ?? c.maxTp ?? 100) <= 0;
    card.className = 'gegner-card charakter-card' + (isTot ? ' tot' : '');
    const maxTp = c.maxTp ?? 100;
    const tp = c.tp ?? maxTp;
    const pct = maxTp > 0 ? Math.round((tp / maxTp) * 100) : 100;
    const rk = c.rk != null ? c.rk : 20;
    const db = parseInt(c.defensivBonus, 10) || 0;
    const historie = c.historie || [];
    const historieHtml = historie.length > 0
      ? `<details class="gegner-historie"><summary>Historie (${historie.length})</summary><ul>${historie.slice().reverse().slice(0, 10).map(h => {
        const vonSuffix = h.von ? ` von ${escapeHtml(h.von.name)}` : '';
        if (h.tp > 0) return `<li>Rd ${h.runde}: −${h.tp} TP (${h.quelle}${vonSuffix})</li>`;
        if (h.beschreibung) return `<li>Rd ${h.runde}: ${escapeHtml(h.beschreibung)}${vonSuffix}</li>`;
        return `<li>Rd ${h.runde}: ${h.quelle}${vonSuffix}</li>`;
      }).join('')}</ul></details>`
      : '';
    const status = c.status || [];
    const statusLabels = { ben: 'ben', benoPar: 'benoPar', oPar: 'oPar', par: 'Par', init: 'Init', ko: 'K.O.' };
    const statusBadges = status.map(s => {
      const label = statusLabels[s.typ] || s.typ;
      return s.typ === 'ko' ? `<span class="gegner-status ko">${label}</span>` : `<span class="gegner-status">${label} ${s.runden} Rd</span>`;
    }).join('');
    const laufend = c.laufendeSchaden || [];
    const laufendSum = laufend.reduce((a, l) => a + l.tp, 0);
    const laufendBadge = laufendSum > 0 ? `<span class="gegner-status laufend">+${laufendSum} T/Rd</span>` : '';
    const laufendHeilenRow = laufendSum > 0
      ? `<div class="gegner-heilen-row gegner-blutung-row" data-id="${c.id}" data-typ="${c.typ}">
          <button type="button" class="btn gegner-heilen-btn" data-id="${c.id}" data-typ="${c.typ}">1 T/Rd Blutung stoppen</button>
        </div>`
      : '';
    const iconUrl = getIconUrl(c.icon);
    const wPart = c.typ === 'spieler' && c.wahrnehmung
      ? ` · W = ${escapeHtml(String(c.wahrnehmung))}`
      : '';
    const dbPart = db ? ` · DB = ${db}` : '';
    const statsLine = `RK = ${rk}${dbPart} · TP = <span class="charakter-tp-fraction">${tp}/${maxTp}</span>${wPart}`;
    const selectedIds = state.selectedGegnerIds || [];
    const isSelected = selectedIds.includes(c.id);
    card.innerHTML = `
      <div class="gegner-card-header charakter-card-header">
        <div class="charakter-card-top">
          <div class="charakter-card-identity">
            <img class="gegner-icon" src="${iconUrl}" alt="${escapeHtml(c.name)}" />
            <span class="gegner-name">${isTot ? '† ' : ''}${escapeHtml(c.name)}</span>
          </div>
          <div class="charakter-card-actions">
            <button type="button" class="btn ghost gegner-select-toggle ${isSelected ? 'active' : ''}" data-id="${c.id}" title="${isSelected ? 'Abwählen' : 'Auswahl: Als Ziel auswählen'}">${isSelected ? '✓' : '○'}</button>
            <button type="button" class="btn ghost char-visible-toggle" data-id="${c.id}" data-typ="${c.typ}" title="Ausblenden">👁</button>
            <button type="button" class="btn ghost charakter-ereignis-btn" data-id="${c.id}" data-typ="${c.typ}" title="Verletzung und TP erfassen">+</button>
            ${(c.historie || []).length > 0 ? `<button type="button" class="btn ghost charakter-undo-btn" data-id="${c.id}" title="Zurücksetzen: letzten Eintrag rückgängig">↩</button>` : ''}
            <button type="button" class="btn ghost gegner-icon-edit" data-id="${c.id}" data-typ="${c.typ}" title="Bearbeiten">✎</button>
          </div>
        </div>
        <div class="charakter-card-stats">
          <span class="gegner-rk-tp">${statsLine}</span>
        </div>
        <div class="charakter-card-tp-wrap">
          <span class="charakter-card-tp-label">TP anpassen:</span>
          <div class="tp-step-row tp-step-row--char">
            <button type="button" class="btn ghost tp-step-char-btn" data-step="-5" data-id="${c.id}" title="-5 TP">-5</button>
            <button type="button" class="btn ghost tp-step-char-btn" data-step="-3" data-id="${c.id}" title="-3 TP">-3</button>
            <button type="button" class="btn ghost tp-step-char-btn" data-step="3" data-id="${c.id}" title="+3 TP">+3</button>
            <button type="button" class="btn ghost tp-step-char-btn" data-step="5" data-id="${c.id}" title="+5 TP">+5</button>
          </div>
        </div>
      </div>
      ${statusBadges || laufendBadge ? `<div class="gegner-status-row">${statusBadges}${laufendBadge}</div>` : ''}
      ${laufendHeilenRow}
      <div class="gegner-tp-bar">
        <div class="gegner-tp-fill" style="width: ${Math.max(0, pct)}%"></div>
      </div>
      ${historieHtml}
      ${isTot ? '<span class="gegner-tot">TOT</span>' : ''}
    `;
    card.querySelector('.gegner-select-toggle')?.addEventListener('click', (e) => {
      e.stopPropagation();
      let ids = [...(state.selectedGegnerIds || [])];
      if (ids.includes(c.id)) ids = ids.filter(id => id !== c.id);
      else ids.push(c.id);
      state.selectedGegnerIds = ids;
      applyZielToSimulator();
      render();
    });
    card.querySelector('.charakter-ereignis-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      showCharakterEreignisPopover(card, c);
    });
    card.querySelector('.charakter-undo-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const undone = undoLastCharakterHistorie(c.id);
      if (undone) render();
    });
    card.querySelector('.gegner-icon-edit')?.addEventListener('click', (e) => {
      e.stopPropagation();
      showCharakterEditPopover(card, c);
    });
    card.querySelector('.char-visible-toggle')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (c.typ === 'npc') toggleNpcSichtbarkeit(c.id);
      else if (c.typ === 'spieler') toggleSpielerSichtbarkeit(c.id);
      render();
    });
    const heilenBtn = card.querySelector('.gegner-blutung-row .gegner-heilen-btn');
    heilenBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (heilenLaufendeSchadenCharakter(c.id, 1)) render();
    });
    card.querySelectorAll('.tp-step-char-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const step = parseInt(btn.dataset.step, 10) || 0;
        if (step < 0) applySchadenCharakter(c.id, Math.abs(step), 'manuell', `${Math.abs(step)} TP (Schnellaktion)`);
        if (step > 0) heilenTpCharakter(c.id, step);
        render();
      });
    });
    container.appendChild(card);
  });
}

function showCharakterEreignisPopover(cardEl, char) {
  const existing = document.querySelector('.charakter-ereignis-popover');
  if (existing) existing.remove();
  const popover = document.createElement('div');
  popover.className = 'gegner-edit-popover charakter-ereignis-popover';
  popover.innerHTML = `
    <div class="gegner-edit-row">
      <label>Verletzung / Ereignis</label>
      <input type="text" class="charakter-ereignis-desc" placeholder="z. B. Pfeil in die Schulter, eingeklemmt" />
    </div>
    <div class="gegner-edit-row">
      <label>Schaden (TP abziehen) – optional</label>
      <input type="number" class="charakter-ereignis-schaden" min="0" placeholder="0" value="" />
    </div>
    <div class="gegner-edit-row">
      <label>Heilung (TP hinzufügen) – optional</label>
      <input type="number" class="charakter-ereignis-heilung" min="0" placeholder="0" value="" />
    </div>
    <button type="button" class="btn primary charakter-ereignis-apply">Hinzufügen</button>
  `;
  prependPopoverCloseButton(popover);
  popover.querySelector('.charakter-ereignis-apply').addEventListener('click', () => {
    const desc = popover.querySelector('.charakter-ereignis-desc').value?.trim() || '';
    const schadenVal = parseInt(popover.querySelector('.charakter-ereignis-schaden').value, 10) || 0;
    const heilVal = parseInt(popover.querySelector('.charakter-ereignis-heilung').value, 10) || 0;
    if (!desc && schadenVal <= 0 && heilVal <= 0) return;
    if (schadenVal > 0) {
      applySchadenCharakter(char.id, schadenVal, 'manuell', desc || `${schadenVal} TP (manuell)`);
    } else if (desc) {
      applySchadenCharakter(char.id, 0, 'manuell', desc);
    }
    if (heilVal > 0) {
      heilenTpCharakter(char.id, heilVal);
    }
    popover.remove();
    render();
  });
  mountGegnerEditPopover(popover);
}

function showCharakterEditPopover(cardEl, char) {
  const existing = document.querySelector('.gegner-edit-popover:not(.gegner-schaden-popover)');
  if (existing && existing.dataset.editTargetId === char.id) {
    existing.remove();
    return;
  }
  if (existing) existing.remove();
  const popover = document.createElement('div');
  popover.className = 'gegner-edit-popover';
  const rkVal = char.rk != null ? char.rk : 20;
  const gTyp = char.gegnerTyp || 'normal';
  const rkOpts = Array.from({ length: 20 }, (_, i) => i + 1).map(n =>
    `<option value="${n}"${rkVal === n ? ' selected' : ''}>${n}</option>`
  ).join('');
  const sichtbarHtml = `<div class="gegner-edit-row">
        <label><input type="checkbox" class="gegner-edit-sichtbar" ${(char.sichtbar !== false) ? 'checked' : ''} /> Im Kampf sichtbar</label>
      </div>`;
  const gruppen2 = getGegnerGruppen();
  const gruppeOptsHtml2 = '<option value="">— Keine —</option>' +
    gruppen2.map(g => `<option value="${g.id}"${g.id === (char.gruppeId || '') ? ' selected' : ''}>${escapeHtml(g.name)}</option>`).join('');
  popover.innerHTML = `
    <div class="gegner-edit-row">
      <label>Gruppe</label>
      <select class="gegner-edit-gruppe">${gruppeOptsHtml2}</select>
    </div>
    <div class="gegner-edit-row">
      <label>Grösse</label>
      <select class="gegner-edit-groesse">${gegnerGroesseOptionsHtml(gTyp)}</select>
    </div>
    ${getRole() === ROLES.SPIELLEITER ? `<div class="gegner-edit-row">
      <label>Kampf-Musik</label>
      <select class="gegner-edit-musik"></select>
    </div>` : ''}
    <div class="gegner-edit-row">
      <label>Rüstungsklasse</label>
      <select class="gegner-edit-rk">${rkOpts}</select>
    </div>
    ${ruestungKoppelCheckboxHtml(char.ruestungAnRKKoppeln)}
    <div class="gegner-edit-row">
      <label>Rüstung</label>
      <select class="gegner-edit-ruestung">${ruestungTypOptionsHtml(char.ruestungTyp)}</select>
    </div>
    <div class="gegner-edit-row">
      <label>Held</label>
      <select class="gegner-edit-held">${istHeldOptionsHtml(char.istHeld)}</select>
    </div>
    <div class="gegner-edit-row">
      <label>TP (aktuell)</label>
      <input type="number" class="gegner-edit-tp" min="0" max="${char.maxTp ?? 100}" value="${char.tp ?? char.maxTp ?? 100}" />
    </div>
    <div class="gegner-edit-row">
      <label>TP (max)</label>
      <input type="number" class="gegner-edit-maxTp" min="1" value="${char.maxTp ?? 100}" />
    </div>
    <div class="gegner-edit-row">
      <label>Defensivbonus</label>
      <input type="number" class="gegner-edit-db" value="${char.defensivBonus ?? 0}" />
    </div>
    <div class="gegner-edit-row">
      <label>B&M</label>
      <input type="number" class="gegner-edit-bm" value="${char.bm ?? 0}" />
    </div>
    <div class="gegner-edit-row">
      <label>Wahrnehmung</label>
      <input type="text" class="gegner-edit-wahrnehmung" value="${escapeHtml(char.wahrnehmung || '')}" placeholder="z. B. 72" />
    </div>
    ${sichtbarHtml}
    <div class="gegner-edit-row">
      <label>Icon</label>
      <div class="gegner-edit-icon-picker"></div>
    </div>
    <button type="button" class="btn primary gegner-edit-apply">Übernehmen</button>
  `;
  prependPopoverCloseButton(popover);
  popover.dataset.selectedIcon = char.icon || '';
  const iconPickerEl = popover.querySelector('.gegner-edit-icon-picker');
  renderIconPicker(iconPickerEl, char.icon, (filename) => { popover.dataset.selectedIcon = filename; });
  const musikElC = popover.querySelector('.gegner-edit-musik');
  if (musikElC) fillMusikProfilSelect(musikElC, char.musikProfil, char.typ === 'npc' ? 'npc' : 'spieler');
  wireRuestungKoppelPopover(popover);
  popover.querySelector('.gegner-edit-apply').addEventListener('click', () => {
    const rk = parseInt(popover.querySelector('.gegner-edit-rk').value, 10);
    const ruestungKoppel = popover.querySelector('.gegner-edit-ruestung-koppel')?.checked !== false;
    const ruestungTyp = popover.querySelector('.gegner-edit-ruestung')?.value || 'LE';
    const tp = parseInt(popover.querySelector('.gegner-edit-tp').value, 10);
    const maxTp = Math.max(1, parseInt(popover.querySelector('.gegner-edit-maxTp').value, 10));
    const defensivBonus = parseInt(popover.querySelector('.gegner-edit-db').value, 10) || 0;
    const bm = parseInt(popover.querySelector('.gegner-edit-bm').value, 10) || 0;
    const gegnerTyp = popover.querySelector('.gegner-edit-groesse')?.value || 'normal';
    const wahrnehmung = popover.querySelector('.gegner-edit-wahrnehmung')?.value?.trim() || null;
    const icon = popover.dataset.selectedIcon || char.icon;
    const gruppeId = popover.querySelector('.gegner-edit-gruppe')?.value?.trim() || null;
    const sichtbar = popover.querySelector('.gegner-edit-sichtbar')?.checked !== false;
    const istHeld = popover.querySelector('.gegner-edit-held')?.value === '1';
    const updates = { rk, ruestungAnRKKoppeln: ruestungKoppel, ruestungTyp: coerceRuestungTyp(ruestungTyp), istHeld, tp: Math.min(tp, maxTp), maxTp, icon, defensivBonus, bm, gruppeId, gegnerTyp, wahrnehmung, sichtbar };
    const musikSel = popover.querySelector('.gegner-edit-musik');
    if (musikSel && getRole() === ROLES.SPIELLEITER) updates.musikProfil = musikSel.value;
    if (char.typ === 'spieler') {
      updateSpieler(char.id, updates);
    } else {
      updateNpc(char.id, updates);
    }
    popover.remove();
    render();
  });
  popover.dataset.editTargetId = char.id;
  mountGegnerEditPopover(popover);
}

function renderAktiveGruppeSelect() {
  const sel = document.getElementById('aktiveGruppeSelect');
  if (!sel) return;
  const gruppen = getGegnerGruppen();
  const aktiveId = getAktiveGruppeId();
  sel.innerHTML = `<option value=""${!aktiveId ? ' selected' : ''}>Alle</option>` +
    gruppen.map(g => `<option value="${g.id}"${g.id === aktiveId ? ' selected' : ''}>${escapeHtml(g.name)}</option>`).join('');
}

function renderGegnerGruppenVerwaltung() {
  const container = document.getElementById('gegnerGruppenVerwaltung');
  if (!container) return;
  const gruppen = getGegnerGruppen();
  container.innerHTML = '';
  if (gruppen.length === 0) {
    const hint = document.createElement('p');
    hint.className = 'gegner-gruppen-hint muted';
    hint.textContent = 'Erstelle eine Gruppe (z. B. Kerker), weise Gegner über das Dropdown auf der Karte zu, wähle dann die Gruppe oben und klicke „Alle auswählen“.';
    container.appendChild(hint);
  }
  gruppen.forEach(g => {
    const row = document.createElement('div');
    row.className = 'gegner-gruppe-row';
    row.innerHTML = `
      <span class="gegner-gruppe-name">${escapeHtml(g.name)}</span>
      <button type="button" class="btn ghost gegner-gruppe-rename" data-id="${g.id}" title="Umbenennen">✎</button>
      <button type="button" class="btn ghost gegner-gruppe-remove" data-id="${g.id}" title="Löschen">×</button>
    `;
    row.querySelector('.gegner-gruppe-rename')?.addEventListener('click', () => {
      const n = prompt('Neuer Name:', g.name);
      if (n != null && n.trim() && updateGegnerGruppe(g.id, n.trim())) render();
    });
    row.querySelector('.gegner-gruppe-remove')?.addEventListener('click', () => {
      if (confirm(`Gruppe „${g.name}" und ihre Zuordnung zu Gegnern entfernen?`)) {
        removeGegnerGruppe(g.id);
        render();
      }
    });
    container.appendChild(row);
  });
  const addRow = document.createElement('div');
  addRow.className = 'gegner-gruppe-add-row';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Neue Gruppe (z. B. Kerker)';
  input.className = 'gegner-gruppe-add-input';
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn primary';
  addBtn.textContent = 'Hinzufügen';
  addBtn.addEventListener('click', () => {
    const name = input.value?.trim();
    if (name && addGegnerGruppe(name)) {
      input.value = '';
      render();
    }
  });
  addRow.appendChild(input);
  addRow.appendChild(addBtn);
  container.appendChild(addRow);
}

function renderGegnerGruppeSelect() {
  const sel = document.getElementById('charGruppeSelect');
  if (!sel) return;
  const gruppen = getGegnerGruppen();
  const currentVal = sel.value || '';
  sel.innerHTML = '<option value="">— Keine —</option>' +
    gruppen.map(g => `<option value="${g.id}"${g.id === currentVal ? ' selected' : ''}>${escapeHtml(g.name)}</option>`).join('');
}

function renderVorlagen() {
  renderCharVorlageSelect();
  const wrap = document.getElementById('vorlagenWrap');
  if (!wrap) return;
  wrap.innerHTML = '';
  const typLabels = { gegner: 'NPC Gegner', npc: 'NPC Verbündet', spieler: 'Spieler' };

  const form = document.createElement('div');
  form.className = 'gegner-vorlage-form';
  form.innerHTML = `
    <div class="vorlage-field">
      <span class="vorlage-field-label">Typ</span>
      <select class="vorlage-typ">
        <option value="gegner">NPC Gegner</option>
        <option value="npc">NPC Verbündet</option>
        <option value="spieler">Spieler</option>
      </select>
    </div>
    <div class="vorlage-field vorlage-field-wide">
      <span class="vorlage-field-label">Vorlagenname</span>
      <input type="text" class="vorlage-name" placeholder="z. B. Waldtroll" autocomplete="off" />
    </div>
    <div class="vorlage-field">
      <span class="vorlage-field-label">Trefferpunkte (max)</span>
      <input type="number" class="vorlage-tp" min="1" placeholder="100" />
    </div>
    <div class="vorlage-field">
      <span class="vorlage-field-label">Grösse (Gegnertyp)</span>
      <select class="vorlage-groesse">${gegnerGroesseOptionsHtml('normal')}</select>
    </div>
    <div class="vorlage-field vorlage-field-wide">
      <span class="vorlage-field-label">Kampf-Musik (Profil)</span>
      <select class="vorlage-musik"></select>
    </div>
    <div class="vorlage-field">
      <span class="vorlage-field-label">Rüstungsklasse</span>
      <select class="vorlage-rk">${Array.from({ length: 20 }, (_, i) => i + 1).map(n => `<option value="${n}"${n === 10 ? ' selected' : ''}>${n}</option>`).join('')}</select>
    </div>
    <div class="vorlage-field vorlage-field-wide">
      <label><input type="checkbox" class="vorlage-ruestung-koppel" checked /> Rüstung an RK koppeln (Schatten)</label>
    </div>
    <div class="vorlage-field">
      <span class="vorlage-field-label">Rüstungsart</span>
      <select class="vorlage-ruestung">${ruestungTypOptionsHtml('VL')}</select>
    </div>
    <div class="vorlage-field">
      <span class="vorlage-field-label">Defensivbonus</span>
      <input type="number" class="vorlage-db" placeholder="0" />
    </div>
    <div class="vorlage-field">
      <span class="vorlage-field-label">Bewegung &amp; Manöver</span>
      <input type="number" class="vorlage-bm" placeholder="0" />
    </div>
    <div class="vorlage-field vorlage-field-wide">
      <span class="vorlage-field-label">Wahrnehmung (optional)</span>
      <input type="text" class="vorlage-wn" placeholder="z. B. 72" autocomplete="off" />
    </div>
    <button type="button" class="btn primary vorlage-add">Vorlage speichern</button>
  `;
  const typSelV = form.querySelector('.vorlage-typ');
  const musikSelV = form.querySelector('.vorlage-musik');
  const refillVorlageMusik = () => {
    const typ = typSelV?.value || 'gegner';
    const et = typ === 'spieler' ? 'spieler' : typ === 'npc' ? 'npc' : 'gegner';
    fillMusikProfilSelect(musikSelV, null, et);
  };
  typSelV?.addEventListener('change', refillVorlageMusik);
  refillVorlageMusik();
  const vorlageRk = form.querySelector('.vorlage-rk');
  const vorlageKoppel = form.querySelector('.vorlage-ruestung-koppel');
  const vorlageRust = form.querySelector('.vorlage-ruestung');
  const syncVorlageRuestung = () => {
    const rk = parseInt(vorlageRk?.value, 10) || 10;
    if (vorlageKoppel?.checked) {
      vorlageRust.value = ruestungTypFromRk(rk);
      vorlageRust.disabled = true;
    } else {
      vorlageRust.disabled = false;
    }
  };
  vorlageKoppel?.addEventListener('change', syncVorlageRuestung);
  vorlageRk?.addEventListener('change', syncVorlageRuestung);
  syncVorlageRuestung();
  form.querySelector('.vorlage-add')?.addEventListener('click', () => {
    const name = form.querySelector('.vorlage-name')?.value?.trim();
    if (!name) return;
    const tp = parseInt(form.querySelector('.vorlage-tp')?.value, 10);
    const db = parseInt(form.querySelector('.vorlage-db')?.value, 10);
    const bm = parseInt(form.querySelector('.vorlage-bm')?.value, 10);
    const typV = form.querySelector('.vorlage-typ')?.value || 'gegner';
    addVorlage({
      name,
      typ: typV,
      maxTp: Number.isFinite(tp) && tp > 0 ? tp : 100,
      gegnerTyp: form.querySelector('.vorlage-groesse')?.value,
      rk: form.querySelector('.vorlage-rk')?.value,
      ruestungAnRKKoppeln: form.querySelector('.vorlage-ruestung-koppel')?.checked !== false,
      ruestungTyp: coerceRuestungTyp(form.querySelector('.vorlage-ruestung')?.value || 'LE'),
      defensivBonus: Number.isFinite(db) ? db : 0,
      bm: Number.isFinite(bm) ? bm : 0,
      wahrnehmung: form.querySelector('.vorlage-wn')?.value?.trim() || null,
      musikProfil: musikSelV?.value || undefined,
      icon: getSelectedIconFromPicker(document.getElementById('charIconPicker'))
    });
    render();
  });
  wrap.appendChild(form);

  const list = getVorlagen();
  const listWrap = document.createElement('div');
  listWrap.className = 'gegner-vorlagen-liste';
  if (list.length === 0) {
    listWrap.innerHTML = '<p class="muted">Noch keine Vorlagen gespeichert.</p>';
  } else {
    list.forEach(v => {
      const row = document.createElement('div');
      row.className = 'gegner-vorlage-row';
      const label = typLabels[v.typ] || v.typ;
      row.innerHTML = `<span><em>${escapeHtml(label)}</em> ${escapeHtml(v.name)} · ${v.maxTp} TP · RK ${v.rk}${v.defensivBonus ? ` · DB ${v.defensivBonus}` : ''}${v.bm ? ` · B&M ${v.bm}` : ''}</span><button type="button" class="btn ghost edit">✎</button><button type="button" class="btn ghost del">×</button>`;
      row.querySelector('.edit')?.addEventListener('click', () => {
        const name = prompt('Neuer Vorlagenname:', v.name);
        if (!name) return;
        updateVorlage(v.id, { name: name.trim() });
        render();
      });
      row.querySelector('.del')?.addEventListener('click', () => {
        if (confirm(`Vorlage "${v.name}" löschen?`)) {
          removeVorlage(v.id);
          render();
        }
      });
      listWrap.appendChild(row);
    });
  }
  wrap.appendChild(listWrap);
}

function renderInitiative() {
  const listEl = document.getElementById('initiativeListe');
  if (!listEl) return;
  /** Reihenfolge nur aus aktuellen Figuren berechnen — nicht bei jedem Render speichern (Firebase onValue → Render → Speichern → Loop). */
  const list = buildInitiativeOrderFromKampf();
  if (!Array.isArray(list) || list.length === 0) {
    listEl.innerHTML = '<p class="muted">Keine Kämpfer im Kampf (oder alle bei 0 TP).</p>';
    return;
  }
  listEl.innerHTML = list.map((e, idx) => {
    const tail = e.initVerlust
      ? '<span class="initiative-init-badge" title="Initiativeverlust durch Kritischen Treffer — zuletzt in der Runde">Init-Verlust</span>'
      : '';
    return `<div class="initiative-item${e.initVerlust ? ' initiative-init-verlust' : ''}"><span>${idx + 1}.</span><img class="charakter-chip-icon" src="${getIconUrl(e.icon)}" alt="" /><span>${escapeHtml(e.name)}</span><span class="initiative-val" title="Bewegung &amp; Manöver (Reihenfolge: höher zuerst)">${e.bm}</span>${tail}</div>`;
  }).join('');
}

function stopSummaryToggle(e) {
  e.preventDefault();
  e.stopPropagation();
}

function renderHistorieArchiv() {
  const el = document.getElementById('historieArchivListe');
  if (!el) return;

  el.querySelectorAll('details.historie-item[open]').forEach((d) => {
    const id = d.dataset.archivId;
    if (id) openHistorieArchivIds.add(id);
  });

  const data = getKampfHistorieArchiv();
  if (!data.length) {
    openHistorieArchivIds.clear();
    el.innerHTML = '<p class="muted">Noch keine archivierten Kämpfe.</p>';
    return;
  }
  el.innerHTML = '';
  data.forEach(h => {
    const details = document.createElement('details');
    details.className = 'historie-item';
    details.dataset.archivId = h.id;
    if (openHistorieArchivIds.has(h.id)) details.open = true;

    const date = new Date(h.datum);
    const summary = document.createElement('summary');
    summary.className = 'historie-item-summary';

    const title = document.createElement('span');
    title.className = 'historie-item-title';
    title.textContent = `${h.name} · ${date.toLocaleString('de-CH')} · ${h.runden} Rd`;

    const actions = document.createElement('span');
    actions.className = 'historie-item-actions';

    const restoreBtn = document.createElement('button');
    restoreBtn.type = 'button';
    restoreBtn.className = 'btn ghost';
    restoreBtn.textContent = 'Wiederherstellen';
    restoreBtn.addEventListener('click', (e) => {
      stopSummaryToggle(e);
      if (!confirm('Kampf wiederherstellen? Aktuelle TP werden auf Basis der archivierten Historie neu berechnet.')) return;
      const ok = restoreKampfHistorie(h.id);
      if (!ok) {
        alert('Wiederherstellen fehlgeschlagen. Ist die richtige Kampagne gewählt?');
        return;
      }
      openHistorieArchivIds.delete(h.id);
      render();
      document.querySelector('.app-tabs:not([hidden]) .tab[data-tab="charaktertracker"]')?.click();
    });

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn ghost';
    delBtn.textContent = 'Archiv löschen';
    delBtn.addEventListener('click', (e) => {
      stopSummaryToggle(e);
      if (!confirm('Archiv-Eintrag wirklich löschen?')) return;
      if (!deleteKampfHistorieArchivEintrag(h.id)) {
        alert('Löschen fehlgeschlagen.');
        return;
      }
      openHistorieArchivIds.delete(h.id);
      render();
    });

    actions.appendChild(restoreBtn);
    actions.appendChild(delBtn);
    summary.appendChild(title);
    summary.appendChild(actions);
    details.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'historie-item-body';
    const eintraege = h.eintraege || [];
    if (eintraege.length === 0) {
      body.innerHTML = '<p class="muted">Keine gespeicherten Historie-Einträge.</p>';
    } else {
      eintraege.forEach(ent => {
        const card = document.createElement('div');
        card.className = 'historie-entity';
        card.innerHTML = `<strong>${escapeHtml(ent.entityName)} (${ent.entityTyp})</strong><ul>${(ent.historie || []).map(x => `<li>Rd ${x.runde}: ${escapeHtml(x.beschreibung || `${x.quelle} ${x.tp || 0} TP`)}</li>`).join('')}</ul>`;
        body.appendChild(card);
      });
    }
    details.appendChild(body);
    el.appendChild(details);
  });
}

function resolveSelectedEntities(ids) {
  return ids.map(id => {
    const g = getGegnerById(id);
    if (g) return { ...g, _typ: 'gegner' };
    const s = getSpielerById(id);
    if (s) return { ...s, _typ: 'spieler' };
    const n = getNpcById(id);
    if (n) return { ...n, _typ: 'npc' };
    return null;
  }).filter(Boolean);
}

function renderGegnerZielAuswahl() {
  const wrap = document.getElementById('gegnerZielAuswahlWrap');
  const container = document.getElementById('gegnerZielAuswahl');
  const aktionen = document.getElementById('gegnerZielAktionen');
  if (!wrap || !container || !aktionen) return;
  const selectedIds = state.selectedGegnerIds || [];
  const ziele = resolveSelectedEntities(selectedIds);
  if (ziele.length === 0) {
    wrap.classList.add('hidden');
    return;
  }
  wrap.classList.remove('hidden');
  container.innerHTML = '';
  const heading = document.createElement('div');
  heading.className = 'gegner-ziel-heading';
  heading.textContent = `${ziele.length} ausgewählt:`;
  container.appendChild(heading);
  const row = document.createElement('div');
  row.className = 'gegner-ziel-chips';
  ziele.forEach(z => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'gegner-ziel-chip active';
    chip.title = `${z.name} abwählen`;
    const isTot = (z.tp ?? z.maxTp ?? 100) <= 0;
    const typLabel = z._typ === 'gegner' ? '' : z._typ === 'npc' ? ' (NPC)' : ' (SC)';
    chip.innerHTML = `<img src="${getIconUrl(z.icon)}" alt="" class="gegner-ziel-chip-icon" /><span>${isTot ? '† ' : ''}${escapeHtml(z.name)}${typLabel}</span><span class="gegner-ziel-chip-remove">×</span>`;
    if (isTot) chip.classList.add('tot');
    chip.addEventListener('click', () => {
      state.selectedGegnerIds = selectedIds.filter(id => id !== z.id);
      applyZielToSimulator();
      render();
    });
    row.appendChild(chip);
  });
  container.appendChild(row);

  aktionen.innerHTML = '';
  const gruppen = getGegnerGruppen();
  if (ziele.length >= 1) {
    const schadenRow = document.createElement('div');
    schadenRow.className = 'gegner-ziel-schaden-row';
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.min = '1';
    inp.placeholder = 'TP';
    inp.className = 'gegner-ziel-tp-input';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn primary gegner-ziel-schaden-btn';
    btn.textContent = 'TP Schaden an alle';
    btn.addEventListener('click', () => {
      const tp = parseInt(inp.value, 10) || 0;
      if (tp > 0) {
        ziele.forEach(z => {
          if (z._typ === 'gegner') applySchaden(z.id, tp, 'manuell', `${tp} TP (manuell)`);
          else applySchadenCharakter(z.id, tp, 'manuell', `${tp} TP (manuell)`);
        });
        inp.value = '';
        render();
      }
    });
    schadenRow.appendChild(inp);
    schadenRow.appendChild(btn);
    aktionen.appendChild(schadenRow);

    const todBtn = document.createElement('button');
    todBtn.type = 'button';
    todBtn.className = 'btn ghost gegner-ziel-tod-btn';
    todBtn.textContent = 'Alle als tot markieren';
    todBtn.addEventListener('click', () => {
      ziele.forEach(z => {
        if (z._typ === 'gegner') updateGegner(z.id, { tp: 0 });
        else if (z._typ === 'spieler') updateSpieler(z.id, { tp: 0 });
        else updateNpc(z.id, { tp: 0 });
      });
      state.selectedGegnerIds = [];
      applyZielToSimulator();
      render();
    });
    aktionen.appendChild(todBtn);

    const gegnerZiele = ziele.filter(z => z._typ === 'gegner');
    if (gegnerZiele.length > 0) {
      const ausKampfBtn = document.createElement('button');
      ausKampfBtn.type = 'button';
      ausKampfBtn.className = 'btn ghost gegner-ziel-auskampf-btn';
      ausKampfBtn.textContent = `Gegner aus Kampf entfernen (${gegnerZiele.length})`;
      ausKampfBtn.addEventListener('click', () => {
        gegnerZiele.forEach(g => updateGegner(g.id, { imKampf: false }));
        state.selectedGegnerIds = selectedIds.filter(id => !gegnerZiele.find(g => g.id === id));
        applyZielToSimulator();
        render();
      });
      aktionen.appendChild(ausKampfBtn);
    }

    if (gruppen.length > 0) {
      const zuweisenWrap = document.createElement('div');
      zuweisenWrap.className = 'gegner-ziel-zuweisen-row';
      const zuweisenSel = document.createElement('select');
      zuweisenSel.className = 'gegner-ziel-zuweisen-select';
      zuweisenSel.innerHTML = '<option value="">Gruppe wählen …</option>' +
        gruppen.map(gr => `<option value="${gr.id}">${escapeHtml(gr.name)}</option>`).join('');
      const zuweisenBtn = document.createElement('button');
      zuweisenBtn.type = 'button';
      zuweisenBtn.className = 'btn ghost gegner-ziel-zuweisen-btn';
      zuweisenBtn.textContent = 'Zuweisen';
      zuweisenBtn.addEventListener('click', () => {
        const gruppeId = zuweisenSel.value?.trim() || null;
        if (gruppeId) {
          ziele.forEach(z => {
            if (z._typ === 'gegner') updateGegner(z.id, { gruppeId });
            else if (z._typ === 'spieler') updateSpieler(z.id, { gruppeId });
            else updateNpc(z.id, { gruppeId });
          });
          zuweisenSel.value = '';
          render();
        }
      });
      zuweisenWrap.appendChild(zuweisenSel);
      zuweisenWrap.appendChild(zuweisenBtn);
      aktionen.appendChild(zuweisenWrap);
    }

    const loeschenBtn = document.createElement('button');
    loeschenBtn.type = 'button';
    loeschenBtn.className = 'btn ghost gegner-ziel-loeschen-btn';
    loeschenBtn.textContent = 'Ausgewählte löschen';
    loeschenBtn.addEventListener('click', () => {
      const namen = ziele.map(z => z.name).join(', ');
      if (confirm(`${ziele.length} Einträge wirklich löschen?\n\n${namen}`)) {
        ziele.forEach(z => {
          if (z._typ === 'gegner') removeGegner(z.id);
          else if (z._typ === 'spieler') removeSpieler(z.id);
          else removeNpc(z.id);
        });
        state.selectedGegnerIds = [];
        applyZielToSimulator();
        render();
      }
    });
    aktionen.appendChild(loeschenBtn);
  }
}

function renderSpielerCharakterView() {
  const container = document.getElementById('spielerCharakterView');
  if (!container) return;
  if (getRole() === ROLES.SPIELLEITER) {
    container.innerHTML = '';
    return;
  }
  const charId = state.selectedCharakterId;
  if (!charId) {
    container.innerHTML = '<p class="muted">Kein Charakter ausgewählt.</p>';
    return;
  }
  const spieler = getSpieler();
  const npcs = getNpcs();
  const alle = [...spieler.map(s => ({ ...s, typ: 'spieler' })), ...npcs.map(n => ({ ...n, typ: 'npc' }))];
  const c = alle.find(x => x.id === charId);
  if (!c) {
    container.innerHTML = '<p class="muted">Charakter nicht gefunden.</p>';
    return;
  }
  const tp = c.tp ?? c.maxTp ?? 100;
  const maxTp = c.maxTp ?? 100;
  const pct = maxTp > 0 ? Math.round((tp / maxTp) * 100) : 100;
  const rk = c.rk != null ? c.rk : 20;
  const db = parseInt(c.defensivBonus, 10) || 0;
  const iconUrl = getIconUrl(c.icon);
  const status = c.status || [];
  const statusLabels = { ben: 'ben', benoPar: 'benoPar', oPar: 'oPar', par: 'Par', init: 'Init', ko: 'K.O.' };
  const statusBadges = status.map(s => {
    const label = statusLabels[s.typ] || s.typ;
    return s.typ === 'ko' ? `<span class="gegner-status ko">${label}</span>` : `<span class="gegner-status">${label} ${s.runden} Rd</span>`;
  }).join('');
  const laufend = c.laufendeSchaden || [];
  const laufendSum = laufend.reduce((a, l) => a + l.tp, 0);
  const laufendBadge = laufendSum > 0 ? `<span class="gegner-status laufend">+${laufendSum} T/Rd</span>` : '';
  container.innerHTML = `
    <div class="spieler-char-card">
      <div class="gegner-card-header">
        <img class="gegner-icon" src="${iconUrl}" alt="${escapeHtml(c.name)}" />
        <span class="gegner-name">${escapeHtml(c.name)}</span>
        <span class="gegner-rk-tp">RK ${rk}${db ? ` · DB ${db}` : ''} · ${tp}/${maxTp} TP</span>
      </div>
      ${statusBadges || laufendBadge ? `<div class="gegner-status-row">${statusBadges}${laufendBadge}</div>` : ''}
      <div class="gegner-tp-bar">
        <div class="gegner-tp-fill" style="width: ${Math.max(0, pct)}%"></div>
      </div>
    </div>
  `;
}

function render() {
  renderKampagnenDropdown();
  renderGegnerCharListe();
  renderSpielerListe();
  renderNpcListe();
  renderAktiveGruppeSelect();
  renderGegnerGruppenVerwaltung();
  renderGegnerGruppeSelect();
  renderVorlagen();
  renderGegnerZielAuswahl();
  renderGegnerListe();
  renderCharakterListe();
  renderZielAnzeige();
  renderInitiative();
  renderHistorieArchiv();
  renderDbAnzeige();
  renderAngreiferAnzeige();
  renderSimulatorKampfToolbar();
  populateWeapons();
  renderUserProfileIcon();
  renderRunde();
  renderSpielerCharakterView();
  syncCombatMusic();

  const isSpieler = getRole() !== ROLES.SPIELLEITER;
  if (isSpieler) {
    document.querySelectorAll(`${ERFASSUNG_PANEL} .spielleiter-only, ${CHARAKTER_PANEL} .spielleiter-only`).forEach((el) => {
      el.hidden = true;
    });
  }
  document.querySelectorAll('.spieler-charakter-view').forEach(el => {
    el.hidden = !isSpieler;
  });
}

function initKampagnenUI() {
  const sel = $(`${ERFASSUNG_PANEL} #kampagneSelect`);
  const addBtn = $(`${ERFASSUNG_PANEL} #kampagneAdd`);
  const renameBtn = $(`${ERFASSUNG_PANEL} #kampagneRename`);
  const delBtn = $(`${ERFASSUNG_PANEL} #kampagneDel`);

  sel?.addEventListener('change', () => {
    const id = sel.value;
    if (id && switchKampagne(id)) {
      state.selectedGegnerId = '';
      render();
    }
  });

  addBtn?.addEventListener('click', () => {
    const name = prompt('Name der neuen Kampagne:', 'Kampagne 1');
    if (name != null) {
      createKampagne(name.trim());
      render();
    }
  });

  renameBtn?.addEventListener('click', () => {
    const current = getCurrentKampagne();
    if (!current) return;
    const name = prompt('Neuer Name:', current.name);
    if (name != null && name.trim()) {
      renameKampagne(current.id, name.trim());
      render();
    }
  });

  delBtn?.addEventListener('click', () => {
    const current = getCurrentKampagne();
    if (!current) return;
    if (confirm(`Kampagne „${current.name}" wirklich löschen?`)) {
      deleteKampagne(current.id);
      render();
    }
  });

  const idCopyBtn = $(`${ERFASSUNG_PANEL} #kampagneIdCopy`);
  const idDisplay = $(`${ERFASSUNG_PANEL} #kampagneIdDisplay`);
  idCopyBtn?.addEventListener('click', () => {
    const id = idDisplay?.value?.trim();
    if (!id) return;
    navigator.clipboard?.writeText(id).then(() => {
      idCopyBtn.textContent = 'Kopiert!';
      setTimeout(() => { idCopyBtn.textContent = 'Kopieren'; }, 1500);
    }).catch(() => alert('Kopieren fehlgeschlagen.'));
  });

  const joinInput = $(`${ERFASSUNG_PANEL} #kampagneJoinInput`);
  const joinBtn = $(`${ERFASSUNG_PANEL} #kampagneJoinBtn`);
  joinBtn?.addEventListener('click', async () => {
    const id = joinInput?.value?.trim();
    if (!id) {
      alert('Bitte Kampagnen-ID eingeben.');
      return;
    }
    joinBtn.disabled = true;
    try {
      const data = await loadCampaign(id);
      if (!data) {
        alert('Kampagne nicht gefunden. ID prüfen.');
        return;
      }
      joinCampaign(id);
      if (switchKampagne(id)) {
        joinInput.value = '';
        render();
      }
    } finally {
      joinBtn.disabled = false;
    }
  });
}

let charAddFormInitialized = false;
function initCharAddForm() {
  const form = document.getElementById('charAddForm');
  const iconPicker = document.getElementById('charIconPicker');
  if (iconPicker && !iconPicker.dataset.initialized) {
    iconPicker.dataset.initialized = '1';
    renderIconPicker(iconPicker, null);
  }
  const charMusikEl = document.getElementById('charMusikProfil');
  if (form && charMusikEl && !charMusikEl.dataset.boundMusik) {
    charMusikEl.dataset.boundMusik = '1';
    const refillCharMusik = () => {
      const typ = form.querySelector('#charTyp')?.value || 'gegner';
      const et = typ === 'spieler' ? 'spieler' : typ === 'npc' ? 'npc' : 'gegner';
      fillMusikProfilSelect(charMusikEl, null, et);
    };
    form.querySelector('#charTyp')?.addEventListener('change', refillCharMusik);
    refillCharMusik();
  }
  initCharAddRuestungFields();
  if (charAddFormInitialized) return;
  charAddFormInitialized = true;

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const typ = form.querySelector('#charTyp')?.value || 'gegner';
    const name = form.querySelector('#charName')?.value?.trim();
    if (!name) return;
    const anzahl = parseInt(form.querySelector('#charAnzahl')?.value || '1', 10) || 1;
    const tp = form.querySelector('#charTp')?.value || '100';
    const groesse = form.querySelector('#charGroesse')?.value || 'normal';
    const rk = form.querySelector('#charRk')?.value || '10';
    const ruestungKoppel = form.querySelector('#charRuestungKoppel')?.checked !== false;
    const ruestungTyp = coerceRuestungTyp(form.querySelector('#charRuestungTyp')?.value || ruestungTypFromRk(parseInt(rk, 10) || 10));
    const defensivBonus = form.querySelector('#charDb')?.value || '0';
    const bm = form.querySelector('#charBm')?.value || '0';
    const wahrnehmung = form.querySelector('#charWahrnehmung')?.value?.trim() || null;
    const gruppeId = form.querySelector('#charGruppeSelect')?.value?.trim() || null;
    const musikP = form.querySelector('#charMusikProfil')?.value || null;
    const icon = getSelectedIconFromPicker(iconPicker);
    if (!getCurrentKampagneId()) createKampagne('Kampagne 1');
    if (typ === 'gegner') {
      if (anzahl > 1) {
        const ids = addGegnerBatch(anzahl, name, tp, groesse, rk, icon, gruppeId, wahrnehmung);
        ids.forEach(id => updateGegner(id, { defensivBonus, bm, ruestungAnRKKoppeln: ruestungKoppel, ruestungTyp, ...(musikP ? { musikProfil: musikP } : {}) }));
      } else {
        const id = addGegner(name, tp, groesse, rk, icon, gruppeId, wahrnehmung);
        if (id) updateGegner(id, { defensivBonus, bm, ruestungAnRKKoppeln: ruestungKoppel, ruestungTyp, ...(musikP ? { musikProfil: musikP } : {}) });
      }
    } else if (typ === 'npc') {
      if (anzahl > 1) {
        const ids = addNpcBatch(anzahl, name, tp, rk, icon, groesse, wahrnehmung);
        ids.forEach(id => updateNpc(id, { defensivBonus, bm, gruppeId, ruestungAnRKKoppeln: ruestungKoppel, ruestungTyp, ...(musikP ? { musikProfil: musikP } : {}) }));
      } else {
        const id = addNpc(name, icon, tp, rk, groesse, wahrnehmung);
        if (id) updateNpc(id, { defensivBonus, bm, gruppeId, ruestungAnRKKoppeln: ruestungKoppel, ruestungTyp, ...(musikP ? { musikProfil: musikP } : {}) });
      }
    } else {
      const id = addSpieler(name, icon, tp, rk, wahrnehmung, groesse);
      if (id) updateSpieler(id, { defensivBonus, bm, gruppeId, ruestungAnRKKoppeln: ruestungKoppel, ruestungTyp, ...(musikP ? { musikProfil: musikP } : {}) });
    }
    form.reset();
    form.querySelector('#charAnzahl').value = '1';
    form.querySelector('#charTp').value = '100';
    form.querySelector('#charRk').value = '10';
    form.querySelector('#charGroesse').value = 'normal';
    form.querySelector('#charTyp').value = typ;
    const rkCh = document.getElementById('charRk');
    const koppelCh = document.getElementById('charRuestungKoppel');
    if (koppelCh) koppelCh.checked = true;
    rkCh?.dispatchEvent(new Event('change'));
    iconPicker?.querySelectorAll('.icon-picker-btn.selected').forEach(b => b.classList.remove('selected'));
    render();
  });

  form?.querySelector('#charVorlageSelect')?.addEventListener('change', () => {
    const sel = form.querySelector('#charVorlageSelect');
    const tpl = getVorlagen().find(v => v.id === sel?.value);
    if (!tpl) return;
    form.querySelector('#charName').value = tpl.name || '';
    form.querySelector('#charTp').value = tpl.maxTp || 100;
    form.querySelector('#charGroesse').value = tpl.gegnerTyp || 'normal';
    form.querySelector('#charRk').value = String(tpl.rk || 10);
    const kf = document.getElementById('charRuestungKoppel');
    const rs = document.getElementById('charRuestungTyp');
    if (kf) kf.checked = tpl.ruestungAnRKKoppeln !== false;
    if (rs) rs.value = coerceRuestungTyp(tpl.ruestungTyp);
    document.getElementById('charRk')?.dispatchEvent(new Event('change'));
    form.querySelector('#charDb').value = String(tpl.defensivBonus || 0);
    form.querySelector('#charBm').value = String(tpl.bm || 0);
    form.querySelector('#charWahrnehmung').value = tpl.wahrnehmung || '';
    if (tpl.typ) form.querySelector('#charTyp').value = tpl.typ;
    const cm = document.getElementById('charMusikProfil');
    if (cm) {
      const et = tpl.typ === 'spieler' ? 'spieler' : tpl.typ === 'npc' ? 'npc' : 'gegner';
      fillMusikProfilSelect(cm, tpl.musikProfil, et);
    }
  });

  form?.querySelector('#charTyp')?.addEventListener('change', () => {
    renderCharVorlageSelect();
  });
}

function renderCharVorlageSelect() {
  const sel = document.getElementById('charVorlageSelect');
  if (!sel) return;
  const typ = document.getElementById('charTyp')?.value || 'gegner';
  const list = getVorlagen().filter(v => v.typ === typ);
  const cur = sel.value || '';
  sel.innerHTML = '<option value="">— Keine —</option>' +
    list.map(v => `<option value="${v.id}"${v.id === cur ? ' selected' : ''}>${escapeHtml(v.name)}</option>`).join('');
}

let gegnerUIInitialized = false;
function initGegnerUI() {
  if (gegnerUIInitialized) return;
  gegnerUIInitialized = true;

  const aktiveSel = document.getElementById('aktiveGruppeSelect');
  aktiveSel?.addEventListener('change', () => {
    const val = aktiveSel.value || null;
    setAktiveGruppeId(val);
    state.aktiveGruppeCharId = val;
    render();
  });

  document.getElementById('gegnerAlleAuswaehlen')?.addEventListener('click', () => {
    const aktiveGruppe = getAktiveGruppeId() || null;
    const gegnerIds = getGegnerFuerKampf().map(g => g.id);
    const spieler = getSpieler().filter(s => s.sichtbar !== false);
    const npcs = getNpcs().filter(n => n.sichtbar !== false);
    let charIds = [...spieler, ...npcs].map(c => c.id);
    if (aktiveGruppe) {
      charIds = [...spieler, ...npcs].filter(c => c.gruppeId === aktiveGruppe).map(c => c.id);
    }
    state.selectedGegnerIds = [...gegnerIds, ...charIds];
    applyZielToSimulator();
    render();
  });

  document.getElementById('gegnerAbwaehlen')?.addEventListener('click', () => {
    state.selectedGegnerIds = [];
    applyZielToSimulator();
    render();
  });

  const archiveHandler = () => {
    const name = prompt('Name für Kampf-Historie (optional):', `Kampf ${new Date().toLocaleString('de-CH')}`) ?? '';
    const id = archiveKampfHistorie(name);
    if (!id) {
      alert('Keine Historie vorhanden, die archiviert werden kann.');
      return;
    }
    state.selectedGegnerIds = [];
    render();
  };
  document.getElementById('kampfArchivierenBtn')?.addEventListener('click', archiveHandler);
  document.getElementById('historieArchivierenBtn')?.addEventListener('click', archiveHandler);
}

let rundeUIInitialized = false;

function doRundeNext() {
  processRundenende();
  setAktuelleRunde(getAktuelleRunde() + 1);
  render();
}

function doRundePrev() {
  const r = getAktuelleRunde();
  if (r > 0) {
    setAktuelleRunde(r - 1);
    render();
  }
}

function doRundeReset() {
  setAktuelleRunde(0);
  render();
}

function initRundeUI() {
  if (rundeUIInitialized) return;
  rundeUIInitialized = true;
  $(`${SIMULATOR_PANEL} #rundeNext`)?.addEventListener('click', doRundeNext);
  $(`${SIMULATOR_PANEL} #rundePrev`)?.addEventListener('click', doRundePrev);
  $(`${SIMULATOR_PANEL} #rundeReset`)?.addEventListener('click', doRundeReset);
  document.getElementById('rundeNextStatus')?.addEventListener('click', doRundeNext);
  document.getElementById('rundePrevStatus')?.addEventListener('click', doRundePrev);
  document.getElementById('rundeResetStatus')?.addEventListener('click', doRundeReset);
}

export function initKampftracker() {
  initKampagnenUI();
  initCharAddForm();
  initGegnerUI();
  initRundeUI();
  initSimulatorKampfToolbar();
  render();
}

export function initSpieler() {
  const kampagneId = getCurrentKampagneId();
  if (kampagneId) {
    const saved = getCharakter(kampagneId);
    if (saved) {
      state.selectedCharakterId = saved.id;
      state.selectedCharakterName = saved.name;
    }
  }
  initRundeUI();
  initSimulatorKampfToolbar();
  render();
}

let charakterwahlInitialized = false;

export function initCharakterwahl() {
  const overlay = document.getElementById('charakterwahlOverlay');
  const kampagneSel = document.getElementById('charakterwahlKampagne');
  const charSel = document.getElementById('charakterwahlCharakter');
  const startBtn = document.getElementById('charakterwahlStarten');
  const zurueckBtn = document.getElementById('charakterwahlZurueck');
  const ohneCharBtn = document.getElementById('charakterwahlOhneCharakter');
  const joinWrap = document.getElementById('charakterwahlJoinWrap');
  const joinInput = document.getElementById('charakterwahlKampagneJoin');
  const joinBtn = document.getElementById('charakterwahlKampagneJoinBtn');
  const charHint = document.getElementById('charakterwahlCharakterHint');
  if (!overlay || !kampagneSel || !charSel || !startBtn) return;

  if (isFirebaseActive()) joinWrap?.classList.remove('hidden');

  const populate = () => {
    const kampagnen = getKampagnenListe();
    const currentId = getCurrentKampagneId();
    kampagneSel.innerHTML = '<option value="">(Kampagne wählen)</option>';
    kampagnen.forEach(({ id, name }) => {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = name;
      if (id === currentId || (kampagnen.length === 1 && !currentId)) opt.selected = true;
      kampagneSel.appendChild(opt);
    });
    if (kampagnen.length === 1 && !currentId) switchKampagne(kampagnen[0].id);
    const charaktere = getCharaktere();
    charSel.innerHTML = '<option value="">(Charakter wählen)</option>';
    charaktere.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.typ === 'npc' ? `${c.name} (NPC)` : c.name;
      if (c.id === state.selectedCharakterId) opt.selected = true;
      charSel.appendChild(opt);
    });
    if (ohneCharBtn) ohneCharBtn.hidden = getRole() !== ROLES.SPIELLEITER;
    if (charHint) {
      charHint.classList.toggle('hidden', getRole() !== ROLES.SPIELLEITER);
    }
  };

  if (!charakterwahlInitialized) {
    charakterwahlInitialized = true;
    kampagneSel.addEventListener('change', () => {
      const id = kampagneSel.value;
      if (id && switchKampagne(id)) populate();
    });

    joinBtn?.addEventListener('click', async () => {
      const id = joinInput?.value?.trim();
      if (!id) { alert('Bitte Kampagnen-ID eingeben.'); return; }
      joinBtn.disabled = true;
      try {
        const data = await loadCampaign(id);
        if (!data) { alert('Kampagne nicht gefunden. ID prüfen.'); return; }
        joinCampaign(id);
        switchKampagne(id);
        joinInput.value = '';
        populate();
      } finally { joinBtn.disabled = false; }
    });

    zurueckBtn?.addEventListener('click', () => {
      overlay.classList.add('hidden');
      document.getElementById('roleOverlay')?.classList.remove('hidden');
    });

    ohneCharBtn?.addEventListener('click', () => {
      state.selectedCharakterId = null;
      state.selectedCharakterName = null;
      const kampagneId = getCurrentKampagneId();
      if (kampagneId) setCharakter(kampagneId, null);
      overlay.classList.add('hidden');
      if (getRole() === ROLES.SPIELLEITER) refreshKampftracker();
      else initSpieler();
    });

    startBtn.addEventListener('click', () => {
      const kampagneId = kampagneSel.value;
      const charId = charSel.value;
      if (!kampagneId || !charId) {
        alert('Bitte Kampagne und Charakter wählen.');
        return;
      }
      const charaktere = getCharaktere();
      const c = charaktere.find(x => x.id === charId);
      if (!c) return;
      switchKampagne(kampagneId);
      state.selectedCharakterId = c.id;
      state.selectedCharakterName = c.name;
      setCharakter(kampagneId, c);
      overlay.classList.add('hidden');
      initSpieler();
    });
  }
  populate();
}

export function refreshKampftracker() {
  render();
}
