# HOWTO: Neue Vertonungen erstellen

Du hast eine neue oder geänderte Krit-Tabelle in `assets/data/tables_processed.json` und möchtest die zugehörigen MP3s vertonen.

> **Voraussetzung:** Die Tabellen-Daten existieren bereits. Falls nicht zuerst [HOWTO-NEW-TABLE.md](HOWTO-NEW-TABLE.md) durchgehen.

---

## Was passiert?

Das Skript [`tools/audio/generate_audio_elevenlabs.js`](../tools/audio/generate_audio_elevenlabs.js) liest `tables_processed.json`, geht alle Krit-Einträge durch und ruft für jeden `tts_text` die **ElevenLabs Text-to-Speech API** auf. Existierende MP3s werden übersprungen, also kostet ein Re-Run nur die wirklich fehlenden Dateien.

Dateinamen-Schema: `assets/audio/krit/<tableSlug>/<KAT>_<RANGE>.mp3`, z.B. `assets/audio/krit/hieb/E_76-80.mp3`. Format-Logik in `scripts/audioNaming.mjs`.

---

## Setup einmalig

1. **ElevenLabs-Account** anlegen, Voice trainieren oder vorhandene Voice-ID notieren.
2. **`private/.env`** erweitern (siehe [`private/README.md`](../private/README.md)):
   ```env
   ELEVENLABS_API_KEY=sk-...
   ELEVENLABS_VOICE_ID=...
   # Optional, Default 1.1
   ELEVENLABS_SPEECH_SPEED=1.1
   ```

---

## Generieren

```bash
npm run generate-audio
```

Das Skript zeigt für jeden Eintrag entweder „skip (existiert)" oder „write …". Bei Rate-Limits (429) wird mit Backoff wiederholt.

Output: `assets/audio/krit/<tableSlug>/<KAT>_<RANGE>.mp3`.

---

## Sprache der Stimme prüfen

ElevenLabs `eleven_multilingual_v2` ist in `generate_audio_elevenlabs.js` hartkodiert. Wenn du eine andere Sprache willst, dort anpassen.

---

## Aufräumen nicht mehr passender englischer MP3s

Wenn die englischen Krit-Tabellen aktualisiert wurden, kann es Reste geben, deren Dateinamen nicht mehr in `tables_processed.json` vorkommen.

```bash
# Listet, was fehlt / überflüssig ist
npm run englisch-mp3-report

# Verschiebt überflüssige MP3s nach assets/audio/krit/_archive_englisch_non_canonical/<Datum>/
npm run englisch-mp3-archive
```

Skript: [`tools/audio/englisch_krit_audio_tool.js`](../tools/audio/englisch_krit_audio_tool.js).

---

## Smoke-Test

1. **Service-Worker Cache bumpen** in [`sw.js`](../sw.js) (`CACHE_NAME` hochzählen) – sonst lädt der Browser die alten Dateien aus dem Cache.
2. App starten (`npm run serve`), Hard-Reload.
3. Im Simulator den frisch vertonten Krit auswählen, „Krit auslösen". Erwartung: MP3 wird gespielt; falls nicht, fällt die App auf Browser-TTS zurück (siehe `audio.js` / `logic.js`).

---

## Kostenwarnung

ElevenLabs ist **kostenpflichtig pro Zeichen**. Eine grosse Tabelle (mehrere hundert Einträge × ~50 Wörter `tts_text`) kann schnell ein paar Euro kosten. Vor dem Lauf:

- `tables_processed.json` lokal sichten, ob die Texte tatsächlich „final" sind.
- Mit `--dry-run` arbeiten? Aktuell gibt es keinen, aber das Skript macht `fs.existsSync(filePath)` vor jedem API-Call und überspringt – also keine doppelte Abrechnung.
