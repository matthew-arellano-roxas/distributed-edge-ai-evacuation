#pragma once

#include <Arduino.h>

class LedcServo
{
public:
    LedcServo(
        uint8_t pin,
        uint8_t channel,
        uint32_t frequency = 50,
        uint8_t resolutionBits = 16,
        uint16_t minPulseUs = 500,
        uint16_t maxPulseUs = 2500);

    bool begin();
    void detach();

    void writeAngle(int angle);
    void writeMicroseconds(uint16_t pulseUs);

    int readAngle() const;
    uint16_t readMicroseconds() const;

    void setTargetAngle(int angle);
    void update(uint16_t stepDelayMs = 15);

    bool isAttached() const;
    bool isMoving() const;

private:
    static constexpr int kMinAngle = 0;
    static constexpr int kMaxAngle = 180;

    uint8_t _pin;
    uint8_t _channel;
    uint32_t _frequency;
    uint8_t _resolutionBits;
    uint16_t _minPulseUs;
    uint16_t _maxPulseUs;

    bool _attached;
    int _currentAngle;
    int _targetAngle;
    uint16_t _currentPulseUs;
    unsigned long _lastStepTime;

    uint32_t pulseToDuty(uint16_t pulseUs) const;
    uint16_t angleToPulse(int angle) const;
    int pulseToAngle(uint16_t pulseUs) const;
    int clampAngle(int angle) const;
    uint16_t clampPulse(uint16_t pulseUs) const;
};
