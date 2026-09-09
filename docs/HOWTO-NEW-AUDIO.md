# HOWTO: Neue Vertonungen erstellen

Du hast eine neue oder geänderte Krit-Tabelle in `assets/data/tables_processed.json` und möchtest die zugehörigen MP3s vertonen.

> **Voraussetzung:** Die Tabellen-Daten existieren bereits. Falls nicht zuerst [HOWTO-NEW-TABLE.md](HOWTO-NEW-TABLE.md) durchgehen.

---

## Was passiert?

Die Audio-Skripte lesen `tables_processed.json`, Feld **`tts`**, und erzeugen MP3s. **Zwei Stimmen, zwei Ordner:**

| npm-Skript | Engine | Output |
|---|---|---|
| `generate-audio` | ElevenLabs API | `assets/audio/krit/<tableSlug>/<KAT>_<RANGE>.mp3` |
| `generate-audio-qwen` | lokales Qwen3-TTS (`~/local-tts`) | `assets/audio/qwen/<tableSlug>/<KAT>_<RANGE>.mp3` |

Gleiche Dateinamen-Logik in `scripts/audioNaming.mjs`. In der App: **Profil → Krit-Stimme**.

Existierende Dateien im jeweiligen Ordner werden übersprungen. Ctrl+C ist sicher; der nächste Lauf macht nur Fehlendes.

---

## Lokal mit Qwen (Stimme Bud2)

**Local TTS Studio wird nicht benötigt** (besser schliessen, sonst teilen sich zwei Prozesse die GPU). Der Batch spricht nur `~/local-tts`.

Studio und der Batch nutzen **verschiedene Pythons**. Studio kann klingen, während `npm run generate-audio-qwen-sweep` scheitert — das ist kein Sweep-Bug. `qwen_tts` 0.1.1 ist für **transformers 4.57.3** gebaut. Steht in `~/local-tts/.venv` transformers **5.x**, reisst Generate an HuggingFace-APIs ab (`create_causal_mask(..., input_embeds=...)` und verwandtes). Nicht auf 5.x patchen.

Auf 4.57.3 ist der HuggingFace-Decorator `check_model_inputs` zu streng (`unexpected keyword argument 'inputs_embeds'`). Der Worker macht ihn durchlässig; Studio-App nicht anfassen.

Studio-App **nicht** anfassen. Nur das CLI-venv, Studio geschlossen:

```bash
~/local-tts/.venv/bin/pip install 'transformers==4.57.3'
```

Der Batch bricht auf transformers 5 sofort ab, statt das Modell zu laden und Clip für Clip zu crashen.

Setting (Sampler, Speed, Loudness, Modell-Revision) liegt in [`tools/audio/qwen_tts_settings.json`](../tools/audio/qwen_tts_settings.json) — das ist dasselbe Set, das in Studio getestet wurde (Full Reference, German, Seed 1024, Speed 1.11×, Temperature 0.81, …).

Voraussetzung: **auf dem Mac** (nicht in der Cloud-Agent-Konsole) im Projektordner:

```bash
npm install
```

`~/local-tts` muss eingerichtet sein (`./setup.sh`, `./tts setup`). Stimme **Bud2** wird beim ersten Lauf aus Studio nach `~/local-tts/data/voices/bud2/` kopiert, falls sie dort noch fehlt.

`caffeinate` gibt es nur unter macOS (verhindert Schlaf). Unter Linux einfach ohne `caffeinate` denselben `npm`-Befehl nutzen.

### Test

```bash
npm run generate-audio-qwen -- --limit 3
npm run generate-audio-qwen -- --min-chars 350 --limit 4
```

### Nachtlauf

Studio **beenden**, dann:

```bash
caffeinate -i npm run generate-audio-qwen
```

- **Morgens:** Ctrl+C. Unfertige Dateien bleiben `*.partial.mp3`.
- **Nächste Nacht:** denselben Befehl.

Default-Backend ist **torch** (Qwen3-TTS-12Hz-1.7B-Base, wie Studio). `--backend mlx` ist schneller, klingt aber nicht identisch.

In der App: Profil → **Krit-Stimme** → „Bud2 (Qwen)“. Fehlt eine Qwen-Datei, fällt die App auf ElevenLabs zurück.

