// state.js
// Dieses Modul verwaltet den globalen Zustand der Anwendung.

let treffer = null;
let tables = null;
let selectedWeapon = null;
let autoCrit = {
    typ: '',
    kat: ''
};
let currentBgKey = null;
let isBgMusicPlaying = false;

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
    }
};