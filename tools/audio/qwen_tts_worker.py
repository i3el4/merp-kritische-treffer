#!/usr/bin/env python3
"""Qwen3-TTS worker: Bud2 + Studio sampling. Production → assets/audio/qwen/; Sweep → _pipeline/qwen-sweep/."""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import traceback
import types
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace

SETTINGS_PATH = Path(__file__).resolve().parent / "qwen_tts_settings.json"
DEFAULT_LOCAL_TTS = Path.home() / "local-tts"
DEFAULT_STUDIO_PROFILES = (
    Path("/Applications/Local TTS Studio.app/Contents/Resources/app")
    / "output"
    / "user_data"
    / "voice_profiles.json"
)
PARTIAL_SUFFIX = ".partial.mp3"
_TRANSFORMERS_COMPAT_APPLIED = False


def load_settings() -> dict:
    return json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))


def main() -> int:
    settings = load_settings()
    sampling = settings.get("sampling") or {}
    parser = argparse.ArgumentParser(
        description="Vertont Krit-Jobs lokal mit Qwen3-TTS (Full reference, Studio-Setting)."
    )
    parser.add_argument("--jobs", required=True, type=Path)
    parser.add_argument("--voice", default=settings.get("voice", "bud2"))
    parser.add_argument("--local-tts", type=Path, default=DEFAULT_LOCAL_TTS)
    parser.add_argument("--studio-profiles", type=Path, default=DEFAULT_STUDIO_PROFILES)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--backend", choices=("auto", "mlx", "torch"), default=settings.get("backend", "torch"))
    parser.add_argument("--language", default=settings.get("language", "German"))
    args = parser.parse_args()

    apply_qwen_transformers_compat()
    local_tts = args.local_tts.expanduser().resolve()
    tts = load_local_tts(local_tts)
    voice_name = tts.sanitize_name(args.voice)
    ensure_voice(tts, voice_name, args.studio_profiles.expanduser())

    jobs = json.loads(args.jobs.expanduser().read_text(encoding="utf-8"))
    if not isinstance(jobs, list):
        raise ValueError("Jobs-Datei muss ein JSON-Array sein.")

    manifest = load_manifest(args.manifest)
    done = set(manifest.get("files") or [])

    planned: list[dict] = []
    skipped = 0
    for job in jobs:
        rel = job["rel"]
        out = Path(job["out"])
        if out.is_file():
            skipped += 1
            done.add(rel)
            continue
        planned.append(job)
        if args.limit and len(planned) >= args.limit:
            break

    per_job_sampling = any(isinstance(job, dict) and job.get("sampling") for job in jobs)
    print(f"Stimme:     {voice_name}  (Full reference / ICL)")
    print(f"Modell:     {settings.get('model_id')}  rev={settings.get('revision')}")
    print(f"Backend:    {args.backend}  lang={args.language}  seed={settings.get('seed')}")
    if per_job_sampling:
        print("Sampling:   pro Job (Sweep)")
    else:
        print(f"Sampling:   T={sampling.get('temperature')} top_k={sampling.get('top_k')} "
              f"subT={sampling.get('subtalker_temperature')} subK={sampling.get('subtalker_top_k')}")
    print(f"Speed:      {settings.get('speed')}×  loudnorm={settings.get('target_loudness_lufs')} LUFS")
    print(f"Einträge:   {len(jobs)}")
    print(f"Vorhanden:  {skipped}  (Resume, Qwen-Ordner)")
    print(f"Dieses Lauf:{len(planned)}  (limit={args.limit or 'off'})")
    if not planned:
        print("Nichts zu tun.")
        return 0

    if args.dry_run:
        for index, job in enumerate(planned, start=1):
            n = len(str(job.get("text") or ""))
            print(f"[dry-run {index}/{len(planned)}] write {job['rel']}  ({n} Zeichen)")
        return 0

    profile = tts.load_voice(voice_name)
    ref_text = (profile.get("ref_text") or "").strip()
    if not ref_text:
        raise ValueError(f"Stimme '{voice_name}' hat kein Transkript — Full reference nicht möglich.")

    os.environ.setdefault("HF_HOME", str(local_tts / "models" / "hf"))
    os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")

    engine = load_studio_engine(tts, args.backend, settings)
    ref_audio = str(tts.reference_wav(profile).resolve())
    prompt = engine.create_prompt(ref_audio=ref_audio, ref_text=ref_text)

    generated = 0
    failed = 0
    try:
        for index, job in enumerate(planned, start=1):
            rel = job["rel"]
            text = str(job["text"]).strip()
            out = Path(job["out"])
            preview = text.replace("\n", " ")
            if len(preview) > 80:
                preview = preview[:77] + "…"
            job_sampling = merge_sampling(settings, job)
            variant = job.get("variant") or ""
            print(f"[{index}/{len(planned)}] {rel}")
            if variant:
                print(f"  variant {variant}  {format_sampling(job_sampling)}")
            print(f"  {preview}")

            started = time.perf_counter()
            try:
                generate_one(
                    tts=tts,
                    engine=engine,
                    settings=settings,
                    sampling=job_sampling,
                    text=text,
                    language=args.language,
                    prompt=prompt,
                    ref_audio=ref_audio,
                    ref_text=ref_text,
                    out=out,
                    sweep=bool(job.get("sweep")),
                )
            except KeyboardInterrupt:
                raise
            except Exception as exc:
                failed += 1
                print(f"  Fehler: {exc}", file=sys.stderr)
                continue

            done.add(rel)
            manifest["voice"] = voice_name
            manifest["engine"] = "qwen3-tts-local"
            manifest["settings"] = "tools/audio/qwen_tts_settings.json"
            manifest["updated"] = datetime.now().isoformat(timespec="seconds")
            manifest["files"] = sorted(done)
            save_manifest(args.manifest, manifest)
            generated += 1
            print(f"  write {out}  ({time.perf_counter() - started:.1f}s)")
    except KeyboardInterrupt:
        print(
            f"\nAbgebrochen. Generiert: {generated}, Fehler: {failed}. "
            "Nächster Lauf setzt an den fertigen Dateien fort.",
            file=sys.stderr,
        )
        return 130

    print(f"\nFertig. Generiert: {generated}, übersprungen: {skipped}, Fehler: {failed}")
    return 1 if failed else 0