---

## Sampler-Sweep (Einstellungen vergleichen)

Nicht die App und nicht Studio: ein Raster aus **sechs Krit-Texten** × Sampler-Varianten (Fragen, Ausruf, sachlich, lang). Output nur unter `assets/data/_pipeline/qwen-sweep/` (gitignored). `assets/audio/qwen/` bleibt unangetastet.

Text und Raster: [`tools/audio/qwen_tts_sweep.json`](../tools/audio/qwen_tts_sweep.json). Speed, Seed, Loudnorm, Modell bleiben das Studio-Setting; es ändert sich nur Temperature / Top-P / Top-K plus Subtalker.

Studio **beenden**, dann:

```bash
# Kurztest (1 Text × 7 Varianten)
npm run generate-audio-qwen-sweep -- --preset quick

# Mix aus den Favoriten (baseline, crisp, T1.00, subK20 + 4 Mischungen)
npm run generate-audio-qwen-sweep -- --preset mix

# Andere Stimme + eigener Text (Stimme muss in ~/local-tts/data/voices/sal/ liegen)
npm run generate-audio-qwen-sweep -- --preset mix sal "Hallo, ich heisse Stefan. Wie geht es dir?"

# Nachtlauf (6 Texte × alle Varianten, Resume per Ctrl+C)
caffeinate -i npm run generate-audio-qwen-sweep
```

Pro Clip erscheint `generate …` und alle 20s `… generate läuft noch`. Nach 8 Minuten ohne Ende wird der Clip übersprungen. Steht die Zeile `[n/150]` minutenlang ohne Heartbeat: Ctrl+C, denselben Befehl nochmal (fertige MP3s bleiben).

Morgens `assets/data/_pipeline/qwen-sweep/index.html` öffnen (oder `npm run serve` und die Datei im Browser). Links die Texte, darunter die Varianten. Sterne und Notizen bleiben im Browser. Den Gewinner als JSON kopieren und ins Chat stellen — dann wandert er nach `qwen_tts_settings.json`.

Eigene Stimme oder eigener Text: Output unter `audio/<stimme>/…`. Die Bud2-Krit-Samples bleiben. Ohne Text, nur Stimme (`--preset mix sal`) werden die sechs Krit-Sätze mit dieser Stimme erzeugt.

---

## ElevenLabs (Cloud)

### Setup einmalig

1. **ElevenLabs-Account** anlegen, Voice trainieren oder vorhandene Voice-ID notieren.
2. **`private/.env`** erweitern (siehe [`private/README.md`](../private/README.md)):
   ```env
   ELEVENLABS_API_KEY=sk-...
   ELEVENLABS_VOICE_ID=...
   # Optional, Default 1.1
   ELEVENLABS_SPEECH_SPEED=1.1
   ```

### Generieren

```bash
npm run generate-audio
```

Skript: [`tools/audio/generate_audio_elevenlabs.js`](../tools/audio/generate_audio_elevenlabs.js).

---

## Aufräumen nicht mehr passender englischer MP3s

```bash
npm run englisch-mp3-report
npm run englisch-mp3-archive
```

Skript: [`tools/audio/englisch_krit_audio_tool.js`](../tools/audio/englisch_krit_audio_tool.js).

---

## Smoke-Test

1. **Service-Worker Cache bumpen** in [`sw.js`](../sw.js) (`CACHE_NAME` hochzählen).
2. App starten (`npm run serve`), Hard-Reload.
3. Im Simulator einen vertonten Krit auslösen. Erwartung: MP3; sonst Browser-TTS.

---

## Kostenwarnung (nur ElevenLabs)

ElevenLabs ist **kostenpflichtig pro Zeichen**. Das Skript überspringt vorhandene Dateien.

Qwen lokal kostet kein API-Guthaben, braucht aber Zeit (Modell bleibt im RAM).

Wenn Generate mit `create_causal_mask() got an unexpected keyword argument 'input_embeds'` stirbt: transformers **5.x** im CLI-venv — zurück auf 4.57.3. Wenn Generate mit `check_model_inputs ... unexpected keyword argument 'inputs_embeds'` stirbt: 4.57.3 ist richtig, aber der HuggingFace-Decorator ist zu streng; `git pull` holt den durchlässigen Worker.
