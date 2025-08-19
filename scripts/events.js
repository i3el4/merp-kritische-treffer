// events.js
// Dieses Modul enthält alle Event-Listener der App.

import { state } from './state.js';
import { $, $$ } from './dom.js';
import { calculateAttack, lookupCritEntry, mapCritName } from './logic.js';
import { playCritAudio, tryStartBgAudio } from './audio.js';
import { chip } from './dom.js';

/**
 * Richtet alle Event-Listener für die Benutzeroberfläche ein.
 */
export function setupEventListeners() {
    // Event-Listener für Angriffs-Berechnung
    $('#calcAttack').addEventListener('click', calculateAttack);

    // Event-Listener für Haupttreffer-Berechnung
    $('#calcCrit').addEventListener('click', calculateCrit);

    // Event-Listener für Nebentreffer-Berechnung
    $('#calcSide').addEventListener('click', calculateSide);

    // Event-Listener für den Reset-Button
    $('#resetBtn').addEventListener('click', resetApp);

    // Event-Listener für die Gegnertyp-Buttons
    $('#gegnerTyp').addEventListener('click', handleGegnerTypClick);

    // Event-Listener, wenn sich der Krit-Typ ändert
    $('#critType').addEventListener('change', handleCritTypeChange);

    // Event-Listener für Nebentreffer-Typ-Dropdown
    $('#sideType').addEventListener('change', handleSideTypeChange);

    // Event-Listener für Audio-Toggles
    $('#bgToggleBtn').addEventListener('click', handleBgToggle);
    $('#bgVol').addEventListener('input', handleBgVolumeChange);
}

/**
 * Berechnet den Haupttreffer.
 */
