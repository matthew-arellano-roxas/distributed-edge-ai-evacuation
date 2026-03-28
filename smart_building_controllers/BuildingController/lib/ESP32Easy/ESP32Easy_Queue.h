#pragma once
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include <functional>

// ============================================================
//  ESP32Easy_Queue.h
//  Type-safe queue for passing data between tasks
//
//  Usage:
//    EasyQueue<float> tempQueue(10);  // holds 10 floats
//
//    // Sender task:
//    tempQueue.send(25.3f);
//
//    // Receiver task:
//    float val;
//    if (tempQueue.receive(val)) {
//        Serial.println(val);
//    }
// ============================================================

template<typename T>
class EasyQueue {
public:
    // size = max number of items the queue can hold
    EasyQueue(size_t size) {
        _queue = xQueueCreate(size, sizeof(T));
    }

    ~EasyQueue() {
        vQueueDelete(_queue);
    }

    // --- Send a value (blocks if full until timeoutMs) ---
    bool send(const T& value, uint32_t timeoutMs = portMAX_DELAY) {
        return xQueueSend(_queue, &value, pdMS_TO_TICKS(timeoutMs)) == pdTRUE;
    }

    // --- Send from an interrupt ---
    bool sendFromISR(const T& value) {
        BaseType_t woken = pdFALSE;
        bool ok = xQueueSendFromISR(_queue, &value, &woken) == pdTRUE;
        portYIELD_FROM_ISR(woken);
        return ok;
    }

    // --- Receive a value (blocks until data arrives or timeout) ---
    bool receive(T& out, uint32_t timeoutMs = portMAX_DELAY) {
        return xQueueReceive(_queue, &out, pdMS_TO_TICKS(timeoutMs)) == pdTRUE;
    }

    // --- Peek at next value without removing it ---
    bool peek(T& out, uint32_t timeoutMs = 0) {
        return xQueuePeek(_queue, &out, pdMS_TO_TICKS(timeoutMs)) == pdTRUE;
    }

    // --- How many items are waiting ---
    size_t available() { return uxQueueMessagesWaiting(_queue); }

    // --- Is the queue empty / full? ---
    bool isEmpty() { return available() == 0; }
    bool isFull()  { return uxQueueSpacesAvailable(_queue) == 0; }

    // --- Clear all items ---
    void clear() { xQueueReset(_queue); }

    // --- Process all items with a callback ---
    // Example: tempQueue.drain([](float val) { Serial.println(val); });
    void drain(std::function<void(T)> fn, uint32_t timeoutMs = 0) {
        T item;
        while (receive(item, timeoutMs)) {
            fn(item);
        }
    }

private:
    QueueHandle_t _queue;
};
