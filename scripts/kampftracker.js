// kampftracker.js
// UI-Logik für den Kampftracker (Kampagnen, Gegner).

import { $, $$ } from './dom.js';
import { CHARAKTER_ICONS, URLS } from './constants.js';
import {
  getKampagnenListe,
  getCurrentKampagne,
  getCurrentKampagneId,
  getGegner,
  getGegnerFuerKampf,
  getGegnerById,
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
  addSpieler,
  removeSpieler,
  updateSpieler,
  addNpc,
  removeNpc,
  updateNpc,
  heilenTpCharakter,
  heilenLaufendeSchadenCharakter
} from './campaigns.js';
import { state } from './state.js';
import { getRole, ROLES, setCharakter, getCharakter } from './role.js';
import { isFirebaseActive, loadCampaign, joinCampaign } from './firebase-storage.js';

const KAMPFTRACKER_PANEL = '#kampftrackerPanel';
const CHARAKTERTRACKER_PANEL = '#charaktertrackerPanel';
const ERFASSUNG_PANEL = '#erfassungPanel';

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

function showCharakterEditPopoverForChip(chipEl, char) {
  const existing = document.querySelector('.gegner-edit-popover');
  if (existing) existing.remove();
  const popover = document.createElement('div');
  popover.className = 'gegner-edit-popover';
  const rkVal = char.rk != null ? char.rk : 20;
  const rkOpts = Array.from({ length: 20 }, (_, i) => i + 1).map(n =>
    `<option value="${n}"${rkVal === n ? ' selected' : ''}>${n}</option>`
  ).join('');
  const wahrnehmungHtml = char.typ === 'spieler'
    ? `<div class="gegner-edit-row">
        <label>Wahrnehmung</label>
        <input type="text" class="gegner-edit-wahrnehmung" value="${escapeHtml(char.wahrnehmung || '')}" placeholder="z. B. 72" />
      </div>`
    : '';
  popover.innerHTML = `
    <div class="gegner-edit-row">
      <label>Name</label>
      <input type="text" class="gegner-edit-name" value="${escapeHtml(char.name || '')}" placeholder="Name" />
    </div>
    <div class="gegner-edit-row">
      <label>Rüstungsklasse</label>
      <select class="gegner-edit-rk">${rkOpts}</select>
    </div>
    <div class="gegner-edit-row">
      <label>TP (aktuell)</label>
      <input type="number" class="gegner-edit-tp" min="0" max="${char.maxTp ?? 100}" value="${char.tp ?? char.maxTp ?? 100}" />
    </div>
    <div class="gegner-edit-row">
      <label>TP (max)</label>
      <input type="number" class="gegner-edit-maxTp" min="1" value="${char.maxTp ?? 100}" />
    </div>
    ${wahrnehmungHtml}
    <div class="gegner-edit-row">
      <label>Icon</label>
      <div class="gegner-edit-icon-picker"></div>
    </div>
    <button type="button" class="btn primary gegner-edit-apply">Übernehmen</button>
  `;
  popover.dataset.selectedIcon = char.icon || '';
  const iconPickerEl = popover.querySelector('.gegner-edit-icon-picker');
  renderIconPicker(iconPickerEl, char.icon, (filename) => { popover.dataset.selectedIcon = filename; });
  popover.querySelector('.gegner-edit-apply').addEventListener('click', () => {
    const name = popover.querySelector('.gegner-edit-name')?.value?.trim();
    const rk = parseInt(popover.querySelector('.gegner-edit-rk').value, 10);
    const tp = parseInt(popover.querySelector('.gegner-edit-tp').value, 10);
    const maxTp = Math.max(1, parseInt(popover.querySelector('.gegner-edit-maxTp').value, 10));
    const icon = popover.dataset.selectedIcon || char.icon;
    const updates = { name: name || char.name, rk, tp: Math.min(tp, maxTp), maxTp, icon };
    if (char.typ === 'spieler') {
      const wahr = popover.querySelector('.gegner-edit-wahrnehmung')?.value?.trim();
      updates.wahrnehmung = wahr || null;
      updateSpieler(char.id, updates);
    } else {
      updateNpc(char.id, updates);
    }
    popover.remove();
    render();
  });
  chipEl.style.position = 'relative';
  chipEl.appendChild(popover);
}

