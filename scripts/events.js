// events.js
// Dieses Modul enthält alle Event-Listener der App.

import { state } from './state.js';
import { $ } from './dom.js';
import { URLS, PATZER_CONTEXT_MODS, resolveCritIcon, formatCritTableLabel } from './constants.js';
import { calculateAttack, lookupCritEntry, mapCritName, adjustWeaponFontSizes, resolveEffectiveCritRoll } from './logic.js';
import { playCritAudio, tryStartBgAudio } from './audio.js';
import { chip } from './dom.js';
import { applySchaden, applySchadenCharakter, getGegnerById, getSpielerById, getNpcById, getAktuelleRunde, getCharakterById } from './campaigns.js';
import { refreshKampftracker } from './kampftracker.js';
import { parseCritText } from './critParser.js';
import { setCorrection, deleteCorrection, exportCorrections } from './critCorrections.js';

/**
 * Fügt das Krit-Icon in die KPI-Zeile ein (falls vorhanden).
 * @param {HTMLElement} kpi Das KPI-Element
 * @param {string} typ Der Krit-Typ (z.B. Stich, Elektro)
 */
function appendCritIcon(kpi, typ) {
    const isSupplement = String(typ).startsWith('Englisch_')
        || ['Ungleichgewicht', 'Kleine_Tiere', 'Feger_Und_Wuerfe', 'Schlaege', 'Greifen_Ringkampf'].includes(String(typ));
    const iconFile = resolveCritIcon(typ) || (isSupplement ? 'stich.png' : null);
    if (iconFile) {
        const img = document.createElement('img');
        const iconPath = URLS.ICONS_BASE_PATH + iconFile;
        img.src = new URL(iconPath, window.location.href).href;
        img.alt = typ;
        img.className = 'crit-kpi-icon';
        img.loading = 'eager';
        kpi.prepend(img);
    }
}

const applySchadenPayloads = new Map();
let applySchadenButtonId = 0;

function closeCritEditOverlay() {
    $('#critEditOverlay')?.classList.add('hidden');
}

function applyCritCorrectionAndClose(visual, tts) {
    const ctx = state.lastCritContext;
    if (!ctx) return closeCritEditOverlay();
    setCorrection(ctx.typ, ctx.kat, ctx.key, { visual, tts });
    state.lastCritVisual = visual;
    state.lastCritTts = tts;
    const parsed = parseCritText(visual);
    if (parsed.tp === 0) parsed.tp = parseCritText(tts).tp;
    state.lastCritTp = parsed.tp;
    state.lastCritParsed = parsed;
    const res = ctx.source === 'crit' ? $('#critOut .result') : $('#sideOut .result');
    const wrap = ctx.source === 'crit' ? $('#critApplyWrap') : $('#sideApplyWrap');
    if (res) res.textContent = visual;
    wrap.innerHTML = '';
    appendApplySchadenButton(wrap, 'crit', parsed);
    playCritAudio(ctx.typ, ctx.kat, ctx.key, tts);
    closeCritEditOverlay();
}

