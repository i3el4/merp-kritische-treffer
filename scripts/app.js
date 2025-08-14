// --- Datenquellen (Pfad in assets/data/) ---
const TREFFER_URL = 'assets/data/treffer_tabellen_strukturiert.json';
const TABLES_URL = 'assets/data/tables.json';
const AUDIO_BASE_PATH = 'assets/audio/';
const FONT_BASE_PATH = 'assets/fonts/';
const IMG_BASE_PATH = 'assets/img/';

// --- Globaler Zustand ---
let treffer = null;
let tables = null;
let autoCrit = {
  typ: '',
  kat: ''
};
let currentBgKey = null;

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

// RK Buttons erzeugen
const rkWrap = $('#rk');
for (let i = 1; i <= 20; i++) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = i;
  b.dataset.rk = i;
  b.addEventListener('click', () => {
    $$('.rk button').forEach(x => x.classList.toggle('active', x === b));
  });
  if (i === 3) b.classList.add('active'); // Default RK 3
  rkWrap.appendChild(b);
}

// Waffenliste + Nebentreffer-Tabellen füllen
async function loadData() {
  const [t1, t2] = await Promise.all([fetch(TREFFER_URL), fetch(TABLES_URL)]);
  treffer = await t1.json();
  tables = await t2.json();

  // Waffen aus treffer.Angriffstabellen (Schlüssel)
  const wSel = $('#weapon');
  const waffen = Object.keys(treffer?.Angriffstabellen || {}).sort();
  wSel.innerHTML = '';
  waffen.forEach(k => {
    const opt = document.createElement('option');
    opt.value = k; // Original-Key (z. B. HANDAXT)
    const label = k.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    opt.textContent = label;
    wSel.appendChild(opt);
  });
  if (waffen.length) wSel.value = waffen[0];

  // Nebentreffer-Typen aus tables.json
  const sideSel = $('#sideType');
  sideSel.innerHTML = '<option value="">(eine wählen)</option>';
  Object.keys(tables || {}).forEach(key => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = key;
    sideSel.appendChild(opt);
  });
}

// Utility: nächstniedrigerer Key im Objekt (number keys)
function floorKey(obj, target) {
  const keys = Object.keys(obj).map(k => parseInt(k, 10)).filter(n => !Number.isNaN(n)).sort((a, b) => a - b);
  let best = null;
  for (const k of keys) {
    if (k <= target) best = k;
    else break;
  }
  return best;
}

// Angriff berechnen
$('#calcAttack').addEventListener('click', () => {
  const weaponKey = $('#weapon').value; // z. B. HANDAXT
  const rk = parseInt($('.rk button.active')?.dataset.rk || '3', 10);
  const attack = parseInt($('#attack').value, 10);
  const out = $('#attackOut');
  const kpi = $('#attackKpi');
  const res = out.querySelector('.result');

  kpi.innerHTML = '';
  res.classList.remove('muted');

  const weaponBlock = treffer?.Angriffstabellen?.[weaponKey];
  if (!weaponKey || !weaponBlock?.RK) {
    res.textContent = '⚠️ Keine Angriffsdaten gefunden.';
    return;
  }
  if (Number.isNaN(attack)) {
    res.textContent = 'Bitte einen Angriffswert eingeben.';
    return;
  }

  const rkBlock = weaponBlock.RK[String(rk)];
  if (!rkBlock) {
    res.textContent = `Keine Daten für RK ${rk}.`;
    return;
  }

  const fk = floorKey(rkBlock, attack);
  if (fk === null) {
    res.textContent = 'Kein passender Eintrag (Wert zu niedrig).';
    return;
  }

  const entry = rkBlock[String(fk)];
  const tp = entry.trefferpunkte ?? '—';
  const kt = entry.krit_typ || '';
  const kk = entry.krit_kat || '';

  autoCrit.typ = mapCritName(kt) || '';
  autoCrit.kat = kk || '';

  const label = weaponKey.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  kpi.append(chip(`Waffe: ${label}`));
  kpi.append(chip(`RK: ${rk}`));
  kpi.append(chip(`Tabelleneintrag: ${fk}`));

  const pillz = document.createElement('div');
  pillz.className = 'kpi';
  pillz.append(pill('Trefferpunkte', String(tp), 'ok'));
  if (kt && kk) {
    pillz.append(pill('Krit', `${kt}-${kk}`, 'warn'));
    $('#critType').value = autoCrit.typ || '';
    $('#critCat').value = autoCrit.kat || '';
  } else {
    pillz.append(pill('Krit', '—', ''));
  }
  res.innerHTML = '';
  res.append(pillz);

  if (autoCrit.typ) {
    tryStartBgAudio(autoCrit.typ);
  }
});