function showGegnerEditPopover(cardEl, gegner) {
  const existing = cardEl.querySelector('.gegner-edit-popover');
  if (existing) {
    existing.remove();
    return;
  }
  const popover = document.createElement('div');
  popover.className = 'gegner-edit-popover';
  const rkVal = gegner.rk != null ? gegner.rk : 20;
  const imKampfVal = gegner.imKampf !== false;
  const gruppen = getGegnerGruppen();
  const gruppeOpts = '<option value="">— Keine —</option>' +
    gruppen.map(g => `<option value="${g.id}"${g.id === (gegner.gruppeId || '') ? ' selected' : ''}>${escapeHtml(g.name)}</option>`).join('');
  const rkOpts = Array.from({ length: 20 }, (_, i) => i + 1).map(n =>
    `<option value="${n}"${rkVal === n ? ' selected' : ''}>${n}</option>`
  ).join('');
  popover.innerHTML = `
    <div class="gegner-edit-row gegner-edit-gruppe-row">
      <label>Gruppe / Raum</label>
      <select class="gegner-edit-gruppe" title="Gegner diesem Raum zuweisen (z. B. Kerker)">
        ${gruppeOpts}
      </select>
    </div>
    <div class="gegner-edit-row">
      <label>Rüstungsklasse</label>
      <select class="gegner-edit-rk">${rkOpts}</select>
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
      <label><input type="checkbox" class="gegner-edit-imkampf" ${imKampfVal ? 'checked' : ''} /> Im Kampf anzeigen</label>
    </div>
    <div class="gegner-edit-row">
      <label>Icon</label>
      <div class="gegner-edit-icon-picker"></div>
    </div>
    <button type="button" class="btn primary gegner-edit-apply">Übernehmen</button>
  `;
  popover.dataset.selectedIcon = gegner.icon || '';
  const iconPickerEl = popover.querySelector('.gegner-edit-icon-picker');
  renderIconPicker(iconPickerEl, gegner.icon, (filename) => {
    popover.dataset.selectedIcon = filename;
  });
  popover.querySelector('.gegner-edit-apply').addEventListener('click', () => {
    const rk = parseInt(popover.querySelector('.gegner-edit-rk').value, 10);
    const tp = parseInt(popover.querySelector('.gegner-edit-tp').value, 10);
    const maxTp = Math.max(1, parseInt(popover.querySelector('.gegner-edit-maxTp').value, 10));
    const icon = popover.dataset.selectedIcon || gegner.icon;
    const imKampf = popover.querySelector('.gegner-edit-imkampf')?.checked !== false;
    const gruppeSel = popover.querySelector('.gegner-edit-gruppe');
    const gruppeId = gruppeSel?.value?.trim() || null;
    const updates = { rk, tp: Math.min(tp, maxTp), maxTp, icon, imKampf, gruppeId };
    updateGegner(gegner.id, updates);
    popover.remove();
    render();
  });
  cardEl.appendChild(popover);
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
  cardEl.style.position = 'relative';
  cardEl.appendChild(popover);
}

