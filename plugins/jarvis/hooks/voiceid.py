"""Alfred's voice ID: is this recording the enrolled person?

    python voiceid.py setup   <alfred_dir>                  download the model (once)
    python voiceid.py enroll  <alfred_dir> <wav> [<wav>...]   make the voiceprint
    python voiceid.py verify  <alfred_dir> <wav>              compare a recording with it

Prints one line of JSON. Everything stays on this computer: the model runs locally (sherpa-onnx,
WeSpeaker ResNet34 trained on VoxCeleb) and the voiceprint is a list of numbers in
<alfred_dir>/voiceprint.json, not a recording.
"""

import json
import os
import sys
import urllib.request
import wave

MODEL_NAME = "wespeaker_en_voxceleb_resnet34.onnx"
MODEL_URL = "https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/" + MODEL_NAME


def say(obj):
    print(json.dumps(obj), flush=True)
    sys.exit(0)


def model_path(alfred_dir):
    return os.path.join(alfred_dir, "models", MODEL_NAME)


def ensure_model(alfred_dir):
    path = model_path(alfred_dir)
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        tmp = path + ".part"
        urllib.request.urlretrieve(MODEL_URL, tmp)
        os.replace(tmp, path)
    return path


def read_wav(path):
    import numpy as np

    with wave.open(path, "rb") as w:
        if w.getsampwidth() != 2:
            raise ValueError("expected 16-bit audio")
        rate = w.getframerate()
        channels = w.getnchannels()
        data = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
    if channels > 1:
        data = data.reshape(-1, channels).mean(axis=1)
    return rate, data


def embed(extractor, path):
    import numpy as np

    rate, samples = read_wav(path)
    if len(samples) < rate * 0.8:
        raise ValueError("too short to recognise a voice (under a second)")
    stream = extractor.create_stream()
    stream.accept_waveform(rate, samples)
    stream.input_finished()
    v = np.array(extractor.compute(stream), dtype=np.float32)
    return v / (np.linalg.norm(v) + 1e-9)


def extractor_for(alfred_dir):
    import sherpa_onnx

    config = sherpa_onnx.SpeakerEmbeddingExtractorConfig(model=ensure_model(alfred_dir), num_threads=1)
    if not config.validate():
        raise RuntimeError("the voice ID model did not load")
    return sherpa_onnx.SpeakerEmbeddingExtractor(config)


def main(argv):
    if len(argv) < 3:
        say({"ok": False, "error": "usage: voiceid.py setup|enroll|verify <alfred_dir> [wav...]"})
    cmd, alfred_dir, wavs = argv[1], argv[2], argv[3:]
    try:
        import numpy as np  # noqa: F401
        import sherpa_onnx  # noqa: F401
    except ImportError:
        say({"ok": False, "error": "missing", "detail": "Python packages sherpa-onnx and numpy are not installed"})
    try:
        if cmd == "setup":
            ensure_model(alfred_dir)
            extractor_for(alfred_dir)
            say({"ok": True, "model": model_path(alfred_dir)})
        extractor = extractor_for(alfred_dir)
        if cmd == "enroll":
            import numpy as np

            vecs = [embed(extractor, w) for w in wavs]
            if len(vecs) < 2:
                say({"ok": False, "error": "need at least two recordings to enrol"})
            mean = np.mean(vecs, axis=0)
            mean = mean / (np.linalg.norm(mean) + 1e-9)
            # How alike the enrolment recordings are to each other: a guide for the threshold.
            spread = float(min(float(np.dot(v, mean)) for v in vecs))
            with open(os.path.join(alfred_dir, "voiceprint.json"), "w", encoding="utf-8") as f:
                json.dump({"model": MODEL_NAME, "mean": [float(x) for x in mean], "samples": [[float(x) for x in v] for v in vecs], "selfScore": spread}, f)
            say({"ok": True, "enrolled": len(vecs), "selfScore": round(spread, 3)})
        if cmd == "verify":
            import numpy as np

            vp_path = os.path.join(alfred_dir, "voiceprint.json")
            if not os.path.exists(vp_path):
                say({"ok": False, "error": "not enrolled"})
            with open(vp_path, encoding="utf-8") as f:
                vp = json.load(f)
            v = embed(extractor, wavs[0])
            mean = np.array(vp["mean"], dtype=np.float32)
            best = max(float(np.dot(v, np.array(s, dtype=np.float32))) for s in vp["samples"])
            score = max(float(np.dot(v, mean)), best)
            say({"ok": True, "score": round(score, 3)})
        say({"ok": False, "error": "unknown command " + cmd})
    except Exception as err:  # noqa: BLE001
        say({"ok": False, "error": str(err)[:300]})


if __name__ == "__main__":
    main(sys.argv)
