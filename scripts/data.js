// data.js
// Dieses Modul lädt die JSON-Daten und initialisiert die UI.

import {
    URLS,
    WEAPON_LABELS,
    WEAPON_ICONS,
    WEAPON_GROUPS,
    WEAPON_VARIANT_KEY_SET,
    WEAPON_SIZE_VARIANTS,
    WEAPON_SIZE_ORDER,
    WEAPON_SIZE_LABELS,
    formatCritTableLabel,
    resolveEnglishSupplementTableKeys
} from './constants.js';
import { state } from './state.js';
import { $, $$ } from './dom.js';
import { mapCritName, adjustWeaponFontSizes, clearAttackTableMergeCache } from './logic.js';
import { syncCombatMusic } from './combatMusic.js';

// Funktion zum Laden der JSON-Daten und Initialisieren der Benutzeroberfläche.
export async function loadData() {
    // Lädt die beiden JSON-Dateien parallel.
    const [t1, t2] = await Promise.all([fetch(URLS.TREFFER_URL), fetch(URLS.TABLES_URL)]);
    state.treffer = await t1.json();
    clearAttackTableMergeCache();
    state.tables = await t2.json();
    try {
        const t3 = await fetch(URLS.PATZER_URL);
        state.patzerTables = t3.ok ? await t3.json() : {};
    } catch { state.patzerTables = {}; }

    populateWeapons();
    initWeaponSizeClassListener();
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

function hideWeaponSizePopover() {
    const wrap = $('#weaponSizeWrap');
    if (wrap) {
        wrap.hidden = true;
        delete wrap.dataset.anchorWeapon;
    }
}

function positionWeaponSizePopover(anchorBtn) {
    const wrap = $('#weaponSizeWrap');
    if (!wrap || !anchorBtn || wrap.hidden) return;
    const r = anchorBtn.getBoundingClientRect();
    const left = r.left + r.width / 2;
    const top = r.top - 6;
    wrap.style.left = `${Math.round(left)}px`;
    wrap.style.top = `${Math.round(top)}px`;
    wrap.style.transform = 'translate(-50%, -100%)';
    wrap.dataset.anchorWeapon = anchorBtn.dataset.weapon || '';
}

let weaponPopoverResizeBound = false;
function bindWeaponPopoverResizeOnce() {
    if (weaponPopoverResizeBound) return;
    weaponPopoverResizeBound = true;
    window.addEventListener('resize', () => {
        const wrap = $('#weaponSizeWrap');
        if (!wrap || wrap.hidden || !wrap.dataset.anchorWeapon) return;
        const btn = document.querySelector(`#weaponWrap button[data-weapon="${wrap.dataset.anchorWeapon}"]`);
        if (btn) positionWeaponSizePopover(btn);
    });
}

let weaponPopoverOutsideBound = false;
function bindWeaponPopoverOutsideDismissOnce() {
    if (weaponPopoverOutsideBound) return;
    weaponPopoverOutsideBound = true;
    document.addEventListener(
        'pointerdown',
        (ev) => {
            const wrap = $('#weaponSizeWrap');
            if (!wrap || wrap.hidden) return;
            if (wrap.contains(ev.target)) return;
            if (ev.target.closest?.('#weaponWrap')) return;
            hideWeaponSizePopover();
        },
        true
    );
}

function showWeaponSizePopover(weaponKey, anchorBtn) {
    const wrap = $('#weaponSizeWrap');
    const sel = $('#weaponSizeClass');
    if (!wrap || !sel || !anchorBtn) return;

    bindWeaponPopoverResizeOnce();
    bindWeaponPopoverOutsideDismissOnce();

    sel.innerHTML = '';
    WEAPON_SIZE_ORDER.forEach((key) => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = WEAPON_SIZE_LABELS[key];
        sel.appendChild(opt);
    });

    const previous = state.selectedSizeClass;
    const valid = previous && WEAPON_SIZE_ORDER.includes(previous);
    sel.value = valid ? previous : 'klein';
    state.selectedSizeClass = sel.value;

    wrap.hidden = false;
    positionWeaponSizePopover(anchorBtn);
    requestAnimationFrame(() => positionWeaponSizePopover(anchorBtn));
    try {
        sel.focus({ preventScroll: true });
    } catch (_) {
        sel.focus();
    }
}

/**
 * Naturangriffe: Popover nur beim Klick über dem Button (anchorBtn), danach ausblenden.
 */
function syncWeaponSizeUI(weaponKey, anchorBtn = null) {
    if (!WEAPON_SIZE_VARIANTS[weaponKey]) {
        hideWeaponSizePopover();
        state.selectedSizeClass = null;
        return;
    }
    if (anchorBtn) {
        showWeaponSizePopover(weaponKey, anchorBtn);
    } else {
        hideWeaponSizePopover();
    }
}

export function initWeaponSizeClassListener() {
    const sel = $('#weaponSizeClass');
    if (!sel || sel.dataset.bound === '1') return;
    sel.dataset.bound = '1';
    sel.addEventListener('change', () => {
        state.selectedSizeClass = sel.value;
        hideWeaponSizePopover();
        syncCombatMusic();
    });
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
            syncWeaponSizeUI(k, btn);
            syncCombatMusic();
        });

        return btn;
    };

    const verwendeteKeys = new Set();

    const noVariantKey = (k) => !WEAPON_VARIANT_KEY_SET.has(k);

    for (const group of WEAPON_GROUPS) {
        const keysInGruppe = group.keys.filter(k => verfuegbareWaffen.has(k) && noVariantKey(k));
        keysInGruppe.forEach(k => {
            verwendeteKeys.add(k);
            wSelWrap.appendChild(createWeaponBtn(k));
        });
    }

    const fehlende = [...verfuegbareWaffen].filter(k => !verwendeteKeys.has(k) && noVariantKey(k)).sort();
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
    syncWeaponSizeUI(state.selectedWeapon);
    syncCombatMusic();
    // Sofort messen (gleicher Task wie DOM) — sonst ein Frame mit CSS-Fallback (14px) → sichtbarer Sprung nach unten.
    void wSelWrap.offsetHeight;
    adjustWeaponFontSizes();
    requestAnimationFrame(() => adjustWeaponFontSizes());
    if (document.fonts?.ready) {
        document.fonts.ready.then(() => {
            if ($('#simulatorPanel')?.classList.contains('hidden')) return;
            adjustWeaponFontSizes();
        });
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

    const englishSupplementKeys = resolveEnglishSupplementTableKeys(state.tables);
    if (englishSupplementKeys.length) {
        critCategories['Naturangriffe'] = englishSupplementKeys;
    }

    for (const [groupName, keys] of Object.entries(critCategories)) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = groupName;
        const seenLabels = new Set();

        keys.forEach(key => {
            if (state.tables[key]) {
                const label = formatCritTableLabel(key);
                const dedupeKey = `${groupName}|${label}`;
                if (seenLabels.has(dedupeKey)) return;
                seenLabels.add(dedupeKey);
                optgroup.appendChild(createOption(key, label));
            }
        });

        if (optgroup.children.length > 0) {
            dropdown.appendChild(optgroup);
        }
    }
}