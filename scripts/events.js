// events.js
// Dieses Modul enthält alle Event-Listener der App.

import { state } from './state.js';
import { $ } from './dom.js';
import { CRIT_ICONS, URLS, PATZER_KATEGORIEN, PATZER_MATERIAL_MODS, PATZER_SCHWIERIGKEIT_MODS } from './constants.js';
import { calculateAttack, lookupCritEntry, lookupPatzerEntry, mapCritName } from './logic.js';
import { playCritAudio, tryStartBgAudio } from './audio.js';
import { chip } from './dom.js';
import { applySchaden, applySchadenCharakter, getGegnerById, getSpielerById, getNpcById, getAktuelleRunde } from './campaigns.js';
import { refreshKampftracker } from './kampftracker.js';
import { parseCritText } from './critParser.js';
import { setCorrection, deleteCorrection, exportCorrections } from './critCorrections.js';

/**
 * Fügt das Krit-Icon in die KPI-Zeile ein (falls vorhanden).
 * @param {HTMLElement} kpi Das KPI-Element
 * @param {string} typ Der Krit-Typ (z.B. Stich, Elektro)
 */
function appendCritIcon(kpi, typ) {
    const iconFile = CRIT_ICONS[typ];
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
        const found = lookupCritEntry(ctx.typ, ctx.kat, roll);
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
 */
function appendApplySchadenButton(wrapContainer, quelle, parsedOverride = null) {
    if (!wrapContainer) return;
    const zielIds = state.selectedGegnerIds || [];
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
    const tp = quelle === 'attack' ? state.lastAttackTp : state.lastCritTp;
    const parsed = parsedOverride ?? (quelle === 'crit' ? state.lastCritParsed : null);
    const hasStatus = parsed && (
        (parsed.ben || 0) + (parsed.benoPar || 0) + (parsed.oPar || 0) +
        (parsed.init || 0) + (parsed.tpPerRound || 0) > 0 || parsed.ko
    );
    const applyTp = tp > 0 ? tp : 0;
    const beschreibungToApply = quelle === 'crit' ? state.lastCritVisual : `Angriff: ${tp} TP`;
    const extractedToApply = quelle === 'crit' && parsed ? { ...parsed } : null;

    const vonCharakter = (state.selectedCharakterId && state.selectedCharakterName)
        ? { id: state.selectedCharakterId, name: state.selectedCharakterName }
        : null;
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

    initCritEditOverlay();

    // Event-Listener für den Reset-Button
    $('#resetBtn').addEventListener('click', resetApp);

    // Fallback-Gegnertyp-Dropdown aktualisiert den Krit-Typ
    $('#fallbackGegnerTyp')?.addEventListener('change', () => {
        const gt = $('#fallbackGegnerTyp').value;
        if (gt === 'gross') {
            $('#critType').value = 'Grosse Wesen';
        } else if (gt === 'gewaltig') {
            $('#critType').value = 'Gewaltige Wesen';
        } else {
            $('#critType').value = state.autoCrit.typ || '';
        }
        $('#critType').dispatchEvent(new Event('change'));
    });

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

    // Event-Listener für Audio-Toggles
    $('#bgToggleBtn')?.addEventListener('click', handleBgToggle);
    $('#bgVol')?.addEventListener('input', handleBgVolumeChange);
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

    const found = lookupCritEntry(typSel, katSel, roll);
    if (!found) {
        state.lastCritTp = 0;
        state.lastCritVisual = '';
        state.lastCritParsed = null;
        state.lastCritContext = null;
        $('#critEditRow')?.style.setProperty('display', 'none');
        res.textContent = `Kein Eintrag gefunden für ${typSel.replace(/_/g, ' ')} ${katSel} (${roll}).`;
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
    kpi.append(chip(`Typ: ${typSel.replace(/_/g, ' ')}`));
    kpi.append(chip(`Kat: ${katSel}`));
    kpi.append(chip(`Wurf: ${roll}`));
    if (key) kpi.append(chip(`Bereich: ${key}`));
    res.textContent = visualText;
    res.classList.add('crit-prominent');

    appendApplySchadenButton($('#critApplyWrap'), 'crit', parsed);

    state.lastCritContext = { typ: typSel, kat: katSel, key, source: 'crit' };
    $('#critEditRow')?.style.setProperty('display', '');
    $('#sideEditRow')?.style.setProperty('display', 'none');

    playCritAudio(typSel, katSel, key, ttsText);
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
    if (state.isBgMusicPlaying) {
        tryStartBgAudio(typ);
    }
}

function calculatePatzer() {
    const kat = $('#patzerKategorie')?.value || 'allgemein';
    const material = $('#patzerMaterial')?.value || 'normal';
    const schwierigkeit = $('#patzerSchwierigkeit')?.value || 'normal';
    const rollRaw = parseInt($('#patzerRoll')?.value, 10);
    const out = $('#patzerOut .result');
    const kpi = $('#patzerKpi');
    if (!out || !kpi) return;
    kpi.innerHTML = '';
    if (Number.isNaN(rollRaw) || rollRaw < 1) {
        out.textContent = 'Bitte einen gültigen Wurf (>= 1) eingeben.';
        return;
    }
    const katMod = PATZER_KATEGORIEN.find(x => x.id === kat)?.mod || 0;
    const matMod = PATZER_MATERIAL_MODS.find(x => x.id === material)?.mod || 0;
    const schMod = PATZER_SCHWIERIGKEIT_MODS.find(x => x.id === schwierigkeit)?.mod || 0;
    const finalRoll = Math.max(1, rollRaw + katMod + matMod + schMod);
    const entry = lookupPatzerEntry('allgemein', finalRoll);
    const text = entry?.text || 'Kein Patzer-Eintrag gefunden.';
    kpi.append(chip(`Basis: ${rollRaw}`));
    kpi.append(chip(`Kategorie: ${katMod >= 0 ? '+' : ''}${katMod}`));
    kpi.append(chip(`Material: ${matMod >= 0 ? '+' : ''}${matMod}`));
    kpi.append(chip(`Schwierigkeit: ${schMod >= 0 ? '+' : ''}${schMod}`));
    kpi.append(chip(`Final: ${finalRoll}`));
    out.textContent = text;
    state.lastPatzerResult = { rollRaw, finalRoll, text, kat, material, schwierigkeit };
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
    state.autoCrit = { typ: '', kat: '' };
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