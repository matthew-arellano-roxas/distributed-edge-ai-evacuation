# EasyQueue\<T\>

Type-safe queue for passing data between FreeRTOS tasks. Replaces raw `xQueueCreate`, void pointer casts, and manual size calculations.

**File:** `ESP32Easy_Queue.h`  
**No extra libraries required** — uses FreeRTOS which is built into the ESP32 Arduino/ESP-IDF framework.

---

## Quick start

```cpp
#include "ESP32Easy.h"

EasyQueue<float> tempQueue(10);  // holds up to 10 floats

// Task A — producer
EasyTask sensorTask("Sensor", []() {
    float temp = readSensor();
    tempQueue.send(temp);
    EasyTask::sleep(1000);
});

// Task B — consumer
EasyTask mqttTask("MQTT", []() {
    float val;
    if (tempQueue.receive(val)) {
        Serial.println(val);
    }
});
```

---

## EasyQueue\<T\>

### Constructor

```cpp
EasyQueue<T> queue(size);
```

| Parameter | Type | Description |
|---|---|---|
| `T` | any type | The type of item to store (float, int, struct, etc.) |
| `size` | `size_t` | Maximum number of items the queue can hold |

Works with any copyable type:

```cpp
EasyQueue<float>    tempQueue(10);
EasyQueue<int>      countQueue(5);
EasyQueue<bool>     flagQueue(3);

// Custom struct:
struct SensorData { float temp; float hum; uint32_t timestamp; };
EasyQueue<SensorData> dataQueue(20);
```

---

## Sending data

### `send()` — from a task

```cpp
// Blocks until space is available (waits forever by default)
tempQueue.send(25.3f);

// With a timeout — returns false if queue is full after 100ms
bool ok = tempQueue.send(25.3f, 100);
if (!ok) {
    Serial.println("Queue full, dropped reading");
}
```

### `sendFromISR()` — from an interrupt

```cpp
EasyQueue<int> pinQueue(5);

void IRAM_ATTR buttonISR() {
    int pin = BUTTON_PIN;
    pinQueue.sendFromISR(pin);
}
```

> Never call regular `send()` from an ISR — always use `sendFromISR()`.

---

## Receiving data

### `receive()` — blocks until data arrives

```cpp
float val;
tempQueue.receive(val);   // blocks until something is in the queue
Serial.println(val);
```

### `receive()` with timeout

```cpp
float val;
if (tempQueue.receive(val, 500)) {
    // got data within 500ms
    mqtt.publish("home/temp", val);
} else {
    // nothing arrived — handle timeout
}
```

### Non-blocking check

```cpp
float val;
if (tempQueue.receive(val, 0)) {  // timeout = 0 = non-blocking
    process(val);
}
// continues immediately whether or not data was available
```

---

## Peeking

Read the next item without removing it from the queue.

```cpp
float val;
if (tempQueue.peek(val)) {
    Serial.println("Next value: " + String(val));
    // item is still in the queue
}
```

---

## Inspecting the queue

```cpp
tempQueue.available();   // number of items currently waiting
tempQueue.isEmpty();     // true if no items
tempQueue.isFull();      // true if at max capacity
tempQueue.clear();       // discard all items
```

---

## Draining the queue

Process all waiting items at once — useful in a publish task that should send everything accumulated since the last loop.

```cpp
EasyTask mqttTask("MQTT", []() {
    mqtt.loop();

    // Send everything that arrived since last tick
    tempQueue.drain([](float val) {
        mqtt.publish("home/temp", String(val));
    });

    EasyTask::sleep(100);
});
```

---

## Sending structs

Queues work best when you bundle related data into a struct so everything stays together.

```cpp
struct SensorReading {
    float temperature;
    float humidity;
    uint32_t timestamp;
};

EasyQueue<SensorReading> readings(10);

// Producer:
EasyTask sensorTask("Sensor", []() {
    SensorReading r;
    r.temperature = readTemp();
    r.humidity    = readHumidity();
    r.timestamp   = millis();
    readings.send(r);
    EasyTask::sleep(2000);
});

// Consumer:
EasyTask mqttTask("MQTT", []() {
    readings.drain([](SensorReading r) {
        JsonDocument doc;
        doc["temp"] = r.temperature;
        doc["hum"]  = r.humidity;
        doc["ts"]   = r.timestamp;
        mqtt.publishJson("home/sensor", doc);
    });
    EasyTask::sleep(100);
});
```

---

## Queue size guidelines

| Use case | Recommended size |
|---|---|
| Sensor → MQTT (slow broker) | `10–20` |
| Button presses / events | `5–10` |
| High-frequency data | `50–100` |
| Commands from MQTT | `5` |

> **Memory cost:** Each item takes `sizeof(T)` bytes. A queue of 20 `SensorReading` structs (12 bytes each) uses ~240 bytes of heap, plus ~76 bytes of FreeRTOS overhead.

---

## Producer / consumer pattern

The core pattern that makes multi-task ESP32 code clean:

```
[Sensor Task]  ──── queue ────▶  [MQTT Task]
                                      │
[Display Task] ◀──── queue ──────────┘
```

Rules:
1. **One task writes, another reads.** Don't have multiple tasks writing to the same queue without coordination.
2. **Never share a raw variable between tasks.** Always use a queue (or mutex if a queue doesn't fit).
3. **Size the queue for your worst case.** If your consumer can be delayed by WiFi reconnection (several seconds), make the queue large enough to hold readings during that time.

---

## Full example

```cpp
#include "ESP32Easy.h"

struct Reading {
    float temp;
    float hum;
};

EasyQueue<Reading> dataQueue(20);
EasyQueue<String>  cmdQueue(5);

// Sensor — produces readings
EasyTask sensorTask("Sensor", []() {
    Reading r = { readTemp(), readHumidity() };
    if (!dataQueue.send(r, 50)) {
        Serial.println("Queue full! Dropped reading.");
    }
    EasyTask::sleep(2000);
}, 1, 3072, 1);

// MQTT — consumes readings, produces commands
EasyTask mqttTask("MQTT", []() {
    wifi.loop();
    mqtt.loop();

    dataQueue.drain([](Reading r) {
        JsonDocument doc;
        doc["t"] = r.temp;
        doc["h"] = r.hum;
        mqtt.publishJson("home/sensor", doc);
    });

    EasyTask::sleep(50);
}, 2, 5120, 0);

// Command handler — processes incoming MQTT commands
mqtt.subscribe("home/cmd", [](const String& msg) {
    cmdQueue.send(msg, 10);
});

EasyTask cmdTask("Cmd", []() {
    String cmd;
    if (cmdQueue.receive(cmd, 100)) {
        if (cmd == "restart") ESP.restart();
        if (cmd == "status")  mqtt.publish("home/status", "ok");
    }
}, 1, 3072, 1);
```

---

## Common mistakes

**Calling `send()` from an ISR** — always use `sendFromISR()` in interrupt handlers.

**Queue too small** — if `send()` returns `false` and you're dropping data, increase the queue size or make the consumer faster.

**Sending large structs** — FreeRTOS copies the entire item on every `send()` and `receive()`. For very large structs (>100 bytes), consider sending a pointer and managing memory manually with a static buffer or memory pool.

**Receiving without checking the return value** — `receive()` returns `false` on timeout. Always check it if you use a timeout, otherwise `out` contains the previous value.
