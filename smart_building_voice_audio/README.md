# Raspberry Pi Announcer

This service listens for MQTT evacuation alerts and speaks them through the Raspberry Pi audio output, including a connected Bluetooth speaker.

## Setup

```bash
cd raspberry_pi_announcer
cp .env.example .env
pip install paho-mqtt
python voice_announcer.py
```

Install a TTS engine on Raspberry Pi if needed:

```bash
sudo apt install espeak-ng
```

Default MQTT topic:

```text
building/evacuation/alerts
```

Supported alert keys:

- `voice=fire_alert`
- `voice_message=high_gas_alert`
- `voice_message=high_temperature_alert`

