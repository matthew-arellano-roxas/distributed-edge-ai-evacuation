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


BASE_DIR = Path(__file__).resolve().parent
AUDIO_DIR = BASE_DIR / "audio files"
ENV_PATH = BASE_DIR / ".env"


def _load_env_file():
    if not ENV_PATH.exists():
        return

    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
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
MQTT_ANNOUNCEMENT_TOPIC = os.getenv("MQTT_ANNOUNCEMENT_TOPIC", "building/evacuation/alerts")
MQTT_EVACUATION_TOPIC = os.getenv("MQTT_EVACUATION_TOPIC", "building/command/evacuation")
MQTT_SENSOR_TOPIC = os.getenv("MQTT_SENSOR_TOPIC", "building/sensors/#")
MQTT_CLIENT_ID = os.getenv("MQTT_ALERT_AUDIO_CLIENT_ID", "mqtt-alert-audio-player")
ALERT_COOLDOWN_SECONDS = float(os.getenv("ALERT_COOLDOWN_SECONDS", "8"))

DEFAULT_FIRE_MP3 = AUDIO_DIR / "fire_voice_line.mp3"
FIRE_FIRST_FLOOR_MP3 = AUDIO_DIR / "fire_first_floor_voice_line.mp3"
FIRE_SECOND_FLOOR_MP3 = AUDIO_DIR / "fire_second_floor_voice_line.mp3"
FIRE_THIRD_FLOOR_MP3 = AUDIO_DIR / "fire_third_floor_fire_voice_line.mp3"
GAS_MP3 = AUDIO_DIR / "gas_leak_voice_line.mp3"
TEMPERATURE_MP3 = AUDIO_DIR / "temperature_rising_voice_line.mp3"
SMOKE_MP3 = AUDIO_DIR / "smoke_voice_line.mp3"

_last_played_at = {}


def _normalize_floor(value):
    if value is None:
        return None

    text = str(value).strip().lower()
    if not text:
        return None

    replacements = {
        "1": "1",
        "first": "1",
        "first floor": "1",
        "floor 1": "1",
        "2": "2",
        "second": "2",
        "second floor": "2",
        "floor 2": "2",
        "3": "3",
        "third": "3",
        "third floor": "3",
        "floor 3": "3",
    }
    return replacements.get(text, text)


def _extract_floor(payload):
    for key in ("floor", "sourceFloor"):
        value = payload.get(key)
        normalized = _normalize_floor(value)
        if normalized:
            return normalized

    message = str(payload.get("message") or payload.get("announcement") or "")
    lowered = message.lower()
    if "floor 1" in lowered or "first floor" in lowered:
        return "1"
    if "floor 2" in lowered or "second floor" in lowered:
        return "2"
    if "floor 3" in lowered or "third floor" in lowered:
        return "3"
    return None


def _parse_sensor_topic(topic):
    parts = topic.split("/")
    if len(parts) < 4:
        return None

    floor = parts[2] if len(parts) > 2 else None
    sensor_type = parts[-1] if parts else None
    place = floor
    if len(parts) > 4:
        place = "/".join(parts[3:-1])

    return {
        "floor": floor,
        "placeId": place,
        "sensorType": sensor_type,
    }


def _is_sensor_triggered(topic, payload):
    sensor_info = _parse_sensor_topic(topic)
    if sensor_info is None:
        return False, None, None

    sensor_type = str(sensor_info["sensorType"] or "").lower()
    floor = sensor_info["floor"]
    payload_floor = payload.get("floor")
    payload["floor"] = payload_floor or floor
    payload["placeId"] = payload.get("placeId") or sensor_info["placeId"]

    if sensor_type == "flame":
        detected = payload.get("detected")
        active = detected is True or str(detected).lower() == "true"
        return active, "fire", _extract_floor(payload)

    if sensor_type in ("gas", "mq2"):
        detected = payload.get("detected") or payload.get("isDetected")
        active = detected is True or str(detected).lower() == "true"
        return active, "gas", _extract_floor(payload)

    if sensor_type == "temperature":
        try:
            value = float(payload.get("value") or payload.get("temperature") or 0)
        except (TypeError, ValueError):
            value = 0
        return value > 40, "temperature", _extract_floor(payload)

    if sensor_type == "smoke":
        detected = payload.get("detected")
        active = detected is True or str(detected).lower() == "true"
        return active, "smoke", _extract_floor(payload)

    return False, None, None