function initCritEditOverlay() {
    const overlay = $('#critEditOverlay');
    const visualEl = $('#critEditVisual');
    const ttsEl = $('#critEditTts');

    function openOverlay() {
        const ctx = state.lastCritContext;
        if (!ctx) return;
        if (visualEl) visualEl.value = state.lastCritVisual ?? '';
        if (ttsEl) ttsEl.value = state.lastCritTts ?? '';
        overlay?.classList.remove('hidden');
    }

    $('#critEditBtn')?.addEventListener('click', openOverlay);
    $('#sideEditBtn')?.addEventListener('click', openOverlay);

    $('#critEditSave')?.addEventListener('click', () => {
        const visual = visualEl?.value?.trim() ?? '';
        const tts = ttsEl?.value?.trim() ?? '';
        applyCritCorrectionAndClose(visual, tts);
    });

    $('#critEditRevert')?.addEventListener('click', () => {
        const ctx = state.lastCritContext;
        if (!ctx) return closeCritEditOverlay();
        deleteCorrection(ctx.typ, ctx.kat, ctx.key);
        const roll = ctx.source === 'crit' ? parseInt($('#critRoll').value, 10) : parseInt($('#sideRoll').value, 10);
        const effectiveRoll = ctx.source === 'crit'
            ? resolveEffectiveCritRoll(roll, !!state.autoCrit.tMinus50)
            : roll;
        const found = lookupCritEntry(ctx.typ, ctx.kat, effectiveRoll);
        const origVisual = found?.entry?.visual ?? state.lastCritVisual ?? '';
        const origTts = found?.entry?.tts ?? state.lastCritTts ?? '';
        state.lastCritVisual = origVisual;
        state.lastCritTts = origTts;
        const parsed = parseCritText(origVisual);
        if (parsed.tp === 0) parsed.tp = parseCritText(origTts).tp;
        state.lastCritTp = parsed.tp;
        state.lastCritParsed = parsed;
        const res = ctx.source === 'crit' ? $('#critOut .result') : $('#sideOut .result');
        const wrap = ctx.source === 'crit' ? $('#critApplyWrap') : $('#sideApplyWrap');
        if (res) res.textContent = origVisual;
        wrap.innerHTML = '';
        appendApplySchadenButton(wrap, 'crit', parsed);
        playCritAudio(ctx.typ, ctx.kat, ctx.key, origTts);
        closeCritEditOverlay();
    });

    $('#critEditClose')?.addEventListener('click', closeCritEditOverlay);
    $('#critEditCancel')?.addEventListener('click', closeCritEditOverlay);

    overlay?.addEventListener('click', (e) => {
        if (e.target === overlay) closeCritEditOverlay();
    });

    $('#critEditExport')?.addEventListener('click', () => {
        const json = exportCorrections();
        const blob = new Blob([json], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'merp_crit_korrekturen.json';
        a.click();
        URL.revokeObjectURL(a.href);
    });
}

/**
 * Fügt einen "Schaden anwenden"-Button hinzu, wenn Ziel gewählt und TP > 0 oder Status.
 * @param {HTMLElement} wrapContainer Der Wrap-Container (z.B. #critApplyWrap)
 * @param {'attack'|'crit'} quelle
 * @param {{ tp?: number, ben?: number, benoPar?: number, oPar?: number, init?: number, tpPerRound?: number, ko?: boolean }} [parsedOverride] Bei 'crit': geparstes Objekt direkt übergeben
 * @param {{ zielIds?: string[], tpOverride?: number, beschreibungOverride?: string, vonCharakter?: { id: string, name: string } | null }} [applyOpts] Optional: Ziele/Text/Attribution überschreiben
 */
function appendApplySchadenButton(wrapContainer, quelle, parsedOverride = null, applyOpts = null) {
    if (!wrapContainer) return;
    const zielIds = (applyOpts?.zielIds && applyOpts.zielIds.length > 0)
        ? applyOpts.zielIds
        : (state.selectedGegnerIds || []);
    if (zielIds.length === 0) return;
    const livingIds = zielIds.filter(id => {
        const g = getGegnerById(id);
        if (g) return g.tp > 0;
        const s = getSpielerById(id);
        if (s) return (s.tp ?? s.maxTp ?? 100) > 0;
        const n = getNpcById(id);
        if (n) return (n.tp ?? n.maxTp ?? 100) > 0;
        return false;
    });
    const allDead = livingIds.length === 0;
    const tp = quelle === 'attack'
        ? state.lastAttackTp
        : (applyOpts?.tpOverride != null ? applyOpts.tpOverride : state.lastCritTp);
    const parsed = parsedOverride ?? (quelle === 'crit' ? state.lastCritParsed : null);
    const hasStatus = parsed && (
        (parsed.ben || 0) + (parsed.benoPar || 0) + (parsed.oPar || 0) +
        (parsed.init || 0) + (parsed.tpPerRound || 0) > 0 || parsed.ko
    );
    const applyTp = tp > 0 ? tp : 0;
    const beschreibungToApply = quelle === 'crit'
        ? (applyOpts?.beschreibungOverride ?? state.lastCritVisual)
        : `Angriff: ${tp} TP`;
    const extractedToApply = quelle === 'crit' && parsed ? { ...parsed } : null;

    const vonCharakter = applyOpts && Object.prototype.hasOwnProperty.call(applyOpts, 'vonCharakter')
        ? applyOpts.vonCharakter
        : (state.angreiferSubTab === 'monster'
            ? null
            : (() => {
                const id = state.kampfAngreiferCharakterId;
                if (!id) return null;
                const ch = getCharakterById(id);
                return ch ? { id: ch.id, name: ch.name } : null;
              })());
    let id = null;
    if (!allDead) {
        const payload = {
            zielIds: livingIds,
            applyTp,
            quelle,
            beschreibung: beschreibungToApply,
            extracted: extractedToApply,
            vonCharakter
        };
        id = ++applySchadenButtonId;
        applySchadenPayloads.set(id, payload);
    }

    const names = livingIds.map(id => getGegnerById(id)?.name || getSpielerById(id)?.name || getNpcById(id)?.name).filter(Boolean);
    const zielText = allDead
        ? 'Ziel ist bereits tot'
        : (livingIds.length === 1 ? names[0] : `${livingIds.length} Ziele`);
    wrapContainer.innerHTML = '';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn primary btn-apply-schaden';
    if (id != null) btn.dataset.applyId = String(id);
    const statusLabel = hasStatus ? ' + Status' : '';
    btn.textContent = tp > 0 ? `${tp} TP${statusLabel} anwenden (${zielText})` : `Status anwenden (${zielText})`;
    if (allDead) btn.disabled = true;
    btn.style.marginTop = '8px';
    btn.style.display = 'block';
    btn.style.cursor = 'pointer';
    wrapContainer.appendChild(btn);
}

/**
 * Richtet alle Event-Listener für die Benutzeroberfläche ein.
 */
export function setupEventListeners() {
    // Event-Listener für Angriffs-Berechnung
    $('#calcAttack')?.addEventListener('click', () => {
        calculateAttack();
        appendApplySchadenButton($('#attackApplyWrap'), 'attack');
    });

    // Event-Listener für Haupttreffer-Berechnung
    $('#calcCrit').addEventListener('click', calculateCrit);

    // Event-Listener für Nebentreffer-Berechnung
    $('#calcSide').addEventListener('click', calculateSide);
    $('#calcPatzer')?.addEventListener('click', calculatePatzer);
    $('#patzerKategorie')?.addEventListener('change', populatePatzerModifikationSelect);
    populatePatzerModifikationSelect();

    initCritEditOverlay();

    // Event-Listener für den Reset-Button
    $('#resetBtn').addEventListener('click', resetApp);

    // Event-Listener, wenn sich der Krit-Typ ändert
    $('#critType')?.addEventListener('change', handleCritTypeChange);

    // Event-Listener für Nebentreffer-Typ-Dropdown
    $('#sideType')?.addEventListener('change', handleSideTypeChange);

    // Event-Delegation für Schaden-anwenden-Buttons (verhindert Klick-Probleme)
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-apply-schaden');
        if (!btn || btn.disabled) return;
        const id = btn.dataset.applyId;
        if (!id) return;
        const payload = applySchadenPayloads.get(parseInt(id, 10));
        if (!payload) return;
        const { zielIds: zids, applyTp: tpVal, quelle: q, beschreibung: desc, extracted: ext, vonCharakter: von } = payload;
        const ids = Array.isArray(zids) ? zids : [zids];
        let ok = true;
        for (const zid of ids) {
            if (getGegnerById(zid)) {
                if (!applySchaden(zid, tpVal, q, desc, ext, von)) ok = false;
            } else {
                if (!applySchadenCharakter(zid, tpVal, q, desc, ext, von)) ok = false;
            }
        }
        if (ok) {
            refreshKampftracker();
            btn.textContent = '✓ Angewendet';
            btn.disabled = true;
            applySchadenPayloads.delete(parseInt(id, 10));
        }
    });

    // Event-Listener für Waffen-Labels (Lautstärke: initCombatMusic)
    const scheduleWeaponLabelFit = () => {
        if ($('#simulatorPanel')?.classList.contains('hidden')) return;
        clearTimeout(weaponLabelFitTimer);
        weaponLabelFitTimer = setTimeout(() => adjustWeaponFontSizes(), 120);
    };
    window.addEventListener('resize', scheduleWeaponLabelFit);
    const weaponWrap = $('#weaponWrap');
    if (weaponWrap && typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(scheduleWeaponLabelFit);
        ro.observe(weaponWrap);
    }
}

