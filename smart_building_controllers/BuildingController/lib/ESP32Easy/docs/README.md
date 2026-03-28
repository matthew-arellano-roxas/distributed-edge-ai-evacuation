# ESP32Easy

A lightweight abstraction layer for ESP32 development. Wraps FreeRTOS tasks, queues, mutexes, semaphores, WiFi, and MQTT into clean, simple C++ classes — so you spend less time fighting the framework and more time building your project.

---

## Why

Raw ESP32 FreeRTOS code looks like this:

```cpp
// Create a task
TaskHandle_t handle;
xTaskCreatePinnedToCore(myTaskFunc, "Sensor", 4096, NULL, 1, &handle, 1);

// Pass data between tasks
QueueHandle_t q = xQueueCreate(10, sizeof(float));
xQueueSend(q, &val, portMAX_DELAY);
xQueueReceive(q, &val, portMAX_DELAY);

// Protect shared data
SemaphoreHandle_t mutex = xSemaphoreCreateMutex();
xSemaphoreTake(mutex, portMAX_DELAY);
// ... critical section ...
xSemaphoreGive(mutex);
```

With ESP32Easy, the same code becomes:

```cpp
EasyTask sensorTask("Sensor", []() { ... });
sensorTask.start();

EasyQueue<float> dataQueue(10);
dataQueue.send(val);
dataQueue.receive(val);

EasyMutex mutex;
mutex.lock([&]() { /* critical section */ });
```

Same performance. No raw handles. No void pointer casts.

---

## Installation

### PlatformIO (recommended)

1. Copy the `ESP32Easy/` folder into your project's `lib/` directory
2. Add dependencies to `platformio.ini`:

```ini
[env:esp32dev]
platform  = espressif32
board     = esp32dev
framework = arduino

lib_deps =
    knolleary/PubSubClient @ ^2.8
    bblanchon/ArduinoJson  @ ^7.0
```

### Arduino IDE

1. Copy all `.h` files into your sketch folder
2. Install `PubSubClient` and `ArduinoJson` via Sketch → Include Library → Manage Libraries

---

## Usage

Include one header for everything:

```cpp
#include "ESP32Easy.h"
```

Or include individual files if you only need some components:

```cpp
#include "ESP32Easy_Task.h"   // EasyTask, EasyMutex, EasySemaphore
#include "ESP32Easy_Queue.h"  // EasyQueue<T>
#include "ESP32Easy_WiFi.h"   // EasyWiFi
#include "ESP32Easy_MQTT.h"   // EasyMQTT (requires PubSubClient + ArduinoJson)
```

---

## Components

| Class | File | Description |
|---|---|---|
| `EasyTask` | `ESP32Easy_Task.h` | FreeRTOS task wrapper — lambda-based, no handles |
| `EasyMutex` | `ESP32Easy_Task.h` | Mutex for protecting shared resources |
| `EasySemaphore` | `ESP32Easy_Task.h` | Binary semaphore for signalling between tasks |
| `EasyQueue<T>` | `ESP32Easy_Queue.h` | Type-safe inter-task queue |
| `EasyWiFi` | `ESP32Easy_WiFi.h` | WiFi with auto-reconnect and callbacks |
| `EasyMQTT` | `ESP32Easy_MQTT.h` | MQTT with auto-reconnect, wildcards, JSON publish |

---

## Core concepts

### Tasks don't share variables — they use queues

```cpp
// BAD — race condition, random crashes
float sharedTemp = 0;  // Task A writes, Task B reads — unsafe!

// GOOD — queue handles synchronisation
EasyQueue<float> tempQueue(10);
// Task A: tempQueue.send(reading);
// Task B: tempQueue.receive(val);
```

### Use a mutex when you must share a resource

```cpp
EasyMutex serialMutex;

// Both tasks can call this safely:
serialMutex.lock([&]() {
    Serial.println("safe output");
});
```

### Tasks talk through signals, not polling

```cpp
EasySemaphore alertSignal;

// Task A — waits:
alertSignal.wait();  // blocks until given

// Task B — signals:
if (temp > 80) alertSignal.give();
```

---

## Full example

A complete project: temperature sensor → MQTT, with commands and alerting.

