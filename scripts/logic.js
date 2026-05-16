// logic.js
// Dieses Modul enthält die Kernlogik für die Berechnungen.

import { state } from './state.js';
import {
    WEAPON_LABELS,
    GEGNER_WEAPON_LABELS,
    WEAPON_SIZE_VARIANTS,
    GEGNER_SIZE_VARIANTS,
    WEAPON_SIZE_LABELS,
    RUESTUNG_TYP_LABELS,
    GEGNER_TYP_LABELS,
    coerceRuestungTyp,
    getGegnerTableKeyForWeapon,
    DEFAULT_RK,
    gegnerTypForGameRules
} from './constants.js';
import { getCorrection } from './critCorrections.js';
import { $, $$ } from './dom.js';
import { playCritAudio, tryStartBgAudio } from './audio.js';
import { chip, pill } from './dom.js';
import { getGegnerById, getCharakterById } from './campaigns.js';

const WEAPON_LABEL_MIN_PX = 10;
/** Absoluter Deckel (px); die effektive Obergrenze ist zusätzlich an die Tab-Schrift gekoppelt (siehe getAppTabLabelFontSizePx). */
const WEAPON_LABEL_MAX_PX = 20;
const WEAPON_LABEL_LH = 1.03;

/**
 * Berechnete Pixelgrösse wie bei `.app-tabs .tab` (0.8em / mobil 0.72em), damit Waffen-Labels nie grösser als Kampf/Status/… wirken.
 */
function getAppTabLabelFontSizePx() {
    const nav = document.querySelector('.app-tabs:not([hidden])') || document.querySelector('.app-tabs');
    const tab = nav?.querySelector('.tab');
    if (!tab) return 12.8;
    const px = parseFloat(window.getComputedStyle(tab).fontSize);
    return Number.isFinite(px) && px > 0 ? px : 12.8;
}

/**
 * Intrinsic width of one line (nowrap) — block-level span.scrollWidth with width:100% equals the tile, not the text.
 */
function measureWeaponLineWidth(line, fontSizePx, fontFamily, fontWeight, fontStyle) {
    const p = document.createElement('span');
    p.textContent = line;
    p.setAttribute('aria-hidden', 'true');
    p.style.cssText = [
        'position:fixed',
        'left:-10000px',
        'top:0',
        'visibility:hidden',
        'white-space:nowrap',
        'pointer-events:none',
        `font-size:${fontSizePx}px`,
        `line-height:${fontSizePx * WEAPON_LABEL_LH}px`,
        `font-family:${fontFamily}`,
        `font-weight:${fontWeight}`,
        `font-style:${fontStyle}`
    ].join(';');
    document.body.appendChild(p);
    const w = p.scrollWidth;
    p.remove();
    return w;
}

/**
 * Wählt die grösste Schrift, bei der der Text (inkl. \n-Umbrüche aus WEAPON_LABELS) in die Zelle passt.
 * Berücksichtigt Padding von Button und Span (sonst wirkt scrollWidth zu gross).
 */