def load_local_tts(root: Path) -> types.ModuleType:
    tts_py = root / "tts.py"
    if not tts_py.is_file():
        raise FileNotFoundError(f"local-tts nicht gefunden: {tts_py}")
    spec = importlib.util.spec_from_file_location("local_tts_cli", tts_py)
    if spec is None or spec.loader is None:
        raise ImportError(f"Kann {tts_py} nicht laden.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_studio_engine(tts, backend: str, settings: dict):
    chosen = tts.choose_backend(backend)
    if chosen == "mlx":
        print("Hinweis: MLX übernimmt nicht alle Studio-Sampler (kein Subtalker/Top-K). Für Bud2-Setting: --backend torch")
        return MlxCompatEngine(tts, settings)
    apply_qwen_transformers_compat()
    return TorchStudioEngine(tts, settings)


def apply_qwen_transformers_compat() -> None:
    """qwen_tts nutzt @check_model_inputs(); manche transformers-Versionen verlangen @check_model_inputs."""
    global _TRANSFORMERS_COMPAT_APPLIED
    if _TRANSFORMERS_COMPAT_APPLIED:
        return
    try:
        import transformers.utils.generic as generic
    except Exception:
        return
    original = getattr(generic, "check_model_inputs", None)

    def check_model_inputs(func=None, *args, **kwargs):
        if func is None:
            def decorator(fn):
                return _bind_check_model_inputs(original, fn)
            return decorator
        return _bind_check_model_inputs(original, func)

    generic.check_model_inputs = check_model_inputs
    for name in ("transformers.utils", "transformers"):
        mod = sys.modules.get(name)
        if mod is not None and hasattr(mod, "check_model_inputs"):
            setattr(mod, "check_model_inputs", check_model_inputs)
    _TRANSFORMERS_COMPAT_APPLIED = True


def _bind_check_model_inputs(original, fn):
    if original is None:
        return fn
    try:
        result = original(fn)
        return result if callable(result) else fn
    except TypeError:
        pass
    try:
        result = original()
        if callable(result):
            wrapped = result(fn)
            return wrapped if callable(wrapped) else fn
    except TypeError:
        pass
    return fn


class TorchStudioEngine:
    def __init__(self, tts, settings: dict):
        tts.quiet_library_noise()
        import torch

        from qwen_tts import Qwen3TTSModel

        device = tts.pick_device()
        dtype = torch.float32 if device in {"mps", "cpu"} else torch.bfloat16
        model_id = settings["model_id"]
        revision = settings.get("revision")
        print(f"Backend: PyTorch  Modell: {model_id}")
        if revision:
            print(f"Revision: {revision}")
        print(f"Gerät:  {device}  ({dtype})")
        kwargs = {
            "device_map": device,
            "dtype": dtype,
            "attn_implementation": "sdpa",
        }
        if revision:
            kwargs["revision"] = revision
        try:
            self.model = Qwen3TTSModel.from_pretrained(model_id, **kwargs)
        except TypeError as exc:
            if revision and "revision" in str(exc):
                kwargs.pop("revision", None)
                self.model = Qwen3TTSModel.from_pretrained(model_id, **kwargs)
            else:
                raise
        self.settings = settings
        self.torch = torch

    def create_prompt(self, ref_audio: str, ref_text: str):
        return self.model.create_voice_clone_prompt(
            ref_audio=ref_audio,
            ref_text=ref_text,
            x_vector_only_mode=False,
        )

    def generate_chunk(self, text: str, language: str, prompt, ref_audio: str, ref_text: str, sampling=None):
        sampling = sampling if sampling is not None else (self.settings.get("sampling") or {})
        seed = self.settings.get("seed")
        if seed is not None:
            self.torch.manual_seed(int(seed))
            if self.torch.cuda.is_available():
                self.torch.cuda.manual_seed_all(int(seed))
        wavs, sr = self.model.generate_voice_clone(
            text=text,
            language=language,
            voice_clone_prompt=prompt,
            non_streaming_mode=True,
            do_sample=True,
            temperature=float(sampling.get("temperature", 0.81)),
            top_p=float(sampling.get("top_p", 1.0)),
            top_k=int(sampling.get("top_k", 62)),
            repetition_penalty=float(sampling.get("repetition_penalty", 1.04)),
            subtalker_dosample=True,
            subtalker_temperature=float(sampling.get("subtalker_temperature", 0.96)),
            subtalker_top_p=float(sampling.get("subtalker_top_p", 1.0)),
            subtalker_top_k=int(sampling.get("subtalker_top_k", 62)),
            max_new_tokens=int(sampling.get("max_new_tokens", 2048)),
        )
        return wavs[0], sr


class MlxCompatEngine:
    def __init__(self, tts, settings: dict):
        args = SimpleNamespace(model="1.7B", backend="mlx", fast=False, quality=False)
        self.inner = tts.load_engine(args)
        self.settings = settings
        self.tts = tts

    def create_prompt(self, ref_audio: str, ref_text: str):
        return self.inner.create_prompt(ref_audio=ref_audio, ref_text=ref_text, x_vector_only=False)

    def generate_chunk(self, text: str, language: str, prompt, ref_audio: str, ref_text: str, sampling=None):
        sampling = sampling if sampling is not None else (self.settings.get("sampling") or {})
        tokens = int(sampling.get("max_new_tokens", 2048))
        return self.inner.generate(
            text=text,
            language=language,
            voice_clone_prompt=prompt,
            ref_audio=ref_audio,
            ref_text=ref_text,
            x_vector_only=False,
            max_new_tokens=tokens,
            temperature=float(sampling.get("temperature", 0.81)),
        )


def ensure_voice(tts: types.ModuleType, name: str, studio_profiles: Path) -> None:
    voice_dir = tts.VOICES / name
    if (voice_dir / "profile.json").is_file():
        profile = tts.load_voice(name)
        if not (profile.get("ref_text") or "").strip():
            raise ValueError(f"Stimme '{name}' ohne Transkript.")
        print(f"Stimme vorhanden: {voice_dir}")
        return

    audio, ref_text, language = studio_voice(studio_profiles, name)
    ns = SimpleNamespace(
        name=name,
        audio=audio,
        text=ref_text,
        text_file=None,
        language=language or "German",
        speak_language="German",
        no_transcript=False,
    )
    print(f"Importiere Studio-Stimme '{name}' nach {voice_dir} …")
    tts.cmd_clone(ns)


def studio_voice(profiles_path: Path, name: str) -> tuple[Path, str, str]:
    if not profiles_path.is_file():
        raise FileNotFoundError(
            f"Stimme '{name}' fehlt in local-tts und Studio-Profile nicht gefunden: {profiles_path}"
        )
    data = json.loads(profiles_path.read_text(encoding="utf-8"))
    wanted = name.strip().lower()
    for item in data.get("profiles") or []:
        if str(item.get("name") or "").strip().lower() != wanted:
            continue
        audio = Path(str(item.get("ref_audio") or "")).expanduser()
        ref_text = str(item.get("ref_text") or "").strip()
        language = str(item.get("language") or "German")
        if not audio.is_file():
            raise FileNotFoundError(f"Studio-Referenz fehlt: {audio}")
        if not ref_text:
            raise ValueError(f"Studio-Stimme '{name}' hat kein Transkript.")
        return audio, ref_text, language
    known = ", ".join(str(p.get("name") or "") for p in (data.get("profiles") or []))
    raise FileNotFoundError(f"Studio-Stimme '{name}' nicht gefunden. Vorhanden: {known}")


def split_paragraphs(text: str, enabled: bool) -> list[str]:
    text = text.replace("\r\n", "\n").strip()
    if not enabled or not text:
        return [text] if text else []
    parts = [re.sub(r"[ \t]+", " ", p).strip() for p in re.split(r"\n\s*\n", text)]
    return [p for p in parts if p]


def merge_sampling(settings: dict, job: dict) -> dict:
    merged = dict(settings.get("sampling") or {})
    extra = job.get("sampling")
    if isinstance(extra, dict):
        merged.update(extra)
    return merged


def format_sampling(sampling: dict) -> str:
    return (
        f"T={sampling.get('temperature')} P={sampling.get('top_p')} K={sampling.get('top_k')} "
        f"subT={sampling.get('subtalker_temperature')} subP={sampling.get('subtalker_top_p')} "
        f"subK={sampling.get('subtalker_top_k')}"
    )


def generate_one(*, tts, engine, settings, text, language, prompt, ref_audio, ref_text, out: Path, sampling=None, sweep=False) -> None:
    assert_qwen_output_path(out, sweep=sweep)
    partial = out.with_name(out.stem + PARTIAL_SUFFIX)
    if partial.exists():
        partial.unlink()
    out.parent.mkdir(parents=True, exist_ok=True)

    chunks = split_paragraphs(text, bool(settings.get("paragraph_generation", True)))
    if not chunks:
        raise ValueError("Kein Text.")

    wavs = []
    sample_rate = None
    for chunk in chunks:
        piece, sample_rate = engine.generate_chunk(
            text=chunk,
            language=language,
            prompt=prompt,
            ref_audio=ref_audio,
            ref_text=ref_text,
            sampling=sampling if sampling is not None else (settings.get("sampling") or {}),
        )
        wavs.append(tts.to_mono(piece))

    pause_s = float(settings.get("paragraph_pause_ms") or 0) / 1000.0
    combined = tts.concat_wavs(wavs, sample_rate, pause_s=pause_s if len(wavs) > 1 else 0.0)
    finalize_mp3(tts, combined, sample_rate, partial, settings)
    os.replace(partial, out)


def assert_qwen_output_path(out: Path, sweep: bool = False) -> None:
    resolved = Path(out).resolve()
    parts = resolved.parts
    if "audio" in parts:
        i = parts.index("audio")
        if i + 1 < len(parts) and parts[i + 1] == "krit":
            raise RuntimeError(f"Qwen darf nicht nach assets/audio/krit/ schreiben: {out}")
        if sweep and i + 1 < len(parts) and parts[i + 1] == "qwen":
            raise RuntimeError(f"Sweep darf nicht nach assets/audio/qwen/ schreiben: {out}")
    if sweep and "qwen-sweep" not in parts:
        raise RuntimeError(f"Sweep-Output muss unter qwen-sweep liegen: {out}")


def finalize_mp3(tts, wav, sample_rate: int, dest: Path, settings: dict) -> None:
    import soundfile as sf

    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg fehlt (brew install ffmpeg).")

    with tempfile.TemporaryDirectory() as tmp:
        raw = Path(tmp) / "raw.wav"
        sf.write(raw, wav, sample_rate)
        current = raw
        speed = float(settings.get("speed") or 1.0)
        if abs(speed - 1.0) > 0.001:
            sped = Path(tmp) / "speed.wav"
            run_ffmpeg([ffmpeg, "-y", "-i", str(current), "-filter:a", f"atempo={speed}", str(sped)])
            current = sped
        if settings.get("normalize"):
            lufs = float(settings.get("target_loudness_lufs", -16.0))
            tp = float(settings.get("true_peak_limit_dbtp", -1.0))
            current = loudnorm_wav(ffmpeg, current, Path(tmp) / "norm.wav", lufs, tp)
        run_ffmpeg(
            [ffmpeg, "-y", "-i", str(current), "-codec:a", "libmp3lame", "-q:a", "2", str(dest)]
        )


def loudnorm_wav(ffmpeg: str, src: Path, dest: Path, lufs: float, tp: float) -> Path:
    measure = subprocess.run(
        [
            ffmpeg, "-i", str(src),
            "-af", f"loudnorm=I={lufs}:TP={tp}:LRA=11:print_format=json",
            "-f", "null", "-",
        ],
        capture_output=True,
        text=True,
    )
    measured = parse_loudnorm_json(measure.stderr or "")
    if measured:
        filt = (
            f"loudnorm=I={lufs}:TP={tp}:LRA=11:"
            f"measured_I={measured['input_i']}:"
            f"measured_TP={measured['input_tp']}:"
            f"measured_LRA={measured['input_lra']}:"
            f"measured_thresh={measured['input_thresh']}:"
            f"offset={measured['target_offset']}:"
            f"linear=true"
        )
    else:
        filt = f"loudnorm=I={lufs}:TP={tp}:LRA=11"
    run_ffmpeg([ffmpeg, "-y", "-i", str(src), "-af", filt, str(dest)])
    return dest


def parse_loudnorm_json(stderr: str) -> dict | None:
    start = stderr.rfind("{")
    end = stderr.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        data = json.loads(stderr[start : end + 1])
    except json.JSONDecodeError:
        return None
    keys = ("input_i", "input_tp", "input_lra", "input_thresh", "target_offset")
    if not all(k in data for k in keys):
        return None
    return data


def run_ffmpeg(cmd: list[str]) -> None:
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "ffmpeg fehlgeschlagen")


def load_manifest(path: Path) -> dict:
    if not path.is_file():
        return {"engine": "qwen3-tts-local", "files": []}
    return json.loads(path.read_text(encoding="utf-8"))


def save_manifest(path: Path, manifest: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, path)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("\nAbgebrochen.", file=sys.stderr)
        raise SystemExit(130)
    except Exception as exc:
        print(f"Fehler: {exc}", file=sys.stderr)
        traceback.print_exc()
        raise SystemExit(1)