function calculateCrit() {
    const roll = parseInt($('#critRoll').value, 10);
    const typSel = $('#critType').value || state.autoCrit.typ;
    const katSel = $('#critCat').value || state.autoCrit.kat;

    const out = $('#critOut');
    const kpi = $('#critKpi');
    const res = out.querySelector('.result');
    kpi.innerHTML = '';
    res.classList.remove('muted');

    const critTable = state.tables?.[typSel]?.[katSel];
    if (!typSel || !katSel || !critTable) {
        res.textContent = 'Krit-Typ und -Kategorie festlegen (oder Schritt 1 ausführen).';
        return;
    }

    const ranges = Object.keys(critTable);
    if (ranges.length === 0) {
        res.textContent = `Keine Daten für ${typSel.replace(/_/g, ' ')} ${katSel} gefunden.`;
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

    const found = lookupCritEntry(typSel, katSel, roll);
    if (!found) {
        res.textContent = `Kein Eintrag gefunden für ${typSel.replace(/_/g, ' ')} ${katSel} (${roll}).`;
        return;
    }

    const {
        text,
        key
    } = found;

    kpi.append(chip(`Typ: ${typSel.replace(/_/g, ' ')}`));
    kpi.append(chip(`Kat: ${katSel}`));
    kpi.append(chip(`Wurf: ${roll}`));
    if (key) kpi.append(chip(`Bereich: ${key}`));
    res.textContent = text;
    res.classList.add('crit-prominent');

    playCritAudio(typSel, katSel, key, text);
    if (state.isBgMusicPlaying) {
        tryStartBgAudio(typSel);
    }
}

/**
 * Berechnet den Nebentreffer.
 */
function calculateSide() {
    const typ = $('#sideType').value;
    const kat = $('#sideCat').value;
    const roll = parseInt($('#sideRoll').value, 10);

    const out = $('#sideOut');
    const kpi = $('#sideKpi');
    const res = out.querySelector('.result');
    kpi.innerHTML = '';
    res.classList.remove('muted');

    const sideTable = state.tables?.[typ]?.[kat];
    if (!typ || !kat || !sideTable) {
        res.textContent = 'Bitte eine Nebentreffer-Tabelle und Kategorie wählen.';
        return;
    }

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

    const {
        text,
        key
    } = found;

    kpi.append(chip(`Nebentyp: ${typ.replace(/_/g, ' ')}`));
    kpi.append(chip(`Kat: ${kat}`));
    kpi.append(chip(`Wurf: ${roll}`));
    if (key) kpi.append(chip(`Bereich: ${key}`));
    res.textContent = text;
    res.classList.add('crit-prominent');

    playCritAudio(typ, kat, key, text);
    if (state.isBgMusicPlaying) {
        tryStartBgAudio(typ);
    }
}

/**
 * Setzt die App-Oberfläche zurück.
 */
function resetApp() {
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
    state.autoCrit = {
        typ: '',
        kat: ''
    };
    $('#critOut .result').classList.remove('crit-prominent');
    $('#sideOut .result').classList.remove('crit-prominent');
}

/**
 * Behandelt den Klick auf die Gegnertyp-Buttons.
 * @param {Event} e Das Klick-Ereignis.
 */
function handleGegnerTypClick(e) {
    const targetBtn = e.target.closest('button');
    if (targetBtn) {
        $$('#gegnerTyp button').forEach(b => b.classList.remove('active'));
        targetBtn.classList.add('active');
        const gegnerTyp = targetBtn.dataset.gegnerTyp;
        if (gegnerTyp === 'gross') {
            $('#critType').value = 'Grosse_Wesen';
        } else if (gegnerTyp === 'gewaltig') {
            $('#critType').value = 'Gewaltige_Wesen';
        } else {
            $('#critType').value = '';
        }
        updateCritCatDropdown();
    }
}

/**
 * Behandelt das Ändern des Krit-Typ-Dropdowns.
 */
function handleCritTypeChange() {
    updateCritCatDropdown();
}

/**
 * Aktualisiert das Krit-Kategorie-Dropdown.
 */
function updateCritCatDropdown() {
    const selectedTableKey = $('#critType').value;
    const kritKategorien = state.tables?.[selectedTableKey] ? Object.keys(state.tables[selectedTableKey]).filter(k => k !== 'audioFile') : [];
    const critCatDropdown = $('#critCat');
    critCatDropdown.innerHTML = '';
    if (kritKategorien.length > 0) {
        kritKategorien.forEach(kat => {
            const opt = document.createElement('option');
            opt.value = kat;
            opt.textContent = kat;
            critCatDropdown.appendChild(opt);
        });
    }
    if (critCatDropdown.options.length > 0) {
        critCatDropdown.value = critCatDropdown.options[0].value;
    }
}

/**
 * Behandelt das Ändern des Nebentreffer-Typ-Dropdowns.
 */
function handleSideTypeChange() {
    const selectedSideTable = $('#sideType').value;
    const sideCatDropdown = $('#sideCat');
    sideCatDropdown.innerHTML = '';
    if (selectedSideTable && state.tables[selectedSideTable]) {
        const categories = Object.keys(state.tables[selectedSideTable]).filter(k => k !== 'audioFile');
        categories.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.textContent = cat;
            sideCatDropdown.appendChild(opt);
        });
    }
}

/**
 * Behandelt den Klick auf den Hintergrundmusik-Toggle-Button.
 */
function handleBgToggle() {
    const bgAudio = $('#bgAudio');
    if (state.isBgMusicPlaying) {
        bgAudio.pause();
        state.isBgMusicPlaying = false;
        $('#bgToggleBtn').textContent = 'Musik ▶︎';
    } else {
        state.isBgMusicPlaying = true;
        $('#bgToggleBtn').textContent = 'Musik ⏸︎';
        if (state.currentBgKey) {
            bgAudio.play().catch(() => { });
        } else {
            const currentCrit = $('#critType').value || state.autoCrit.typ;
            if (currentCrit) {
                tryStartBgAudio(currentCrit);
            }
        }
    }
}

/**
 * Behandelt das Ändern der Hintergrundmusik-Lautstärke.
 * @param {Event} e Das Input-Ereignis.
 */
function handleBgVolumeChange(e) {
    const bgAudio = $('#bgAudio');
    bgAudio.volume = parseFloat(e.target.value || '0.2');
}