export function adjustWeaponFontSizes() {
    // Wenn der Kampf-Tab nicht aktiv ist, haben die Buttons oft clientWidth 0 — Messung würde alles auf Min-Schrift setzen.
    if ($('#simulatorPanel')?.classList.contains('hidden')) return;

    const fsCap = Math.min(WEAPON_LABEL_MAX_PX, getAppTabLabelFontSizePx());

    const weaponButtons = $$('#weaponWrap button');
    weaponButtons.forEach(button => {
        const span = button.querySelector('span');
        if (!span) return;

        if (button.clientWidth < 4 || button.clientHeight < 4) return;

        span.style.removeProperty('font-size');
        span.style.removeProperty('line-height');
        void span.offsetWidth;

        const btnStyle = window.getComputedStyle(button);
        const padX = parseFloat(btnStyle.paddingLeft) + parseFloat(btnStyle.paddingRight);
        const padY = parseFloat(btnStyle.paddingTop) + parseFloat(btnStyle.paddingBottom);
        const spStyle = window.getComputedStyle(span);
        const spanPadX = parseFloat(spStyle.paddingLeft) + parseFloat(spStyle.paddingRight);
        const spanPadY = parseFloat(spStyle.paddingTop) + parseFloat(spStyle.paddingBottom);
        const safety = 0;
        const maxW = Math.max(8, button.clientWidth - padX - spanPadX - safety);
        /** Etwas enger als die Kachel — verhindert Rundungs-/Subpixel-Umbrüche mitten im Wort (Rapier, Knüppel). */
        const layoutW = Math.max(4, maxW - 3);
        const maxH = Math.max(16, button.clientHeight - padY - spanPadY - safety);

        const baseFam = spStyle.fontFamily;
        const baseWt = spStyle.fontWeight;
        const baseSt = spStyle.fontStyle;
        const lines = (span.textContent || '').split('\n');

        let chosen = WEAPON_LABEL_MIN_PX;
        for (let fs = fsCap; fs >= WEAPON_LABEL_MIN_PX; fs -= 0.5) {
            span.style.fontSize = `${fs}px`;
            span.style.lineHeight = `${fs * WEAPON_LABEL_LH}px`;
            const wOk = lines.every(line => {
                const li = line.replace(/\r/g, '');
                if (!li.trim()) return true;
                return measureWeaponLineWidth(li, fs, baseFam, baseWt, baseSt) <= layoutW + 1;
            });
            span.style.setProperty('white-space', 'pre-line', 'important');
            span.style.setProperty('width', '100%', 'important');
            void span.offsetWidth;
            const hOk = span.scrollHeight <= maxH + 1.5;
            if (wOk && hOk) {
                chosen = fs;
                break;
            }
        }
        span.style.removeProperty('white-space');
        span.style.removeProperty('width');
        span.style.setProperty('font-size', `${chosen}px`, 'important');
        span.style.setProperty('line-height', `${chosen * WEAPON_LABEL_LH}px`, 'important');
    });
}

/**
 * Findet den nächstniedrigeren Schlüssel in einem Objekt mit nummerischen Schlüsseln.
 * @param {object} obj Das Objekt.
 * @param {number} target Der Zielwert.
 * @returns {number|null} Der gefundene Schlüssel oder null.
 */
/** Krit-Typ-Kürzel aus Spieler-Waffentabelle bei gleichem Angriffswert/RK (Schatten: nur für Krit-Art). */
function getWeaponCritTypAtAttack(weaponKey, attackValue, rk, sizeClass) {
    if (!weaponKey || isNaN(attackValue) || attackValue <= 0) return '';
    const sizeClassNat = WEAPON_SIZE_VARIANTS[weaponKey] ? (sizeClass || 'klein') : null;
    const block = resolveAttackTable(weaponKey, sizeClassNat);
    const row = block?.RK?.[String(rk)];
    if (!row) return '';
    const fk = floorKey(row, attackValue);
    if (fk === null) return '';
    return row[String(fk)]?.krit_typ || '';
}

function floorKey(obj, target) {
    const keys = Object.keys(obj).map(k => parseInt(k, 10)).filter(n => !Number.isNaN(n)).sort((a, b) => a - b);
    let best = null;
    for (const k of keys) {
        if (k <= target) best = k;
        else break;
    }
    return best;
}

/** Cache für gemergte Naturangriffs-Tabellen (Schlüssel: `${weaponKey}|${sizeClass}`). */
const attackTableMergeCache = new Map();

/** Cache für gemergte Gegner-Angriffstabellen. */
const gegnerAttackTableMergeCache = new Map();

export function clearGegnerAttackTableMergeCache() {
    gegnerAttackTableMergeCache.clear();
}