/**
 * Berechnet den Haupttreffer.
 */
function calculateCrit() {
    const roll = parseInt($('#critRoll').value, 10);
    const typSel = $('#critType').value || state.autoCrit.typ;
    const tMinus50 = !!state.autoCrit.tMinus50;
    const rawKatSel = tMinus50 ? 'A' : ($('#critCat').value || state.autoCrit.kat);
    const katSel = resolveLookupCategory(typSel, rawKatSel);
    if (katSel && $('#critCat').value !== katSel) {
        $('#critCat').value = katSel;
    }
    if (tMinus50 && $('#critCat').value !== 'A') {
        $('#critCat').value = 'A';
    }

    const out = $('#critOut');
    const kpi = $('#critKpi');
    const res = out.querySelector('.result');
    kpi.innerHTML = '';
    res.classList.remove('muted');

    const critTable = state.tables?.[typSel]?.[katSel];
    if (!typSel || !katSel || !critTable) {
        state.lastCritTp = 0;
        state.lastCritVisual = '';
        state.lastCritParsed = null;
        state.lastCritContext = null;
        $('#critEditRow')?.style.setProperty('display', 'none');
        res.textContent = 'Krit-Typ und -Kategorie festlegen (oder Schritt 1 ausführen).';
        return;
    }

    if (isNaN(roll) || roll < 0) {
        state.lastCritTp = 0;
        state.lastCritVisual = '';
        state.lastCritParsed = null;
        state.lastCritContext = null;
        $('#critEditRow')?.style.setProperty('display', 'none');
        res.textContent = 'Bitte einen gültigen Würfelwurf (≥ 0) eingeben.';
        return;
    }

    const effectiveRoll = resolveEffectiveCritRoll(roll, tMinus50);
    const found = lookupCritEntry(typSel, katSel, effectiveRoll);
    if (!found) {
        state.lastCritTp = 0;
        state.lastCritVisual = '';
        state.lastCritParsed = null;
        state.lastCritContext = null;
        $('#critEditRow')?.style.setProperty('display', 'none');
        const rollHint = tMinus50 ? `${roll} → ${effectiveRoll} (T−50)` : String(roll);
        res.textContent = `Kein Eintrag gefunden für ${formatCritTableLabel(typSel)} ${katSel} (${rollHint}).`;
        return;
    }

    const { entry, key } = found;
    const visualText = typeof entry === 'object' && entry?.visual != null ? entry.visual : String(entry ?? '');
    const ttsText = typeof entry === 'object' && entry?.tts != null ? entry.tts : String(entry ?? '');

    state.lastCritVisual = visualText;
    state.lastCritTts = ttsText;
    const parsed = parseCritText(visualText);
    if (parsed.tp === 0) parsed.tp = parseCritText(ttsText).tp;
    if (entry?.severity) parsed.severity = entry.severity;
    state.lastCritTp = parsed.tp;
    state.lastCritParsed = parsed;

    appendCritIcon(kpi, typSel);
    kpi.append(chip(`Typ: ${formatCritTableLabel(typSel)}`));
    kpi.append(chip(`Kat: ${katSel}`));
    if (tMinus50) {
        kpi.append(chip(`Wurf: ${roll} → ${effectiveRoll} (T−50)`));
    } else {
        kpi.append(chip(`Wurf: ${roll}`));
    }
    if (key) kpi.append(chip(`Bereich: ${key}`));
    res.textContent = visualText;
    res.classList.add('crit-prominent');

    appendApplySchadenButton($('#critApplyWrap'), 'crit', parsed);

    state.lastCritContext = { typ: typSel, kat: katSel, key, source: 'crit' };
    $('#critEditRow')?.style.setProperty('display', '');
    $('#sideEditRow')?.style.setProperty('display', 'none');

    playCritAudio(typSel, katSel, key, ttsText);
    if (state.isBgMusicPlaying && !state.kampfModus) {
        tryStartBgAudio(typSel);
    }
}

