#pragma once

#include <Arduino.h>
#include <functional>
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"

class EasyMux {
public:
    static constexpr uint8_t kChannelCount = 16;
    static constexpr int kReadFailed = -1;

    EasyMux(uint8_t s0Pin,
            uint8_t s1Pin,
            uint8_t s2Pin,
            uint8_t s3Pin,
            uint8_t signalPin,
            uint16_t settleDelayUs = 5)
        : _s0Pin(s0Pin),
          _s1Pin(s1Pin),
          _s2Pin(s2Pin),
          _s3Pin(s3Pin),
          _signalPin(signalPin),
          _settleDelayUs(settleDelayUs),
          _lock(xSemaphoreCreateMutex()) {}

    ~EasyMux() {
        if (_lock != nullptr) {
            vSemaphoreDelete(_lock);
        }
    }

    bool begin(uint8_t signalMode = INPUT) {
        if (_lock == nullptr) return false;

        pinMode(_s0Pin, OUTPUT);
        pinMode(_s1Pin, OUTPUT);
        pinMode(_s2Pin, OUTPUT);
        pinMode(_s3Pin, OUTPUT);
        pinMode(_signalPin, signalMode);

        _applyChannel(0);
        return true;
    }

    bool beginInput() { return begin(INPUT); }
    bool beginInputPullup() { return begin(INPUT_PULLUP); }
    bool beginOutput() { return begin(OUTPUT); }

    bool select(uint8_t channel, uint32_t timeoutMs = portMAX_DELAY) {
        if (!_isValidChannel(channel) || !_take(timeoutMs)) return false;
        _applyChannel(channel);
        _give();
        return true;
    }

    int readAnalog(uint8_t channel, uint32_t timeoutMs = portMAX_DELAY) {
        if (!_isValidChannel(channel) || !_take(timeoutMs)) return kReadFailed;
        _applyChannel(channel);
        const int value = analogRead(_signalPin);
        _give();
        return value;
    }

    int readDigital(uint8_t channel, uint32_t timeoutMs = portMAX_DELAY) {
        if (!_isValidChannel(channel) || !_take(timeoutMs)) return kReadFailed;
        _applyChannel(channel);
        const int value = digitalRead(_signalPin);
        _give();
        return value;
    }

    bool writeDigital(uint8_t channel, uint8_t value, uint32_t timeoutMs = portMAX_DELAY) {
        if (!_isValidChannel(channel) || !_take(timeoutMs)) return false;
        _applyChannel(channel);
        digitalWrite(_signalPin, value);
        _give();
        return true;
    }

    bool withChannel(uint8_t channel, const std::function<void()>& fn, uint32_t timeoutMs = portMAX_DELAY) {
        if (!_isValidChannel(channel) || !_take(timeoutMs)) return false;
        _applyChannel(channel);
        fn();
        _give();
        return true;
    }

    uint8_t currentChannel() const { return _currentChannel; }
    uint8_t signalPin() const { return _signalPin; }
    void setSettleDelayUs(uint16_t delayUs) { _settleDelayUs = delayUs; }

private:
    const uint8_t _s0Pin;
    const uint8_t _s1Pin;
    const uint8_t _s2Pin;
    const uint8_t _s3Pin;
    const uint8_t _signalPin;

    uint16_t _settleDelayUs;
    volatile uint8_t _currentChannel = 0;
    SemaphoreHandle_t _lock = nullptr;

    bool _take(uint32_t timeoutMs) {
        if (_lock == nullptr) return false;

        const TickType_t ticks = timeoutMs == portMAX_DELAY
            ? portMAX_DELAY
            : pdMS_TO_TICKS(timeoutMs);

        return xSemaphoreTake(_lock, ticks) == pdTRUE;
    }

    void _give() {
        if (_lock != nullptr) {
            xSemaphoreGive(_lock);
        }
    }

    bool _isValidChannel(uint8_t channel) const {
        return channel < kChannelCount;
    }

    void _applyChannel(uint8_t channel) {
        digitalWrite(_s0Pin, (channel >> 0) & 0x01);
        digitalWrite(_s1Pin, (channel >> 1) & 0x01);
        digitalWrite(_s2Pin, (channel >> 2) & 0x01);
        digitalWrite(_s3Pin, (channel >> 3) & 0x01);
        _currentChannel = channel;
        if (_settleDelayUs > 0) {
            delayMicroseconds(_settleDelayUs);
        }
    }
};