export function clearAttackTableMergeCache() {
    attackTableMergeCache.clear();
    clearGegnerAttackTableMergeCache();
}

function gegnerVariantKeysForGroesse(groesse, variants) {
    const { klein, mittel, gross } = variants;
    if (groesse === 'klein') return [klein];
    if (groesse === 'normal') return [];
    if (groesse === 'gross' || groesse === 'gewaltig') return [klein, mittel, gross];
    return [];
}

/**
 * Gegner-Angriffstabelle (Ruestung-Spalten), mit Merge für ZuK/RuS je nach Angreifer-Grösse.
 */
export function resolveGegnerAttackTable(weaponKey, angreiferGroesse) {
    const tabellen = state.treffer?.GegnerAngriffstabellen;
    const base = tabellen?.[weaponKey];
    if (!base?.Ruestung) return base;

    const variants = GEGNER_SIZE_VARIANTS[weaponKey];
    if (!variants) return base;

    const groesse = angreiferGroesse || 'klein';
    const cacheKey = `${weaponKey}|${groesse}`;
    if (gegnerAttackTableMergeCache.has(cacheKey)) {
        return gegnerAttackTableMergeCache.get(cacheKey);
    }

    const vKeys = gegnerVariantKeysForGroesse(groesse, variants);
    const colSet = new Set(['PL', 'KE', 'VL', 'LE', 'OR']);
    Object.keys(base.Ruestung).forEach((c) => colSet.add(c));
    for (const vk of vKeys) {
        const ext = tabellen?.[vk]?.Ruestung;
        if (ext) Object.keys(ext).forEach((c) => colSet.add(c));
    }

    const mergedRuestung = {};
    for (const col of colSet) {
        const row = { ...(base.Ruestung[col] || {}) };
        for (const vk of vKeys) {
            const ext = tabellen?.[vk]?.Ruestung?.[col];
            if (ext && typeof ext === 'object') Object.assign(row, ext);
        }
        if (Object.keys(row).length) mergedRuestung[col] = row;
    }

    const merged = { ...base, Ruestung: mergedRuestung };
    gegnerAttackTableMergeCache.set(cacheKey, merged);
    return merged;
}

function variantTableKeysForSizeClass(sizeClass, variants) {
    const { klein, mittel, gross } = variants;
    if (sizeClass === 'klein') return [klein];
    if (sizeClass === 'mittel') return [klein, mittel];
    if (sizeClass === 'gross' || sizeClass === 'riesig') return [klein, mittel, gross];
    return [klein];
}

/**
 * Liefert den Angriffsblock (mit RK-Zeilen): bei Naturangriffen Merge aus Basis + Varianten.
 */
export function resolveAttackTable(weaponKey, sizeClass) {
    const tabellen = state.treffer?.Angriffstabellen;
    const base = tabellen?.[weaponKey];
    if (!base?.RK) return base;

    const variants = WEAPON_SIZE_VARIANTS[weaponKey];
    if (!variants) return base;

    const sc = sizeClass || 'klein';
    const cacheKey = `${weaponKey}|${sc}`;
    if (attackTableMergeCache.has(cacheKey)) {
        return attackTableMergeCache.get(cacheKey);
    }

    const vKeys = variantTableKeysForSizeClass(sc, variants);
    const rkSet = new Set(Object.keys(base.RK));
    for (const vk of vKeys) {
        const rkExt = tabellen?.[vk]?.RK;
        if (rkExt && typeof rkExt === 'object') {
            Object.keys(rkExt).forEach((rk) => rkSet.add(rk));
        }
    }

    const mergedRK = {};
    for (const rk of rkSet) {
        const row = { ...(base.RK[rk] || {}) };
        for (const vk of vKeys) {
            const ext = tabellen?.[vk]?.RK?.[rk];
            if (ext && typeof ext === 'object') Object.assign(row, ext);
        }
        mergedRK[rk] = row;
    }

    const merged = { ...base, RK: mergedRK };
    attackTableMergeCache.set(cacheKey, merged);
    return merged;
}