/**
 * Berechnet den Nebentreffer.
 */
function calculateSide() {
    const typ = $('#sideType').value;
    const rawKat = $('#sideCat').value;
    const kat = resolveLookupCategory(typ, rawKat);
    if (kat && $('#sideCat').value !== kat) {
        $('#sideCat').value = kat;
    }
    const roll = parseInt($('#sideRoll').value, 10);

    const out = $('#sideOut');
    const kpi = $('#sideKpi');
    const res = out.querySelector('.result');
    kpi.innerHTML = '';
    res.classList.remove('muted');

    const sideTable = state.tables?.[typ]?.[kat];
    if (!typ || !kat || !sideTable) {
        state.lastCritTp = 0;
        state.lastCritVisual = '';
        state.lastCritParsed = null;
        state.lastCritContext = null;
        $('#sideEditRow')?.style.setProperty('display', 'none');
        res.textContent = 'Bitte eine Nebentreffer-Tabelle und Kategorie wählen.';
        return;
    }

    if (isNaN(roll) || roll < 0) {
        state.lastCritTp = 0;
        state.lastCritVisual = '';
        state.lastCritParsed = null;
        state.lastCritContext = null;
        $('#sideEditRow')?.style.setProperty('display', 'none');
        res.textContent = 'Bitte einen gültigen Würfelwurf (≥ 0) eingeben.';
        return;
    }

    const found = lookupCritEntry(typ, kat, roll);
    if (!found) {
        state.lastCritTp = 0;
        state.lastCritVisual = '';
        state.lastCritParsed = null;
        state.lastCritContext = null;
        $('#sideEditRow')?.style.setProperty('display', 'none');
        res.textContent = `Kein Eintrag gefunden für ${typ.replace(/_/g, ' ')} ${kat} (${roll}).`;
        return;
    }

    const { entry, key } = found;
    const visualText = typeof entry === 'object' && entry?.visual != null ? entry.visual : String(entry ?? '');
    const ttsText = typeof entry === 'object' && entry?.tts != null ? entry.tts : String(entry ?? '');

    state.lastCritVisual = visualText;
    state.lastCritTts = ttsText;
    const parsed = parseCritText(visualText);
    if (parsed.tp === 0) parsed.tp = parseCritText(ttsText).tp;
    if (entry?.severity) parsed.severity = entry.severity;
    state.lastCritTp = parsed.tp;
    state.lastCritParsed = parsed;

    appendCritIcon(kpi, typ);
    kpi.append(chip(`Nebentyp: ${typ.replace(/_/g, ' ')}`));
    kpi.append(chip(`Kat: ${kat}`));
    kpi.append(chip(`Wurf: ${roll}`));
    if (key) kpi.append(chip(`Bereich: ${key}`));
    res.textContent = visualText;
    res.classList.add('crit-prominent');

    appendApplySchadenButton($('#sideApplyWrap'), 'crit', parsed);

    state.lastCritContext = { typ, kat, key, source: 'side' };
    $('#sideEditRow')?.style.setProperty('display', '');
    $('#critEditRow')?.style.setProperty('display', 'none');

    playCritAudio(typ, kat, key, ttsText);
    if (state.isBgMusicPlaying && !state.kampfModus) {
        tryStartBgAudio(typ);
    }
}

