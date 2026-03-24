// main.js
// Einstiegspunkt der App. Lädt Daten, Rollenwahl und Tab-Navigation.

import { loadData } from './data.js';
import { setupEventListeners } from './events.js';
import { initPWA } from './pwa.js';
import { getRole, setRole, ROLES, getCharakter, setCharakter } from './role.js';
import { initKampftracker, initSpieler, initCharakterwahl, refreshKampftracker, getIconUrl } from './kampftracker.js';
import { getCurrentKampagneId, getKampagnenListe, getCharaktere, switchKampagne } from './campaigns.js';
import { initFirebase, startSync, subscribeToChanges, isFirebaseActive, loadCampaign, joinCampaign } from './firebase-storage.js';
import { initCritCorrections } from './critCorrections.js';
import { adjustWeaponFontSizes } from './logic.js';
import { state } from './state.js';
import { $, $$ } from './dom.js';

let appInitialized = false;
let selectedRoleOnStartScreen = null;

function showRoleOverlay() {
  const overlay = $('#roleOverlay');
  if (overlay) {
    overlay.classList.remove('hidden');
    const role = getRole();
    overlay.querySelectorAll('[data-role]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.role === role);
    });
  }
}

function hideRoleOverlay() {
  const overlay = $('#roleOverlay');
  if (overlay) overlay.classList.add('hidden');
}

function applyRoleUI(role) {
  const spielleiterTabs = $('#spielleiterTabs');
  const spielerTabs = $('#spielerTabs');
  const userProfileBtn = $('#userProfileBtn');

  if (role === ROLES.SPIELLEITER) {
    if (spielleiterTabs) spielleiterTabs.hidden = false;
    if (spielerTabs) spielerTabs.hidden = true;
    if (userProfileBtn) userProfileBtn.hidden = false;
    $('#charakterwahlOverlay')?.classList.add('hidden');
    switchTab('simulator');
    initKampftracker();
  } else {
    if (spielleiterTabs) spielleiterTabs.hidden = true;
    if (spielerTabs) spielerTabs.hidden = false;
    if (userProfileBtn) userProfileBtn.hidden = false;
    switchTab('simulator');
    if (!state.skipCharakterwahl && needsCharakterwahl()) {
      showCharakterwahl();
    } else {
      state.skipCharakterwahl = false;
      $('#charakterwahlOverlay')?.classList.add('hidden');
      initSpieler();
    }
  }
}

function needsCharakterwahl() {
  if (getRole() !== ROLES.SPIELLER) return false;
  const kampagneId = getCurrentKampagneId();
  if (!kampagneId) return true;
  const c = getCharakter(kampagneId);
  return !c || !c.id;
}

function showCharakterwahl() {
  const overlay = $('#charakterwahlOverlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  initCharakterwahl();
}

function switchTab(tabId) {
  const panels = $$('.tab-panel');
  const tabButtons = $$('.app-tabs .tab');
  panels.forEach(p => {
    p.classList.toggle('hidden', p.id !== tabId + 'Panel');
  });
  tabButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  refreshKampftracker();
  if (tabId === 'simulator') {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => adjustWeaponFontSizes());
    });
  }
}

function initTabs() {
  $$('.app-tabs .tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      if (tabId) switchTab(tabId);
    });
  });
}

function initRoleSelection() {
  const overlay = $('#roleOverlay');
  if (!overlay) return;

  overlay.querySelectorAll('[data-role]').forEach(btn => {
    btn.addEventListener('click', () => {
      const role = btn.dataset.role;
      if (setRole(role)) {
        hideRoleOverlay();
        applyRoleUI(role);
        if (!appInitialized) {
          appInitialized = true;
          initApp();
        }
      }
    });
  });
}

function hideUserProfileDropdown() {
  $('#userProfileDropdown')?.classList.add('hidden');
}

let userProfileInitialized = false;

function initUserProfile() {
  if (userProfileInitialized) return;
  userProfileInitialized = true;

  const btn = $('#userProfileBtn');
  const dropdown = $('#userProfileDropdown');
  const roleItem = $('#userProfileRolle');
  const charItem = $('#userProfileCharakter');

  btn?.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown?.classList.toggle('hidden');
  });

  roleItem?.addEventListener('click', () => {
    hideUserProfileDropdown();
    showRoleOverlay();
  });

  charItem?.addEventListener('click', () => {
    hideUserProfileDropdown();
    showCharakterwahl();
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.user-profile-wrap')) hideUserProfileDropdown();
  });
}

