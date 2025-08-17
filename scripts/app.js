// --- Datenquellen (Pfad in assets/data/) ---
const TREFFER_URL = 'assets/data/treffer_tabellen_strukturiert.json';
const TABLES_URL = 'assets/data/tables.json';
const AUDIO_BASE_PATH = 'assets/audio/';
const FONT_BASE_PATH = 'assets/fonts/';
const IMG_BASE_PATH = 'assets/img/';

// --- Globaler Zustand ---
let treffer = null;
let tables = null;
let selectedWeapon = null;
let autoCrit = {
  typ: '',
  kat: ''
};
let currentBgKey = null;
let isBgMusicPlaying = false;

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

// RK Buttons erzeugen
const rkWrap = $('#rk');
for (let i = 1; i <= 20; i++) {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.rk = i;

  const span = document.createElement('span');
  span.textContent = i;
  b.appendChild(span);

  b.addEventListener('click', () => {
    $$('#rk button').forEach(x => x.classList.toggle('active', x === b));
  });
  if (i === 3) b.classList.add('active');
  rkWrap.appendChild(b);
}

// NEUE FUNKTION: Passt die Schriftgrösse der Waffen-Buttons an
function adjustWeaponFontSizes() {
  const weaponButtons = $$('#weaponWrap button');
  weaponButtons.forEach(button => {
    const span = button.querySelector('span');
    if (!span) return;

    // Setzt die Schriftgrösse zurück, falls sie vorher schon mal angepasst wurde
    span.style.fontSize = '';
    span.style.lineHeight = '';

    const style = window.getComputedStyle(button);
    const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const availableWidth = button.clientWidth - padding;

    // Prüft, ob der Text breiter als der verfügbare Platz ist
    if (span.scrollWidth > availableWidth) {
      let currentFontSize = parseFloat(window.getComputedStyle(span).fontSize);
      // Verringert die Schriftgrösse schrittweise, bis der Text passt
      while (span.scrollWidth > availableWidth && currentFontSize > 8) { // Minimalgrösse 8px
        currentFontSize -= 0.5;
        span.style.fontSize = `${currentFontSize}px`;
        span.style.lineHeight = `${currentFontSize * 1.1}px`; // Passende Zeilenhöhe
      }
    }
  });
}

// Waffenliste + Nebentreffer-Tabellen füllen
async function loadData() {
  const [t1, t2] = await Promise.all([fetch(TREFFER_URL), fetch(TABLES_URL)]);
  treffer = await t1.json();
  tables = await t2.json();

  const wSelWrap = $('#weaponWrap');
  const waffen = Object.keys(treffer?.Angriffstabellen || {}).sort();
  wSelWrap.innerHTML = '';

  waffen.forEach(k => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'weapon-button';
    btn.dataset.weapon = k;

    const label = document.createElement('span');
    label.textContent = k.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    btn.appendChild(label);

    btn.addEventListener('click', () => {
      selectedWeapon = k;
      $$('#weaponWrap button').forEach(x => x.classList.remove('active'));
      btn.classList.add('active');
    });

    wSelWrap.appendChild(btn);
  });

  // Standard-Waffe auswählen
  if (waffen.length) {
    selectedWeapon = waffen[0];
    $(`button[data-weapon="${selectedWeapon}"]`)?.classList.add('active');
  }

  // NEUER AUFRUF: Passt die Schriftgrössen an, nachdem die Buttons erstellt wurden
  adjustWeaponFontSizes();

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
  const weaponKey = selectedWeapon;
  const rk = parseInt($('#rk button.active')?.dataset.rk || '3', 10);
  const attack = parseInt($('#attack').value, 10);
  const out = $('#attackOut');
  const kpi = $('#attackKpi');
  const res = out.querySelector('.result');

  kpi.innerHTML = '';
  res.classList.remove('muted');
  res.classList.remove('crit-prominent');

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

  if (isBgMusicPlaying && autoCrit.typ) {
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
  res.classList.add('crit-prominent');

  playCritAudio(typSel, katSel, key, text);
  if (isBgMusicPlaying) {
    tryStartBgAudio(typSel);
  }
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
  res.classList.add('crit-prominent');

  playCritAudio(typ, kat, key, text);
  if (isBgMusicPlaying) {
    tryStartBgAudio(typ);
  }
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
  const safeTyp = String(typ).trim().toLowerCase();
  const capitalTyp = safeTyp.charAt(0).toUpperCase() + safeTyp.slice(1);
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

$('#bgToggleBtn').addEventListener('click', () => {
  if (isBgMusicPlaying) {
    bgAudio.pause();
    isBgMusicPlaying = false;
    $('#bgToggleBtn').textContent = 'Musik ▶︎';
  } else {
    isBgMusicPlaying = true;
    $('#bgToggleBtn').textContent = 'Musik ⏸︎';
    if (currentBgKey) {
      bgAudio.play().catch(() => { });
    } else {
      const currentCrit = $('#critType').value || autoCrit.typ;
      if (currentCrit) {
        tryStartBgAudio(currentCrit);
      }
    }
  }
});

$('#bgVol').addEventListener('input', e => {
  bgAudio.volume = parseFloat(e.target.value || '0.2');
});


function tryStartBgAudio(tableKey) {
  if (!tables || !isBgMusicPlaying) return;
  const t = tables[tableKey];
  const file = t?.audioFile;
  if (!file) {
    bgAudio.pause();
    currentBgKey = null;
    return;
  }
  if (currentBgKey === tableKey && !bgAudio.paused) return;
  currentBgKey = tableKey;
  bgAudio.src = AUDIO_BASE_PATH + `musik/${file}`;
  bgAudio.volume = parseFloat($('#bgVol').value || '0.2');
  bgAudio.play().catch(() => { });
}

function playCritAudio(typ, kat, rangeKey, fallbackText) {
  const mp3 = buildCritAudioFilename(typ, kat, rangeKey);
  if (!mp3) {
    speak(fallbackText);
    return;
  }
  sfxAudio.pause();
  sfxAudio.currentTime = 0;
  sfxAudio.src = mp3;
  sfxAudio.volume = parseFloat($('#ttsVol').value);
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
function speak(text) {
  if (!('speechSynthesis' in window)) return;
  const volume = parseFloat($('#ttsVol')?.value ?? '1.0');
  if (volume === 0) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'de-DE';
  utter.rate = 1.02;
  utter.volume = volume;
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
  $('#critOut .result').classList.remove('crit-prominent');
  $('#sideOut .result').classList.remove('crit-prominent');
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
  navigator.serviceWorker.register(url).catch(() => { });
}

// Init
window.addEventListener('load', () => {
  loadData().catch(err => {
    console.error(err);
    alert('Fehler beim Laden der JSON-Dateien. Bitte sicherstellen, dass sich assets/data/tables.json und assets/data/treffer_tabellen_strukturiert.json im gleichen Repo befinden.');
  });
});
