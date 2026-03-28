# EasyTask

Wraps FreeRTOS tasks, mutexes, and semaphores into simple C++ classes. No raw `xTaskCreate` boilerplate, no void pointers, no manual handle management.

**File:** `ESP32Easy_Task.h`  
**No extra libraries required** — uses FreeRTOS which is built into the ESP32 Arduino/ESP-IDF framework.

---

## Quick start

```cpp
#include "ESP32Easy.h"

EasyTask myTask("Blink", []() {
    digitalWrite(LED_BUILTIN, HIGH);
    EasyTask::sleep(500);
    digitalWrite(LED_BUILTIN, LOW);
    EasyTask::sleep(500);
});

void setup() {
    pinMode(LED_BUILTIN, OUTPUT);
    myTask.start();
}

void loop() {
    vTaskDelay(1000 / portTICK_PERIOD_MS);
}
```

---

## EasyTask

### Constructor

```cpp
EasyTask task(name, fn, priority, stackSize, core);
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `name` | `const char*` | required | Task name (shown in debug tools) |
| `fn` | `std::function<void()>` | required | Lambda or function to run in a loop |
| `priority` | `int` | `1` | 1 = low, 5 = high |
| `stackSize` | `int` | `4096` | Stack size in bytes |
| `core` | `int` | `-1` | `0`, `1`, or `-1` for any core |

### Methods

```cpp
task.start();       // Begin running the task
task.stop();        // Delete the task (cannot be restarted)
task.suspend();     // Pause execution
task.resume();      // Resume after suspend
task.isRunning();   // Returns bool
task.name();        // Returns const char*
```

### Static helpers

```cpp
// Sleep inside a task (milliseconds)
EasyTask::sleep(1000);

// Fixed-rate loop — runs exactly every N ms regardless of how long your code takes
EasyTask myTask("Control", []() {
    static TickType_t last = xTaskGetTickCount();
    doWork();
    EasyTask::sleepUntil(last, 10);  // exactly every 10ms
});
```

### Core assignment

```cpp
// Core 0 = WiFi/networking tasks (recommended for anything using WiFi)
// Core 1 = sensor reading, display, general logic
// -1     = let FreeRTOS decide (default)

EasyTask wifiTask("WiFi",   fn, 2, 5120, 0);  // pin to core 0
EasyTask sensorTask("Sensor", fn, 1, 3072, 1);  // pin to core 1
```

### Stack size guidelines

| Task type | Recommended stack |
|---|---|
| Simple logic, GPIO | `2048` |
| Serial output | `3072` |
| WiFi / MQTT | `5120` |
| JSON parsing | `5120` |
| TLS / HTTPS | `8192` |

> If your ESP32 crashes with a stack overflow, double the stack size and try again.

### Priority guidelines

| Priority | Use for |
|---|---|
| `1` | Sensor reading, logging |
| `2` | MQTT loop, display updates |
| `3` | Alert handling, time-critical control |
| `4–5` | Hard real-time (motor control, encoders) |

---

## EasyMutex

Protects a shared resource so two tasks cannot access it at the same time.

### When to use

Use a mutex when two or more tasks share **any** resource: `Serial`, a display, a shared variable, SPI/I2C bus, etc.

### Constructor

```cpp
EasyMutex myMutex;  // Created unlocked
```

### Lock with a lambda (recommended)

The lock is always released when the lambda exits, even if it throws.

```cpp
EasyMutex serialMutex;

// Task A:
serialMutex.lock([&]() {
    Serial.println("Task A output");
});

// Task B (in a different task — will wait for Task A to finish):
serialMutex.lock([&]() {
    Serial.println("Task B output");
});
```

### Protecting a shared variable

```cpp
float sharedTemp = 0;
EasyMutex tempMutex;

// Writer task:
tempMutex.lock([&]() {
    sharedTemp = readSensor();
});

