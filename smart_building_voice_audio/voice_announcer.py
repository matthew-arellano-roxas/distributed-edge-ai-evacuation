import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

try:
    import paho.mqtt.client as mqtt
except ImportError:
    mqtt = None


def _load_env_file():
    env_path = Path(__file__).resolve().parent / ".env"
    if not env_path.exists():
        return

    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue

        key, value = stripped.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_env_file()

MQTT_HOST = os.getenv("MQTT_HOST", "127.0.0.1")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_USERNAME = os.getenv("MQTT_USERNAME", "")
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD", "")
MQTT_ANNOUNCEMENT_TOPIC = os.getenv(
    "MQTT_ANNOUNCEMENT_TOPIC",
    "building/evacuation/alerts",
)
MQTT_CLIENT_ID = os.getenv("MQTT_ANNOUNCER_CLIENT_ID", "pi-voice-announcer")

ANNOUNCER_NAME = os.getenv("ANNOUNCER_NAME", "Building announcer")
ANNOUNCEMENT_COOLDOWN_SECONDS = float(
    os.getenv("ANNOUNCEMENT_COOLDOWN_SECONDS", "8"),
)
TTS_VOICE = os.getenv("TTS_VOICE", "en")
TTS_SPEED = os.getenv("TTS_SPEED", "155")
TTS_VOLUME = os.getenv("TTS_VOLUME", "180")

_last_spoken_at = {}


def _is_record(value):
    return isinstance(value, dict)


def _clean_place(value):
    if not value:
        return "the affected area"
    return str(value).replace("_", " ").replace("-", " ").strip()


def _clean_floor(value):
    if value in (None, ""):
        return ""
    return f" on floor {value}"


def _extract_floor_from_message(message):
    if not message:
        return None

    text = str(message)
    marker = " on floor "
    index = text.lower().find(marker)
    if index == -1:
        return None

    floor_text = text[index + len(marker) :].strip().rstrip(".")
    return floor_text or None


def _build_announcement(payload):
    if not _is_record(payload):
        return None

    direct_text = payload.get("announcement") or payload.get("text")
    if direct_text:
        return str(direct_text).strip()

    place = _clean_place(
        payload.get("placeId")
        or payload.get("location")
        or payload.get("sourceLocation")
    )
    floor_value = (
        payload.get("floor")
        or payload.get("sourceFloor")
        or _extract_floor_from_message(payload.get("message"))
    )
    floor = _clean_floor(floor_value)
    voice_key = str(payload.get("voice") or payload.get("voice_message") or "").strip().lower()
    message = str(payload.get("message") or "").strip()

    templates = {
        "fire_alert": (
            f"Attention. Attention. Fire has been detected in {place}{floor}. "
            "Please evacuate immediately and proceed to the nearest safe exit."
        ),
        "high_gas_alert": (
            f"Attention. Attention. Gas has been detected in {place}{floor}. "
            "Please avoid the area and follow evacuation instructions."
        ),
        "high_temperature_alert": (
            f"Attention. Attention. High temperature has been detected in {place}{floor}. "
            "Please stay alert and follow safety instructions."
        ),
    }

    if voice_key in templates:
        return templates[voice_key]

    if "fire" in message.lower():
        return (
            f"Attention. Attention. Fire has been detected in {place}{floor}. "
            "Please evacuate immediately and proceed to the nearest safe exit."
        )

    if "gas" in message.lower():
        return (
            f"Attention. Attention. Gas has been detected in {place}{floor}. "
            "Please avoid the area and follow evacuation instructions."
        )

    if "temperature" in message.lower():
        return (
            f"Attention. Attention. High temperature has been detected in {place}{floor}. "
            "Please stay alert and follow safety instructions."
        )

    if message:
        return f"Attention. Attention. {message}. Please follow safety instructions."

    return None


def _resolve_tts_command():
    if shutil.which("espeak-ng"):
        return [
            "espeak-ng",
            "-v",
            TTS_VOICE,
            "-s",
            TTS_SPEED,
            "-a",
            TTS_VOLUME,
        ]

    if shutil.which("espeak"):
        return [
            "espeak",
            "-v",
            TTS_VOICE,
            "-s",
            TTS_SPEED,
            "-a",
            TTS_VOLUME,
        ]

    if shutil.which("spd-say"):
        return ["spd-say"]

    return None


