#pragma once
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/semphr.h"
#include <functional>
#include <Arduino.h>

// ============================================================
//  ESP32Easy_Task.h
//  Simple task abstraction for FreeRTOS on ESP32
//
//  Usage:
//    EasyTask myTask("MyTask", []() {
//        Serial.println("Hello from task!");
//        EasyTask::sleep(1000);
//    });
//    myTask.start();
// ============================================================

class EasyTask {
public:
    // --- Types ---
    using TaskFn = std::function<void()>;

    // --- Constructor ---
    // name     : task name (for debugging)
    // fn       : lambda or function to run in a loop
    // priority : 1 = low, 5 = high (default: 1)
    // stackSize: bytes for stack (default: 4096)
    // core     : 0 or 1, -1 = any core (default: -1)
    EasyTask(const char* name, TaskFn fn,
             int priority = 1,
             int stackSize = 4096,
             int core = -1)
        : _name(name), _fn(fn),
          _priority(priority),
          _stackSize(stackSize),
          _core(core),
          _handle(nullptr),
          _running(false) {}

    // --- Start the task ---
    void start() {
        if (_running) return;
        _running = true;
        if (_core == -1) {
            xTaskCreate(_taskEntry, _name, _stackSize, this, _priority, &_handle);
        } else {
            xTaskCreatePinnedToCore(_taskEntry, _name, _stackSize, this, _priority, &_handle, _core);
        }
    }

    // --- Stop the task ---
    void stop() {
        if (_handle && _running) {
            _running = false;
        }
    }

    // --- Suspend / Resume ---
    void suspend() { if (_handle) vTaskSuspend(_handle); }
    void resume()  { if (_handle) vTaskResume(_handle);  }

    // --- Sleep inside a task (ms) ---
    static void sleep(uint32_t ms) {
        vTaskDelay(ms / portTICK_PERIOD_MS);
    }

    // --- Sleep until next period (for fixed-rate loops) ---
    // Example: sleepUntil(xLastWakeTime, 100) — runs exactly every 100ms
    static void sleepUntil(TickType_t& lastWakeTime, uint32_t periodMs) {
        vTaskDelayUntil(&lastWakeTime, pdMS_TO_TICKS(periodMs));
    }

    bool isRunning() const { return _running; }
    const char* name() const { return _name; }

private:
    const char* _name;
    TaskFn      _fn;
    int         _priority;
    int         _stackSize;
    int         _core;
    TaskHandle_t _handle;
    volatile bool _running;

    static void _taskEntry(void* arg) {
        EasyTask* self = static_cast<EasyTask*>(arg);
        while (self->_running) {
            self->_fn();
        }
        self->_handle = nullptr;
        vTaskDelete(NULL);
    }
};


// ============================================================
//  EasyMutex — wrap a shared resource safely
//
//  Usage:
//    EasyMutex mutex;
//    mutex.lock([&]() {
//        sharedVariable = 42;  // safe!
//    });
// ============================================================
class EasyMutex {
public:
    EasyMutex() { _mutex = xSemaphoreCreateMutex(); }
    ~EasyMutex() { vSemaphoreDelete(_mutex); }

    // Run a lambda while holding the lock
    void lock(std::function<void()> fn, uint32_t timeoutMs = portMAX_DELAY) {
        if (xSemaphoreTake(_mutex, pdMS_TO_TICKS(timeoutMs)) == pdTRUE) {
            fn();
            xSemaphoreGive(_mutex);
        }
    }

    // Manual lock/unlock if you prefer
    bool take(uint32_t timeoutMs = portMAX_DELAY) {
        return xSemaphoreTake(_mutex, pdMS_TO_TICKS(timeoutMs)) == pdTRUE;
    }
    void give() { xSemaphoreGive(_mutex); }

private:
    SemaphoreHandle_t _mutex;
};


// ============================================================
//  EasySemaphore — signal between tasks
//
//  Usage (task A signals task B):
//    EasySemaphore signal;
//    // Task A:  signal.give();
//    // Task B:  signal.wait();  // blocks until signaled
// ============================================================
class EasySemaphore {
public:
    EasySemaphore() { _sem = xSemaphoreCreateBinary(); }
    ~EasySemaphore() { vSemaphoreDelete(_sem); }

    void give()                          { xSemaphoreGive(_sem); }
    void giveFromISR()                   { xSemaphoreGiveFromISR(_sem, nullptr); }
    bool wait(uint32_t timeoutMs = portMAX_DELAY) {
        return xSemaphoreTake(_sem, pdMS_TO_TICKS(timeoutMs)) == pdTRUE;
    }

private:
    SemaphoreHandle_t _sem;
};
