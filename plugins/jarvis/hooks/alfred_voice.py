"""Alfred's own voice: speech and hearing on this computer, no other app needed.

    py -3 alfred_voice.py serve --dir <alfred_dir> [--port 3911] [--voice bm_george] [--speed 0.95]
                                [--asr parakeet|whisper-base]

A small web service on 127.0.0.1 only, answering the same requests Alfred sends VoiceStudio:
    GET  /health                    {"ok": true, "tts": "ready|loading|error", "asr": ..., "error": ...}
    POST /v1/audio/speech           JSON {input, voice?, speed?, response_format: pcm|wav}
                                    -> 24 kHz 16-bit mono PCM, or a WAV
    POST /v1/audio/transcriptions   multipart: file (WAV), language? -> {"text": "..."}

Speech: Kokoro (Apache-2.0), British voices (bm_george, bm_lewis, bm_daniel, bm_fable, ...).
Hearing: sherpa-onnx with NVIDIA Parakeet TDT 0.6B v2 (default) or Whisper base.en.
Models download once into <alfred_dir>/models. Nothing leaves this computer.
"""

import argparse
import io
import json
import os
import socket
import sys
import tarfile
import threading
import time
import traceback
import urllib.request
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

KOKORO_BASE = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/"
KOKORO_FILES = ["kokoro-v1.0.int8.onnx", "voices-v1.0.bin"]
ASR_BASE = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/"
ASR_MODELS = {
    "parakeet": "sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8",
    "whisper-base": "sherpa-onnx-whisper-base.en",
}
TTS_RATE = 24000

state = {"tts": "loading", "asr": "waiting", "error": None}
tts_ready = threading.Event()
asr_ready = threading.Event()
tts_lock = threading.Lock()
asr_lock = threading.Lock()
engines = {}
args = None


def log(msg):
    try:
        with open(os.path.join(args.dir, "voice.log"), "a", encoding="utf-8") as f:
            f.write(time.strftime("%Y-%m-%d %H:%M:%S ") + msg + "\n")
    except OSError:
        pass


def fetch(url, dest):
    """Downloads to dest through a .part file, so a cut download is never mistaken for a model."""
    if os.path.exists(dest):
        return
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    tmp = dest + ".part"
    log("downloading " + url)
    urllib.request.urlretrieve(url, tmp)
    os.replace(tmp, dest)


def models_dir():
    return os.path.join(args.dir, "models")


# ---------------------------------------------------------------------------
# Speech (Kokoro)


def load_tts():
    try:
        from kokoro_onnx import Kokoro

        paths = []
        for name in KOKORO_FILES:
            p = os.path.join(models_dir(), name)
            fetch(KOKORO_BASE + name, p)
            paths.append(p)
        engines["tts"] = Kokoro(paths[0], paths[1])
        state["tts"] = "ready"
        log("speech ready")
    except Exception as err:  # noqa: BLE001
        state["tts"] = "error"
        state["error"] = "speech: " + str(err)[:300]
        log(traceback.format_exc())
    finally:
        tts_ready.set()


def speak(text, voice, speed):
    tts = engines["tts"]
    voices = set(tts.get_voices())
    if voice not in voices:
        voice = args.voice if args.voice in voices else "bm_george"
    with tts_lock:
        samples, rate = tts.create(text, voice=voice, speed=speed, lang="en-gb")
    import numpy as np

    pcm = (np.clip(samples, -1.0, 1.0) * 32767).astype("<i2").tobytes()
    return pcm, rate


def as_wav(pcm, rate):
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Hearing (sherpa-onnx)


asr_started = threading.Lock()


def load_asr():
    if not asr_started.acquire(blocking=False):
        return  # already loading or loaded
    state["asr"] = "loading"
    try:
        import sherpa_onnx

        name = ASR_MODELS.get(args.asr, ASR_MODELS["parakeet"])
        folder = os.path.join(models_dir(), name)
        if not os.path.isdir(folder):
            archive = folder + ".tar.bz2"
            fetch(ASR_BASE + name + ".tar.bz2", archive)
            with tarfile.open(archive, "r:bz2") as t:
                t.extractall(models_dir(), filter="data") if sys.version_info >= (3, 12) else t.extractall(models_dir())
            os.remove(archive)
        f = lambda n: os.path.join(folder, n)  # noqa: E731
        if name.startswith("sherpa-onnx-whisper"):
            rec = sherpa_onnx.OfflineRecognizer.from_whisper(
                encoder=f("base.en-encoder.int8.onnx"), decoder=f("base.en-decoder.int8.onnx"),
                tokens=f("base.en-tokens.txt"), num_threads=2)
        else:
            rec = sherpa_onnx.OfflineRecognizer.from_transducer(
                encoder=f("encoder.int8.onnx"), decoder=f("decoder.int8.onnx"), joiner=f("joiner.int8.onnx"),
                tokens=f("tokens.txt"), model_type="nemo_transducer", num_threads=2)
        engines["asr"] = rec
        state["asr"] = "ready"
        log("hearing ready (" + name + ")")
    except Exception as err:  # noqa: BLE001
        state["asr"] = "error"
        state["error"] = "hearing: " + str(err)[:300]
        log(traceback.format_exc())
    finally:
        asr_ready.set()