/**
 * Füllt die Modifikations-Optionen passend zur gewählten Tabellenspalte.
 */
function populatePatzerModifikationSelect() {
    const kat = $('#patzerKategorie')?.value || 'Nahkampf';
    const sel = $('#patzerModifikation');
    if (!sel) return;
    const list = PATZER_CONTEXT_MODS[kat] || [];
    sel.innerHTML = '';
    list.forEach((o) => {
        const opt = document.createElement('option');
        opt.value = o.id;
        const m = o.mod >= 0 ? `+${o.mod}` : `${o.mod}`;
        opt.textContent = `${o.label} (${m})`;
        opt.dataset.mod = String(o.mod);
        sel.appendChild(opt);
    });
}

function clearPatzerApplyState() {
    state.lastPatzerTp = 0;
    state.lastPatzerParsed = null;
    const w = $('#patzerApplyWrap');
    if (w) w.innerHTML = '';
}

function calculatePatzer() {
    const kat = $('#patzerKategorie')?.value || 'Nahkampf';
    const modSel = $('#patzerModifikation');
    const selectedOpt = modSel?.selectedOptions?.[0];
    const contextMod = selectedOpt ? parseInt(selectedOpt.dataset.mod || '0', 10) : 0;
    const rollRaw = parseInt(String($('#patzerRoll')?.value ?? '').trim(), 10);
    const out = $('#patzerOut .result');
    const kpi = $('#patzerKpi');
    if (!out || !kpi) return;
    kpi.innerHTML = '';
    out.classList.remove('crit-prominent');
    clearPatzerApplyState();
    state.lastPatzerResult = null;
    if (Number.isNaN(rollRaw) || rollRaw < 1) {
        out.textContent = 'Bitte einen gültigen Wurf (ganze Zahl ≥ 1) eingeben.';
        return;
    }
    const finalRoll = rollRaw + contextMod;
    const found = lookupCritEntry('Allgemeine Patzer', kat, finalRoll);
    if (!found) {
        out.textContent = 'Kein Patzer-Eintrag für diesen effektiven Wurf.';
        kpi.append(chip(`Basis: ${rollRaw}`));
        kpi.append(chip(`Modifikation: ${contextMod >= 0 ? '+' : ''}${contextMod}`));
        kpi.append(chip(`Effektiv: ${finalRoll}`));
        return;
    }
    const visualText = found.entry.visual;
    const ttsText = found.entry.tts;
    const key = found.key;
    const parsed = parseCritText(visualText);
    if (parsed.tp === 0) parsed.tp = parseCritText(ttsText).tp;
    if (found.entry?.severity) parsed.severity = found.entry.severity;
    state.lastPatzerTp = parsed.tp;
    state.lastPatzerParsed = parsed;

    kpi.append(chip(`Basis: ${rollRaw}`));
    kpi.append(chip(`Modifikation: ${contextMod >= 0 ? '+' : ''}${contextMod}`));
    kpi.append(chip(`Effektiv: ${finalRoll}`));
    kpi.append(chip(`Bereich: ${key}`));
    appendCritIcon(kpi, 'Allgemeine Patzer');
    out.textContent = visualText;
    out.classList.add('crit-prominent');
    state.lastPatzerResult = {
        rollRaw,
        finalRoll,
        contextMod,
        kat,
        key,
        visual: visualText,
        tts: ttsText
    };
    appendApplySchadenButton($('#patzerApplyWrap'), 'crit', parsed, {
        tpOverride: parsed.tp,
        beschreibungOverride: `Patzer: ${visualText}`,
        vonCharakter: null
    });
    playCritAudio('Allgemeine Patzer', kat, key, ttsText);
    if (state.isBgMusicPlaying && !state.kampfModus) {
        tryStartBgAudio('Allgemeine Patzer');
    }
}

