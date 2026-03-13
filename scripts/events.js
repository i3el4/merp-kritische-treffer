// events.js
// Dieses Modul enthält alle Event-Listener der App.

import { state } from './state.js';
import { $, $$ } from './dom.js';
import { CRIT_ICONS, URLS } from './constants.js';
import { calculateAttack, lookupCritEntry, mapCritName } from './logic.js';
import { playCritAudio, tryStartBgAudio } from './audio.js';
import { chip } from './dom.js';
import { applySchaden, applySchadenCharakter, getGegnerById, getSpielerById, getNpcById, getAktuelleRunde } from './campaigns.js';
import { refreshKampftracker } from './kampftracker.js';
import { parseCritText } from './critParser.js';

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

/**
 * Fügt einen "Schaden anwenden"-Button hinzu, wenn Ziel gewählt und TP > 0 oder Status.
 * @param {HTMLElement} wrapContainer Der Wrap-Container (z.B. #critApplyWrap)
 * @param {'attack'|'crit'} quelle
 * @param {{ tp?: number, ben?: number, benoPar?: number, oPar?: number, init?: number, tpPerRound?: number, ko?: boolean }} [parsedOverride] Bei 'crit': geparstes Objekt direkt übergeben
 */
function appendApplySchadenButton(wrapContainer, quelle, parsedOverride = null) {
    if (!wrapContainer) return;
    const gegnerIds = state.selectedGegnerIds || [];
    const livingIds = gegnerIds.filter(id => {
        const g = getGegnerById(id);
        if (g) return g.tp > 0;
        const s = getSpielerById(id);
        if (s) return (s.tp ?? s.maxTp ?? 100) > 0;
        const n = getNpcById(id);
        if (n) return (n.tp ?? n.maxTp ?? 100) > 0;
        return false;
    });
    if (livingIds.length === 0) return;
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
    const payload = {
        zielIds: livingIds,
        applyTp,
        quelle,
        beschreibung: beschreibungToApply,
        extracted: extractedToApply,
        vonCharakter
    };
    const id = ++applySchadenButtonId;
    applySchadenPayloads.set(id, payload);

    const names = livingIds.map(id => getGegnerById(id)?.name || getSpielerById(id)?.name || getNpcById(id)?.name).filter(Boolean);
    const zielText = livingIds.length === 1 ? names[0] : `${livingIds.length} Ziele`;
    wrapContainer.innerHTML = '';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn primary btn-apply-schaden';
    btn.dataset.applyId = String(id);
    const statusLabel = hasStatus ? ' + Status' : '';
    btn.textContent = tp > 0 ? `${tp} TP${statusLabel} anwenden (${zielText})` : `Status anwenden (${zielText})`;
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

    // Event-Listener für den Reset-Button
    $('#resetBtn').addEventListener('click', resetApp);

    // Event-Listener für die Gegnertyp-Buttons
    $('#gegnerTyp')?.addEventListener('click', handleGegnerTypClick);

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
        res.textContent = 'Krit-Typ und -Kategorie festlegen (oder Schritt 1 ausführen).';
        return;
    }

    if (isNaN(roll) || roll < 0) {
        state.lastCritTp = 0;
        state.lastCritVisual = '';
        state.lastCritParsed = null;
        res.textContent = 'Bitte einen gültigen Würfelwurf (≥ 0) eingeben.';
        return;
    }

    const found = lookupCritEntry(typSel, katSel, roll);
    if (!found) {
        state.lastCritTp = 0;
        state.lastCritVisual = '';
        state.lastCritParsed = null;
        res.textContent = `Kein Eintrag gefunden für ${typSel.replace(/_/g, ' ')} ${katSel} (${roll}).`;
        return;
    }

    const { entry, key } = found;
    const visualText = typeof entry === 'object' && entry?.visual != null ? entry.visual : String(entry ?? '');
    const ttsText = typeof entry === 'object' && entry?.tts != null ? entry.tts : String(entry ?? '');

    state.lastCritVisual = visualText;
    const parsed = parseCritText(visualText);
    if (parsed.tp === 0) parsed.tp = parseCritText(ttsText).tp;
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
        res.textContent = 'Bitte eine Nebentreffer-Tabelle und Kategorie wählen.';
        return;
    }

    if (isNaN(roll) || roll < 0) {
        state.lastCritTp = 0;
        state.lastCritVisual = '';
        state.lastCritParsed = null;
        res.textContent = 'Bitte einen gültigen Würfelwurf (≥ 0) eingeben.';
        return;
    }

    const found = lookupCritEntry(typ, kat, roll);
    if (!found) {
        state.lastCritTp = 0;
        state.lastCritVisual = '';
        state.lastCritParsed = null;
        res.textContent = `Kein Eintrag gefunden für ${typ.replace(/_/g, ' ')} ${kat} (${roll}).`;
        return;
    }

    const { entry, key } = found;
    const visualText = typeof entry === 'object' && entry?.visual != null ? entry.visual : String(entry ?? '');
    const ttsText = typeof entry === 'object' && entry?.tts != null ? entry.tts : String(entry ?? '');

    state.lastCritVisual = visualText;
    const parsed = parseCritText(visualText);
    if (parsed.tp === 0) parsed.tp = parseCritText(ttsText).tp;
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

    playCritAudio(typ, kat, key, ttsText);
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
    $('#attackApplyWrap').innerHTML = '';
    $('#critApplyWrap').innerHTML = '';
    $('#sideApplyWrap').innerHTML = '';
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
            $('#critType').value = 'Grosse Wesen';
        } else if (gegnerTyp === 'gewaltig') {
            $('#critType').value = 'Gewaltige Wesen';
        } else {
            $('#critType').value = state.autoCrit.typ || '';
        }
        $('#critType').dispatchEvent(new Event('change'));
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