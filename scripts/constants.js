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
  PANZERFAUST: 'Faust (gepanzert)',
  KAMPFAXT: 'Axt (2H)',
  BOLA: 'Bola',
  BREITSCHWERT: 'Schwert (normal)',
  KEULE: 'Knüppel',
  COMPOSITEBOGEN: 'Bogen (Komposit)',
  FALCHION: 'Falchion',
  FLAIL: 'Flegel',
  SCHWERE_ARMBRUST: 'Armbrust (schwer)',
  WURFSPEER: 'Speer (Wurf)',
  LANZE: 'Lanze',
  LEICHTE_ARMBRUST: 'Armbrust (leicht)',
  LANGBOGEN: 'Bogen (lang)',
  STREITKOLBEN: 'Streitkolben',
  MAINEGAUCHE: 'Main gauche',
  MORGENSTERN: 'Morgenstern',
  STANGENWAFFE: 'Hellebarde',
  KAMPFSTAB: 'Stab',
  RAPIER: 'Rapier',
  SCIMITAR: 'Krummsäbel',
  KURZBOGEN: 'Bogen (kurz)',
  KURZSCHWERT: 'Schwert (kurz)',
  SCHLEUDER: 'Schleuder',
  SPEER: 'Speer',
  ZWEIHÄNDER: 'Schwert (2H)',
  KRIEGSHAMMER: 'Hammer',
  KRIEGSBEIL: 'Kriegsbeil',
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
  AUDIO_BASE_PATH: 'assets/audio/',
  FONT_BASE_PATH: 'assets/fonts/',
  IMG_BASE_PATH: 'assets/img/',
  ICONS_BASE_PATH: 'assets/icons/',
};

/** Icons für Gegner, NPCs und Charaktere (Dateiname → Anzeigename) */
export const CHARAKTER_ICONS = {
  'bad_guy.png': 'Bösewicht',
  'bard.png': 'Barde',
  'dragon.png': 'Drache',
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
};

export const DEFAULT_RK = 3;