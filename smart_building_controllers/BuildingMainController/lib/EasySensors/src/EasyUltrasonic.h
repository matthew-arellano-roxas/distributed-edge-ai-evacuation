#pragma once

#include <Arduino.h>

class EasyUltrasonic {
public:
    static constexpr float kInvalidDistance = -1.0f;

    EasyUltrasonic(uint8_t triggerPin, uint8_t echoPin, uint32_t timeoutUs = 30000)
        : _triggerPin(triggerPin), _echoPin(echoPin), _timeoutUs(timeoutUs) {}

    void begin() {
        pinMode(_triggerPin, OUTPUT);
        pinMode(_echoPin, INPUT);
        digitalWrite(_triggerPin, LOW);
    }

    float readDistanceCm() const {
        digitalWrite(_triggerPin, LOW);
        delayMicroseconds(2);
        digitalWrite(_triggerPin, HIGH);
        delayMicroseconds(10);
        digitalWrite(_triggerPin, LOW);

        const unsigned long duration = pulseIn(_echoPin, HIGH, _timeoutUs);
        if (duration == 0) {
            return kInvalidDistance;
        }

        return static_cast<float>(duration) * 0.0343f * 0.5f;
    }

private:
    uint8_t _triggerPin;
    uint8_t _echoPin;
    uint32_t _timeoutUs;
};
