// state.js
// Dieses Modul verwaltet den globalen Zustand der Anwendung.

let treffer = null;
let tables = null;
let patzerTables = null;
let selectedWeapon = null;
/** Nur bei Naturangriffen: 'klein' | 'mittel' | 'gross' | 'riesig'; sonst null */
let selectedSizeClass = null;
let autoCrit = {
    typ: '',
    kat: '',
    tMinus50: false
};
let currentBgKey = null;
let isBgMusicPlaying = false;
let selectedGegnerId = null;
let selectedGegnerIds = [];
let selectedCharakterId = null;
let selectedCharakterName = null;
let lastAttackTp = 0;
let lastCritTp = 0;
let lastCritVisual = '';
let lastCritParsed = null;
let lastPatzerResult = null;
let lastPatzerTp = 0;
let lastPatzerParsed = null;
let aktiveGruppeCharId = null;
/** Kampfmodus: Kampf-Musik darf laufen (localStorage). */
let kampfModus = false;
/** SL: 'charakter' | 'monster' — welcher Angriffs-Kontext im Simulator aktiv ist. */
let angreiferSubTab = 'charakter';
/** SL Monsterangriff: ID des angreifenden Gegners. */
let monsterAngreiferGegnerId = null;
/** SL Schatten-Modus: Intensitäts-Stufe der Kampfmusik (klein|normal|gross|gewaltig). */
let schattenMusikKategorie = 'klein';

export const state = {
    get treffer() {
        return treffer;
    },
    set treffer(value) {
        treffer = value;
    },
    get tables() {
        return tables;
    },
    set tables(value) {
        tables = value;
    },
    get patzerTables() {
        return patzerTables;
    },
    set patzerTables(value) {
        patzerTables = value;
    },
    get selectedWeapon() {
        return selectedWeapon;
    },
    set selectedWeapon(value) {
        selectedWeapon = value;
    },
    get selectedSizeClass() {
        return selectedSizeClass;
    },
    set selectedSizeClass(value) {
        selectedSizeClass = value;
    },
    get autoCrit() {
        return autoCrit;
    },
    set autoCrit(value) {
        autoCrit = value;
    },
    get currentBgKey() {
        return currentBgKey;
    },
    set currentBgKey(value) {
        currentBgKey = value;
    },
    get isBgMusicPlaying() {
        return isBgMusicPlaying;
    },
    set isBgMusicPlaying(value) {
        isBgMusicPlaying = value;
    },
    get selectedGegnerId() {
        return selectedGegnerId;
    },
    set selectedGegnerId(value) {
        selectedGegnerId = value;
    },
    get selectedGegnerIds() {
        return selectedGegnerIds;
    },
    set selectedGegnerIds(value) {
        selectedGegnerIds = Array.isArray(value) ? value : [];
        selectedGegnerId = selectedGegnerIds[0] || null;
    },
    get selectedCharakterId() {
        return selectedCharakterId;
    },
    set selectedCharakterId(value) {
        selectedCharakterId = value;
    },
    get selectedCharakterName() {
        return selectedCharakterName;
    },
    set selectedCharakterName(value) {
        selectedCharakterName = value;
    },
    get lastAttackTp() { return lastAttackTp; },
    set lastAttackTp(value) { lastAttackTp = value; },
    get lastCritTp() { return lastCritTp; },
    set lastCritTp(value) { lastCritTp = value; },
    get lastCritVisual() { return lastCritVisual; },
    set lastCritVisual(value) { lastCritVisual = value; },
    get lastCritParsed() { return lastCritParsed; },
    set lastCritParsed(value) { lastCritParsed = value; },
    get lastPatzerResult() { return lastPatzerResult; },
    set lastPatzerResult(value) { lastPatzerResult = value; },
    get lastPatzerTp() { return lastPatzerTp; },
    set lastPatzerTp(value) { lastPatzerTp = value; },
    get lastPatzerParsed() { return lastPatzerParsed; },
    set lastPatzerParsed(value) { lastPatzerParsed = value; },
    get aktiveGruppeCharId() { return aktiveGruppeCharId; },
    set aktiveGruppeCharId(value) { aktiveGruppeCharId = value; },
    get kampfModus() { return kampfModus; },
    set kampfModus(value) { kampfModus = !!value; },
    get angreiferSubTab() { return angreiferSubTab; },
    set angreiferSubTab(value) {
        angreiferSubTab = value === 'monster' ? 'monster' : 'charakter';
    },
    get monsterAngreiferGegnerId() { return monsterAngreiferGegnerId; },
    set monsterAngreiferGegnerId(value) { monsterAngreiferGegnerId = value || null; },
    get schattenMusikKategorie() { return schattenMusikKategorie; },
    set schattenMusikKategorie(value) {
        const v = String(value || '').toLowerCase();
        schattenMusikKategorie = ['klein', 'normal', 'gross', 'gewaltig'].includes(v) ? v : 'klein';
    }
};