/**
 * Berechnet den Angriff und die Trefferpunkte.
 */
export function calculateAttack() {
    const weaponKey = state.selectedWeapon;
    const isMonsterAttack = state.angreiferSubTab === 'monster';
    const firstId = (state.selectedGegnerIds || [])[0] || null;
    const zielGegner = firstId ? getGegnerById(firstId) : null;
    const zielChar = !zielGegner && firstId ? getCharakterById(firstId) : null;
    const ziel = zielGegner || zielChar?.char;
    const rk = ziel
        ? Math.max(1, Math.min(20, parseInt(ziel.rk, 10) || 20))
        : DEFAULT_RK;
    const ruestungTyp = coerceRuestungTyp(ziel?.ruestungTyp);
    const attack = parseInt($('#attack').value, 10);
    const out = $('#attackOut');
    const kpi = $('#attackKpi');
    const res = out.querySelector('.result');

    kpi.innerHTML = '';
    res.innerHTML = '';
    res.classList.remove('muted');
    state.lastAttackTp = 0;

    let lookupBlock;
    let defenseLabel;
    let gegnerTableKey = '';
    if (isMonsterAttack) {
        const angreiferGroesse = state.schattenMusikKategorie || 'klein';
        gegnerTableKey = getGegnerTableKeyForWeapon(weaponKey);
        if (!gegnerTableKey) {
            res.textContent = '⚠️ Keine Zuordnung zur Gegner-Angriffstabelle für diese Waffe.';
            return;
        }
        const weaponBlock = resolveGegnerAttackTable(gegnerTableKey, angreiferGroesse);
        if (!weaponKey || !weaponBlock?.Ruestung) {
            res.textContent = '⚠️ Keine Gegner-Angriffsdaten gefunden.';
            return;
        }
        lookupBlock = weaponBlock.Ruestung[ruestungTyp];
        defenseLabel = `Rüstung: ${RUESTUNG_TYP_LABELS[ruestungTyp] || ruestungTyp} (${ruestungTyp})`;
        if (!lookupBlock) {
            res.textContent = `Keine Daten für Rüstung ${ruestungTyp}.`;
            return;
        }
    } else {
        const sizeClassNat = WEAPON_SIZE_VARIANTS[weaponKey]
            ? (state.selectedSizeClass || 'klein')
            : null;
        const weaponBlock = resolveAttackTable(weaponKey, sizeClassNat);
        if (!weaponKey || !weaponBlock?.RK) {
            res.textContent = '⚠️ Keine Angriffsdaten gefunden.';
            return;
        }
        lookupBlock = weaponBlock.RK[String(rk)];
        defenseLabel = `RK: ${rk}`;
        if (!lookupBlock) {
            res.textContent = `Keine Daten für RK ${rk}.`;
            return;
        }
    }

    if (isNaN(attack)) {
        res.textContent = 'Bitte einen Angriffswert eingeben.';
        return;
    }

    let remainingAttack = attack;
    let totalTp = 0;
    let firstKrit = {
        typ: '',
        kat: '',
        cellTypRaw: ''
    };
    let isFirstLookup = true;
    const calculationSteps = [];

    if (attack <= 0) {
        res.textContent = 'Kein Schaden bei Angriffswert ≤ 0.';
        const waffeChip = (WEAPON_LABELS[weaponKey] || weaponKey.replace(/_/g, ' ')).replace(/\n/g, ' ');
        kpi.append(chip(`Waffe: ${waffeChip}`));
        if (WEAPON_SIZE_VARIANTS[weaponKey]) {
            const kl = WEAPON_SIZE_LABELS[state.selectedSizeClass || 'klein'] || state.selectedSizeClass;
            kpi.append(chip(`Klasse: ${kl}`));
        }
        if (isMonsterAttack) {
            const groesse = state.schattenMusikKategorie || 'klein';
            kpi.append(chip(`Angreifer: ${GEGNER_TYP_LABELS?.[groesse] || groesse}`));
            if (gegnerTableKey) {
                kpi.append(chip(`Treffertabelle: ${GEGNER_WEAPON_LABELS[gegnerTableKey] || gegnerTableKey}`));
            }
        }
        kpi.append(chip(defenseLabel));
        kpi.append(chip(`Angriffswert: ${attack}`));
        return;
    }

    while (remainingAttack > 0) {
        const fk = floorKey(lookupBlock, remainingAttack);
        if (fk === null) {
            calculationSteps.push({
                attack: remainingAttack,
                tp: 0,
                key: '(< Minimum)'
            });
            break;
        }

        const entry = lookupBlock[String(fk)];
        const currentTp = entry.trefferpunkte ?? 0;
        totalTp += currentTp;
        calculationSteps.push({
            attack: remainingAttack,
            tp: currentTp,
            key: fk
        });

        if (isFirstLookup) {
            firstKrit.kat = entry.krit_kat || '';
            firstKrit.cellTypRaw = entry.krit_typ || '';
            if (!isMonsterAttack) {
                firstKrit.typ = entry.krit_typ || '';
            }
            isFirstLookup = false;
        }

        remainingAttack -= 150;
    }

    const gegnerTyp = gegnerTypForGameRules(ziel ? (ziel.gegnerTyp || 'normal') : 'normal');
    let minKat = 'A';
    if (gegnerTyp === 'gross') minKat = 'B';
    if (gegnerTyp === 'gewaltig') minKat = 'D';

    const rawKat = firstKrit.kat;
    const kannKritWuerfeln = firstKrit.kat && firstKrit.kat >= minKat;

    if (!kannKritWuerfeln) {
        firstKrit = {
            typ: '',
            kat: '',
            cellTypRaw: ''
        };
    }

    let resolvedCritTyp = '';
    if (kannKritWuerfeln) {
        const weaponCritRaw = isMonsterAttack
            ? getWeaponCritTypAtAttack(weaponKey, attack, rk, state.selectedSizeClass)
            : firstKrit.typ;
        const baseTyp = resolveAutoCritTableKey(weaponCritRaw, weaponKey)
            || mapCritName(weaponCritRaw)
            || weaponCritRaw;
        resolvedCritTyp = resolveCritTableForTarget({
            baseTyp,
            cellTypRaw: isMonsterAttack ? firstKrit.cellTypRaw : firstKrit.typ,
            ziel
        });
        firstKrit.typ = resolvedCritTyp;
    }

    state.autoCrit = {
        typ: resolvedCritTyp,
        kat: firstKrit.kat || ''
    };

    const label = (WEAPON_LABELS[weaponKey] || weaponKey.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())).replace(/\n/g, ' ');
    kpi.append(chip(`Waffe: ${label}`));
    if (WEAPON_SIZE_VARIANTS[weaponKey]) {
        const kl = WEAPON_SIZE_LABELS[state.selectedSizeClass || 'klein'] || state.selectedSizeClass;
        kpi.append(chip(`Klasse: ${kl}`));
    }
    if (isMonsterAttack) {
        const groesse = state.schattenMusikKategorie || 'klein';
        kpi.append(chip(`Angreifer: ${GEGNER_TYP_LABELS[groesse] || groesse}`));
        if (gegnerTableKey) {
            kpi.append(chip(`Treffertabelle: ${GEGNER_WEAPON_LABELS[gegnerTableKey] || gegnerTableKey}`));
        }
    }
    kpi.append(chip(defenseLabel));
    kpi.append(chip(`Angriffswert: ${attack}`));

    state.lastAttackTp = totalTp;

    const pillz = document.createElement('div');
    pillz.className = 'kpi';
    pillz.append(pill('Gesamttreffer', String(totalTp), 'ok'));

    if (gegnerTyp === 'gross' || gegnerTyp === 'gewaltig') {
        pillz.append(pill('Schadenskategorie', rawKat || '—', ''));
        if (kannKritWuerfeln) {
            pillz.append(pill('Krit', `${firstKrit.typ} (ab ${minKat})`, 'warn'));
        } else {
            const hinweis = gegnerTyp === 'gross' ? 'Krit erst ab B würfeln' : 'Krit erst ab D würfeln';
            pillz.append(pill('Krit', hinweis, ''));
        }
    } else if (state.autoCrit.typ && state.autoCrit.kat) {
        pillz.append(pill('Krit', `${firstKrit.typ}-${firstKrit.kat}`, 'warn'));
    } else {
        pillz.append(pill('Krit', '—', ''));
    }

    if (state.autoCrit.typ && (state.autoCrit.kat || kannKritWuerfeln)) {
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
            critCatDropdown.value = kritKategorien.includes('Normal') ? 'Normal' : kritKategorien[0] || '';
        } else {
            critCatDropdown.innerHTML = '';
            const normalCategories = ['A', 'B', 'C', 'D', 'E'];
            normalCategories.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat;
                opt.textContent = cat;
                critCatDropdown.appendChild(opt);
            });
            critCatDropdown.value = state.autoCrit.kat || 'A';
        }
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
        if (matchRange(key, roll)) {
            const entry = cat[key];
            const baseVisual = typeof entry === 'object' && entry?.visual != null ? entry.visual : String(entry ?? '');
            const baseTts = typeof entry === 'object' && entry?.tts != null ? entry.tts : String(entry ?? '');
            const corr = getCorrection(typ, kat, key);
            const visual = corr?.visual !== undefined && corr.visual !== '' ? corr.visual : baseVisual;
            const tts = corr?.tts !== undefined && corr.tts !== '' ? corr.tts : baseTts;
            return {
                entry: { visual, tts },
                key
            };
        }
    }
    return null;
}