async function initApp() {
  await initCritCorrections();
  loadData().catch(err => {
    console.error(err);
    alert('Fehler beim Laden der JSON-Dateien. Bitte sicherstellen, dass sich assets/data/tables_processed.json und assets/data/treffer_tabellen_strukturiert.json im gleichen Repo befinden.');
  });
  setupEventListeners();
  initPWA();
}

function hideStartScreen() {
  const container = $('#introStartContainer');
  if (container) container.classList.add('hidden');
}

function initStartScreen() {
  const container = $('#introStartContainer');
  const roleBtns = container?.querySelectorAll('[data-role]');
  const charSection = $('#startScreenCharakterSection');
  const expandHint = $('#startScreenExpandHint');
  const joinWrap = $('#startScreenJoinWrap');
  const kampagneJoinInput = $('#startScreenKampagneJoin');
  const kampagneJoinBtn = $('#startScreenKampagneJoinBtn');
  const kampagneSel = $('#startScreenKampagne');
  const charSel = $('#startScreenCharakter');
  const startenBtn = $('#startScreenStarten');
  const ohneCharBtn = $('#startScreenOhneCharakter');

  const updateCharakterPreview = () => {
    const rolePreview = $('#startScreenRolePreview');
    const preview = $('#startScreenCharakterPreview');
    rolePreview?.classList.add('hidden');
    const iconEl = $('#startScreenCharakterIcon');
    const nameEl = $('#startScreenCharakterName');
    if (!preview || !iconEl || !nameEl) return;
    const charId = charSel?.value;
    if (!charId) {
      preview.classList.add('hidden');
      return;
    }
    const charaktere = getCharaktere();
    const c = charaktere.find(x => x.id === charId);
    if (!c) {
      preview.classList.add('hidden');
      return;
    }
    iconEl.src = getIconUrl(c.icon);
    iconEl.alt = c.name;
    nameEl.textContent = c.typ === 'npc' ? `${c.name} (NPC)` : c.name;
    preview.classList.remove('hidden');
  };

  const populateCharakterwahl = () => {
    if (!kampagneSel || !charSel) return;
    const kampagnen = getKampagnenListe();
    kampagneSel.innerHTML = '<option value="">(Kampagne wählen)</option>';
    kampagnen.forEach(({ id, name }) => {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = name;
      kampagneSel.appendChild(opt);
    });
    const charaktere = getCharaktere();
    charSel.innerHTML = '<option value="">(Charakter wählen)</option>';
    charaktere.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.typ === 'npc' ? `${c.name} (NPC)` : c.name;
      charSel.appendChild(opt);
    });
    if (ohneCharBtn) ohneCharBtn.hidden = selectedRoleOnStartScreen !== ROLES.SPIELLEITER;
    const currentId = getCurrentKampagneId();
    if (currentId && kampagnen.some(k => k.id === currentId)) kampagneSel.value = currentId;
    updateCharakterPreview();
    const ch = $('#startScreenCharakterHint');
    if (ch) ch.classList.toggle('hidden', selectedRoleOnStartScreen !== ROLES.SPIELLEITER);
    const eho = $('#startScreenExpandHintOptional');
    if (eho) eho.hidden = selectedRoleOnStartScreen !== ROLES.SPIELLEITER;
  };

  const charHint = $('#startScreenCharakterHint');

  const expandHintOptional = $('#startScreenExpandHintOptional');

  const expandSection = () => {
    charSection?.classList.add('expanded');
    expandHint?.classList.remove('hidden');
    populateCharakterwahl();
    if (isFirebaseActive()) joinWrap?.classList.remove('hidden');
    if (charHint) charHint.classList.toggle('hidden', selectedRoleOnStartScreen !== ROLES.SPIELLEITER);
    if (expandHintOptional) expandHintOptional.hidden = selectedRoleOnStartScreen !== ROLES.SPIELLEITER;
  };

  roleBtns?.forEach(btn => {
    btn.addEventListener('click', () => {
      roleBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedRoleOnStartScreen = btn.dataset.role;
      expandSection();
    });
  });

  kampagneJoinBtn?.addEventListener('click', async () => {
    const id = kampagneJoinInput?.value?.trim();
    if (!id) { alert('Bitte Kampagnen-ID eingeben.'); return; }
    kampagneJoinBtn.disabled = true;
    try {
      const data = await loadCampaign(id);
      if (!data) { alert('Kampagne nicht gefunden. ID prüfen.'); return; }
      joinCampaign(id);
      switchKampagne(id);
      kampagneJoinInput.value = '';
      populateCharakterwahl();
    } finally { kampagneJoinBtn.disabled = false; }
  });

  kampagneSel?.addEventListener('change', () => {
    const id = kampagneSel.value;
    if (id && switchKampagne(id)) populateCharakterwahl();
  });

  charSel?.addEventListener('change', updateCharakterPreview);

  const doStart = () => {
    const role = selectedRoleOnStartScreen || getRole();
    if (!role) { alert('Bitte zuerst eine Rolle wählen.'); return; }
    const kampagneId = kampagneSel?.value;
    const charId = charSel?.value;
    const kampagnen = getKampagnenListe();
    const charaktere = getCharaktere();
    const hasCampaignChar = kampagnen.length > 0 && charaktere.length > 0;

    if (hasCampaignChar && kampagneId && charId) {
      const c = charaktere.find(x => x.id === charId);
      if (c) {
        switchKampagne(kampagneId);
        state.selectedCharakterId = c.id;
        state.selectedCharakterName = c.name;
        setCharakter(kampagneId, c);
      }
    } else if (role === ROLES.SPIELLER && hasCampaignChar && (!kampagneId || !charId)) {
      alert('Bitte Kampagne und Charakter wählen, oder „Ohne Charakter fortfahren“.');
      return;
    } else {
      state.selectedCharakterId = null;
      state.selectedCharakterName = null;
      if (kampagneId) switchKampagne(kampagneId);
    }

    setRole(role);
    hideStartScreen();
    initUserProfile();
    applyRoleUI(role);
    appInitialized = true;
    initApp();
  };

  startenBtn?.addEventListener('click', doStart);

  ohneCharBtn?.addEventListener('click', () => {
    setRole(selectedRoleOnStartScreen || ROLES.SPIELLER);
    state.selectedCharakterId = null;
    state.selectedCharakterName = null;
    state.skipCharakterwahl = true;
    const kampagneId = kampagneSel?.value;
    if (kampagneId) switchKampagne(kampagneId);
    hideStartScreen();
    initUserProfile();
    applyRoleUI(selectedRoleOnStartScreen || ROLES.SPIELLER);
    appInitialized = true;
    initApp();
  });
}