def _choose_fire_file(floor):
    if floor == "1":
        return FIRE_FIRST_FLOOR_MP3
    if floor == "2":
        return FIRE_SECOND_FLOOR_MP3
    if floor == "3":
        return FIRE_THIRD_FLOOR_MP3
    return DEFAULT_FIRE_MP3


def _choose_audio_file(topic, payload):
    if topic.startswith("building/sensors/"):
        active, alert_type, floor = _is_sensor_triggered(topic, payload)
        if not active:
            return None
        if alert_type == "fire":
            return _choose_fire_file(floor)
        if alert_type == "gas":
            return GAS_MP3
        if alert_type == "temperature":
            return TEMPERATURE_MP3
        if alert_type == "smoke":
            return SMOKE_MP3
        return None

    voice_key = str(payload.get("voice") or payload.get("voice_message") or "").strip().lower()
    message = str(payload.get("message") or payload.get("announcement") or "").strip().lower()
    reason = str(payload.get("reason") or "").strip().lower()
    floor = _extract_floor(payload)

    if topic == MQTT_EVACUATION_TOPIC or reason == "fire_detected":
        return _choose_fire_file(floor)

    if voice_key == "fire_alert" or "fire" in message:
        return _choose_fire_file(floor)

    if voice_key == "high_gas_alert" or "gas" in message:
        return GAS_MP3

    if voice_key == "high_temperature_alert" or "temperature" in message:
        return TEMPERATURE_MP3

    if "smoke" in message:
        return SMOKE_MP3

    return None


def _resolve_audio_player():
    for candidate in ("ffplay", "mpg123", "mpv", "cvlc"):
        if shutil.which(candidate):
            return candidate
    return None


def _play_mp3(path):
    player = _resolve_audio_player()
    if player is None:
        print(
            "[AUDIO] No audio player found. Install ffplay, mpg123, mpv, or vlc.",
            file=sys.stderr,
        )
        return

    if player == "ffplay":
        command = [player, "-nodisp", "-autoexit", "-loglevel", "error", str(path)]
    elif player == "cvlc":
        command = [player, "--play-and-exit", str(path)]
    else:
        command = [player, str(path)]

    subprocess.run(command, check=False)


def _should_skip(key):
    now = time.monotonic()
    last_time = _last_played_at.get(key)
    if last_time is not None and now - last_time < ALERT_COOLDOWN_SECONDS:
        return True
    _last_played_at[key] = now
    return False


def _on_connect(client, userdata, flags, rc, properties=None):
    if rc != 0:
        print(f"[AUDIO] MQTT connection failed with rc={rc}", file=sys.stderr)
        return

    client.subscribe(MQTT_ANNOUNCEMENT_TOPIC)
    client.subscribe(MQTT_EVACUATION_TOPIC)
    client.subscribe(MQTT_SENSOR_TOPIC)
    print(
        f"[AUDIO] Subscribed to {MQTT_ANNOUNCEMENT_TOPIC}, {MQTT_EVACUATION_TOPIC}, and {MQTT_SENSOR_TOPIC} "
        f"at {MQTT_HOST}:{MQTT_PORT}"
    )


def _on_message(client, userdata, msg):
    try:
        payload = json.loads(msg.payload.decode("utf-8"))
    except json.JSONDecodeError:
        print(f"[AUDIO] Ignoring non-JSON payload on {msg.topic}", file=sys.stderr)
        return

    if not isinstance(payload, dict):
        print(f"[AUDIO] Ignoring unexpected payload on {msg.topic}: {payload}")
        return

    audio_file = _choose_audio_file(msg.topic, payload)
    if audio_file is None:
        print(f"[AUDIO] No matching audio file for payload on {msg.topic}: {payload}")
        return

    if not audio_file.exists():
        print(f"[AUDIO] Missing audio file: {audio_file}", file=sys.stderr)
        return

    dedupe_key = f"{msg.topic}:{audio_file.name}:{_extract_floor(payload) or '-'}"
    if _should_skip(dedupe_key):
        print(f"[AUDIO] Skipping duplicate alert for {audio_file.name}")
        return

    print(f"[AUDIO] Playing {audio_file.name} for topic {msg.topic}")
    _play_mp3(audio_file)


def main():
    if mqtt is None:
        raise RuntimeError("paho-mqtt is not installed. Run: python -m pip install paho-mqtt")

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

    print(f"[AUDIO] Connecting to MQTT broker at {MQTT_HOST}:{MQTT_PORT} ...")
    client.connect(MQTT_HOST, MQTT_PORT, keepalive=30)
    client.loop_forever()


if __name__ == "__main__":
    main()
