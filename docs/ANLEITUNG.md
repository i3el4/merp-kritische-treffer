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
| **Kampf** | Angriff, Krit, Patzer, Licht/Schatten, Angreifer-Icons, Initiative, Runde, Kampfmusik | + Kampagne/Historie, volle Figurenverwaltung |
| **Status** | Gegner, Spieler/NPCs, Gruppen, Runde (Assistenz) | wie Spieler + Bearbeiten aller Figuren im Charakter-Tab |
| **Charakter** | eigene Übersicht | Figuren anlegen und bearbeiten |
| **Historie** | — | Kämpfe archivieren |
| **Kampagne** | — | Kampagnen verwalten |

---

## Spieler-Modus

### Tab Kampf – typischer Ablauf

1. **Licht / Schatten** umschalten (oben im Kampf-Tab): im **Licht** greift ihr mit eurem Charakter an, im **Schatten** tragt ihr Monster-Angriffe für den SL ein.
2. **Angreifer** (runde Icons unter Licht/Schatten): im Licht euer **Spielercharakter** (gleiche Auswahl wie in der Charakterwahl), im Schatten das **angreifende Monster**. Die **Kampfmusik** wechselt mit dem gewählten Angreifer (wenn Kampfmusik an und Waffe gewählt).
3. **Waffenart** wählen (Icon-Buttons). Bei Naturangriffen (Biss, Klaue, …) erscheint ein **Grössen-Popup** (klein / mittel / gross).
4. **Angriffsziel(e)** antippen (runde Icons):
   - **Gegner** = Ziele eures Angriffs
   - **Verbündete** = Mitstreiter (Orientierung)
   Mehrere Ziele möglich. Im **Schatten** sind die Gruppen **vertauscht** (Gegner = Helden, Verbündete = Monster).
5. **Defensivbonus (DB)** der Auswahl steht unter den Icons (nicht auf den Icons selbst).
6. **Angriffswert** eintragen.
7. **Treffer ermitteln** → Trefferpunkte und ggf. Krit-Kategorie (A–E).
8. Bei Krit: **Würfelwurf** eintragen → **Kritischer Treffer ermitteln** (Text, ggf. Audio).
9. Optional: **Schaden anwenden** auf die gewählten Ziele.

**Initiative / Runde** (unter dem Rechner): ihr könnt den SL bei Reihenfolge und Rundenwechsel unterstützen.

Optional aufklappbar: **Nebentreffer**, **Kritischer Patzer**.

### Tab Status / Charakter

**Status:** Gegner-Karten, Spieler/NPCs, Gruppen und Rundensteuerung — zum Mitverfolgen und Eintragen von Schaden (gemeinsame Kampagne).

**Charakter:** **euer** Charakter (TP, RK, DB, Status). Figuren anlegen bleibt beim Spielleiter (Tab Charakter/Kampagne).

### Audio (Profil oben rechts)

Musik-Lautstärke, TTS-Fallback wenn keine Krit-MP3 vorhanden ist.

---

## Spielleiter-Modus

### Licht vs. Schatten (Kampf-Tab)

| Modus | Verwendung |
|-------|------------|
| **Licht** | Angriffe von **Spielercharakteren/NPCs**. Angreifer per **Icon** wählen (ein Charakter). Ziel-Verteidigung: **RK**. |
| **Schatten** | Angriffe von **Monstern**. Angreifer-**Icon** = Monster; **Treffer und Krit** aus **Gegner-Tabellen** (Rüstung PL–OR, Grösse vom Monster). Ziel-Verteidigung: **Rüstung**. |

**Krit-Regeln (Kurz):**

- **Licht, Naturangriff, Angriffsklasse Klein** (Tabellenabschnitt „Small Attacks“): Zelle z. B. `5AT` → Treffer aus Zelle, Krit-Tabelle **Kleine Tiere**, Kategorie aus der Zelle (z. B. A).
- **Schatten, Gegner-Zelle nur `T`** (z. B. `6T`): Kategorie **A**, Krit auf Standard-Tabelle (z. B. Stich), Würfel **−50**.
- **Schatten, Gegner-Zelle `AT`** (Kategorie + T): **Kleine Tiere**, Kategorie aus Zelle, normaler Würfel.
- **Schatten, Zelle mit P/S/K** (z. B. `12A` → Stich Kat. A): kein −50, keine Kleine-Tiere-Tabelle nur wegen der Waffe.

- Standard: **Schatten** (wird gespeichert).
- **Angreifer:** im Licht SC/NPC (Icons), im Schatten das Monster (Icon). **Kampfmusik** folgt dem gewählten Angreifer (Charakter-Profil bzw. Monster-Grösse).

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
| Rüstung / RK-Kopplung | Im **Schatten** die Tabellenspalte PL–OR: standardmässig aus der RK abgeleitet (1–4 OR, 5–8 LE, 9–12 VL, 13–16 KE, 17–20 PL). Abwahl „an RK koppeln“ ermöglicht eine **manuelle** Rüstungsart. |
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

- **Spieler:** Licht (eigener Charakter) und Schatten (Monster für SL), volle Kampf- und Status-Assistenz; Kampagne/Historie nur SL.
- **Spielleiter:** wie Spieler im Kampf + Figuren anlegen, Kampagne, Historie.
