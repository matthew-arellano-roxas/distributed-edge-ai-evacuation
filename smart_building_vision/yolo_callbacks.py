import json
import os
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
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


_load_env_file()

MQTT_HOST = os.getenv("MQTT_HOST", "127.0.0.1")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_FLOOR = os.getenv("MQTT_FLOOR", "1")
MQTT_TOPIC_TEMPLATE = os.getenv("MQTT_TOPIC_TEMPLATE", "building/occupancy/{floor}")
MQTT_OCCUPANCY_TOPIC = MQTT_TOPIC_TEMPLATE.format(floor=MQTT_FLOOR)

MQTT_MOVEMENT_KEY = os.getenv("MQTT_MOVEMENT_KEY", "movement")
MQTT_EVENT_KEY = os.getenv("MQTT_EVENT_KEY", "event")
MQTT_COUNT_KEY = os.getenv("MQTT_COUNT_KEY", "count")
MQTT_LABEL_KEY = os.getenv("MQTT_LABEL_KEY", "label")
MQTT_CONFIDENCE_KEY = os.getenv("MQTT_CONFIDENCE_KEY", "confidence")

_mqtt_client = None
_mqtt_ready = False
_mqtt_warning_printed = False


def _get_mqtt_client():
    global _mqtt_client, _mqtt_ready, _mqtt_warning_printed

    if mqtt is None:
        if not _mqtt_warning_printed:
            print("[MQTT] paho-mqtt is not installed. Occupancy events will not be published.")
            _mqtt_warning_printed = True
        return None

    if _mqtt_client is not None and _mqtt_ready:
        return _mqtt_client

    try:
        if _mqtt_client is None:
            if hasattr(mqtt, "CallbackAPIVersion"):
                _mqtt_client = mqtt.Client(
                    mqtt.CallbackAPIVersion.VERSION1,
                    client_id="vision-occupancy",
                )
            else:
                _mqtt_client = mqtt.Client(client_id="vision-occupancy")
        _mqtt_client.connect(MQTT_HOST, MQTT_PORT, keepalive=30)
        _mqtt_client.loop_start()
        _mqtt_ready = True
        return _mqtt_client
    except Exception as exc:
        if not _mqtt_warning_printed:
            print(f"[MQTT] Failed to connect to {MQTT_HOST}:{MQTT_PORT}: {exc}")
            _mqtt_warning_printed = True
        _mqtt_ready = False
        return None


def _publish_floor_movement(movement, event_name, count, detection_info):
    client = _get_mqtt_client()
    payload = {
        MQTT_MOVEMENT_KEY: movement,
        MQTT_EVENT_KEY: event_name,
        MQTT_COUNT_KEY: count,
        MQTT_LABEL_KEY: detection_info["label"],
        MQTT_CONFIDENCE_KEY: round(float(detection_info["confidence"]), 4),
    }

    if client is None:
        print(f"[MQTT] Skipping publish to {MQTT_OCCUPANCY_TOPIC}: {json.dumps(payload)}")
        return

    result = client.publish(MQTT_OCCUPANCY_TOPIC, json.dumps(payload))
    if result.rc != 0:
        print(f"[MQTT] Publish failed for {MQTT_OCCUPANCY_TOPIC}: rc={result.rc}")


def on_object_closing_in(detection_info):
    print(
        f"[CALLBACK] Object closing in: {detection_info['label']} "
        f"(confidence={detection_info['confidence']:.2f}, area={int(detection_info['area'])})"
    )


def on_object_moving_away(detection_info):
    print(
        f"[CALLBACK] Object moving away: {detection_info['label']} "
        f"(confidence={detection_info['confidence']:.2f}, area={int(detection_info['area'])})"
    )


def on_object_out_of_view(last_detection_info):
    print(
        f"[CALLBACK] Object out of view: {last_detection_info['label']} "
        f"(last_confidence={last_detection_info['confidence']:.2f}, "
        f"last_area={int(last_detection_info['area'])})"
    )


def on_enter_elevator(count, detection_info):
    print(f"[COUNT] Entered elevator: total_entered={count} ({detection_info['label']})")


def on_exit_elevator(count, detection_info):
    print(f"[COUNT] Exited elevator to floor: total_exited={count} ({detection_info['label']})")


def on_enter_floor(count, detection_info):
    print(f"[COUNT] Entered floor: total_entered_floor={count} ({detection_info['label']})")
    _publish_floor_movement(1, "enter_floor", count, detection_info)


def on_exit_floor(count, detection_info):
    print(f"[COUNT] Exited floor: total_exited_floor={count} ({detection_info['label']})")
    _publish_floor_movement(-1, "exit_floor", count, detection_info)
