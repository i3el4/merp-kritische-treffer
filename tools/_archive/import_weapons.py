#!/usr/bin/env python3
"""
Importiert Waffendaten aus Excel-Dateien (Angriffstabelle_MERP_*.xlsx) 
in treffer_tabellen_strukturiert.json.
"""

import json
import re
from pathlib import Path

try:
    import openpyxl
except ImportError:
    print("Bitte openpyxl installieren: pip install openpyxl")
    exit(1)

# Mapping: Dateiname (ohne Präfix) -> JSON-Key (konsistent zu HANDAXT, DOLCH)
WEAPON_NAME_MAP = {
    "ArmoredFist": "PANZERFAUST",
    "BattleAxe": "KAMPFAXT",
    "Bola": "BOLA",
    "BroadSword": "BREITSCHWERT",
    "Club": "KEULE",
    "CompositeBow": "COMPOSITEBOGEN",
    "Falchion": "FALCHION",
    "Flail": "FLAIL",
    "HeavyCrossbow": "SCHWERE_ARMBRUST",
    "Javelin": "WURFSPEER",
    "Lance": "LANZE",
    "LightCrossbow": "LEICHTE_ARMBRUST",
    "LongBow": "LANGBOGEN",
    "Mace": "STREITKOLBEN",
    "MaineGauche": "MAINEGAUCHE",
    "MorningStar": "MORGENSTERN",
    "PoleArm": "STANGENWAFFE",
    "Quarterstaff": "KAMPFSTAB",
    "Rapier": "RAPIER",
    "Scimitar": "SCIMITAR",
    "ShortBow": "KURZBOGEN",
    "ShortSword": "KURZSCHWERT",
    "Sling": "SCHLEUDER",
    "Spear": "SPEER",
    "TwoHandedSword": "ZWEIHÄNDER",
    "WarHammer": "KRIEGSHAMMER",
    "WarMattock": "KRIEGSBEIL",
    "Whip": "PEITSCHE",
}


def parse_cell_value(cell_val):
    """
    Parst Zellenwert auf trefferpunkte, krit_typ, krit_kat.
    Muster A: Zahl + 2 Buchstaben (z.B. 14CK)
    Muster B: Zahl + 1 Buchstabe (z.B. 5A)
    Muster C: Nur Zahl (z.B. 3, 0)
    """
    if cell_val is None or (isinstance(cell_val, str) and not cell_val.strip()):
        return {"trefferpunkte": None, "krit_typ": None, "krit_kat": None}

    s = str(cell_val).strip()

    # Muster A: Zahl + 2 Buchstaben (z.B. 14CK, 8EK)
    m = re.match(r"^(\d+)([A-E])([A-Z])$", s, re.IGNORECASE)
    if m:
        return {
            "trefferpunkte": int(m.group(1)),
            "krit_kat": m.group(2).upper(),
            "krit_typ": m.group(3).upper(),
        }

    # Muster B: Zahl + 1 Buchstabe
    m = re.match(r"^(\d+)([A-E])$", s, re.IGNORECASE)
    if m:
        return {
            "trefferpunkte": int(m.group(1)),
            "krit_kat": m.group(2).upper(),
            "krit_typ": None,
        }

    # Muster C: Nur Zahl
    m = re.match(r"^(\d+)$", s)
    if m:
        return {
            "trefferpunkte": int(m.group(1)),
            "krit_typ": None,
            "krit_kat": None,
        }

    # Fallback: unbekanntes Format
    return {"trefferpunkte": None, "krit_typ": None, "krit_kat": None}


def expand_attack_range(val):
    """
    Wenn Angriffswert ein Bereich ist (z.B. '40-44'), 
    gibt Liste [40, 41, 42, 43, 44] zurück.
    Sonst [val].
    """
    s = str(val).strip()
    m = re.match(r"^(\d+)\s*-\s*(\d+)$", s)
    if m:
        lo, hi = int(m.group(1)), int(m.group(2))
        return list(range(lo, hi + 1))
    try:
        return [int(s)]
    except ValueError:
        return []


def read_weapon_from_excel(path):
    """Liest eine Excel-Datei und gibt Waffendaten als dict zurück."""
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.active

    rows = list(ws.iter_rows(values_only=True))
    wb.close()

    if len(rows) < 2:
        return None

    # Header: AT, 20, 19, 18, ..., 1
    header = rows[0]
    rk_columns = []
    for i, h in enumerate(header):
        if h is not None and str(h).isdigit():
            rk_val = int(h)
            if 1 <= rk_val <= 20:
                rk_columns.append((i, str(rk_val)))

    # RK-Spalten nach Wert sortieren (20 zuerst)
    rk_columns.sort(key=lambda x: -int(x[1]))

    result = {"RK": {}}
    for col_idx, rk_key in rk_columns:
        result["RK"][rk_key] = {}

    # Datenzeilen (ab Zeile 1)
    for row in rows[1:]:
        if not row:
            continue
        attack_raw = row[0]
        attack_values = expand_attack_range(attack_raw)
        if not attack_values:
            continue

        for col_idx, rk_key in rk_columns:
            if col_idx >= len(row):
                continue
            cell_val = row[col_idx]
            parsed = parse_cell_value(cell_val)

            for av in attack_values:
                result["RK"][rk_key][str(av)] = parsed

    return result


def main():
    base = Path(__file__).parent.parent.parent
    templates_dir = base / "assets" / "templates"
    json_path = base / "assets" / "data" / "treffer_tabellen_strukturiert.json"

    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    if "Angriffstabellen" not in data:
        data["Angriffstabellen"] = {}

    # Alle Angriffstabelle_MERP_*.xlsx (ohne Treffer_Tabelle, krit_treffer)
    excel_files = sorted(templates_dir.glob("Angriffstabelle_MERP_*.xlsx"))

    for xlsx_path in excel_files:
        stem = xlsx_path.stem  # z.B. Angriffstabelle_MERP_BroadSword
        weapon_part = stem.replace("Angriffstabelle_MERP_", "")
        weapon_key = WEAPON_NAME_MAP.get(weapon_part, weapon_part.upper().replace(" ", "_"))

        print(f"Verarbeite: {xlsx_path.name} -> {weapon_key}")

        try:
            weapon_data = read_weapon_from_excel(xlsx_path)
            if weapon_data:
                data["Angriffstabellen"][weapon_key] = weapon_data
        except Exception as e:
            print(f"  FEHLER: {e}")

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"\nFertig. JSON aktualisiert: {json_path}")


if __name__ == "__main__":
    main()