// Kritischen Haupttreffer nachschlagen
$('#calcCrit').addEventListener('click', () => {
  const roll = parseInt($('#critRoll').value, 10);
  const typSel = $('#critType').value || autoCrit.typ;
  const katSel = $('#critCat').value || autoCrit.kat;

  const out = $('#critOut');
  const kpi = $('#critKpi');
  const res = out.querySelector('.result');
  kpi.innerHTML = '';
  res.classList.remove('muted');

  if (!roll || roll < 1 || roll > 100) {
    res.textContent = 'Bitte Wurf (1–100) eingeben.';
    return;
  }
  if (!typSel || !katSel) {
    res.textContent = 'Krit-Typ und -Kategorie festlegen (oder Schritt 1 ausführen).';
    return;
  }

  const found = lookupCritEntry(typSel, katSel, roll);
  if (!found) {
    res.textContent = `Kein Eintrag gefunden für ${typSel} ${katSel} (${roll}).`;
    return;
  }

  const {
    text,
    key
  } = found;

  kpi.append(chip(`Typ: ${typSel}`));
  kpi.append(chip(`Kat: ${katSel}`));
  kpi.append(chip(`Wurf: ${roll}`));
  if (key) kpi.append(chip(`Bereich: ${key}`));
  res.textContent = text;

  playCritAudio(typSel, katSel, key, text);
  tryStartBgAudio(typSel);
});

// Nebentreffer
$('#calcSide').addEventListener('click', () => {
  const typ = $('#sideType').value;
  const kat = $('#sideCat').value;
  const roll = parseInt($('#sideRoll').value, 10);

  const out = $('#sideOut');
  const kpi = $('#sideKpi');
  const res = out.querySelector('.result');
  kpi.innerHTML = '';
  res.classList.remove('muted');

  if (!typ) {
    res.textContent = 'Bitte eine Nebentreffer-Tabelle wählen.';
    return;
  }
  if (!roll || roll < 1 || roll > 100) {
    res.textContent = 'Bitte Wurf (1–100) eingeben.';
    return;
  }

  const found = lookupCritEntry(typ, kat, roll);
  if (!found) {
    res.textContent = `Kein Eintrag gefunden für ${typ} ${kat} (${roll}).`;
    return;
  }
  const {
    text,
    key
  } = found;

  kpi.append(chip(`Nebentyp: ${typ}`));
  kpi.append(chip(`Kat: ${kat}`));
  kpi.append(chip(`Wurf: ${roll}`));
  if (key) kpi.append(chip(`Bereich: ${key}`));
  res.textContent = text;

  playCritAudio(typ, kat, key, text);
  tryStartBgAudio(typ);
});

// UI Helpers
function chip(t) {
  const s = document.createElement('span');
  s.className = 'pill';
  s.textContent = t;
  return s;
}

function pill(label, value, tone) {
  const w = document.createElement('div');
  w.className = 'pill ' + (tone || '');
  w.innerHTML = '<strong>' + label + ':</strong> ' + value;
  return w;
}

// Kürzel → Tabellen-Key
function mapCritName(kurz) {
  if (!kurz) return '';
  const map = {
    'P': 'Stich',
    'S': 'Streich',
    'K': 'Hieb'
  };
  const base = map[kurz] || kurz;
  const keys = Object.keys(tables || {});
  if (keys.includes(base)) return base;
  const alt = keys.find(k => k.toLowerCase().startsWith(base.toLowerCase()));
  return alt || '';
}

// Bereichs-Parser & MP3-Dateiname
function matchRange(range, roll) {
  range = String(range).trim();
  const z = (s) => parseInt(String(s).replace(/^0+/, '') || '0', 10);
  if (range.includes('-')) {
    const [a, b] = range.split('-');
    return roll >= z(a) && roll <= z(b);
  }
  if (range.startsWith('≤')) {
    return roll <= z(range.slice(1));
  }
  if (range.startsWith('≥')) {
    return roll >= z(range.slice(1));
  }
  return roll === z(range);
}

function sanitizeRangeForFile(rangeKey) {
  let s = String(rangeKey).trim();
  s = s.replace(/[–—]/g, '-').replace(/\s+/g, '');
  if (s.includes('-')) {
    const [a, b] = s.split('-');
    const nz = (x) => String(parseInt(x, 10));
    return nz(a) + '-' + nz(b);
  }
  s = s.replace(/[≤≥]/g, '');
  return String(parseInt(s, 10));
}

