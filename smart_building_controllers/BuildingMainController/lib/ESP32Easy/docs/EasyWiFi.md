# EasyWiFi

Simple WiFi connection helper with auto-reconnect and connect/disconnect callbacks.

**File:** `ESP32Easy_WiFi.h`  
**No extra libraries required** — uses the `WiFi` library built into the ESP32 Arduino framework.

---

## Quick start

```cpp
#include "ESP32Easy.h"

EasyWiFi wifi("MySSID", "mypassword");

void setup() {
    Serial.begin(115200);

    wifi.onConnect([]() {
        Serial.println("Connected! IP: " + wifi.ip());
    });

    if (!wifi.connect()) {
        Serial.println("WiFi failed. Restarting...");
        ESP.restart();
    }
}
```

---

## EasyWiFi

### Constructor

```cpp
EasyWiFi wifi(ssid, password);
```

| Parameter | Type | Description |
|---|---|---|
| `ssid` | `const char*` | Your WiFi network name |
| `password` | `const char*` | Your WiFi password |

---

## Connecting

### Blocking connect (recommended for `setup()`)

Waits until connected or until the timeout expires.

```cpp
// Default timeout: 15 seconds
bool ok = wifi.connect();

// Custom timeout:
bool ok = wifi.connect(30000);  // 30 seconds

if (!ok) {
    Serial.println("Could not connect. Restarting.");
    ESP.restart();
}
```

### With callbacks

```cpp
wifi.onConnect([]() {
    Serial.println("WiFi up! IP: " + wifi.ip());
    mqtt.connect();  // start MQTT after WiFi is confirmed
});

wifi.onDisconnect([]() {
    Serial.println("WiFi lost. Reconnecting...");
});

wifi.connect();
```

---

## Auto-reconnect

Call `wifi.loop()` continuously in your networking task. It monitors the connection and calls `WiFi.reconnect()` automatically if the connection drops.

```cpp
EasyTask mqttTask("MQTT", []() {
    wifi.loop();   // checks connection, reconnects if needed
    mqtt.loop();
    EasyTask::sleep(10);
}, 2, 5120, 0);
```

`onDisconnect` fires when the drop is detected. `onConnect` fires again when reconnected.

---

## Helpers

```cpp
wifi.isConnected();   // bool — true if currently connected
wifi.ip();            // String — e.g. "192.168.1.42"
wifi.rssi();          // int — signal strength in dBm (e.g. -65)
```

### Signal strength interpretation

| RSSI | Quality |
|---|---|
| > -50 dBm | Excellent |
| -50 to -60 dBm | Good |
| -60 to -70 dBm | Fair |
| -70 to -80 dBm | Weak |
| < -80 dBm | Very weak / drops expected |

### Wait until connected (inside a task)

```cpp
EasyTask sensorTask("Sensor", []() {
    wifi.waitUntilConnected();  // blocks here until WiFi is up
    // now safe to use network
    mqtt.publish("home/boot", "ready");
    EasyTask::sleep(5000);
});
```

---

## Startup order

Always connect WiFi before MQTT. The recommended pattern:

```cpp
void setup() {
    Serial.begin(115200);

    // 1. Configure callbacks
    wifi.onConnect([]() {
        Serial.println("WiFi: " + wifi.ip());
    });

    // 2. Connect WiFi (blocking)
    if (!wifi.connect()) {
        ESP.restart();
    }

    // 3. Configure MQTT subscriptions
    mqtt.subscribe("home/cmd", handler);

    // 4. Connect MQTT (WiFi is already up)
    mqtt.connect();

    // 5. Start tasks
    mqttTask.start();
    sensorTask.start();
}
```

---

## Multiple networks (manual fallback)

`EasyWiFi` connects to one network. For multi-network fallback, use the underlying `WiFi` library directly before creating `EasyWiFi`, or use `WiFiMulti`:

```cpp
#include <WiFiMulti.h>

WiFiMulti wifiMulti;

void setup() {
    wifiMulti.addAP("HomeNetwork",  "homepass");
    wifiMulti.addAP("BackupNetwork", "backuppass");

    while (wifiMulti.run() != WL_CONNECTED) {
        delay(500);
    }
    Serial.println("Connected: " + WiFi.localIP().toString());
}
```

---

## Full example

```cpp
#include "ESP32Easy.h"

EasyWiFi wifi("MySSID", "mypassword");
EasyMQTT mqtt("192.168.1.100", 1883, "esp32-device");

void setup() {
    Serial.begin(115200);

    wifi.onConnect([]() {
        Serial.printf("WiFi connected. IP: %s  RSSI: %d dBm\n",
                      wifi.ip().c_str(), wifi.rssi());
    });

    wifi.onDisconnect([]() {
        Serial.println("WiFi lost!");
    });

    if (!wifi.connect(20000)) {
        Serial.println("WiFi timeout. Restarting.");
        ESP.restart();
    }

    mqtt.connect();

    // Networking task — keeps both alive
    EasyTask("Net", []() {
        wifi.loop();
        mqtt.loop();
        EasyTask::sleep(10);
    }, 2, 5120, 0).start();

    // Periodic RSSI report
    EasyTask("Signal", []() {
        if (wifi.isConnected()) {
            mqtt.publish("home/device/rssi", wifi.rssi());
        }
        EasyTask::sleep(60000);
    }, 1, 2048, 1).start();
}

void loop() {
    vTaskDelay(1000 / portTICK_PERIOD_MS);
}
```

---

## Common mistakes

**Starting MQTT before WiFi is connected** — `mqtt.connect()` will fail silently if WiFi is not up. Always call `wifi.connect()` first and check the return value.

**Not calling `wifi.loop()`** — without it, disconnections are never detected and `onConnect`/`onDisconnect` never fire after the initial connection.

**Hardcoding credentials in source code** — for production, store credentials in NVS (flash) or use WiFiManager so you can update them without reflashing.

**Restarting on every connection failure** — `ESP.restart()` in `setup()` is fine for simple devices, but for production consider a retry loop with exponential backoff instead.
