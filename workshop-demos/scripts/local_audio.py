#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["mlx-audio", "parakeet-mlx==0.5.2", "huggingface_hub[hf_xet]", "supertonic==1.3.1", "soundfile", "misaki[en]"]
# ///
import argparse, importlib, json, os, sys
from pathlib import Path

PIANISSIMO_MODEL = "KlangAI/pianissimo-sv-mlx-8bit"
PARAKEET_MODEL = "mlx-community/parakeet-tdt-0.6b-v3"
KOKORO_MODEL = "mlx-community/Kokoro-82M-bf16"
CHATTERBOX_MODEL = "mlx-community/chatterbox-multilingual-v3"
SUPERTONIC_MODEL = "Supertone/supertonic-3"

def selected_stt(model_name=None):
    requested = (model_name or os.getenv("LOCAL_STT_MODEL") or "pianissimo").lower()
    if requested in {"pianissimo", "sv", "swedish", PIANISSIMO_MODEL.lower()}:
        return "pianissimo", PIANISSIMO_MODEL
    if requested in {"parakeet", "multilingual", PARAKEET_MODEL.lower()}:
        return "parakeet", PARAKEET_MODEL
    raise ValueError(f"Unknown transcription model: {requested}. Use pianissimo or parakeet.")

def load_stt(model_name=None):
    backend, model_id = selected_stt(model_name)
    if backend == "pianissimo":
        from huggingface_hub import snapshot_download
        model_path = snapshot_download(model_id)
        if model_path not in sys.path:
            sys.path.insert(0, model_path)
        loader = importlib.import_module("pianissimo_mlx")
        return {"backend": backend, "model_id": model_id, "model": loader.load(model_path), "loader": loader}
    from mlx_audio.stt.utils import load
    return {"backend": backend, "model_id": model_id, "model": load(model_id)}

def transcribe(stt, audio_path: str) -> str:
    if stt["backend"] == "pianissimo":
        return stt["loader"].transcribe(stt["model"], audio_path).text.strip()
    return stt["model"].generate(audio_path).text.strip()

def load_tts(language="en", voice_model=None):
    requested = (voice_model or os.getenv("LOCAL_VOICE_MODEL") or
                 ("supertonic" if language == "sv" else "kokoro")).lower()
    if requested == "supertonic":
        from supertonic import TTS
        model = TTS(auto_download=True)
        return {"model_id": SUPERTONIC_MODEL, "model": model, "language": language,
                "backend": "supertonic", "style": model.get_voice_style(voice_name="F1")}
    from mlx_audio.tts.utils import load_model
    if requested == "chatterbox":
        return {"model_id": CHATTERBOX_MODEL, "model": load_model(CHATTERBOX_MODEL),
                "language": language, "backend": "chatterbox"}
    if requested == "kokoro":
        return {"model_id": KOKORO_MODEL, "model": load_model(KOKORO_MODEL),
                "language": language, "backend": "kokoro"}
    raise ValueError(f"Unknown voice model: {requested}")

def synthesize(tts, text: str, reference=None):
    import numpy as np
    if tts["backend"] == "supertonic":
        audio, _ = tts["model"].synthesize(
            text, voice_style=tts["style"], lang=tts["language"],
        )
        return np.asarray(audio).squeeze(), int(tts["model"].sample_rate)
    if tts["backend"] == "chatterbox":
        if not reference:
            raise ValueError("Swedish Chatterbox synthesis needs --reference audio")
        parts = list(tts["model"].generate(text=text, ref_audio=reference, lang_code="sv",
                                            exaggeration=0.2, cfg_weight=0.3))
    else:
        parts = list(tts["model"].generate(text=text, voice="af_heart", speed=1.0, lang_code="a"))
    if not parts:
        raise RuntimeError("TTS returned no audio")
    audio = np.concatenate([np.asarray(part.audio) for part in parts])
    return audio, int(getattr(parts[0], "sample_rate", 24000))

def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    stt = sub.add_parser("transcribe")
    stt.add_argument("--audio", required=True)
    stt.add_argument("--model", choices=["pianissimo", "parakeet"], default=None,
                     help="pianissimo is Swedish-first; parakeet is the multilingual fallback")
    tts = sub.add_parser("synthesize")
    tts.add_argument("--text", required=True)
    tts.add_argument("--output", required=True)
    tts.add_argument("--language", choices=["en", "sv"], default="en")
    tts.add_argument("--voice", choices=["supertonic", "chatterbox", "kokoro"], default=None)
    tts.add_argument("--reference", help="Reference WAV used by Swedish Chatterbox voice cloning")
    args = parser.parse_args()
    if args.command == "transcribe":
        model = load_stt(args.model)
        text = transcribe(model, args.audio)
        language = "sv" if model["backend"] == "pianissimo" else "multilingual"
        print("RESULT_JSON:" + json.dumps({"text": text, "model": model["model_id"], "language": language}))
    else:
        import soundfile as sf
        model = load_tts(args.language, args.voice)
        audio, rate = synthesize(model, args.text, args.reference)
        Path(args.output).parent.mkdir(parents=True, exist_ok=True)
        sf.write(args.output, audio, rate)
        print("RESULT_JSON:" + json.dumps({"output": args.output, "model": model["model_id"], "sample_rate": rate}))

if __name__ == "__main__":
    main()
