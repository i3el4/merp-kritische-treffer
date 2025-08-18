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

// Logik für Gegnertyp-Buttons
const gegnerTypWrap = $('#gegnerTyp');
const critTypeDropdown = $('#critType');
const critCatDropdown = $('#critCat');

gegnerTypWrap.addEventListener('click', (e) => {
  const targetBtn = e.target.closest('button');
  if (targetBtn) {
    $$('#gegnerTyp button').forEach(b => b.classList.remove('active'));
    targetBtn.classList.add('active');

    const gegnerTyp = targetBtn.dataset.gegnerTyp;

    // Aktualisiert das Krit-Typ-Dropdown
    if (gegnerTyp === 'gross') {
      critTypeDropdown.value = 'Grosse_Wesen';
    } else if (gegnerTyp === 'gewaltig') {
      critTypeDropdown.value = 'Gewaltige_Wesen';
    } else {
      critTypeDropdown.value = '';
    }

    // Dynamisches Befüllen des Kategorien-Dropdowns
    const selectedTableKey = critTypeDropdown.value;
    const kritKategorien = tables?.[selectedTableKey] ? Object.keys(tables[selectedTableKey]).filter(k => k !== 'audioFile') : [];

    critCatDropdown.innerHTML = '';
    if (kritKategorien.length > 0) {
      kritKategorien.forEach(kat => {
        const opt = document.createElement('option');
        opt.value = kat;
        opt.textContent = kat;
        critCatDropdown.appendChild(opt);
      });
    }

    // Setzt den ersten Eintrag als Standard
    if (critCatDropdown.options.length > 0) {
      critCatDropdown.value = critCatDropdown.options[0].value;
    }
  }
});