```cpp
#include "ESP32Easy.h"

// --- Shared objects ---
EasyWiFi  wifi("MySSID", "mypassword");
EasyMQTT  mqtt("192.168.1.100", 1883, "esp32-sensor");
EasyQueue<float> tempQueue(10);
EasySemaphore    alertSignal;

// --- Task 1: Read sensor every 2 seconds ---
EasyTask sensorTask("Sensor", []() {
    float temp = analogRead(34) * 0.1;
    tempQueue.send(temp);
    if (temp > 35.0) alertSignal.give();
    EasyTask::sleep(2000);
}, 1, 3072, 1);

// --- Task 2: WiFi + MQTT + publish readings ---
EasyTask netTask("Net", []() {
    wifi.loop();
    mqtt.loop();
    tempQueue.drain([](float t) {
        mqtt.publish("home/temp", t);
    });
    EasyTask::sleep(50);
}, 2, 5120, 0);

// --- Task 3: Alert on high temperature ---
EasyTask alertTask("Alert", []() {
    alertSignal.wait();
    mqtt.publish("home/alert", "high_temperature");
}, 3, 2048, 1);

void setup() {
    Serial.begin(115200);

    wifi.onConnect([]() {
        Serial.println("WiFi: " + wifi.ip());
    });

    if (!wifi.connect()) ESP.restart();

    mqtt.setWill("home/status", "offline");
    mqtt.onConnect([]() {
        mqtt.publish("home/status", "online", true);
    });
    mqtt.subscribe("home/cmd", [](const String& msg) {
        if (msg == "restart") ESP.restart();
    });
    mqtt.connect();

    sensorTask.start();
    netTask.start();
    alertTask.start();
}

void loop() {
    vTaskDelay(1000 / portTICK_PERIOD_MS);
}
```

---

## Quick reference

```cpp
// Tasks
EasyTask t("name", []() { ... }, priority, stackBytes, core);
t.start();  t.stop();  t.suspend();  t.resume();
EasyTask::sleep(ms);
EasyTask::sleepUntil(lastWake, periodMs);  // fixed-rate

// Queue
EasyQueue<T> q(size);
q.send(val);               q.send(val, timeoutMs);
q.receive(val);            q.receive(val, timeoutMs);
q.peek(val);               q.drain([](T v) { ... });
q.available();  q.isEmpty();  q.isFull();  q.clear();

// Mutex
EasyMutex m;
m.lock([&]() { ... });
m.lock([&]() { ... }, timeoutMs);

// Semaphore
EasySemaphore s;
s.give();         s.giveFromISR();
s.wait();         s.wait(timeoutMs);

// WiFi
EasyWiFi wifi(ssid, pass);
wifi.onConnect(fn);  wifi.onDisconnect(fn);
wifi.connect(timeoutMs);
wifi.loop();         // call in networking task
wifi.isConnected();  wifi.ip();  wifi.rssi();
wifi.waitUntilConnected();

// MQTT
EasyMQTT mqtt(broker, port, clientId);
mqtt.setCredentials(user, pass);
mqtt.setWill(topic, message);
mqtt.onConnect(fn);  mqtt.onDisconnect(fn);
mqtt.connect();
mqtt.loop();         // call in networking task
mqtt.subscribe(topic, [](const String& payload) { ... });
mqtt.unsubscribe(topic);
mqtt.publish(topic, stringOrNumber, retain);
mqtt.publishJson(topic, jsonDoc, retain);
mqtt.isConnected();
```

---

## Documentation

- [EasyTask, EasyMutex, EasySemaphore →](EasyTask.md)
- [EasyQueue →](EasyQueue.md)
- [EasyMQTT →](EasyMQTT.md)
- [EasyWiFi →](EasyWiFi.md)

---

## Troubleshooting

**Device crashes on boot** — likely a stack overflow. Increase the `stackSize` parameter on the crashing task (try `8192`).

**MQTT never connects** — ensure WiFi is connected first. Check broker IP, port, and that no firewall blocks port 1883.

**Tasks seem to freeze** — a task is blocking without sleeping. Add `EasyTask::sleep()` in every loop iteration, even a short one (`EasyTask::sleep(1)`).

**Serial output is garbled** — two tasks writing to Serial at the same time. Wrap all `Serial.print` calls with an `EasyMutex`.

**Data lost between tasks** — queue is too small or the consumer is too slow. Increase queue size and check that `mqtt.loop()` is being called regularly.

---

## License

MIT — free to use, modify, and distribute.
