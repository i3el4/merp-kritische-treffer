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

export const PATZER_KATEGORIEN = [
  { id: 'allgemein', label: 'Allgemeiner Patzer', mod: 0 },
  { id: 'leichtes_manoever', label: 'Leichtes Manöver', mod: -60 },
  { id: 'leichtsinnig', label: 'Leichtsinniges Manöver', mod: 10 }
];

export const PATZER_MATERIAL_MODS = [
  { id: 'normal', label: 'Normal', mod: 0 },
  { id: 'holz', label: 'Holz', mod: -5 },
  { id: 'stahl', label: 'Stahl', mod: 0 },
  { id: 'mithril', label: 'Mithril', mod: 10 }
];

export const PATZER_SCHWIERIGKEIT_MODS = [
  { id: 'leicht', label: 'Leicht', mod: -10 },
  { id: 'normal', label: 'Normal', mod: 0 },
  { id: 'schwer', label: 'Schwer', mod: 10 },
  { id: 'extrem', label: 'Extrem', mod: 20 }
];