function buildCritAudioFilename(typ, kat, rangeKey) {
  if (!typ || !kat || !rangeKey) return null;
  const safeTyp = String(typ).trim().toLowerCase(); // Kleinschreibung
  const capitalTyp = safeTyp.charAt(0).toUpperCase() + safeTyp.slice(1); // Streich, nicht streich
  const safeKat = String(kat).trim().toUpperCase();
  const safeRange = sanitizeRangeForFile(rangeKey);
  return `${AUDIO_BASE_PATH}krit/${capitalTyp}_${safeKat}_${safeRange}.mp3`;
}

function lookupCritEntry(typ, kat, roll) {
  const block = tables?.[typ];
  if (!block) return null;
  const cat = block?.[kat];
  if (!cat) return null;
  for (const key of Object.keys(cat)) {
    if (matchRange(key, roll)) return {
      text: cat[key],
      key
    };
  }
  return null;
}

// Audio
const bgAudio = $('#bgAudio');
const sfxAudio = $('#sfxAudio');

$('#bgVol').addEventListener('input', e => {
  bgAudio.volume = parseFloat(e.target.value || '0.2');
});

$('#bgToggle').addEventListener('change', () => {
  if (!$('#bgToggle').checked) {
    bgAudio.pause();
  } else if (currentBgKey) {
    tryStartBgAudio(currentBgKey);
  }
});

function tryStartBgAudio(tableKey) {
  if (!tables || !$('#bgToggle').checked) return;
  const t = tables[tableKey];
  const file = t?.audioFile;
  if (!file) return;
  if (currentBgKey === tableKey && !bgAudio.paused) return;
  currentBgKey = tableKey;
  bgAudio.src = AUDIO_BASE_PATH + `musik/${file}`;
  bgAudio.volume = parseFloat($('#bgVol').value || '0.2');
  bgAudio.play().catch(() => {});
}

function playCritAudio(typ, kat, rangeKey, fallbackText) {
  const mp3 = buildCritAudioFilename(typ, kat, rangeKey);
  console.log('Versuche MP3 abzuspielen:', mp3); // Debug-Ausgabe
  if (!mp3) {
    speak(fallbackText);
    return;
  }
  sfxAudio.pause();
  sfxAudio.currentTime = 0;
  sfxAudio.src = mp3;
  const onError = () => {
    sfxAudio.removeEventListener('error', onError);
    speak(fallbackText);
  };
  sfxAudio.addEventListener('error', onError, {
    once: true
  });
  sfxAudio.play().catch(() => {
    speak(fallbackText);
  });
}

// TTS
$('#ttsVol').addEventListener('input', () => {
  // nichts nötig – wird erst beim Sprechen verwendet
});

function speak(text) {
  const enabled = $('#ttsToggle').checked;
  if (!enabled || !('speechSynthesis' in window)) return;

  window.speechSynthesis.cancel();

  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'de-DE';
  utter.rate = 1.02;
  utter.volume = parseFloat($('#ttsVol').value || '1.0'); // hier!
  window.speechSynthesis.speak(utter);
}

// Reset
$('#resetBtn').addEventListener('click', () => {
  $('#attack').value = '';
  $('#critRoll').value = '';
  $('#critOut .result').textContent = 'Noch kein Ergebnis.';
  $('#attackOut .result').textContent = 'Noch kein Ergebnis.';
  $('#sideOut .result').textContent = 'Noch kein Ergebnis.';
  $('#critKpi').innerHTML = '';
  $('#attackKpi').innerHTML = '';
  $('#sideKpi').innerHTML = '';
  $('#critType').value = '';
  $('#critCat').value = '';
  autoCrit = {
    typ: '',
    kat: ''
  };
});

// PWA Basics
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  $('#installBtn').hidden = false;
});
$('#installBtn').addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $('#installBtn').hidden = true;
});
if ('serviceWorker' in navigator) {
  const sw = `
    const CORE = self.location.href;
    self.addEventListener('install', e=>{self.skipWaiting()});
    self.addEventListener('activate', e=>{clients.claim()});
    self.addEventListener('fetch', e=>{});
  `;
  const blob = new Blob([sw], {
    type: 'text/javascript'
  });
  const url = URL.createObjectURL(blob);
  navigator.serviceWorker.register(url).catch(() => {});
}

// Init
window.addEventListener('load', () => {
  loadData().catch(err => {
    console.error(err);
    alert('Fehler beim Laden der JSON-Dateien. Bitte sicherstellen, dass sich assets/data/tables.json und assets/data/treffer_tabellen_strukturiert.json im gleichen Repo befinden.');
  });
});
