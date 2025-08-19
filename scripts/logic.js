// logic.js
// Dieses Modul enthält die Kernlogik für die Berechnungen.

import { state } from './state.js';
import { $, $$ } from './dom.js';
import { playCritAudio, tryStartBgAudio } from './audio.js';
import { chip, pill } from './dom.js';

/**
 * Passt die Schriftgrösse von Waffen-Buttons an, wenn der Text zu lang ist.
 */
export function adjustWeaponFontSizes() {
    const weaponButtons = $$('#weaponWrap button');
    weaponButtons.forEach(button => {
        const span = button.querySelector('span');
        if (!span) return;

        span.style.fontSize = '';
        span.style.lineHeight = '';

        const style = window.getComputedStyle(button);
        const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
        const availableWidth = button.clientWidth - padding;

        if (span.scrollWidth > availableWidth) {
            let currentFontSize = parseFloat(window.getComputedStyle(span).fontSize);
            while (span.scrollWidth > availableWidth && currentFontSize > 8) {
                currentFontSize -= 0.5;
                span.style.fontSize = `${currentFontSize}px`;
                span.style.lineHeight = `${currentFontSize * 1.1}px`;
            }
        }
    });
}

/**
 * Findet den nächstniedrigeren Schlüssel in einem Objekt mit nummerischen Schlüsseln.
 * @param {object} obj Das Objekt.
 * @param {number} target Der Zielwert.
 * @returns {number|null} Der gefundene Schlüssel oder null.
 */
function floorKey(obj, target) {
    const keys = Object.keys(obj).map(k => parseInt(k, 10)).filter(n => !Number.isNaN(n)).sort((a, b) => a - b);
    let best = null;
    for (const k of keys) {
        if (k <= target) best = k;
        else break;
    }
    return best;
}

/**
 * Berechnet den Angriff und die Trefferpunkte.
 */
export function calculateAttack() {
    const weaponKey = state.selectedWeapon;
    const rk = parseInt($('#rk button.active')?.dataset.rk || '3', 10);
    const attack = parseInt($('#attack').value, 10);
    const out = $('#attackOut');
    const kpi = $('#attackKpi');
    const res = out.querySelector('.result');

    kpi.innerHTML = '';
    res.innerHTML = '';
    res.classList.remove('muted');

    const weaponBlock = state.treffer?.Angriffstabellen?.[weaponKey];
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

    let remainingAttack = attack;
    let totalTp = 0;
    let firstKrit = {
        typ: '',
        kat: ''
    };
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
            calculationSteps.push({
                attack: remainingAttack,
                tp: 0,
                key: '(< Minimum)'
            });
            break;
        }

        const entry = rkBlock[String(fk)];
        const currentTp = entry.trefferpunkte ?? 0;
        totalTp += currentTp;
        calculationSteps.push({
            attack: remainingAttack,
            tp: currentTp,
            key: fk
        });

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
        firstKrit = {
            typ: '',
            kat: ''
        };
    }

    if (gegnerTyp === 'gross' && firstKrit.typ) {
        firstKrit.typ = 'Grosse Wesen';
    } else if (gegnerTyp === 'gewaltig' && firstKrit.typ) {
        firstKrit.typ = 'Gewaltige Wesen';
    }

    state.autoCrit = {
        typ: mapCritName(firstKrit.typ) || firstKrit.typ || '',
        kat: firstKrit.kat || ''
    };

    const label = weaponKey.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    kpi.append(chip(`Waffe: ${label}`));
    kpi.append(chip(`RK: ${rk}`));
    kpi.append(chip(`Angriffswert: ${attack}`));

    const pillz = document.createElement('div');
    pillz.className = 'kpi';
    pillz.append(pill('Gesamttreffer', String(totalTp), 'ok'));

    if (state.autoCrit.typ && state.autoCrit.kat) {
        const kritAnzeige = (gegnerTyp !== 'normal') ? firstKrit.typ : `${firstKrit.typ}-${firstKrit.kat}`;
        pillz.append(pill('Krit', kritAnzeige, 'warn'));

        const critTypeDropdown = $('#critType');
        critTypeDropdown.value = state.autoCrit.typ;

        const critCatDropdown = $('#critCat');
        const critTable = state.tables?.[state.autoCrit.typ];
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
            critCatDropdown.innerHTML = '';
            const normalCategories = ['A', 'B', 'C', 'D', 'E'];
            normalCategories.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat;
                opt.textContent = cat;
                critCatDropdown.appendChild(opt);
            });
        }
        critCatDropdown.value = state.autoCrit.kat;
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
}

/**
 * Sucht einen kritischen Treffer-Eintrag.
 * @param {string} typ Der Krit-Typ.
 * @param {string} kat Die Kategorie.
 * @param {number} roll Der Würfelwurf.
 * @returns {object|null} Das gefundene Ergebnis oder null.
 */
export function lookupCritEntry(typ, kat, roll) {
    const block = state.tables?.[typ];
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

/**
 * Vergleicht einen Wert mit einem Bereichs-String (z.B. "1-5", "≥10").
 * @param {string} range Der Bereichs-String.
 * @param {number} roll Der zu vergleichende Wert.
 * @returns {boolean} True, wenn der Wert im Bereich liegt.
 */
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

/**
 * Findet den passenden Tabellen-Schlüssel für einen Krit-Typ.
 * @param {string} kurz Das Kürzel.
 * @returns {string} Der Tabellen-Schlüssel.
 */
export function mapCritName(kurz) {
    if (!kurz) return '';
    const map = {
        'P': 'Stich',
        'S': 'Streich',
        'K': 'Hieb'
    };
    const base = map[kurz] || kurz;
    const keys = Object.keys(state.tables || {});
    if (keys.includes(base)) return base;
    const alt = keys.find(k => k.toLowerCase().startsWith(base.toLowerCase()));
    return alt || '';
}