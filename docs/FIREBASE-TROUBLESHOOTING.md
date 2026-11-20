# Firebase auf GitHub Pages – Checkliste

## Problem: Kampagne wird nicht gefunden

### 1. API-Einschränkungen prüfen (häufigste Ursache)

Die App nutzt **Firebase Realtime Database** – nicht Firestore oder Datastore.

In der [Google Cloud Console](https://console.cloud.google.com/apis/credentials?project=mersdb):

1. **Browser key (auto created by Firebase)** öffnen
2. Unter **API restrictions** → **Restrict key**
3. **Diese APIs müssen in der Liste sein:**
   - **Firebase Realtime Database API** (`firebasedatabase.googleapis.com`) ← **wichtig**
   - Firebase Rules API (`firebaserules.googleapis.com`)
   - Identity Toolkit API (falls Auth genutzt wird)

**Wenn „Firebase Realtime Database API“ fehlt:** In der Dropdown-Liste „API auswählen“ hinzufügen und speichern.

**Schnelltest:** Unter API restrictions vorübergehend **„Don't restrict key“** wählen. Wenn es dann funktioniert, liegt es an den API-Einschränkungen.

### 2. Application restrictions

**Wichtig:** Wenn „Websites“ gewählt ist, müssen die Einträge **aktiv** sein (Checkboxen ankreuzen bzw. Einträge hinzufügen). Ohne aktivierte Einträge funktioniert der Key von keiner Website.

**Empfehlung zum Testen:** Vorübergehend **„None“** wählen – dann funktioniert der Key von überall. Wenn es dann läuft, liegt es an den Website-Einschränkungen.

**Mit „Websites“:** Diese Referrer hinzufügen und aktivieren:
- `https://i3el4.github.io/*`
- `http://localhost/*`
- `http://127.0.0.1/*`

### 3. Firebase Realtime Database aktiviert?

[Firebase Console](https://console.firebase.google.com/project/mersdb/database) → Realtime Database → Prüfen, ob die Datenbank existiert und Daten enthält.

### 4. Browser-Konsole prüfen

Auf https://i3el4.github.io/merp-kritische-treffer/:

1. F12 → Console
2. Nach Fehlern suchen: `403`, `API_KEY_SERVICE_BLOCKED`, `Permission denied`
