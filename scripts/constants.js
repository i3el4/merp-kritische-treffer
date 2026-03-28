// constants.js
// Dieses Modul enthält alle festen Pfade und Konfigurationen.

/**
 * Waffengruppen für die Anzeige (Reihenfolge = Anzeige-Reihenfolge).
 * Jede Gruppe enthält die Waffen-Keys aus Angriffstabellen.
 */
export const WEAPON_GROUPS = [
  { label: 'Schwerter', keys: ['BREITSCHWERT', 'FALCHION', 'KURZSCHWERT', 'MAINEGAUCHE', 'RAPIER', 'SCIMITAR', 'ZWEIHÄNDER'] },
  { label: 'Bogen', keys: ['COMPOSITEBOGEN', 'KURZBOGEN', 'LANGBOGEN'] },
  { label: 'Armbrüste', keys: ['LEICHTE_ARMBRUST', 'SCHWERE_ARMBRUST'] },
  { label: 'Stangenwaffen', keys: ['STANGENWAFFE', 'KAMPFSTAB', 'LANZE', 'SPEER', 'WURFSPEER'] },
  { label: 'Äxte & Beile', keys: ['HANDAXT', 'KAMPFAXT', 'KRIEGSBEIL'] },
  { label: 'Hämmer & Keulen', keys: ['KRIEGSHAMMER', 'STREITKOLBEN', 'MORGENSTERN', 'KEULE', 'FLAIL'] },
  { label: 'Sonstige', keys: ['DOLCH', 'BOLA', 'SCHLEUDER', 'PEITSCHE', 'PANZERFAUST'] }
];

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
  LANZE: 'speer.png',
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
  KURZSCHWERT: 'Kurzschwert.png',
  SCHLEUDER: 'schleuder.png',
  SPEER: 'speer.png',
  ZWEIHÄNDER: 'axt (2h).png',
  KRIEGSHAMMER: 'hammer.png',
  KRIEGSBEIL: 'Kriegsbeil.png',
  PEITSCHE: 'Peitsche.png',
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