def _speak_windows(text):
    rate = "0"
    try:
        # espeak uses roughly 80-450 wpm, while SAPI uses -10..10.
        speed = int(TTS_SPEED)
        rate = str(max(-10, min(10, round((speed - 175) / 12))))
    except ValueError:
        rate = "0"

    volume = "100"
    try:
        volume = str(max(0, min(100, round(int(TTS_VOLUME) / 2))))
    except ValueError:
        volume = "100"

    escaped_text = text.replace("'", "''")
    powershell_script = (
        "Add-Type -AssemblyName System.Speech; "
        "$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
        f"$speaker.Volume = {volume}; "
        f"$speaker.Rate = {rate}; "
        f"$speaker.Speak('{escaped_text}')"
    )

    try:
        subprocess.run(
            ["powershell", "-NoProfile", "-Command", powershell_script],
            check=True,
        )
        return True
    except FileNotFoundError:
        print("[VOICE] PowerShell not found for Windows speech.", file=sys.stderr)
    except subprocess.CalledProcessError as exc:
        print(f"[VOICE] Windows speech failed: {exc}", file=sys.stderr)

    return False


def _speak(text):
    if os.name == "nt" and _speak_windows(text):
        return

    command = _resolve_tts_command()
    if command is None:
        print(
            "[VOICE] No TTS engine found. On Windows, ensure PowerShell is available. "
            "On Linux, install espeak-ng, espeak, or speech-dispatcher.",
            file=sys.stderr,
        )
        return

    try:
        subprocess.run([*command, text], check=True)
    except subprocess.CalledProcessError as exc:
        print(f"[VOICE] Failed to speak announcement: {exc}", file=sys.stderr)


def _should_skip(text):
    now = time.monotonic()
    last_time = _last_spoken_at.get(text)
    if last_time is not None and now - last_time < ANNOUNCEMENT_COOLDOWN_SECONDS:
        return True
    _last_spoken_at[text] = now
    return False


def _on_connect(client, userdata, flags, rc, properties=None):
    if rc != 0:
        print(f"[VOICE] MQTT connection failed with rc={rc}", file=sys.stderr)
        return

    client.subscribe(MQTT_ANNOUNCEMENT_TOPIC)
    print(
        f"[VOICE] {ANNOUNCER_NAME} subscribed to {MQTT_ANNOUNCEMENT_TOPIC} "
        f"at {MQTT_HOST}:{MQTT_PORT}"
    )


def _on_message(client, userdata, msg):
    try:
        payload = json.loads(msg.payload.decode("utf-8"))
    except json.JSONDecodeError:
        print(f"[VOICE] Ignoring non-JSON payload on {msg.topic}", file=sys.stderr)
        return

    text = _build_announcement(payload)
    if not text:
        print(f"[VOICE] Ignoring payload without announcement text: {payload}")
        return

    if _should_skip(text):
        print(f"[VOICE] Skipping duplicate announcement: {text}")
        return

    print(f"[VOICE] Announcing: {text}")
    _speak(text)


def main():
    if mqtt is None:
        raise RuntimeError("paho-mqtt is not installed. Run: pip install paho-mqtt")

    if hasattr(mqtt, "CallbackAPIVersion"):
        client = mqtt.Client(
            mqtt.CallbackAPIVersion.VERSION2,
            client_id=MQTT_CLIENT_ID,
        )
    else:
        client = mqtt.Client(client_id=MQTT_CLIENT_ID)

    if MQTT_USERNAME:
        client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)

    client.on_connect = _on_connect
    client.on_message = _on_message

    print(f"[VOICE] Connecting to MQTT broker at {MQTT_HOST}:{MQTT_PORT} ...")
    client.connect(MQTT_HOST, MQTT_PORT, keepalive=30)
    client.loop_forever()


if __name__ == "__main__":
    main()