async function initFirebaseIfConfigured() {
  let config = null;
  let configSource = '';
  try {
    const mod = await import('../private/firebase-config.js');
    config = mod.firebaseConfig ?? mod.config ?? mod.default;
    configSource = 'private';
  } catch {
    try {
      const mod = await import('./firebase-config.js');
      config = mod.firebaseConfig ?? mod.config ?? mod.default;
      configSource = 'scripts';
    } catch {
      console.info('[MERS] Keine Firebase-Config gefunden → localStorage');
    }
  }
  if (!config?.apiKey || config.apiKey === 'DEIN_API_KEY') return;
  const ok = await initFirebase(config);
  if (ok) {
    console.info('[MERS] Firebase aktiv (' + configSource + ')');
    await startSync();
    subscribeToChanges(refreshKampftracker);
  } else {
    console.warn('[MERS] Firebase-Init fehlgeschlagen – prüfe API-Key-Einschränkungen in Google Cloud Console');
  }
}

window.addEventListener('load', async () => {
  await initFirebaseIfConfigured();

  initRoleSelection();
  initUserProfile();
  initTabs();

  const role = getRole();
  if (!role) {
    initStartScreen();
    return;
  }

  hideStartScreen();
  initUserProfile();
  applyRoleUI(role);
  appInitialized = true;
  initApp();
});
