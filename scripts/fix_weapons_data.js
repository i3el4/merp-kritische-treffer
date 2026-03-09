#!/usr/bin/env node
/**
 * Bereinigt die Waffendaten in treffer_tabellen_strukturiert.json:
 * - Monotonie für Trefferpunkte (TP darf bei sinkendem Angriff nicht steigen)
 * - Monotonie für Krit-Kategorie (Schweregrad darf bei sinkendem Angriff nicht steigen)
 * - Plausibilität für Krit-Typ (nur erlaubte Typen pro Waffe)
 */

const fs = require('fs');
const path = require('path');

const JSON_PATH = path.join(__dirname, '../assets/data/treffer_tabellen_strukturiert.json');

// Schweregrad: E=5, D=4, C=3, B=2, A=1, null=0 (niedriger = schwerer)
const KAT_TO_NUM = { E: 5, D: 4, C: 3, B: 2, A: 1, null: 0 };
const NUM_TO_KAT = { 5: 'E', 4: 'D', 3: 'C', 2: 'B', 1: 'A', 0: null };

// Erlaubte Krit-Typen pro Waffe: { allowed: string[], default: string }
const WEAPON_TYPES = {
  // Krush (K): Hämmer, Keulen, Flails
  KRIEGSHAMMER: { allowed: ['K'], default: 'K' },
  STREITKOLBEN: { allowed: ['K'], default: 'K' },
  FLAIL: { allowed: ['K', 'P'], default: 'K' }, // Flail kann auch P haben
  KRIEGSBEIL: { allowed: ['K'], default: 'K' },
  KEULE: { allowed: ['K'], default: 'K' },
  BOLA: { allowed: ['K'], default: 'K' },
  MORGENSTERN: { allowed: ['K'], default: 'K' },
  PANZERFAUST: { allowed: ['K'], default: 'K' },
  KAMPFSTAB: { allowed: ['K'], default: 'K' },

  // Puncture (P): Bogen, Armbrust, Speere
  COMPOSITEBOGEN: { allowed: ['P', 'K'], default: 'P' },
  LANGBOGEN: { allowed: ['P', 'K'], default: 'P' },
  KURZBOGEN: { allowed: ['P', 'K'], default: 'P' },
  SCHWERE_ARMBRUST: { allowed: ['P'], default: 'P' },
  LEICHTE_ARMBRUST: { allowed: ['P'], default: 'P' },
  WURFSPEER: { allowed: ['P'], default: 'P' },
  SPEER: { allowed: ['P', 'K'], default: 'P' },
  LANZE: { allowed: ['P'], default: 'P' },
  SCHLEUDER: { allowed: ['P', 'K'], default: 'P' },

  // Swords: K, S, P je nach Situation
  BREITSCHWERT: { allowed: ['K', 'S', 'P'], default: 'K' },
  KURZSCHWERT: { allowed: ['K', 'S', 'P'], default: 'K' },
  ZWEIHÄNDER: { allowed: ['K', 'S', 'P'], default: 'K' },
  FALCHION: { allowed: ['K', 'S', 'P'], default: 'K' },
  SCIMITAR: { allowed: ['K', 'S', 'P'], default: 'K' },
  RAPIER: { allowed: ['K', 'S', 'P'], default: 'P' },
  MAINEGAUCHE: { allowed: ['P', 'K', 'S'], default: 'P' },

  // Axe: Hieb und Streich
  HANDAXT: { allowed: ['K', 'S'], default: 'K' },
  KAMPFAXT: { allowed: ['K', 'S'], default: 'K' },

  // Sonstige
  DOLCH: { allowed: ['P', 'K', 'S'], default: 'P' },
  STANGENWAFFE: { allowed: ['P', 'K', 'S'], default: 'P' },
  PEITSCHE: { allowed: ['S', 'K'], default: 'S' },
};

function katToNum(kat) {
  return kat == null ? 0 : (KAT_TO_NUM[kat] ?? 0);
}

function numToKat(n) {
  return NUM_TO_KAT[n] ?? null;
}

function main() {
  const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  const tables = data.Angriffstabellen;
  if (!tables) {
    console.error('Keine Angriffstabellen gefunden.');
    process.exit(1);
  }

  let fixedTP = 0;
  let fixedKat = 0;
  let fixedTyp = 0;

  for (const [weaponKey, weaponData] of Object.entries(tables)) {
    const rkBlock = weaponData?.RK;
    if (!rkBlock) continue;

    const typeConfig = WEAPON_TYPES[weaponKey] || {
      allowed: ['K', 'P', 'S'],
      default: 'K',
    };

    for (const [rkKey, attackBlock] of Object.entries(rkBlock)) {
      const attackKeys = Object.keys(attackBlock)
        .map(Number)
        .filter((n) => !Number.isNaN(n))
        .sort((a, b) => b - a); // 150, 149, 148, ...

      let prevTP = null;
      let prevKatNum = null;

      for (const atk of attackKeys) {
        const entry = attackBlock[String(atk)];
        if (!entry) continue;

        // 1. Trefferpunkte-Monotonie
        const tp = entry.trefferpunkte;
        if (prevTP !== null && tp !== null && tp > prevTP) {
          entry.trefferpunkte = prevTP;
          fixedTP++;
        }
        if (entry.trefferpunkte !== null) {
          prevTP = entry.trefferpunkte;
        }

        // 2. Krit-Kategorie-Monotonie
        const katNum = katToNum(entry.krit_kat);
        if (prevKatNum !== null && katNum > prevKatNum) {
          entry.krit_kat = numToKat(prevKatNum);
          fixedKat++;
        }
        if (entry.krit_kat != null) {
          prevKatNum = katToNum(entry.krit_kat);
        }

        // 3. Krit-Typ-Plausibilität
        const typ = entry.krit_typ;
        if (typ != null && !typeConfig.allowed.includes(typ)) {
          entry.krit_typ = typeConfig.default;
          fixedTyp++;
        }
      }
    }
  }

  fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2), 'utf8');

  console.log('fix_weapons_data.js – Bereinigung abgeschlossen.');
  console.log(`  Fixed ${fixedTP} TP (Trefferpunkte) inconsistencies`);
  console.log(`  Fixed ${fixedKat} Crit Category (Schweregrad) inconsistencies`);
  console.log(`  Fixed ${fixedTyp} Crit Type (ungültige Typen)`);
  console.log(`  Gespeichert: ${JSON_PATH}`);
}

main();
