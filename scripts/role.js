// role.js
// Verwaltet die Rollenwahl (Spielleiter / Spieler) und Persistenz.

const STORAGE_KEY = 'merp_rolle';

export const ROLES = {
  SPIELLER: 'spieler',
  SPIELLEITER: 'spielleiter'
};

export function getRole() {
  return localStorage.getItem(STORAGE_KEY);
}

export function setRole(role) {
  if (role === ROLES.SPIELLER || role === ROLES.SPIELLEITER) {
    localStorage.setItem(STORAGE_KEY, role);
    return true;
  }
  return false;
}

export function hasRole() {
  return !!getRole();
}

export function clearRole() {
  localStorage.removeItem(STORAGE_KEY);
}

const CHARAKTER_KEY_PREFIX = 'merp_charakter_';

export function getCharakter(kampagneId) {
  if (!kampagneId) return null;
  try {
    const raw = localStorage.getItem(CHARAKTER_KEY_PREFIX + kampagneId);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setCharakter(kampagneId, charakter) {
  if (!kampagneId) return;
  if (charakter) {
    localStorage.setItem(CHARAKTER_KEY_PREFIX + kampagneId, JSON.stringify({ id: charakter.id, name: charakter.name }));
  } else {
    localStorage.removeItem(CHARAKTER_KEY_PREFIX + kampagneId);
  }
}