// NEU: Aktualisiert das Kategorie-Dropdown, wenn sich der Krit-Typ ändert
critTypeDropdown.addEventListener('change', () => {
  const selectedTableKey = critTypeDropdown.value;
  const kritKategorien = tables?.[selectedTableKey] ? Object.keys(tables[selectedTableKey]).filter(k => k !== 'audioFile') : [];

  critCatDropdown.innerHTML = '';
  if (kritKategorien.length > 0) {
    kritKategorien.forEach(kat => {
      const opt = document.createElement('option');
      opt.value = kat;
      opt.textContent = kat;
      critCatDropdown.appendChild(opt);
    });
    critCatDropdown.value = kritKategorien[0]; // Ersten Eintrag als Standard setzen
  }
});

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
      $$('#weaponWrap button').forEach(x => x.classList.remove('active'));
      btn.classList.add('active');
      selectedWeapon = k;
    });

    wSelWrap.appendChild(btn);
  });

  if (waffen.length) {
    const defaultWeaponBtn = $(`#weaponWrap button[data-weapon="${waffen[0]}"]`);
    if (defaultWeaponBtn) {
      defaultWeaponBtn.classList.add('active');
      selectedWeapon = waffen[0];
    }
  }
  adjustWeaponFontSizes();

  // Funktion zum Befüllen der Dropdown-Menüs
  function populateCritDropdowns(dropdown, isMainCrit = true) {
    dropdown.innerHTML = '';
    if (isMainCrit) {
      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = '(automatisch aus Schritt 1 übernommen)';
      dropdown.appendChild(defaultOption);
    } else {
      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = '(eine wählen)';
      dropdown.appendChild(defaultOption);
    }

    const critCategories = {
      'Normal': ['Hieb', 'Stich', 'Stoss', 'Streich'],
      'Magisch': ['Elektro', 'Hitze', 'Kälte', 'Schlag'],
      'Gross & Gewaltig': ['Grosse Wesen', 'Gewaltige Wesen'],
      'Helden': ['Hieb (Held)', 'Stich (Held)', 'Stoss (Held)', 'Streich (Held)'],
      'Patzer': ['Allgemeine Patzer', "Waffenpatzer"]
    };

    if (!isMainCrit) {
      delete critCategories['Helden'];
      delete critCategories['Patzer'];
    }

    for (const [groupName, keys] of Object.entries(critCategories)) {
      const optgroup = document.createElement('optgroup');
      optgroup.label = groupName;

      keys.forEach(key => {
        if (tables[key]) {
          const opt = document.createElement('option');
          opt.value = key;
          opt.textContent = key.replace(/_/g, ' ');
          optgroup.appendChild(opt);
        }
      });

      if (optgroup.children.length > 0) {
        dropdown.appendChild(optgroup);
      }
    }
  }

  // Dropdowns mit den neuen Kategorien befüllen
  populateCritDropdowns($('#critType'), true);
  populateCritDropdowns($('#sideType'), false);

  // Initiales Befüllen des Krit-Kategorie-Dropdowns
  const critCatDropdown = $('#critCat');
  const defaultCritTable = tables?.['Stich']; // Standardwert für initiales Befüllen
  if (defaultCritTable) {
    const categories = Object.keys(defaultCritTable).filter(k => k !== 'audioFile');
    categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      critCatDropdown.appendChild(opt);
    });
  }

  // Event-Listener für Nebentreffer-Tabelle (unverändert)
  const sideSel = $('#sideType');
  sideSel.addEventListener('change', () => {
    const selectedSideTable = sideSel.value;
    const sideCatDropdown = $('#sideCat');
    sideCatDropdown.innerHTML = '';
    if (selectedSideTable && tables[selectedSideTable]) {
      const categories = Object.keys(tables[selectedSideTable]).filter(k => k !== 'audioFile');
      categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        sideCatDropdown.appendChild(opt);
      });
    }
  });

  // Standardauswahl für Nebentreffer-Dropdown
  if (sideSel.options.length > 1) {
    sideSel.value = sideSel.options[1].value;
    sideSel.dispatchEvent(new Event('change'));
  }
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
  // --- Initiales Setup (unverändert) ---
  const weaponKey = selectedWeapon;
  const rk = parseInt($('#rk button.active')?.dataset.rk || '3', 10);
  const attack = parseInt($('#attack').value, 10);
  const out = $('#attackOut');
  const kpi = $('#attackKpi');
  const res = out.querySelector('.result');

  kpi.innerHTML = '';
  res.innerHTML = ''; // Vorheriges Ergebnis leeren
  res.classList.remove('muted');
  res.classList.remove('crit-prominent');

  const weaponBlock = treffer?.Angriffstabellen?.[weaponKey];
  if (!weaponKey || !weaponBlock?.RK) {
    res.textContent = '⚠️ Keine Angriffsdaten gefunden.';
    return;
  }
  if (isNaN(attack)) {
    res.textContent = 'Bitte einen Angriffswert eingeben.';
    return;
  }

  const rkBlock = weaponBlock.RK[String(rk)];
  if (!rkBlock) {
    res.textContent = `Keine Daten für RK ${rk}.`;
    return;
  }

  // --- NEUE LOGIK ZUR KUMULATIVEN BERECHNUNG ---
  let remainingAttack = attack;
  let totalTp = 0;
  let firstKrit = { typ: '', kat: '' };
  let isFirstLookup = true;
  const calculationSteps = [];

  if (attack <= 0) {
    res.textContent = 'Kein Schaden bei Angriffswert ≤ 0.';
    kpi.append(chip(`Waffe: ${weaponKey.replace(/_/g, ' ')}`));
    kpi.append(chip(`RK: ${rk}`));
    kpi.append(chip(`Angriffswert: ${attack}`));
    return;
  }

  while (remainingAttack > 0) {
    const fk = floorKey(rkBlock, remainingAttack);
    if (fk === null) {
      calculationSteps.push({ attack: remainingAttack, tp: 0, key: '(< Minimum)' });
      break;
    }

    const entry = rkBlock[String(fk)];
    const currentTp = entry.trefferpunkte ?? 0;
    totalTp += currentTp;
    calculationSteps.push({ attack: remainingAttack, tp: currentTp, key: fk });

    if (isFirstLookup) {
      firstKrit.typ = entry.krit_typ || '';
      firstKrit.kat = entry.krit_kat || '';
      isFirstLookup = false;
    }

    remainingAttack -= 150;
  }

  const gegnerTyp = $('#gegnerTyp button.active')?.dataset.gegnerTyp || 'normal';
  let minKat = 'A';
  if (gegnerTyp === 'gross') minKat = 'B';
  if (gegnerTyp === 'gewaltig') minKat = 'D';

  if (firstKrit.kat && firstKrit.kat < minKat) {
    firstKrit = { typ: '', kat: '' };
  }

  // Krit-Typ für Anzeige und Dropdown anpassen
  if (gegnerTyp === 'gross' && firstKrit.typ) {
    firstKrit.typ = 'Grosse Wesen';
  } else if (gegnerTyp === 'gewaltig' && firstKrit.typ) {
    firstKrit.typ = 'Gewaltige Wesen';
  }

  autoCrit.typ = mapCritName(firstKrit.typ) || firstKrit.typ || '';
  autoCrit.kat = firstKrit.kat || '';

  const label = weaponKey.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  kpi.append(chip(`Waffe: ${label}`));
  kpi.append(chip(`RK: ${rk}`));
  kpi.append(chip(`Angriffswert: ${attack}`));

  const pillz = document.createElement('div');
  pillz.className = 'kpi';
  pillz.append(pill('Gesamttreffer', String(totalTp), 'ok'));

  if (firstKrit.typ && firstKrit.kat) {
    const kritAnzeige = (gegnerTyp !== 'normal') ? firstKrit.typ : `${firstKrit.typ}-${firstKrit.kat}`;
    pillz.append(pill('Krit', kritAnzeige, 'warn'));

    // Dropdown für Krit-Typ aktualisieren
    const critTypeDropdown = $('#critType');
    critTypeDropdown.value = autoCrit.typ;

    // Dropdown für Kategorien aktualisieren
    const critCatDropdown = $('#critCat');

    // Befüllt Kategorien dynamisch, falls es sich um grosse/gewaltige Wesen handelt
    const critTable = tables?.[autoCrit.typ];
    if (critTable && (gegnerTyp === 'gross' || gegnerTyp === 'gewaltig')) {
      const kritKategorien = Object.keys(critTable).filter(k => k !== 'audioFile');
      critCatDropdown.innerHTML = '';
      kritKategorien.forEach(kat => {
        const opt = document.createElement('option');
        opt.value = kat;
        opt.textContent = kat;
        critCatDropdown.appendChild(opt);
      });
    } else {
      // Für normale Gegner: Stellt sicher, dass die Kategorien A-E vorhanden sind
      // und die richtige Kategorie ausgewählt wird.
      critCatDropdown.innerHTML = '';
      const normalCategories = ['A', 'B', 'C', 'D', 'E'];
      normalCategories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        critCatDropdown.appendChild(opt);
      });
    }
    critCatDropdown.value = autoCrit.kat;
  } else {
    pillz.append(pill('Krit', '—', ''));
  }
  res.append(pillz);

  if (calculationSteps.length > 1) {
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'Berechnungsdetails anzeigen';
    details.appendChild(summary);
    const stepsList = document.createElement('ul');
    stepsList.style.cssText = 'font-size: 12px; margin-top: 8px; padding-left: 20px; list-style-type: disc;';
    calculationSteps.forEach(step => {
      const li = document.createElement('li');
      li.textContent = `AW ${step.attack} (Eintrag: ${step.key}) → ${step.tp} TP`;
      stepsList.appendChild(li);
    });
    details.appendChild(stepsList);
    res.append(details);
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

  const critTable = tables?.[typSel]?.[katSel];

  if (!typSel || !katSel || !critTable) {
    res.textContent = 'Krit-Typ und -Kategorie festlegen (oder Schritt 1 ausführen).';
    return;
  }

  // NEU: Vereinfachte dynamische Validierung
  const ranges = Object.keys(critTable);
  if (ranges.length === 0) {
    res.textContent = `Keine Daten für ${typSel.replace(/_/g, ' ')} ${katSel} gefunden.`;
    return;
  }

  const firstRange = ranges[0];
  const lastRange = ranges[ranges.length - 1];

  const minRoll = parseInt(firstRange.split('-')[0], 10);
  const maxRoll = parseInt(lastRange.split('-')[1], 10);

  // Angepasste Fehlermeldung
  if (isNaN(roll) || roll < minRoll || roll > maxRoll) {
    res.textContent = `Bitte Wurf (${minRoll}–${maxRoll}) eingeben.`;
    return;
  }

  const found = lookupCritEntry(typSel, katSel, roll);

  if (!found) {
    res.textContent = `Kein Eintrag gefunden für ${typSel.replace(/_/g, ' ')} ${katSel} (${roll}).`;
    return;
  }

  const { text, key } = found;

  kpi.append(chip(`Typ: ${typSel.replace(/_/g, ' ')}`));
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

  const sideTable = tables?.[typ]?.[kat];

  if (!typ || !kat || !sideTable) {
    res.textContent = 'Bitte eine Nebentreffer-Tabelle und Kategorie wählen.';
    return;
  }

  // NEU: Vereinfachte dynamische Validierung
  const ranges = Object.keys(sideTable);
  if (ranges.length === 0) {
    res.textContent = `Keine Daten für ${typ.replace(/_/g, ' ')} ${kat} gefunden.`;
    return;
  }

  const firstRange = ranges[0];
  const lastRange = ranges[ranges.length - 1];

  const minRoll = parseInt(firstRange.split('-')[0], 10);
  const maxRoll = parseInt(lastRange.split('-')[1], 10);

  if (isNaN(roll) || roll < minRoll || roll > maxRoll) {
    res.textContent = `Bitte Wurf (${minRoll}–${maxRoll}) eingeben.`;
    return;
  }

  const found = lookupCritEntry(typ, kat, roll);
  if (!found) {
    res.textContent = `Kein Eintrag gefunden für ${typ.replace(/_/g, ' ')} ${kat} (${roll}).`;
    return;
  }

  const { text, key } = found;

  kpi.append(chip(`Nebentyp: ${typ.replace(/_/g, ' ')}`));
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