function applyZielToSimulator() {
  const ids = state.selectedGegnerIds || [];
  const firstId = ids[0] || null;
  const g = firstId ? getGegnerById(firstId) : null;
  const charInfo = !g && firstId ? getCharakterById(firstId) : null;
  const ziel = g || charInfo?.char;
  if (!ziel) return;
  const rk = ziel.rk ?? 20;
  const rkBtn = $(`#rk button[data-rk="${rk}"]`);
  if (rkBtn) {
    $$('#rk button').forEach(b => b.classList.remove('active'));
    rkBtn.classList.add('active');
  }
  if (g) {
    const typ = g.gegnerTyp || 'normal';
    const typBtn = $(`#gegnerTyp button[data-gegner-typ="${typ}"]`);
    if (typBtn) {
      $$('#gegnerTyp button').forEach(b => b.classList.remove('active'));
      typBtn.classList.add('active');
      if (typ === 'gross') $('#critType').value = 'Grosse Wesen';
      else if (typ === 'gewaltig') $('#critType').value = 'Gewaltige Wesen';
      else $('#critType').value = (state.autoCrit && state.autoCrit.typ) || '';
      $('#critType').dispatchEvent(new Event('change'));
    }
  } else if (charInfo) {
    $$('#gegnerTyp button').forEach(b => b.classList.remove('active'));
    $('#gegnerTyp button[data-gegner-typ="normal"]')?.classList.add('active');
    $('#critType').value = (state.autoCrit && state.autoCrit.typ) || '';
    $('#critType').dispatchEvent(new Event('change'));
  }
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
  const gegner = getGegner();
  const selectedIds = state.selectedGegnerIds || [];

  container.innerHTML = '';
  if (gegner.length === 0) {
    container.innerHTML = '<p class="muted">Noch keine Gegner. Füge unten einen hinzu.</p>';
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
    const statusLabels = { ben: 'ben', benoPar: 'benoPar', oPar: 'oPar', init: 'Init', ko: 'K.O.' };
    const statusBadges = status.map(s => {
      const label = statusLabels[s.typ] || s.typ;
      return s.typ === 'ko' ? `<span class="gegner-status ko">${label}</span>` : `<span class="gegner-status">${label} ${s.runden} Rd</span>`;
    }).join('');
    const laufend = g.laufendeSchaden || [];
    const laufendSum = laufend.reduce((a, l) => a + l.tp, 0);
    const laufendBadge = laufendSum > 0 ? `<span class="gegner-status laufend">+${laufendSum} T/Rd</span>` : '';
    const maxHeilung = g.maxTp - g.tp;
    const heilungRow = maxHeilung > 0
      ? `<div class="gegner-heilen-row gegner-heilung-row" data-id="${g.id}">
          <input type="number" min="1" max="${maxHeilung}" value="1" class="gegner-heilen-input" placeholder="TP" title="Trefferpunkte wiederherstellen (z.B. Zaubertrank)">
          <button type="button" class="btn gegner-heilung-btn" data-id="${g.id}" title="TP heilen">TP heilen</button>
        </div>`
      : '';
    const laufendHeilenRow = laufendSum > 0
      ? `<div class="gegner-heilen-row gegner-blutung-row" data-id="${g.id}">
          <button type="button" class="btn gegner-heilen-btn" data-id="${g.id}" title="1 T/Rd Blutung stoppen (mehrmals klicken für mehr)">1 T/Rd Blutung stoppen</button>
        </div>`
      : '';
    const imKampf = g.imKampf !== false;
    const iconUrl = getIconUrl(g.icon);
    const rk = g.rk != null ? g.rk : 20;
    const isSelected = selectedIds.includes(g.id);
    const gruppen = getGegnerGruppen();
    const gruppeName = g.gruppeId ? gruppen.find(gr => gr.id === g.gruppeId)?.name : null;
    const gruppeOpts = gruppen.length > 0
      ? '<option value="">— Keine —</option>' + gruppen.map(gr =>
          `<option value="${gr.id}"${gr.id === (g.gruppeId || '') ? ' selected' : ''}>${escapeHtml(gr.name)}</option>`
        ).join('')
      : '';
    const gruppeSelect = gruppen.length > 0
      ? `<select class="gegner-card-gruppe-select" data-id="${g.id}" title="Gruppe / Raum zuweisen">${gruppeOpts}</select>`
      : '';
    card.innerHTML = `
      <div class="gegner-card-header">
        <img class="gegner-icon" src="${iconUrl}" alt="${escapeHtml(g.name)}" />
        <span class="gegner-name">${isTot ? '† ' : ''}${escapeHtml(g.name)}</span>
        ${gruppeSelect}
        <span class="gegner-rk-tp">RK ${rk} · ${g.tp}/${g.maxTp} TP</span>
        <button type="button" class="btn ghost gegner-select-toggle ${isSelected ? 'active' : ''}" data-id="${g.id}" title="${isSelected ? 'Abwählen' : 'Als Ziel auswählen'}">${isSelected ? '✓' : '○'}</button>
        <button type="button" class="btn ghost gegner-edit" data-id="${g.id}" title="Bearbeiten">✎</button>
        <button type="button" class="btn ghost gegner-schaden-btn" data-id="${g.id}" title="Treffer manuell">±</button>
        ${!isTot ? `<button type="button" class="btn ghost gegner-tod-btn" data-id="${g.id}" title="Als tot markieren">†</button>` : ''}
        <button type="button" class="btn ghost gegner-kampf-toggle ${imKampf ? 'active' : ''}" data-id="${g.id}" title="${imKampf ? 'Im Kampf' : 'Nicht im Kampf'}">${imKampf ? '⚔' : '—'}</button>
        <button type="button" class="btn ghost gegner-remove" data-id="${g.id}" title="Entfernen">×</button>
      </div>
      ${statusBadges || laufendBadge ? `<div class="gegner-status-row">${statusBadges}${laufendBadge}</div>` : ''}
      ${heilungRow}
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
    card.querySelector('.gegner-heilung-row .gegner-heilung-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const row = e.target.closest('.gegner-heilung-row');
      const input = row?.querySelector('.gegner-heilen-input');
      const tp = input ? parseInt(input.value, 10) : 0;
      if (tp > 0 && heilenTp(g.id, tp)) {
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
  const charaktere = getCharaktere();
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
    const addGroup = (label, ziele) => {
      if (ziele.length === 0) return;
      const group = document.createElement('div');
      group.className = 'ziel-group';
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
    addGroup('Gegner', gegnerZiele);
    addGroup('Verbündete', verbuendete);
    requestAnimationFrame(() => adjustZielNameFontSizes());
    if (zielInfo) zielInfo.textContent = '';
  }
}

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
  const el = $(`${KAMPFTRACKER_PANEL} #rundeAnzeige`);
  if (el) el.textContent = `Runde ${r}`;
  const prevBtn = $(`${KAMPFTRACKER_PANEL} #rundePrev`);
  if (prevBtn) prevBtn.disabled = r <= 0;
}

function renderCharRunde() {
  const r = getAktuelleRunde();
  const el = $(`${CHARAKTERTRACKER_PANEL} #charRundeAnzeige`);
  if (el) el.textContent = `Runde ${r}`;
  const prevBtn = $(`${CHARAKTERTRACKER_PANEL} #charRundePrev`);
  if (prevBtn) prevBtn.disabled = r <= 0;
}

function renderCharakterZeile() {
  const charRow = $('#simulatorAngreiferRow');
  const charSelect = $('#simulatorCharakterSelect');
  if (!charRow || !charSelect) return;
  const charaktere = getCharaktere();
  charRow.hidden = getRole() !== ROLES.SPIELLEITER || charaktere.length === 0;
  charSelect.innerHTML = '';
  const opt0 = document.createElement('option');
  opt0.value = '';
  opt0.textContent = '(Kein Charakter)';
  charSelect.appendChild(opt0);
  charaktere.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.typ === 'npc' ? `${c.name} (NPC)` : c.name;
    if (c.id === state.selectedCharakterId) opt.selected = true;
    charSelect.appendChild(opt);
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

function renderSpielerListe() {
  const container = document.getElementById('spielerListe');
  if (!container) return;
  const spieler = getSpieler();
  container.innerHTML = '';
  spieler.forEach(s => {
    const div = document.createElement('div');
    div.className = 'charakter-chip';
    const iconUrl = getIconUrl(s.icon);
    div.innerHTML = `<img class="charakter-chip-icon" src="${iconUrl}" alt="" /><span>${escapeHtml(s.name)}</span><button type="button" class="btn ghost char-icon-edit" data-id="${s.id}" title="Bearbeiten">✎</button><button type="button" class="btn ghost char-remove" data-id="${s.id}" title="Entfernen">×</button>`;
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
    div.className = 'charakter-chip';
    const iconUrl = getIconUrl(n.icon);
    div.innerHTML = `<img class="charakter-chip-icon" src="${iconUrl}" alt="" /><span>${escapeHtml(n.name)}</span><button type="button" class="btn ghost char-icon-edit" data-id="${n.id}" title="Bearbeiten">✎</button><button type="button" class="btn ghost char-remove" data-id="${n.id}" title="Entfernen">×</button>`;
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

function renderCharakterListe() {
  const container = document.getElementById('charakterListe');
  if (!container) return;
  const spieler = getSpieler();
  const npcs = getNpcs();
  const alle = [
    ...spieler.map(s => ({ ...s, typ: 'spieler' })),
    ...npcs.map(n => ({ ...n, typ: 'npc' }))
  ];
  container.innerHTML = '';
  if (alle.length === 0) {
    container.innerHTML = '<p class="muted">Noch keine Spieler oder NPCs. Füge sie in der Kampagne hinzu.</p>';
    return;
  }
  alle.forEach(c => {
    const card = document.createElement('div');
    const isTot = (c.tp ?? c.maxTp ?? 100) <= 0;
    card.className = 'gegner-card charakter-card' + (isTot ? ' tot' : '');
    const maxTp = c.maxTp ?? 100;
    const tp = c.tp ?? maxTp;
    const pct = maxTp > 0 ? Math.round((tp / maxTp) * 100) : 100;
    const rk = c.rk != null ? c.rk : 20;
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
    const statusLabels = { ben: 'ben', benoPar: 'benoPar', oPar: 'oPar', init: 'Init', ko: 'K.O.' };
    const statusBadges = status.map(s => {
      const label = statusLabels[s.typ] || s.typ;
      return s.typ === 'ko' ? `<span class="gegner-status ko">${label}</span>` : `<span class="gegner-status">${label} ${s.runden} Rd</span>`;
    }).join('');
    const laufend = c.laufendeSchaden || [];
    const laufendSum = laufend.reduce((a, l) => a + l.tp, 0);
    const laufendBadge = laufendSum > 0 ? `<span class="gegner-status laufend">+${laufendSum} T/Rd</span>` : '';
    const maxHeilung = maxTp - tp;
    const heilungRow = maxHeilung > 0
      ? `<div class="gegner-heilen-row gegner-heilung-row" data-id="${c.id}" data-typ="${c.typ}">
          <input type="number" min="1" max="${maxHeilung}" value="1" class="gegner-heilen-input" placeholder="TP">
          <button type="button" class="btn gegner-heilung-btn" data-id="${c.id}" data-typ="${c.typ}">TP heilen</button>
        </div>`
      : '';
    const laufendHeilenRow = laufendSum > 0
      ? `<div class="gegner-heilen-row gegner-blutung-row" data-id="${c.id}" data-typ="${c.typ}">
          <button type="button" class="btn gegner-heilen-btn" data-id="${c.id}" data-typ="${c.typ}">1 T/Rd Blutung stoppen</button>
        </div>`
      : '';
    const iconUrl = getIconUrl(c.icon);
    const wahrStr = c.typ === 'spieler' && c.wahrnehmung ? ` · W ${c.wahrnehmung}` : '';
    card.innerHTML = `
      <div class="gegner-card-header">
        <img class="gegner-icon" src="${iconUrl}" alt="${escapeHtml(c.name)}" />
        <span class="gegner-name">${isTot ? '† ' : ''}${escapeHtml(c.name)}</span>
        <span class="gegner-rk-tp">RK ${rk} · ${tp}/${maxTp} TP${wahrStr}</span>
        <button type="button" class="btn ghost charakter-ereignis-btn" data-id="${c.id}" data-typ="${c.typ}" title="Verletzung / Ereignis">+</button>
        <button type="button" class="btn ghost gegner-icon-edit" data-id="${c.id}" data-typ="${c.typ}" title="Bearbeiten">✎</button>
      </div>
      ${statusBadges || laufendBadge ? `<div class="gegner-status-row">${statusBadges}${laufendBadge}</div>` : ''}
      ${heilungRow}
      ${laufendHeilenRow}
      <div class="gegner-tp-bar">
        <div class="gegner-tp-fill" style="width: ${Math.max(0, pct)}%"></div>
      </div>
      ${historieHtml}
      ${isTot ? '<span class="gegner-tot">TOT</span>' : ''}
    `;
    card.querySelector('.charakter-ereignis-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      showCharakterEreignisPopover(card, c);
    });
    card.querySelector('.gegner-icon-edit')?.addEventListener('click', (e) => {
      e.stopPropagation();
      showCharakterEditPopover(card, c);
    });
    const heilenBtn = card.querySelector('.gegner-blutung-row .gegner-heilen-btn');
    heilenBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (heilenLaufendeSchadenCharakter(c.id, 1)) render();
    });
    card.querySelector('.gegner-heilung-row .gegner-heilung-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const row = e.target.closest('.gegner-heilung-row');
      const input = row?.querySelector('.gegner-heilen-input');
      const tpVal = input ? parseInt(input.value, 10) : 0;
      if (tpVal > 0 && heilenTpCharakter(c.id, tpVal)) render();
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
  cardEl.style.position = 'relative';
  cardEl.appendChild(popover);
}

function showCharakterEditPopover(cardEl, char) {
  const existing = cardEl.querySelector('.gegner-edit-popover');
  if (existing) {
    existing.remove();
    return;
  }
  const popover = document.createElement('div');
  popover.className = 'gegner-edit-popover';
  const rkVal = char.rk != null ? char.rk : 20;
  const rkOpts = Array.from({ length: 20 }, (_, i) => i + 1).map(n =>
    `<option value="${n}"${rkVal === n ? ' selected' : ''}>${n}</option>`
  ).join('');
  const wahrnehmungHtml = char.typ === 'spieler'
    ? `<div class="gegner-edit-row">
        <label>Wahrnehmung</label>
        <input type="text" class="gegner-edit-wahrnehmung" value="${escapeHtml(char.wahrnehmung || '')}" placeholder="z. B. 72" />
      </div>`
    : '';
  popover.innerHTML = `
    <div class="gegner-edit-row">
      <label>Rüstungsklasse</label>
      <select class="gegner-edit-rk">${rkOpts}</select>
    </div>
    <div class="gegner-edit-row">
      <label>TP (aktuell)</label>
      <input type="number" class="gegner-edit-tp" min="0" max="${char.maxTp ?? 100}" value="${char.tp ?? char.maxTp ?? 100}" />
    </div>
    <div class="gegner-edit-row">
      <label>TP (max)</label>
      <input type="number" class="gegner-edit-maxTp" min="1" value="${char.maxTp ?? 100}" />
    </div>
    ${wahrnehmungHtml}
    <div class="gegner-edit-row">
      <label>Icon</label>
      <div class="gegner-edit-icon-picker"></div>
    </div>
    <button type="button" class="btn primary gegner-edit-apply">Übernehmen</button>
  `;
  popover.dataset.selectedIcon = char.icon || '';
  const iconPickerEl = popover.querySelector('.gegner-edit-icon-picker');
  renderIconPicker(iconPickerEl, char.icon, (filename) => { popover.dataset.selectedIcon = filename; });
  popover.querySelector('.gegner-edit-apply').addEventListener('click', () => {
    const rk = parseInt(popover.querySelector('.gegner-edit-rk').value, 10);
    const tp = parseInt(popover.querySelector('.gegner-edit-tp').value, 10);
    const maxTp = Math.max(1, parseInt(popover.querySelector('.gegner-edit-maxTp').value, 10));
    const icon = popover.dataset.selectedIcon || char.icon;
    const updates = { rk, tp: Math.min(tp, maxTp), maxTp, icon };
    if (char.typ === 'spieler') {
      const wahr = popover.querySelector('.gegner-edit-wahrnehmung')?.value?.trim();
      updates.wahrnehmung = wahr || null;
      updateSpieler(char.id, updates);
    } else {
      updateNpc(char.id, updates);
    }
    popover.remove();
    render();
  });
  cardEl.appendChild(popover);
}

function renderAktiveGruppeSelect() {
  const sel = document.getElementById('aktiveGruppeSelect');
  if (!sel) return;
  const gruppen = getGegnerGruppen();
  const aktiveId = getAktiveGruppeId();
  sel.innerHTML = `<option value=""${!aktiveId ? ' selected' : ''}>Alle im Kampf</option>` +
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
    hint.textContent = 'Erstelle eine Gruppe (z. B. Kerker), weise Gegner über das Dropdown auf der Karte zu, wähle dann den Raum oben und klicke „Alle auswählen“.';
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
  input.placeholder = 'Neuer Raum (z. B. Kerker)';
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
  const sel = document.getElementById('gegnerGruppeSelect');
  if (!sel) return;
  const gruppen = getGegnerGruppen();
  const currentVal = sel.value || '';
  sel.innerHTML = '<option value="">— Keine —</option>' +
    gruppen.map(g => `<option value="${g.id}"${g.id === currentVal ? ' selected' : ''}>${escapeHtml(g.name)}</option>`).join('');
}

function renderGegnerZielAuswahl() {
  const wrap = document.getElementById('gegnerZielAuswahlWrap');
  const container = document.getElementById('gegnerZielAuswahl');
  const aktionen = document.getElementById('gegnerZielAktionen');
  if (!wrap || !container || !aktionen) return;
  const selectedIds = state.selectedGegnerIds || [];
  const gegnerZiele = selectedIds
    .map(id => getGegnerById(id))
    .filter(Boolean);
  if (gegnerZiele.length === 0) {
    wrap.classList.add('hidden');
    return;
  }
  wrap.classList.remove('hidden');
  container.innerHTML = '';
  const heading = document.createElement('div');
  heading.className = 'gegner-ziel-heading';
  heading.textContent = `${gegnerZiele.length} ausgewählt:`;
  container.appendChild(heading);
  const row = document.createElement('div');
  row.className = 'gegner-ziel-chips';
  gegnerZiele.forEach(g => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'gegner-ziel-chip active';
    chip.title = `${g.name} abwählen`;
    const isTot = g.tp <= 0;
    chip.innerHTML = `<img src="${getIconUrl(g.icon)}" alt="" class="gegner-ziel-chip-icon" /><span>${isTot ? '† ' : ''}${escapeHtml(g.name)}</span><span class="gegner-ziel-chip-remove">×</span>`;
    if (isTot) chip.classList.add('tot');
    chip.addEventListener('click', () => {
      state.selectedGegnerIds = selectedIds.filter(id => id !== g.id);
      applyZielToSimulator();
      render();
    });
    row.appendChild(chip);
  });
  container.appendChild(row);

  aktionen.innerHTML = '';
  const gruppen = getGegnerGruppen();
  if (gegnerZiele.length >= 1) {
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
        gegnerZiele.forEach(g => applySchaden(g.id, tp, 'manuell', `${tp} TP (manuell)`));
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
      gegnerZiele.forEach(g => updateGegner(g.id, { tp: 0 }));
      state.selectedGegnerIds = [];
      applyZielToSimulator();
      render();
    });
    aktionen.appendChild(todBtn);

    const ausKampfBtn = document.createElement('button');
    ausKampfBtn.type = 'button';
    ausKampfBtn.className = 'btn ghost gegner-ziel-auskampf-btn';
    ausKampfBtn.textContent = 'Alle aus Kampf entfernen';
    ausKampfBtn.addEventListener('click', () => {
      gegnerZiele.forEach(g => updateGegner(g.id, { imKampf: false }));
      state.selectedGegnerIds = [];
      applyZielToSimulator();
      render();
    });
    aktionen.appendChild(ausKampfBtn);

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
          gegnerZiele.forEach(g => updateGegner(g.id, { gruppeId }));
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
      const namen = gegnerZiele.map(g => g.name).join(', ');
      if (confirm(`${gegnerZiele.length} Gegner wirklich löschen?\n\n${namen}`)) {
        gegnerZiele.forEach(g => removeGegner(g.id));
        state.selectedGegnerIds = [];
        applyZielToSimulator();
        render();
      }
    });
    aktionen.appendChild(loeschenBtn);
  }
}