// Reader task — always copy inside the lock:
float localCopy;
tempMutex.lock([&]() {
    localCopy = sharedTemp;
});
Serial.println(localCopy);  // use the copy outside the lock
```

### Lock with timeout

```cpp
// Give up if lock not acquired within 100ms
serialMutex.lock([&]() {
    Serial.println("hello");
}, 100);
```

### Manual lock/unlock

```cpp
if (myMutex.take(100)) {   // try for 100ms
    // critical section
    myMutex.give();
}
```

> **Avoid deadlocks:** Never hold two mutexes at once. Always acquire them in the same order across all tasks.

---

## EasySemaphore

Signals between tasks — one task blocks waiting, another task wakes it up.

Think of it as a doorbell: one task waits at the door, another rings it.

### Constructor

```cpp
EasySemaphore mySignal;  // starts "not given"
```

### Basic signal pattern

```cpp
EasySemaphore alertSignal;

// Task that waits (blocks until signaled):
EasyTask alertTask("Alert", []() {
    alertSignal.wait();          // blocks here indefinitely
    Serial.println("Alert!");
    triggerBuzzer();
});

// Another task that triggers the signal:
EasyTask sensorTask("Sensor", []() {
    float temp = readTemp();
    if (temp > 80.0) {
        alertSignal.give();      // wakes up alertTask
    }
    EasyTask::sleep(1000);
});
```

### Wait with timeout

```cpp
// Wait up to 500ms, then continue regardless
if (alertSignal.wait(500)) {
    Serial.println("Got signal!");
} else {
    Serial.println("Timed out");
}
```

### Signal from an interrupt (ISR)

```cpp
EasySemaphore buttonSignal;

void IRAM_ATTR buttonISR() {
    buttonSignal.giveFromISR();   // ISR-safe version
}

void setup() {
    attachInterrupt(BUTTON_PIN, buttonISR, FALLING);
}

EasyTask buttonTask("Button", []() {
    buttonSignal.wait();
    Serial.println("Button pressed!");
});
```

---

## Mutex vs Semaphore — when to use which

| Scenario | Use |
|---|---|
| Two tasks share Serial/I2C/SPI | `EasyMutex` |
| Two tasks share a variable | `EasyMutex` |
| One task triggers another | `EasySemaphore` |
| Button interrupt wakes a task | `EasySemaphore` |
| Timer fires, task processes result | `EasySemaphore` |

---

## Full example

```cpp
#include "ESP32Easy.h"

float sharedTemp = 0;
EasyMutex tempMutex;
EasySemaphore highTempSignal;

// Sensor task — reads every 2s, updates shared variable
EasyTask sensorTask("Sensor", []() {
    float reading = analogRead(34) * 0.1;

    tempMutex.lock([&]() {
        sharedTemp = reading;
    });

    if (reading > 40.0) {
        highTempSignal.give();
    }

    EasyTask::sleep(2000);
}, 1, 3072, 1);

// Display task — reads shared variable every 500ms
EasyTask displayTask("Display", []() {
    float local;
    tempMutex.lock([&]() {
        local = sharedTemp;
    });
    // updateDisplay(local);
    EasyTask::sleep(500);
}, 1, 3072, 1);

// Alert task — blocks until temperature is too high
EasyTask alertTask("Alert", []() {
    highTempSignal.wait();
    Serial.println("WARNING: High temperature!");
    // triggerBuzzer();
}, 3, 2048, 1);

void setup() {
    Serial.begin(115200);
    sensorTask.start();
    displayTask.start();
    alertTask.start();
}

void loop() {
    vTaskDelay(1000 / portTICK_PERIOD_MS);
}
```

---

## Common mistakes

**Task crashes immediately** — stack too small. Increase `stackSize` to `8192` and reduce if stable.

**Task never runs** — priority too low while a higher-priority task never sleeps. Always call `EasyTask::sleep()` in your loop.

**Deadlock** — two mutexes acquired in different orders. Always acquire in the same order across all tasks.

**Accessing a variable without a mutex** — this causes random crashes. If two tasks touch the same variable, always wrap with `EasyMutex`.
