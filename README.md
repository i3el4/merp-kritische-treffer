# MERS Angriffs- & Kritische-Treffer App (PWA)

Diese App erleichtert das Nachschlagen von Angriffswerten und kritischen Treffern im Mittelerde-Rollenspiel (MERP/MERS). Der Fokus liegt auf einer immersiven Nutzererfahrung durch Audio-Feedback und einem optimierten mobilen Design.

---

## 📦 Projektstruktur

```plaintext
/
├── index_clean.html          # Haupt-HTML (verwende diese statt der alten index.html)
├── scripts/
│   └── app.js                # Gesamter JavaScript-Code
├── styles/
│   ├── base.css              # Basiseinstellungen (Farben, Schrift)
│   └── overrides.css         # App-spezifische Layout-Details
├── assets/
│   ├── audio/
│   │   ├── krit/             # Kritische Treffer MP3s (z. B. Streich_E_1-5.mp3)
│   │   └── musik/            # Hintergrundmusik pro Trefferart (z. B. Helden_streich.mp3)
│   ├── fonts/
│   │   └── Aniron.ttf        # Hauptschriftart
│   ├── img/
│   │   └── map_bg.jpeg       # Hintergrundbild
│   ├── icons/
│   │   └── apple-touch-icon.png  # PWA Icon
│   ├── data/
│       ├── tables.json
│       └── treffer_tabellen_strukturiert.json
```

---

## 🚀 Setup

1. Kopiere alle Dateien in dein Projektverzeichnis.
2. Stelle sicher, dass die Ordnerstruktur **genau so** wie oben abgebildet umgesetzt ist.
3. Öffne `index_clean.html` lokal oder auf GitHub Pages – die App funktioniert als Progressive Web App (PWA).
4. Optional: „Zum Home-Bildschirm hinzufügen“ auf iOS/Safari für eine App-ähnliche Nutzung.

---

## 🎧 Audio-Integration

- Alle kritischen Treffer verwenden automatisch MP3s aus `assets/audio/krit/` im Format:  
  `Typ_Kat_Bereich.mp3` (z. B. `Streich_E_1-5.mp3`)
- Für jede Kritische Trefferart kann passende Hintergrundmusik in `assets/audio/musik/` hinterlegt werden.
- Falls keine MP3 vorhanden: automatische Sprachausgabe via TTS (Text-to-Speech)

---

## 📄 Datenquellen

Die App lädt zwei JSON-Dateien dynamisch:
- **treffer_tabellen_strukturiert.json**: Angriffstabellen pro Waffenart
- **tables.json**: Kritische Treffertexte (nach Typ/Kategorie/Wurf)

---

## 🛠 Entwicklerhinweise

- Die gesamte Logik liegt in `scripts/app.js`
- Alle Farben, Schriftarten und Layoutdetails sind in `styles/base.css` und `styles/overrides.css` geregelt.
- Du kannst eigene Waffenarten, Treffertexte oder Audio-Dateien leicht hinzufügen, indem du die JSON-Dateien erweiterst.

---

## 📱 Kompatibilität

- Optimiert für iPhone (Safari)
- Unterstützt Touch-Eingaben und Offline-Zugriff (via PWA)
- Funktioniert auch auf Desktopbrowsern

---

## ⚔️ Viel Spaß beim Spielen!