export function lookupPatzerEntry(kategorie, roll) {
    const patzer = state.patzerTables?.[kategorie] || [];
    for (const entry of patzer) {
        if (matchRange(entry.range, roll)) {
            return entry;
        }
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
    if (range.endsWith('+')) {
        const min = z(range.slice(0, -1));
        return roll >= min;
    }
    // Zwei Grenzen mit Bindestrich (inkl. negative Untergrenze, z. B. -100 bis 5).
    // Nicht split('-') nutzen: "-100-5" würde sonst falsch zerlegt.
    const twoPart = range.match(/^(-?\d+)-(\d+)$/);
    if (twoPart) {
        const a = parseInt(twoPart[1], 10);
        const b = parseInt(twoPart[2], 10);
        return roll >= a && roll <= b;
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
        'T': 'Stich',
        'S': 'Streich',
        'K': 'Hieb'
    };
    const base = map[kurz] || kurz;
    const keys = Object.keys(state.tables || {});
    if (keys.includes(base)) return base;
    const alt = keys.find(k => k.toLowerCase().startsWith(base.toLowerCase()));
    return alt || '';
}

/**
 * Krit-Tabelle für das Ziel: gewaltig/gross > Tiny (nur wenn nicht gross/gewaltig) > Held > Basis-Typ.
 * @param {{ baseTyp: string, cellTypRaw: string, ziel: object|null }} opts
 */
export function resolveCritTableForTarget({ baseTyp, cellTypRaw, ziel }) {
    const gegnerTyp = gegnerTypForGameRules(ziel?.gegnerTyp || 'normal');
    if (gegnerTyp === 'gewaltig') return 'Gewaltige Wesen';
    if (gegnerTyp === 'gross') return 'Grosse Wesen';

    const raw = String(cellTypRaw || '').trim().toUpperCase();
    if (raw === 'T' || raw === 'TA') {
        const keys = Object.keys(state.tables || {});
        if (keys.includes('Kleine_Tiere')) return 'Kleine_Tiere';
        const alt = keys.find((k) => {
            const l = k.toLowerCase();
            return l.includes('kleine') && l.includes('tier');
        });
        if (alt) return alt;
    }

    let typ = String(baseTyp || '').trim();
    if (!typ) return '';
    typ = mapCritName(typ) || typ;

    if (ziel?.istHeld) {
        const heldKey = `${typ} (Held)`;
        if (state.tables?.[heldKey]) return heldKey;
    }

    return typ;
}

function findEnglishCritTableByKeywords(keywords = []) {
    const keys = Object.keys(state.tables || {}).filter((k) =>
        String(k).startsWith('Englisch_') ||
        ['Ungleichgewicht', 'Kleine_Tiere', 'Feger_Und_Wuerfe', 'Schlaege', 'Greifen_Ringkampf'].includes(String(k))
    );
    if (!keys.length) return '';
    const lowered = keys.map((k) => ({ key: k, l: k.toLowerCase() }));
    const match = lowered.find(({ l }) => keywords.some((kw) => l.includes(kw)));
    return match?.key || '';
}

function resolveAutoCritTableKey(rawTyp, weaponKey) {
    let typ = String(rawTyp || '').trim().toUpperCase();
    const weapon = String(weaponKey || '').trim().toUpperCase();

    // Viele Naturangriffs-Codes kommen als "F*" (z.B. FP/FK/FU/FG/FS); für die
    // Tabellenwahl reicht der Basistyp ohne Präfix.
    if (typ.length >= 2 && typ.startsWith('F')) typ = typ.slice(1);

    // Direkte Zuordnung über Krit-Typ-Kürzel aus Angriffstabelle
    if (typ === 'MS') {
        if (weapon === 'SCHLAGEN') return findEnglishCritTableByKeywords(['schlag', 'schlaege', 'schläge', 'striking']);
        return findEnglishCritTableByKeywords(['feger', 'wuerfe', 'würfe', 'sweeps_and_throws']);
    }
    if (typ === 'MA') {
        return findEnglishCritTableByKeywords(['schlag', 'schlaege', 'schläge', 'striking']);
    }
    if (typ === 'G') {
        return findEnglishCritTableByKeywords(['grappling', 'greifen', 'griff', 'ringkampf', 'ringen']);
    }
    if (typ === 'U') {
        return findEnglishCritTableByKeywords(['unbalancing', 'gleichgewicht', 'ungleichgewicht', 'ausbalancier']);
    }
    if (typ === 'TA' || typ === 'T') {
        return findEnglishCritTableByKeywords(['tiny_animal', 'tiere', 'tier']);
    }

    // Klassische Kürzel/Namen erst NACH den Naturangriff-Codes mappen,
    // sonst wird z.B. "G" fälschlich zu "Grosse/Gewaltige Wesen".
    const mapped = mapCritName(typ) || mapCritName(rawTyp);
    if (mapped) return mapped;

    // Fallback über gewählte Naturangriffs-Waffe nur dann, wenn kein explizites
    // (gemapptes) Ziel wie "Grosse/Gewaltige Wesen" ermittelt wurde.
    if (weapon === 'FEGEN') return findEnglishCritTableByKeywords(['feger', 'wuerfe', 'würfe', 'sweeps_and_throws']);
    if (weapon === 'SCHLAGEN') return findEnglishCritTableByKeywords(['schlag', 'schlaege', 'schläge', 'striking']);
    if (weapon === 'GREIFEN') return findEnglishCritTableByKeywords(['grappling', 'greifen', 'griff', 'ringkampf', 'ringen']);
    if (weapon === 'KLEINTIERE') return findEnglishCritTableByKeywords(['tiny_animal', 'tiere', 'tier']);

    return rawTyp || '';
}