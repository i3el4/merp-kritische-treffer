# Private / sensible Dateien

Dieser Ordner enthält Konfigurationsdateien mit API-Keys und Zugangsdaten.
**Inhalte werden nicht zu Git gepusht** (außer dieser README).

## Einrichtung nach dem Klonen

1. **firebase-config.js** (für die PWA):
   - Kopiere `scripts/firebase-config.example.js` nach `private/firebase-config.js`
   - Trage deine Firebase Web-Client-Konfiguration ein (Firebase Console → Projekt-Einstellungen → Web-App)

2. **.env** (für Node-Skripte wie Gemini, ElevenLabs):
   - Erstelle `private/.env` mit z.B.:
   ```
   GEMINI_API_KEY=dein_key
   ELEVENLABS_API_KEY=dein_key
   ELEVENLABS_VOICE_ID=deine_voice_id
   # Optional für generate-audio-qwen (Default: ~/local-tts, Stimme bud2)
   # LOCAL_TTS_ROOT=/Users/…/local-tts
   # QWEN_TTS_VOICE=bud2
   ```

3. **Firebase Admin SDK** (optional, nur für Server/Cloud Functions):
   - Service-Account-JSON hier ablegen, falls du Backend-Funktionen nutzt