/**
 * Setzt die App-Oberfläche zurück.
 */
function resetApp() {
    $('#attack').value = '';
    $('#critRoll').value = '';
    $('#sideRoll').value = '';
    $('#sideType').value = '';
    $('#critOut .result').textContent = 'Noch kein Ergebnis.';
    $('#attackOut .result').textContent = 'Noch kein Ergebnis.';
    $('#sideOut .result').textContent = 'Noch kein Ergebnis.';
    $('#critKpi').innerHTML = '';
    $('#attackKpi').innerHTML = '';
    $('#sideKpi').innerHTML = '';
    $('#critType').value = '';
    $('#critCat').value = '';
    state.autoCrit = { typ: '', kat: '', tMinus50: false };
    state.lastAttackTp = 0;
    state.lastCritTp = 0;
    state.lastCritVisual = '';
    state.lastCritParsed = null;
    $('#critOut .result').classList.remove('crit-prominent');
    $('#sideOut .result').classList.remove('crit-prominent');
    $('#critEditRow')?.style.setProperty('display', 'none');
    $('#sideEditRow')?.style.setProperty('display', 'none');
    state.lastCritContext = null;
    $('#attackApplyWrap').innerHTML = '';
    $('#critApplyWrap').innerHTML = '';
    $('#sideApplyWrap').innerHTML = '';
    $('#patzerApplyWrap').innerHTML = '';
    $('#patzerKpi').innerHTML = '';
    $('#patzerOut .result').textContent = 'Noch kein Ergebnis.';
    $('#patzerOut .result').classList.remove('crit-prominent');
    state.lastPatzerResult = null;
    state.lastPatzerTp = 0;
    state.lastPatzerParsed = null;
}


/**
 * Behandelt das Ändern des Krit-Typ-Dropdowns.
 */
function handleCritTypeChange() {
    updateCritCatDropdown();
}

function hasCategoryEntries(table, category) {
    const cat = table?.[category];
    if (!cat || typeof cat !== 'object') return false;
    return Object.keys(cat).length > 0;
}

function firstNonEmptyCategory(table) {
    if (!table || typeof table !== 'object') return '';
    const categories = Object.keys(table).filter(k => k !== 'audioFile');
    return categories.find((k) => hasCategoryEntries(table, k)) || '';
}

function resolveLookupCategory(tableKey, preferredCategory) {
    const table = state.tables?.[tableKey];
    if (!table) return preferredCategory || '';
    if (preferredCategory && hasCategoryEntries(table, preferredCategory)) return preferredCategory;
    const fallback = firstNonEmptyCategory(table);
    if (fallback) return fallback;
    return preferredCategory || '';
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
        const preferred = resolveLookupCategory(selectedTableKey, critCatDropdown.options[0].value);
        critCatDropdown.value = preferred || critCatDropdown.options[0].value;
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
    if (sideCatDropdown.options.length > 0) {
        const preferred = resolveLookupCategory(selectedSideTable, sideCatDropdown.options[0].value);
        sideCatDropdown.value = preferred || sideCatDropdown.options[0].value;
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