function render() {
  renderKampagnenDropdown();
  renderSpielerListe();
  renderNpcListe();
  renderAktiveGruppeSelect();
  renderGegnerGruppenVerwaltung();
  renderGegnerGruppeSelect();
  renderGegnerZielAuswahl();
  renderGegnerListe();
  renderCharakterListe();
  renderZielAnzeige();
  renderCharakterZeile();
  renderUserProfileIcon();
  renderRunde();
  renderCharRunde();
  // „Auf 0“ nur für Spielleiter sichtbar
  const resetBtn = $('#charRundeReset');
  if (resetBtn) resetBtn.hidden = getRole() !== ROLES.SPIELLEITER;
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

let gegnerUIInitialized = false;
function initGegnerUI() {
  const form = document.getElementById('gegnerAddForm');
  const iconPicker = document.getElementById('gegnerIconPicker');
  if (iconPicker && !iconPicker.dataset.initialized) {
    iconPicker.dataset.initialized = '1';
    renderIconPicker(iconPicker, null);
  }
  if (gegnerUIInitialized) return;
  gegnerUIInitialized = true;
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = form.querySelector('[name="gegnerName"]')?.value?.trim();
    const anzahl = parseInt(form.querySelector('[name="gegnerAnzahl"]')?.value || '1', 10) || 1;
    const tp = form.querySelector('[name="gegnerTp"]')?.value;
    const groesse = form.querySelector('[name="gegnerGroesse"]')?.value || 'normal';
    const rk = form.querySelector('[name="gegnerRk"]')?.value || '20';
    const icon = getSelectedIconFromPicker(iconPicker);
    if (!getCurrentKampagneId()) {
      createKampagne('Kampagne 1');
    }
    const gruppeSel = form.querySelector('#gegnerGruppeSelect');
    const gruppeId = gruppeSel?.value?.trim() || null;
    if (anzahl > 1) {
      addGegnerBatch(anzahl, name, tp, groesse, rk, icon, gruppeId);
    } else {
      addGegner(name, tp, groesse, rk, icon, gruppeId);
    }
    form.reset();
    form.querySelector('[name="gegnerAnzahl"]').value = '1';
    iconPicker?.querySelectorAll('.icon-picker-btn.selected').forEach(b => b.classList.remove('selected'));
    render();
  });

  const aktiveSel = document.getElementById('aktiveGruppeSelect');
  aktiveSel?.addEventListener('change', () => {
    setAktiveGruppeId(aktiveSel.value || null);
    render();
  });

  document.getElementById('gegnerAlleAuswaehlen')?.addEventListener('click', () => {
    const fuerKampf = getGegnerFuerKampf();
    const ids = fuerKampf.map(g => g.id);
    state.selectedGegnerIds = ids;
    applyZielToSimulator();
    render();
  });

  document.getElementById('gegnerAbwaehlen')?.addEventListener('click', () => {
    state.selectedGegnerIds = [];
    applyZielToSimulator();
    render();
  });

  $('#simulatorCharakterSelect')?.addEventListener('change', () => {
    const sel = $('#simulatorCharakterSelect');
    const val = sel?.value || '';
    const charaktere = getCharaktere();
    const c = charaktere.find(x => x.id === val);
    state.selectedCharakterId = c?.id || null;
    state.selectedCharakterName = c?.name || null;
    if (getRole() === ROLES.SPIELLER && getCurrentKampagneId()) {
      setCharakter(getCurrentKampagneId(), c || null);
    }
  });
}

