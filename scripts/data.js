// data.js
// Dieses Modul lädt die JSON-Daten und initialisiert die UI.

import { URLS, DEFAULT_RK, WEAPON_LABELS, WEAPON_ICONS, WEAPON_GROUPS } from './constants.js';
import { state } from './state.js';
import { $, $$ } from './dom.js';
import { mapCritName, adjustWeaponFontSizes } from './logic.js';

// Funktion zum Laden der JSON-Daten und Initialisieren der Benutzeroberfläche.
export async function loadData() {
    // Lädt die beiden JSON-Dateien parallel.
    const [t1, t2] = await Promise.all([fetch(URLS.TREFFER_URL), fetch(URLS.TABLES_URL)]);
    state.treffer = await t1.json();
    state.tables = await t2.json();

    populateWeapons();
    populateRkButtons();
    populateCritDropdowns($('#critType'), true);
    populateCritDropdowns($('#sideType'), false);

    // Initiales Befüllen des Krit-Kategorie-Dropdowns.
    const critCatDropdown = $('#critCat');
    const defaultCritTable = state.tables?.['Stich'];
    if (defaultCritTable) {
        const categories = Object.keys(defaultCritTable).filter(k => k !== 'audioFile');
        categories.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.textContent = cat;
            critCatDropdown.appendChild(opt);
        });
    }

    // Standardauswahl für Nebentreffer-Dropdown.
    const sideSel = $('#sideType');
    if (sideSel.options.length > 1) {
        sideSel.value = sideSel.options[1].value;
        sideSel.dispatchEvent(new Event('change'));
    }
}

// Erzeugt die Buttons für die Waffen (gruppiert).
function populateWeapons() {
    const wSelWrap = $('#weaponWrap');
    const angriffstabellen = state.treffer?.Angriffstabellen || {};
    const verfuegbareWaffen = new Set(Object.keys(angriffstabellen));
    wSelWrap.innerHTML = '';

    const createWeaponBtn = (k) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'weapon-button';
        btn.dataset.weapon = k;

        const displayName = WEAPON_LABELS[k] || k.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
        const label = document.createElement('span');
        label.textContent = displayName;
        btn.appendChild(label);

        const icon = WEAPON_ICONS[k];
        if (icon) {
            const iconPath = URLS.ICONS_BASE_PATH + icon.replace(/ /g, '%20');
            btn.style.backgroundImage = `url(${iconPath})`;
        }

        btn.addEventListener('click', () => {
            $$('#weaponWrap button').forEach(x => x.classList.remove('active'));
            btn.classList.add('active');
            state.selectedWeapon = k;
        });

        return btn;
    };

    const verwendeteKeys = new Set();

    for (const group of WEAPON_GROUPS) {
        const keysInGruppe = group.keys.filter(k => verfuegbareWaffen.has(k));
        keysInGruppe.forEach(k => {
            verwendeteKeys.add(k);
            wSelWrap.appendChild(createWeaponBtn(k));
        });
    }

    const fehlende = [...verfuegbareWaffen].filter(k => !verwendeteKeys.has(k)).sort();
    fehlende.forEach(k => wSelWrap.appendChild(createWeaponBtn(k)));

    const ersteWaffe = (() => {
        for (const group of WEAPON_GROUPS) {
            const k = group.keys.find(key => verfuegbareWaffen.has(key));
            if (k) return k;
        }
        return fehlende[0] || null;
    })();
    if (ersteWaffe) {
        const defaultWeaponBtn = $(`#weaponWrap button[data-weapon="${ersteWaffe}"]`);
        if (defaultWeaponBtn) {
            defaultWeaponBtn.classList.add('active');
            state.selectedWeapon = ersteWaffe;
        }
    }
    adjustWeaponFontSizes();
}

// Erzeugt die Buttons für die Rüstungsklassen (RK).
function populateRkButtons() {
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
        if (i === DEFAULT_RK) b.classList.add('active');
        rkWrap.appendChild(b);
    }
}

// Befüllt die Krit-Typ-Dropdown-Menüs.
function populateCritDropdowns(dropdown, isMainCrit = true) {
    dropdown.innerHTML = '';
    const createOption = (value, text) => {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = text;
        return opt;
    };

    if (isMainCrit) {
        dropdown.appendChild(createOption('', '(automatisch aus Schritt 1 übernommen)'));
    } else {
        dropdown.appendChild(createOption('', '(eine wählen)'));
    }

    const critCategories = {
        'Normal': ['Hieb', 'Stich', 'Stoss', 'Streich'],
        'Magisch': ['Elektro', 'Hitze', 'Kälte', 'Schlag'],
        'Gross & Gewaltig': ['Grosse Wesen', 'Gewaltige Wesen'],
        'Helden': ['Hieb (Held)', 'Stich (Held)', 'Stoss (Held)', 'Streich (Held)'],
        'Patzer': ['Allgemeine Patzer']
    };

    if (!isMainCrit) {
        delete critCategories['Helden'];
        delete critCategories['Patzer'];
    }

    for (const [groupName, keys] of Object.entries(critCategories)) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = groupName;

        keys.forEach(key => {
            if (state.tables[key]) {
                optgroup.appendChild(createOption(key, key.replace(/_/g, ' ')));
            }
        });

        if (optgroup.children.length > 0) {
            dropdown.appendChild(optgroup);
        }
    }
}