def read_wav(data):
    import numpy as np

    with wave.open(io.BytesIO(data), "rb") as w:
        if w.getsampwidth() != 2:
            raise ValueError("expected 16-bit audio")
        rate, channels = w.getframerate(), w.getnchannels()
        samples = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float32) / 32768.0
    if channels > 1:
        samples = samples.reshape(-1, channels).mean(axis=1)
    return rate, samples


def transcribe(data):
    rate, samples = read_wav(data)
    rec = engines["asr"]
    with asr_lock:
        s = rec.create_stream()
        s.accept_waveform(rate, samples)
        rec.decode_stream(s)
    return s.result.text.strip()


def multipart_file(body, content_type):
    """The bytes of the first file part, and the text fields (no cgi module in newer Pythons)."""
    marker = "boundary="
    if marker not in content_type:
        raise ValueError("not multipart")
    boundary = content_type.split(marker, 1)[1].split(";")[0].strip().strip('"').encode()
    fields, file_bytes = {}, None
    for part in body.split(b"--" + boundary):
        if b"\r\n\r\n" not in part:
            continue
        head, _, content = part.partition(b"\r\n\r\n")
        content = content[:-2] if content.endswith(b"\r\n") else content
        disposition = head.decode("utf-8", "replace")
        if 'filename="' in disposition and file_bytes is None:
            file_bytes = content
        elif 'name="' in disposition:
            name = disposition.split('name="', 1)[1].split('"', 1)[0]
            fields[name] = content.decode("utf-8", "replace")
    if file_bytes is None:
        raise ValueError("no file in the request")
    return file_bytes, fields


# ---------------------------------------------------------------------------
# The web service


class Handler(BaseHTTPRequestHandler):
    server_version = "AlfredVoice/1"

    def log_message(self, *a):  # quiet: errors go to voice.log
        pass

    def send(self, code, body, ctype="application/json"):
        if isinstance(body, (dict, list)):
            body = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > 50 * 1024 * 1024:
            raise ValueError("request too large")
        return self.rfile.read(n)

    def do_GET(self):
        if self.path.rstrip("/") in ("/health", ""):
            return self.send(200, {"ok": True, "engine": "alfred", **state})
        self.send(404, {"detail": "not found"})

    def do_POST(self):
        try:
            if self.path.startswith("/v1/audio/speech"):
                req = json.loads(self.body() or b"{}")
                text = str(req.get("input") or "").strip()
                if not text:
                    return self.send(400, {"detail": "no input text"})
                if not tts_ready.wait(600):
                    return self.send(503, {"detail": "the voice is still loading"})
                if state["tts"] != "ready":
                    return self.send(503, {"detail": state["error"] or "the voice did not load"})
                speed = float(req.get("speed") or args.speed)
                pcm, rate = speak(text, str(req.get("voice") or args.voice), speed)
                if req.get("response_format") == "pcm":
                    return self.send(200, pcm, "audio/pcm")
                return self.send(200, as_wav(pcm, rate), "audio/wav")
            if self.path.startswith("/v1/audio/transcriptions"):
                data, _fields = multipart_file(self.body(), self.headers.get("Content-Type", ""))
                threading.Thread(target=load_asr, daemon=True).start()
                if not asr_ready.wait(900):
                    return self.send(503, {"detail": "hearing is still loading"})
                if state["asr"] != "ready":
                    return self.send(503, {"detail": state["error"] or "hearing did not load"})
                return self.send(200, {"text": transcribe(data)})
            self.send(404, {"detail": "not found"})
        except Exception as err:  # noqa: BLE001
            log(traceback.format_exc())
            self.send(500, {"detail": str(err)[:300]})


def port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", port)) == 0


def main():
    global args
    p = argparse.ArgumentParser()
    p.add_argument("command", choices=["serve"])
    p.add_argument("--dir", required=True)
    p.add_argument("--port", type=int, default=3911)
    p.add_argument("--voice", default="bm_george")
    p.add_argument("--speed", type=float, default=0.95)
    p.add_argument("--asr", default="parakeet")
    args = p.parse_args()
    os.makedirs(args.dir, exist_ok=True)
    if port_in_use(args.port):
        print("already running", flush=True)
        return
    threading.Thread(target=load_tts, daemon=True).start()
    # Hearing loads once speech is up, so the first greeting is not held back by the bigger model.
    threading.Thread(target=lambda: (tts_ready.wait(), load_asr()), daemon=True).start()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    log("listening on 127.0.0.1:%d" % args.port)
    print("listening", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
