# MERS – Angriffe & Kritische Treffer
## Anleitung für Spieler und Spielleiter

Die App unterstützt euch im Kampf bei Trefferermittlung, kritischen Treffern, Nebentreffern, Patzern und der Verwaltung von Trefferpunkten und Status-Effekten.

**Technik:** Browser-App (optional als PWA installierbar). Nach Updates die Seite **hart neu laden** (Strg+F5 / Cmd+Shift+R), falls etwas veraltet wirkt.

---

## Erster Start

1. App im Browser öffnen.
2. **Rolle** wählen: *Spieler* oder *Spielleiter*.
3. **Kampagne** wählen – oder mit **Kampagnen-ID beitreten** (vom Spielleiter erhalten), falls Firebase aktiv ist.
4. **Charakter** wählen (Spieler) oder *Ohne Charakter fortfahren* (nur Spielleiter).
5. **Starten**.

Später: Profil-Icon oben rechts → *Rolle wechseln* / *Charakter wechseln*.

---

## Tabs – Übersicht

| Tab | Spieler | Spielleiter |
|-----|---------|-------------|
| **Kampf** | Angriff, Krit, Patzer | + Licht/Schatten, Angreifer, Initiative, Runde |
| **Status** | eigener Charakter | Gegner, Spieler/NPCs, Gruppen |
| **Charakter** | eigene Übersicht | Figuren anlegen und bearbeiten |
| **Historie** | — | Kämpfe archivieren |
| **Kampagne** | — | Kampagnen verwalten |

---

## Spieler-Modus

### Tab Kampf – typischer Ablauf

1. **Waffenart** wählen (Icon-Buttons). Bei Naturangriffen (Biss, Klaue, …) erscheint ein **Grössen-Popup** (klein / mittel / gross).
2. **Angriffsziel(e)** antippen (runde Icons):
   - **Gegner** = Ziele eures Angriffs
   - **Verbündete** = Mitstreiter (Orientierung)
   Mehrere Ziele möglich.
3. **Defensivbonus (DB)** der Auswahl steht unter den Icons (nicht auf den Icons selbst).
4. **Angriffswert** eintragen.
5. **Treffer ermitteln** → Trefferpunkte und ggf. Krit-Kategorie (A–E).
6. Bei Krit: **Würfelwurf** eintragen → **Kritischer Treffer ermitteln** (Text, ggf. Audio).
7. Optional: **Schaden anwenden** auf die gewählten Ziele.

Optional aufklappbar: **Nebentreffer**, **Kritischer Patzer**.

### Tab Status / Charakter

Zeigt **euren** Charakter: TP-Balken, RK, DB, Status (benommen, pariert, K.O., Schaden pro Runde, …). Gegner verwaltet der Spielleiter.

### Audio (Profil oben rechts)

Musik-Lautstärke, TTS-Fallback wenn keine Krit-MP3 vorhanden ist.

---

## Spielleiter-Modus

### Licht vs. Schatten (Kampf-Tab)

| Modus | Verwendung |
|-------|------------|
| **Licht** | Angriffe von **Spielercharakteren/NPCs**. Angreifer im Dropdown wählen. Ziel-Verteidigung: **RK**. |
| **Schatten** | Angriffe von **Monstern**. Waffe wie beim Spieler wählen; TP/Kategorie aus **Gegner-Tabellen**, Krit-Art aus **Waffentabelle**. Ziel-Verteidigung: **Rüstung** (Platte, Kette, …). |

- Standard: **Schatten** (wird gespeichert).
- **Angreifer:** im Licht SC/NPC, im Schatten das Monster.
- **Schatten-Intensität** (Profil-Menü): Kampfmusik und Grösse bei ZuK/RuS-Tabellen.

Im Schatten sind Ziel-Gruppen aus SL-Sicht **vertauscht** (Gegner = eure Helden, Verbündete = Monster). Icon-Hintergründe: Gegner hell, Verbündete dunkel.

### SL-Zusatz im Kampf-Tab

- **Initiative** (nach B&M; Krit kann Initiativeverlust auslösen)
- **Runde** / **Kampf archivieren**
- **Kampfmusik** (Play neben Licht/Schatten)

### Tab Status

- **Gruppen** filtern, Gegner als Ziele sammeln
- **Gegner-Karten:** Schaden, Heilung, Bearbeiten (✎)
- **Spieler & NPCs:** gleiche Funktionen

### Charakter-Einstellungen (Bearbeiten ✎)

| Feld | Wirkung |
|------|---------|
| RK | Verteidigung im **Licht** |
| Rüstung (PL–OR) | Verteidigung im **Schatten** |
| Held | Helden-Krit-Tabellen |
| Grösse | Krit-Schwellen (gross/gewaltig: höhere Kategorie nötig) |
| Defensivbonus | Anzeige bei Zielauswahl |
| Im Kampf sichtbar | erscheint in Kampf/Zielauswahl |

### Kampagne & Historie

Kampagnen anlegen/wechseln. Abgeschlossene Kämpfe **archivieren** und in der Historie einsehen.

### Gemeinsame Kampagne (Firebase)

Mit **Kampagnen-ID** beitreten – alle sehen dieselben Figuren und TP in Echtzeit.

---

## Kampf-Ablauf (Detail)

### 1) Angriff
Waffe + Ziel(e) + Angriffswert → Trefferpunkte, ggf. Krit → optional Schaden anwenden.

### 2) Kritischer Haupttreffer
Nur wenn Schritt 1 eine Krit-Kategorie lieferte. Wurf → Tabellentext → optional Schaden/Status anwenden. **Korrigieren** (✎) bei Bedarf.

### 3) Nebentreffer (optional)
Eigene Tabelle, Kategorie, Wurf.

### 4) Kritischer Patzer (optional)
Wurf, Spalte, Modifikator.

**Zurücksetzen** leert nur die Kampf-Eingaben, nicht die Kampagne.

---

## Tipps

- Mehrere Ziele: mehrere Icons aktivieren.
- Tote Ziele: ausgegraut, kein Schaden anwenden.
- Probleme nach Update: Cache leeren / hart neu laden.
- PWA: *Installieren* im Header, falls angeboten.

---

## Kurz-Merksatz

- **Spieler:** eigene Angriffe gegen SL-Gegner; eigener Status.
- **Spielleiter:** Licht (Helden) + Schatten (Monster), alle Figuren, Runde, Initiative, Historie.
