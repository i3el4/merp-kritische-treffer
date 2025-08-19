// dom.js
// Dieses Modul enthält DOM-Hilfsfunktionen und Selektoren.

export const $ = sel => document.querySelector(sel);
export const $$ = sel => Array.from(document.querySelectorAll(sel));

// Erzeugt einen "Chip" (kleiner, abgerundeter Text-Badge).
export function chip(text) {
    const span = document.createElement('span');
    span.className = 'pill';
    span.textContent = text;
    return span;
}

// Erzeugt eine "Pille" (größeres Text-Badge mit Label und Wert).
export function pill(label, value, tone) {
    const div = document.createElement('div');
    div.className = 'pill ' + (tone || '');
    div.innerHTML = `<strong>${label}:</strong> ${value}`;
    return div;
}