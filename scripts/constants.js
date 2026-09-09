// constants.js
// Dieses Modul enthält alle festen Pfade und Konfigurationen.

/**
 * Waffengruppen für die Anzeige (Reihenfolge = Anzeige-Reihenfolge).
 * Jede Gruppe enthält die Waffen-Keys aus Angriffstabellen.
 */
/** Kanonische Tabellen-Keys für den Naturangriffe-Zusatz. */
export const SUPPLEMENT_CANONICAL_KEYS = [
  'Ungleichgewicht',
  'Kleine_Tiere',
  'Feger_Und_Wuerfe',
  'Schlaege',
  'Greifen_Ringkampf'
];

/** Alle Tabellen-Schlüssel für den importierten Naturangriffe-Zusatz auflösen. */
export function resolveEnglishSupplementTableKeys(tables) {
  const keys = Object.keys(tables || {});
  const preferred = SUPPLEMENT_CANONICAL_KEYS.filter((k) => keys.includes(k));
  const legacy = keys.filter((k) => k.startsWith('Englisch_')).sort();
  return [...preferred, ...legacy.filter((k) => !preferred.includes(k))];
}

/** Anzeigename für Krit-Typ-Dropdown. */
export function formatCritTableLabel(key) {
  if (typeof key !== 'string') return '';
  if (key === 'Ungleichgewicht') return 'Ungleichgewicht';
  if (key === 'Kleine_Tiere') return 'Kleine Tiere';
  if (key === 'Feger_Und_Wuerfe') return 'Feger & Würfe';
  if (key === 'Schlaege') return 'Schläge';
  if (key === 'Greifen_Ringkampf') return 'Greifen / Ringkampf';

  if (key.startsWith('Englisch_')) {
    const raw = key
      .replace(/^Englisch_/, '')
      .replace(/[_:]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const lower = raw.toLowerCase();
    if (lower.includes('feger') && (lower.includes('wuerfe') || lower.includes('würfe'))) return 'Feger & Würfe';
    if (lower.includes('greifen') || lower.includes('griff')) return 'Greifen';
    if (lower.includes('aus dem gleichgewicht') || lower.includes('ungleichgewicht')) return 'Ungleichgewicht';
    if (lower.includes('ausbalancier')) return 'Ungleichgewicht';
    if (lower.includes('kleine tiere') || lower.includes('winzige tier')) return 'Kleine Tiere';
    if (lower.includes('ringkampf') || lower.includes('ringen')) return 'Ringkampf';
    if (lower.includes('schlag') || lower.includes('schlaege') || lower.includes('schläge')) return 'Schläge';

    return raw
      .replace(/kritische\s+treffer(?:tabelle|(?:\s+tabelle)?)?/gi, '')
      .replace(/kampfkunst|kampfsport|martial arts/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return key.replace(/_/g, ' ');
}

export const WEAPON_GROUPS = [
  { label: 'Schwerter', keys: ['BREITSCHWERT', 'FALCHION', 'KURZSCHWERT', 'MAINEGAUCHE', 'RAPIER', 'SCIMITAR', 'ZWEIHÄNDER'] },
  { label: 'Bogen', keys: ['COMPOSITEBOGEN', 'KURZBOGEN', 'LANGBOGEN'] },
  { label: 'Armbrüste', keys: ['LEICHTE_ARMBRUST', 'SCHWERE_ARMBRUST'] },
  { label: 'Stangenwaffen', keys: ['STANGENWAFFE', 'KAMPFSTAB', 'LANZE', 'SPEER', 'WURFSPEER'] },
  { label: 'Äxte & Beile', keys: ['HANDAXT', 'KAMPFAXT', 'KRIEGSBEIL'] },
  { label: 'Hämmer & Keulen', keys: ['KRIEGSHAMMER', 'STREITKOLBEN', 'MORGENSTERN', 'KEULE', 'FLAIL'] },
  { label: 'Sonstige', keys: ['DOLCH', 'BOLA', 'SCHLEUDER', 'PEITSCHE', 'PANZERFAUST'] },
  {
    label: 'Naturangriffe',
    keys: ['BEISSEN', 'KRATZEN', 'STECHEN', 'PIEKSEN', 'HORN', 'RAMMEN', 'TRAMPEL', 'QUETSCHEN', 'GREIFEN', 'FEGEN', 'SCHLAGEN', 'KLEINTIERE']
  }
];

/** Waffen-Keys der Gruppe „Naturangriffe“ (Licht-Modus / Krit Kleine_Tiere). */
export const NATUR_WEAPON_KEYS = new Set(
  (WEAPON_GROUPS.find((g) => g.label === 'Naturangriffe')?.keys || []).map((k) => String(k).toUpperCase())
);

/**
 * Naturangriffe: Basis-Tabelle + drei Varianten (Merge je nach Angriffsklasse).
 * klein/mittel/gross = Reihenfolge der aufeinander aufbauenden Erweiterungen.
 */
export const WEAPON_SIZE_VARIANTS = {
  BEISSEN: { klein: 'BEISSEN_SMALL', mittel: 'BEISSEN_MEDIUM', gross: 'BEISSEN_LARGE' },
  KRATZEN: { klein: 'KRATZEN_SMALL', mittel: 'KRATZEN_MEDIUM', gross: 'KRATZEN_LARGE' },
  STECHEN: { klein: 'STECHEN_SMALL', mittel: 'STECHEN_MEDIUM', gross: 'STECHEN_LARGE' },
  PIEKSEN: { klein: 'PIEKSEN_SMALL', mittel: 'PIEKSEN_MEDIUM', gross: 'PIEKSEN_LARGE' },
  HORN: { klein: 'HORN_SMALL', mittel: 'HORN_MEDIUM', gross: 'HORN_LARGE' },
  RAMMEN: { klein: 'RAMMEN_SMALL', mittel: 'RAMMEN_MEDIUM', gross: 'RAMMEN_LARGE' },
  TRAMPEL: { klein: 'TRAMPEL_SMALL', mittel: 'TRAMPEL_MEDIUM', gross: 'TRAMPEL_LARGE' },
  QUETSCHEN: { klein: 'QUETSCHEN_SMALL', mittel: 'QUETSCHEN_MEDIUM', gross: 'QUETSCHEN_LARGE' },
  GREIFEN: { klein: 'GREIFEN_SMALL', mittel: 'GREIFEN_MEDIUM', gross: 'GREIFEN_LARGE' },
  FEGEN: { klein: 'FEGEN_RANK1', mittel: 'FEGEN_RANK2', gross: 'FEGEN_RANK3' },
  SCHLAGEN: { klein: 'SCHLAGEN_RANK1', mittel: 'SCHLAGEN_RANK2', gross: 'SCHLAGEN_RANK3' },
  KLEINTIERE: { klein: 'KLEINTIERE_NORMAL', mittel: 'KLEINTIERE_RANK1', gross: 'KLEINTIERE_RANK2' }
};

export const WEAPON_SIZE_ORDER = ['klein', 'mittel', 'gross', 'riesig'];

export const WEAPON_SIZE_LABELS = {
  klein: 'Klein',
  mittel: 'Mittel',
  gross: 'Gross',
  riesig: 'Riesig'
};

/** Tabellen-Keys ohne eigenen Button (nur für Merge). */
export const WEAPON_VARIANT_KEY_SET = new Set(
  Object.values(WEAPON_SIZE_VARIANTS).flatMap((v) => [v.klein, v.mittel, v.gross])
);

/** Deutsche Anzeigenamen: Art (Beschreibung), orientiert an Icon-Dateinamen */
export const WEAPON_LABELS = {
  HANDAXT: 'Handaxt',
  DOLCH: 'Dolch',
  PANZERFAUST: 'Faust\n(gepanzert)',
  KAMPFAXT: 'Axt\n(2H)',
  BOLA: 'Bola',
  BREITSCHWERT: 'Schwert\n(normal)',
  KEULE: 'Knüppel',
  COMPOSITEBOGEN: 'Bogen\n(Komposit)',
  FALCHION: 'Falchion',
  FLAIL: 'Flegel',
  SCHWERE_ARMBRUST: 'Armbrust\n(schwer)',
  WURFSPEER: 'Speer\n(Wurf)',
  LANZE: 'Lanze',
  LEICHTE_ARMBRUST: 'Armbrust\n(leicht)',
  LANGBOGEN: 'Bogen\n(lang)',
  STREITKOLBEN: 'Streit-\nkolben',
  MAINEGAUCHE: 'Main\ngauche',
  MORGENSTERN: 'Morgen-\nstern',
  STANGENWAFFE: 'Helle-\nbarde',
  KAMPFSTAB: 'Stab',
  RAPIER: 'Rapier',
  SCIMITAR: 'Krummsäbel',
  KURZBOGEN: 'Bogen\n(kurz)',
  KURZSCHWERT: 'Schwert\n(kurz)',
  SCHLEUDER: 'Schleuder',
  SPEER: 'Speer',
  ZWEIHÄNDER: 'Schwert\n(2H)',
  KRIEGSHAMMER: 'Hammer',
  KRIEGSBEIL: 'Kriegs-\nbeil',
  PEITSCHE: 'Peitsche',
  BEISSEN: 'Biss',
  FEGEN: 'Wurf',
  GREIFEN: 'Griff',
  HORN: 'Hörner',
  KLEINTIERE: 'Kleintier',
  KRATZEN: 'Klaue',
  PIEKSEN: 'Schnabel\n/ Zange',
  QUETSCHEN: 'Sturz',
  RAMMEN: 'Ramm-\nstoss',
  SCHLAGEN: 'Schlag',
  STECHEN: 'Stachel',
  TRAMPEL: 'Trampeln',
};

/**
 * Icon-Datei pro Waffe (ohne Pfad), orientiert an assets/icons/
 * Erwartete neue Icons (falls hinzugefügt): Bola.png, Armbrust.png, Falchion.png,
 * Flegel.png, Lanze.png, Rapier.png, Krummsaebel.png, Streitkolben.png,
 * MainGauche.png, Morgenstern.png, Zweihandschwert.png
 */
export const WEAPON_ICONS = {
  HANDAXT: 'handaxt.png',
  DOLCH: 'dolch.png',
  PANZERFAUST: 'gep. faust.png',
  KAMPFAXT: 'axt (2h).png',
  BOLA: 'Bola.png',
  BREITSCHWERT: 'schwert.png',
  KEULE: 'knueppel.png',
  COMPOSITEBOGEN: 'komp. bogen.png',
  FALCHION: 'Falchion.png',
  FLAIL: 'Flegel.png',
  SCHWERE_ARMBRUST: 'Armbrust.png',
  WURFSPEER: 'speer.png',
  LANZE: 'Lanze.png',
  LEICHTE_ARMBRUST: 'Armbrust.png',
  LANGBOGEN: 'langbogen.png',
  STREITKOLBEN: 'Streitkolben.png',
  MAINEGAUCHE: 'MainGauche.png',
  MORGENSTERN: 'Morgenstern.png',
  STANGENWAFFE: 'halberd.png',
  KAMPFSTAB: 'stab.png',
  RAPIER: 'Rapier.png',
  SCIMITAR: 'Krummsaebel.png',
  KURZBOGEN: 'kurzbogen.png',
  KURZSCHWERT: 'kurzschwert.png',
  SCHLEUDER: 'schleuder.png',
  SPEER: 'speer.png',
  ZWEIHÄNDER: 'Zweihandschwert.png',
  KRIEGSHAMMER: 'hammer.png',
  KRIEGSBEIL: 'Kriegsbeil.png',
  PEITSCHE: 'Peitsche.png',
  BEISSEN: 'beissen.png',
  FEGEN: 'fegen.png',
  GREIFEN: 'greifen.png',
  HORN: 'horn.png',
  KLEINTIERE: 'kleintiere.png',
  KRATZEN: 'kratzen.png',
  PIEKSEN: 'pieksen.png',
  QUETSCHEN: 'quetschen.png',
  RAMMEN: 'rammen.png',
  SCHLAGEN: 'schlagen.png',
  STECHEN: 'stechen.png',
  TRAMPEL: 'trampel.png',
};

/** Icon pro Krit-Typ (Haupt- und Nebentreffer) */
export const CRIT_ICONS = {
  'Hieb': 'hieb.png',
  'Stich': 'stich.png',
  'Stoss': 'stoss.png',
  'Streich': 'streich.png',
  'Elektro': 'elektrizitaet.png',
  'Hitze': 'hitze.png',
  'Kälte': 'kaelte.png',
  'Schlag': 'schlag.png',
  'Hieb (Held)': 'hieb.png',
  'Stich (Held)': 'stich.png',
  'Stoss (Held)': 'stoss.png',
  'Streich (Held)': 'streich.png',
  'Allgemeine Patzer': 'Patzer.png',
  'Waffenpatzer': 'Patzer.png',
  'Grosse Wesen': 'gegner_gross.png',
  'Gewaltige Wesen': 'gegner_gewaltig.png',
};

/**
 * Ermittelt ein passendes Icon für Krit-Tabellen, inkl. Englisch-Zusatztabellen.
 * Nutzt zuerst exakte Treffer, danach heuristische Schlüsselwörter.
 */
export function resolveCritIcon(typ) {
  if (!typ) return null;
  if (CRIT_ICONS[typ]) return CRIT_ICONS[typ];
  const t = String(typ).toLowerCase();
  if (t.includes('allgemeine_patzer') || t.includes('waffenpatzer')) return 'Patzer.png';
  if (t.includes('aus_dem_gleichgewicht') || t.includes('ungleichgewicht') || t.includes('ausbalancier') || t.includes('unbalancing') || t.includes('feger')) return 'fegen.png';
  if (t.includes('greifen') || t.includes('griffkampf') || t.includes('grappling')) return 'greifen.png';
  if (t.includes('ringkampf') || t.includes('wuerfe') || t.includes('würfe')) return 'quetschen.png';
  if (t.includes('kleine_tiere') || t.includes('winzige_tier') || t.includes('tiny_animal')) return 'kleintiere.png';
  if (t.includes('schlag') || t.includes('schlaege') || t.includes('schläge') || t.includes('striking')) return 'schlagen.png';
  if (t.includes('sweeps_and_throws')) return 'fegen.png';
  if (t.includes('kratzen') || t.includes('klauen')) return 'kratzen.png';
  if (t.includes('beissen') || t.includes('beißen') || t.includes('biss')) return 'beissen.png';
  if (t.includes('pieksen')) return 'pieksen.png';
  if (t.includes('stechen') || t.includes('stich')) return 'stechen.png';
  if (t.includes('rammen')) return 'rammen.png';
  if (t.includes('trampel')) return 'trampel.png';
  return null;
}

/** Basis-Pfad für Kampf-Loop-MP3s (siehe assets/audio/kampf/). */
export const KAMPF_AUDIO_BASE_PATH = 'assets/audio/kampf/';

/** In JSON / UI gespeicherte Gegner-Grösse (klein nur für Musik-Regeln, sonst wie normal). */
export const GEGNER_TYP_ALLOWED = ['klein', 'normal', 'gross', 'gewaltig'];

export const GEGNER_TYP_LABELS = {
  klein: 'Klein',
  normal: 'Normal',
  gross: 'Gross',
  gewaltig: 'Gewaltig'
};

export function coerceGegnerTypStored(value) {
  const v = String(value || '').toLowerCase();
  return GEGNER_TYP_ALLOWED.includes(v) ? v : 'normal';
}

/** Für Krit/Angriffstabellen: klein zählt wie normal. */
export function gegnerTypForGameRules(gegnerTyp) {
  const t = coerceGegnerTypStored(gegnerTyp);
  return t === 'klein' ? 'normal' : t;
}

/** Rüstungsmaterial für Monster-Angriffstabellen (Spalten PL–OR). */
export const RUESTUNG_TYP_ALLOWED = ['PL', 'KE', 'VL', 'LE', 'OR'];

export const RUESTUNG_TYP_LABELS = {
  PL: 'Platte',
  KE: 'Kette',
  VL: 'Vollleder',
  LE: 'Leder',
  OR: 'Ohne Rüstung'
};

export function coerceRuestungTyp(value) {
  const v = String(value || '').toUpperCase();
  return RUESTUNG_TYP_ALLOWED.includes(v) ? v : 'LE';
}

/**
 * Typische Zuordnung RK → Rüstungsspalte (Schatten-Tabellen PL–OR).
 * RK 1–4 OR, 5–8 LE, 9–12 VL, 13–16 KE, 17–20 PL.
 */
export function ruestungTypFromRk(rk) {
  const n = Math.max(1, Math.min(20, parseInt(rk, 10) || 20));
  if (n <= 4) return 'OR';
  if (n <= 8) return 'LE';
  if (n <= 12) return 'VL';
  if (n <= 16) return 'KE';
  return 'PL';
}

/**
 * Effektive Rüstungsspalte für Monsterangriffe (Schatten).
 * Standard: aus RK ableiten. Bei ruestungAnRKKoppeln === false manuelles ruestungTyp.
 */
export function trefferRuestungTypFromZiel(ziel) {
  if (!ziel) return 'LE';
  if (ziel.ruestungAnRKKoppeln === false) {
    return coerceRuestungTyp(ziel.ruestungTyp);
  }
  const rk = Math.max(1, Math.min(20, parseInt(ziel.rk, 10) || 20));
  return ruestungTypFromRk(rk);
}

/** Monster-Waffenkategorien (Schatten-Modus). */
export const MONSTER_WEAPON_GROUPS = [
  {
    label: 'Monster',
    keys: ['GEGNER_1HKW', 'GEGNER_1HSW', 'GEGNER_2HW', 'GEGNER_FKW', 'GEGNER_ZUK', 'GEGNER_RUS']
  }
];

export const GEGNER_WEAPON_LABELS = {
  GEGNER_1HKW: '1H Klinge',
  GEGNER_1HSW: '1H Schlag',
  GEGNER_2HW: 'Zweihand',
  GEGNER_FKW: 'Fernkampf',
  GEGNER_ZUK: 'Zähne & Klauen',
  GEGNER_RUS: 'Ringen & Stossen'
};

/** Icons für Monster-Angriffsarten (Reuse aus Spieler-Waffen-Icons). */
export const GEGNER_WEAPON_ICONS = {
  GEGNER_1HKW: 'schwert.png',
  GEGNER_1HSW: 'hammer.png',
  GEGNER_2HW: 'Zweihandschwert.png',
  GEGNER_FKW: 'langbogen.png',
  GEGNER_ZUK: 'beissen.png',
  GEGNER_RUS: 'greifen.png'
};

/** Fallback Krit-Tabelle im Schatten, wenn die Gegner-Zelle keinen eigenen Typ hat (z. B. nur „12A“ → P). */
export const GEGNER_CRIT_TYP = {
  GEGNER_1HKW: 'Hieb',
  GEGNER_1HSW: 'Streich',
  GEGNER_2HW: 'Hieb',
  GEGNER_FKW: 'Stich',
  GEGNER_ZUK: 'Stich',
  GEGNER_RUS: 'Stoss'
};

export function getGegnerCritTyp(gegnerTableKey) {
  return GEGNER_CRIT_TYP[gegnerTableKey] || '';
}

/**
 * Spieler-Waffe → Gegner-Angriffstabellen-Key (Trefferpunkte/Kategorie im Schatten).
 * Krit-Tabelle und −50-Regel kommen aus der Gegner-Zelle (T / AT / P …).
 */
export const WEAPON_TO_GEGNER_TABLE = {
  BREITSCHWERT: 'GEGNER_1HKW',
  FALCHION: 'GEGNER_1HKW',
  KURZSCHWERT: 'GEGNER_1HKW',
  MAINEGAUCHE: 'GEGNER_1HKW',
  RAPIER: 'GEGNER_1HKW',
  SCIMITAR: 'GEGNER_1HKW',
  DOLCH: 'GEGNER_1HKW',
  HANDAXT: 'GEGNER_1HKW',
  ZWEIHÄNDER: 'GEGNER_2HW',
  KAMPFAXT: 'GEGNER_2HW',
  KRIEGSHAMMER: 'GEGNER_1HSW',
  STREITKOLBEN: 'GEGNER_1HSW',
  MORGENSTERN: 'GEGNER_1HSW',
  KEULE: 'GEGNER_1HSW',
  FLAIL: 'GEGNER_1HSW',
  KRIEGSBEIL: 'GEGNER_1HSW',
  PANZERFAUST: 'GEGNER_1HSW',
  COMPOSITEBOGEN: 'GEGNER_FKW',
  KURZBOGEN: 'GEGNER_FKW',
  LANGBOGEN: 'GEGNER_FKW',
  LEICHTE_ARMBRUST: 'GEGNER_FKW',
  SCHWERE_ARMBRUST: 'GEGNER_FKW',
  SCHLEUDER: 'GEGNER_FKW',
  WURFSPEER: 'GEGNER_FKW',
  BOLA: 'GEGNER_FKW',
  STANGENWAFFE: 'GEGNER_RUS',
  KAMPFSTAB: 'GEGNER_RUS',
  LANZE: 'GEGNER_RUS',
  SPEER: 'GEGNER_RUS',
  PEITSCHE: 'GEGNER_RUS',
  BEISSEN: 'GEGNER_ZUK',
  KRATZEN: 'GEGNER_ZUK',
  STECHEN: 'GEGNER_ZUK',
  PIEKSEN: 'GEGNER_ZUK',
  HORN: 'GEGNER_ZUK',
  TRAMPEL: 'GEGNER_ZUK',
  QUETSCHEN: 'GEGNER_ZUK',
  KLEINTIERE: 'GEGNER_ZUK',
  SCHLAGEN: 'GEGNER_ZUK',
  GREIFEN: 'GEGNER_RUS',
  FEGEN: 'GEGNER_RUS',
  RAMMEN: 'GEGNER_RUS'
};

export function getGegnerTableKeyForWeapon(weaponKey) {
  if (!weaponKey) return '';
  if (WEAPON_TO_GEGNER_TABLE[weaponKey]) return WEAPON_TO_GEGNER_TABLE[weaponKey];
  if (String(weaponKey).startsWith('GEGNER_')) return weaponKey;
  return '';
}

export function coerceIstHeld(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

/** ZuK/RuS: Merge aus Basis + Grössen-Tabellen je nach schattenMusikKategorie. */
export const GEGNER_SIZE_VARIANTS = {
  GEGNER_ZUK: { klein: 'GEGNER_ZUK_KLEIN', mittel: 'GEGNER_ZUK_MITTEL', gross: 'GEGNER_ZUK_GROSS' },
  GEGNER_RUS: { klein: 'GEGNER_RUS_KLEIN', mittel: 'GEGNER_RUS_MITTEL', gross: 'GEGNER_RUS_GROSS' }
};

export const GEGNER_VARIANT_KEY_SET = new Set(
  Object.values(GEGNER_SIZE_VARIANTS).flatMap((v) => [v.klein, v.mittel, v.gross])
);

export const MUSIK_PROFIL_VALUES = ['barde', 'nordling', 'hobbit', 'zwerg', 'gondorian', 'npc_verbündet', 'gegner'];

export const MUSIK_PROFIL_LABELS = {
  barde: 'Barde',
  nordling: 'Nordling / Waldläufer',
  hobbit: 'Hobbit',
  zwerg: 'Zwerg',
  gondorian: 'Gondorianer',
  npc_verbündet: 'NPC Verbündet (Standard)',
  gegner: 'Gegner (Musik)'
};

export function defaultMusikProfilForEntityTyp(typ) {
  if (typ === 'gegner') return 'gegner';
  if (typ === 'npc') return 'npc_verbündet';
  return 'barde';
}

export function coerceMusikProfil(value, entityTyp) {
  const fallback = defaultMusikProfilForEntityTyp(entityTyp);
  return MUSIK_PROFIL_VALUES.includes(value) ? value : fallback;
}

export const URLS = {
  TREFFER_URL: 'assets/data/treffer_tabellen_strukturiert.json',
  TABLES_URL: 'assets/data/tables_processed.json',
  PATZER_URL: 'assets/data/patzer_default.json',
  AUDIO_BASE_PATH: 'assets/audio/',
  FONT_BASE_PATH: 'assets/fonts/',
  IMG_BASE_PATH: 'assets/img/',
  ICONS_BASE_PATH: 'assets/icons/',
};

/** Icons für Gegner, NPCs und Charaktere (Dateiname → Anzeigename) */
export const CHARAKTER_ICONS = {
  'bad_guy.png': 'Bösewicht',
  'bard.png': 'Barde',
  'bard2.png': 'Barde (2)',
  'demon.png': 'Dämon',
  'dragon.png': 'Drache',
  'elemental.png': 'Elementar (Feuer)',
  'dwarf.png': 'Zwerg',
  'elf.png': 'Elf',
  'gondorian.png': 'Gondorianer',
  'hobbit.png': 'Hobbit',
  'nazgul.png': 'Nazgûl',
  'orc.png': 'Ork',
  'ranger.png': 'Waldläufer',
  'troll.png': 'Troll',
  'undeath.png': 'Untoter',
  'warg.png': 'Warg',
  'wizard.png': 'Zauberer',
  'gegner_normal.png': 'Goblin',
  'gegner_gross.png': 'Oger',
  'gegner_gewaltig.png': 'Drake',
  'megli.png': 'Megli',
  'harrass.png': 'Harrass',
  'elb_schwarz.png': 'Elf (dunkel)',
  'untoter_koenig.png': 'Untoter König',
  'olog_hai.png': 'Olog-hai',
  'uruk_hai.png': 'Uruk-hai',
  'ork_klein.png': 'Ork (klein)',
  'zwerg_schwarz.png': 'Zwerg (dunkel)',
  'zwerg_grau.png': 'Zwerg (grau)',
};

export const DEFAULT_RK = 3;

/**
 * Modifikation auf den gewürfelten Wert (wird zum Wurf addiert), abhängig von der gewählten Spalte.
 * Schlüssel = Kategorien unter „Allgemeine Patzer“ in tables_processed.json.
 */
export const PATZER_CONTEXT_MODS = {
  Nahkampf: [
    { id: 'einh_schlag', label: 'Einhändige Schlagwaffen', mod: -20 },
    { id: 'einh_klinge', label: 'Einhändige Klingenwaffen', mod: -10 },
    { id: 'zweihand', label: 'Zweihandwaffen', mod: 0 },
    { id: 'stangen', label: 'Stangenwaffen', mod: 10 },
    { id: 'beritten', label: 'Berittener Kampf', mod: 20 }
  ],
  Fernkampf: [
    { id: 'schleuder', label: 'Schleuder', mod: -20 },
    { id: 'kurzbogen', label: 'Kurzbogen', mod: -10 },
    { id: 'komposit', label: 'Kompositbogen', mod: 0 },
    { id: 'langbogen', label: 'Langbogen', mod: 10 },
    { id: 'armbrust', label: 'Armbrust', mod: 20 }
  ],
  Zauber: [
    { id: 'stufe_i', label: 'Zauberstufe I', mod: -20 },
    { id: 'stufe_n', label: 'Zauberstufe N', mod: -10 },
    { id: 'stufe_p', label: 'Zauberstufe P', mod: 0 },
    { id: 'stufe_a', label: 'Zauberstufe A', mod: 10 },
    { id: 'stufe_e', label: 'Zauberstufe E', mod: 20 }
  ],
  Manöver: [
    { id: 'routine', label: 'Routine-Manöver', mod: -50 },
    { id: 'einfach', label: 'Einfache Manöver', mod: -35 },
    { id: 'leicht', label: 'Leichte Manöver', mod: -20 },
    { id: 'mittel', label: 'Mittlere Manöver', mod: -10 },
    { id: 'schwer', label: 'Schwere Manöver', mod: 0 },
    { id: 'sehr_schwer', label: 'Sehr schwere Manöver', mod: 5 },
    { id: 'aeusserst', label: 'Äußerst schwere Manöver', mod: 10 },
    { id: 'fast_verrueckt', label: 'Fast verrückte Manöver', mod: 15 },
    { id: 'absurd', label: 'Absurde Manöver', mod: 20 }
  ]
};