let spielerNpcUIInitialized = false;
function initSpielerNpcUI() {
  const spielerPicker = document.getElementById('spielerIconPicker');
  const npcPicker = document.getElementById('npcIconPicker');
  if (spielerPicker && !spielerPicker.dataset.initialized) {
    spielerPicker.dataset.initialized = '1';
    renderIconPicker(spielerPicker, null);
  }
  if (npcPicker && !npcPicker.dataset.initialized) {
    npcPicker.dataset.initialized = '1';
    renderIconPicker(npcPicker, null);
  }
  if (spielerNpcUIInitialized) return;
  spielerNpcUIInitialized = true;
  document.getElementById('spielerAddForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('spielerName');
    const name = input?.value?.trim();
    const icon = getSelectedIconFromPicker(spielerPicker);
    const tp = document.getElementById('spielerTp')?.value || 100;
    const rk = document.getElementById('spielerRk')?.value || 20;
    const wahrnehmung = document.getElementById('spielerWahrnehmung')?.value?.trim() || null;
    if (!getCurrentKampagneId()) createKampagne('Kampagne 1');
    if (name && addSpieler(name, icon, tp, rk, wahrnehmung)) {
      input.value = '';
      spielerPicker?.querySelectorAll('.icon-picker-btn.selected').forEach(b => b.classList.remove('selected'));
      render();
    }
  });
  document.getElementById('npcAddForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('npcName');
    const name = input?.value?.trim();
    const icon = getSelectedIconFromPicker(npcPicker);
    const tp = document.getElementById('npcTp')?.value || 100;
    const rk = document.getElementById('npcRk')?.value || 20;
    if (!getCurrentKampagneId()) createKampagne('Kampagne 1');
    if (name && addNpc(name, icon, tp, rk)) {
      input.value = '';
      npcPicker?.querySelectorAll('.icon-picker-btn.selected').forEach(b => b.classList.remove('selected'));
      render();
    }
  });
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
  $(`${KAMPFTRACKER_PANEL} #rundeNext`)?.addEventListener('click', doRundeNext);
  $(`${KAMPFTRACKER_PANEL} #rundePrev`)?.addEventListener('click', doRundePrev);
  $(`${KAMPFTRACKER_PANEL} #rundeReset`)?.addEventListener('click', doRundeReset);
}

let charRundeUIInitialized = false;

function initCharRundeUI() {
  if (charRundeUIInitialized) return;
  charRundeUIInitialized = true;
  $(`${CHARAKTERTRACKER_PANEL} #charRundeNext`)?.addEventListener('click', doRundeNext);
  $(`${CHARAKTERTRACKER_PANEL} #charRundePrev`)?.addEventListener('click', doRundePrev);
  $(`${CHARAKTERTRACKER_PANEL} #charRundeReset`)?.addEventListener('click', doRundeReset);
}

export function initKampftracker() {
  initKampagnenUI();
  initSpielerNpcUI();
  initGegnerUI();
  initRundeUI();
  initCharRundeUI();
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
  initSpielerNpcUI();
  initCharRundeUI();
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
