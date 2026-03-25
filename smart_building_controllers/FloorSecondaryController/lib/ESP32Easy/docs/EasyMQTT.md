# EasyMQTT

Auto-reconnecting MQTT client with clean subscribe/publish API, JSON support, and wildcard topic matching.

**File:** `ESP32Easy_MQTT.h`  
**Requires:**
- [`PubSubClient`](https://github.com/knolleary/pubsubclient) — `knolleary/PubSubClient @ ^2.8`
- [`ArduinoJson`](https://arduinojson.org/) — `bblanchon/ArduinoJson @ ^7.0`

Install both via PlatformIO or Arduino Library Manager.

---

## Quick start

```cpp
#include "ESP32Easy.h"

EasyWiFi wifi("MySSID", "mypassword");
EasyMQTT mqtt("192.168.1.100", 1883, "esp32-device");

void setup() {
    wifi.connect();

    mqtt.subscribe("home/cmd", [](const String& msg) {
        Serial.println("Command: " + msg);
    });

    mqtt.connect();
}

EasyTask mqttTask("MQTT", []() {
    wifi.loop();
    mqtt.loop();
    EasyTask::sleep(10);
}, 2, 5120, 0);
```

---

## EasyMQTT

### Constructor

```cpp
EasyMQTT mqtt(broker, port, clientId);
```

| Parameter | Type | Description |
|---|---|---|
| `broker` | `const char*` | IP address or hostname of your MQTT broker |
| `port` | `int` | Usually `1883` (plain) or `8883` (TLS) |
| `clientId` | `const char*` | Unique ID for this device on the broker |

> **Client ID must be unique** — two devices with the same ID will kick each other off the broker.

---

## Setup

### Optional credentials

```cpp
mqtt.setCredentials("username", "password");
```

### Last Will message

Sent automatically by the broker if the device disconnects unexpectedly (power loss, crash, etc.).

```cpp
mqtt.setWill("home/devices/esp32/status", "offline");

// Then on connect, publish your online status:
mqtt.onConnect([]() {
    mqtt.publish("home/devices/esp32/status", "online", true);  // retained
});
```

### Connection callbacks

```cpp
mqtt.onConnect([]() {
    Serial.println("MQTT connected!");
});

mqtt.onDisconnect([]() {
    Serial.println("MQTT disconnected.");
});
```

### Connect

Call once after WiFi is up.

```cpp
mqtt.connect();
```

---

## Subscribing

### Basic subscription

```cpp
mqtt.subscribe("home/light", [](const String& payload) {
    if (payload == "on")  digitalWrite(LED_PIN, HIGH);
    if (payload == "off") digitalWrite(LED_PIN, LOW);
});
```

### Wildcard `#` — all subtopics

```cpp
// Matches: home/sensor/temp, home/sensor/humidity, home/sensor/pressure, ...
mqtt.subscribe("home/sensor/#", [](const String& payload) {
    Serial.println("Sensor data: " + payload);
});
```

### Wildcard `+` — single level

```cpp
// Matches: home/led/1, home/led/2, home/led/3 — but NOT home/led/rgb/red
mqtt.subscribe("home/led/+", [](const String& payload) {
    int brightness = payload.toInt();
    analogWrite(LED_PIN, brightness);
});
```

### Unsubscribe

```cpp
mqtt.unsubscribe("home/light");
```

---

## Publishing

### String

```cpp
mqtt.publish("home/status", "online");
```

### Numbers

```cpp
mqtt.publish("home/temp",  25.3f);     // float (2 decimal places)
mqtt.publish("home/temp",  25.3f, 1);  // float (1 decimal place → "25.3")
mqtt.publish("home/count", 42);        // int
mqtt.publish("home/fan",   true);      // bool → "true" / "false"
```

### JSON

```cpp
JsonDocument doc;
doc["temperature"] = 25.3;
doc["humidity"]    = 61.2;
doc["uptime"]      = millis() / 1000;
doc["rssi"]        = WiFi.RSSI();

mqtt.publishJson("home/sensor", doc);
// Publishes: {"temperature":25.3,"humidity":61.2,"uptime":3600,"rssi":-65}
```

### Retained messages

A retained message is stored by the broker and sent immediately to any new subscriber. Use it for status, configuration, and the last known sensor value.

```cpp
mqtt.publish("home/devices/esp32/status", "online", true);  // third arg = retain
```

---

## The MQTT task

`mqtt.loop()` must be called continuously — it handles keepalive pings, incoming messages, and auto-reconnection. Put it in a dedicated task on core 0 (the WiFi core).

```cpp
EasyTask mqttTask("MQTT", []() {
    wifi.loop();   // auto-reconnect WiFi
    mqtt.loop();   // auto-reconnect MQTT + process messages
    EasyTask::sleep(10);
}, 2, 5120, 0);   // priority 2, 5k stack, core 0
```

> **Why core 0?** The ESP32 WiFi stack runs on core 0. Keeping your networking task there avoids cross-core overhead.

---

## Reconnection behaviour

`EasyMQTT` handles reconnection automatically:
- If the connection drops, `mqtt.loop()` attempts to reconnect every **5 seconds**
- All subscriptions are re-registered automatically after reconnect
- Your `onConnect` callback fires on every successful connection (initial and reconnects)

You do not need to call `mqtt.connect()` again after a disconnect.

---

## Receiving JSON

Parse incoming JSON payloads in your subscription callback using ArduinoJson.

```cpp
mqtt.subscribe("home/config", [](const String& payload) {
    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, payload);

    if (err) {
        Serial.println("JSON parse failed: " + String(err.c_str()));
        return;
    }

    int interval = doc["interval"] | 5000;   // default 5000 if key missing
    bool enabled = doc["enabled"]  | true;

    Serial.printf("Interval: %d  Enabled: %s\n", interval, enabled ? "yes" : "no");
});
```

---

## Common patterns

### Device command handler

```cpp
mqtt.subscribe("devices/esp32/cmd", [](const String& cmd) {
    if (cmd == "restart")     ESP.restart();
    if (cmd == "ping")        mqtt.publish("devices/esp32/pong", "ok");
    if (cmd == "status")      publishStatus();
    if (cmd == "ota")         startOTA();
});
```

### Sending sensor data from another task via queue

```cpp
EasyQueue<float> tempQueue(10);

// Sensor task (core 1):
EasyTask sensorTask("Sensor", []() {
    tempQueue.send(readSensor());
    EasyTask::sleep(5000);
}, 1, 3072, 1);

// MQTT task (core 0) — drain queue and publish:
EasyTask mqttTask("MQTT", []() {
    wifi.loop();
    mqtt.loop();
    tempQueue.drain([](float t) {
        mqtt.publish("home/temp", t);
    });
    EasyTask::sleep(50);
}, 2, 5120, 0);
```

### Publish on event, not on timer

```cpp
EasySemaphore motionSignal;

void IRAM_ATTR motionISR() {
    motionSignal.giveFromISR();
}

EasyTask motionTask("Motion", []() {
    motionSignal.wait();
    mqtt.publish("home/motion", "detected");
}, 2, 3072, 1);
```

---

## Full example

```cpp
#include "ESP32Easy.h"

EasyWiFi wifi("MySSID", "mypassword");
EasyMQTT mqtt("192.168.1.100", 1883, "esp32-living-room");

void setup() {
    Serial.begin(115200);

    // WiFi
    wifi.onConnect([]() {
        Serial.println("WiFi: " + wifi.ip());
    });
    wifi.connect();

    // MQTT setup (before connect)
    mqtt.setWill("home/living-room/status", "offline");

    mqtt.onConnect([]() {
        mqtt.publish("home/living-room/status", "online", true);
        Serial.println("MQTT connected");
    });

    mqtt.subscribe("home/living-room/light", [](const String& msg) {
        digitalWrite(LIGHT_PIN, msg == "on" ? HIGH : LOW);
    });

    mqtt.subscribe("home/living-room/config", [](const String& msg) {
        JsonDocument doc;
        deserializeJson(doc, msg);
        int brightness = doc["brightness"] | 255;
        analogWrite(LIGHT_PIN, brightness);
    });

    mqtt.connect();

    // Periodic publish task
    EasyTask(">PublishTask", []() {
        JsonDocument doc;
        doc["temp"]   = readTemp();
        doc["uptime"] = millis() / 1000;
        mqtt.publishJson("home/living-room/sensor", doc);
        EasyTask::sleep(30000);
    }, 1, 4096, 1).start();

    // Networking task
    EasyTask("MQTT", []() {
        wifi.loop();
        mqtt.loop();
        EasyTask::sleep(10);
    }, 2, 5120, 0).start();
}

void loop() {
    vTaskDelay(1000 / portTICK_PERIOD_MS);
}
```

---

## Broker setup (Mosquitto)

If you need a local broker, [Mosquitto](https://mosquitto.org/) is the standard choice.

**Install on Linux/Raspberry Pi:**
```bash
sudo apt install mosquitto mosquitto-clients
sudo systemctl enable mosquitto
```

**Test from your PC:**
```bash
# Subscribe
mosquitto_sub -h 192.168.1.100 -t "home/#" -v

# Publish
mosquitto_pub -h 192.168.1.100 -t "home/cmd" -m "ping"
```

---

## Common mistakes

**Client ID not unique** — if two devices share the same `clientId`, they will disconnect each other in a loop. Use a unique ID per device (e.g. include the MAC address: `"esp32-" + WiFi.macAddress()`).

**Calling `mqtt.publish()` before `connect()`** — always call `mqtt.connect()` in `setup()` and check `mqtt.isConnected()` before publishing from tasks.

**Not calling `mqtt.loop()`** — without it, the connection drops after the keepalive timeout (~60s), incoming messages are never delivered, and auto-reconnect never fires.

**Publishing from the sensor task (core 1) without a queue** — PubSubClient is not thread-safe. Always publish from the same task that calls `mqtt.loop()`, or use an `EasyQueue` to pass data across.

**Payload too large** — PubSubClient's default buffer is 256 bytes. To increase it, add this before `#include <PubSubClient.h>`:
```cpp
#define MQTT_MAX_PACKET_SIZE 1024
```
