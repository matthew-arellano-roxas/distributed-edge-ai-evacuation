#pragma once

#include <Arduino.h>

struct EasyMQ2Reading {
    int analogValue = 0;
    bool digitalDetected = false;
};

class EasyMQ2 {
public:
    EasyMQ2(uint8_t analogPin, int digitalPin = -1)
        : _analogPin(analogPin), _digitalPin(digitalPin) {}

    void begin() {
        pinMode(_analogPin, INPUT);
        if (_digitalPin >= 0) {
            pinMode(_digitalPin, INPUT);
        }
    }

    EasyMQ2Reading read() const {
        EasyMQ2Reading reading;
        reading.analogValue = analogRead(_analogPin);
        reading.digitalDetected = (_digitalPin >= 0) ? digitalRead(_digitalPin) == HIGH : false;
        return reading;
    }

    int readAnalog() const {
        return analogRead(_analogPin);
    }

    bool isGasDetected() const {
        return (_digitalPin >= 0) ? digitalRead(_digitalPin) == HIGH : false;
    }

private:
    uint8_t _analogPin;
    int _digitalPin;
};
