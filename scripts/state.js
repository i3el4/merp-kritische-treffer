// state.js
// Dieses Modul verwaltet den globalen Zustand der Anwendung.

let treffer = null;
let tables = null;
let patzerTables = null;
let selectedWeapon = null;
let autoCrit = {
    typ: '',
    kat: ''
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
    set aktiveGruppeCharId(value) { aktiveGruppeCharId = value; }
};