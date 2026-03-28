#include "LedcServo.h"

LedcServo::LedcServo(
    uint8_t pin,
    uint8_t channel,
    uint32_t frequency,
    uint8_t resolutionBits,
    uint16_t minPulseUs,
    uint16_t maxPulseUs)
    : _pin(pin),
      _channel(channel),
      _frequency(frequency),
      _resolutionBits(resolutionBits),
      _minPulseUs(minPulseUs),
      _maxPulseUs(maxPulseUs),
      _attached(false),
      _currentAngle(0),
      _targetAngle(0),
      _currentPulseUs(minPulseUs),
      _lastStepTime(0)
{
}

bool LedcServo::begin()
{
    if (_minPulseUs >= _maxPulseUs || _frequency == 0 || _resolutionBits == 0 || _resolutionBits > 16)
    {
        return false;
    }

    if (_attached)
    {
        detach();
    }

    ledcSetup(_channel, _frequency, _resolutionBits);
    ledcAttachPin(_pin, _channel);

    _attached = true;
    _lastStepTime = millis();
    writeAngle(0);

    return true;
}

void LedcServo::detach()
{
    if (!_attached)
    {
        return;
    }

    ledcWrite(_channel, 0);
    ledcDetachPin(_pin);
    _attached = false;
}

void LedcServo::writeAngle(int angle)
{
    if (!_attached)
    {
        return;
    }

    _currentAngle = clampAngle(angle);
    _targetAngle = _currentAngle;
    _currentPulseUs = angleToPulse(_currentAngle);
    _lastStepTime = millis();

    ledcWrite(_channel, pulseToDuty(_currentPulseUs));
}

void LedcServo::writeMicroseconds(uint16_t pulseUs)
{
    if (!_attached)
    {
        return;
    }

    _currentPulseUs = clampPulse(pulseUs);
    _currentAngle = pulseToAngle(_currentPulseUs);
    _targetAngle = _currentAngle;
    _lastStepTime = millis();
    ledcWrite(_channel, pulseToDuty(_currentPulseUs));
}

int LedcServo::readAngle() const
{
    return _currentAngle;
}

uint16_t LedcServo::readMicroseconds() const
{
    return _currentPulseUs;
}

void LedcServo::setTargetAngle(int angle)
{
    _targetAngle = clampAngle(angle);
}

void LedcServo::update(uint16_t stepDelayMs)
{
    if (!_attached || _currentAngle == _targetAngle)
    {
        return;
    }

    const unsigned long now = millis();
    if (now - _lastStepTime < stepDelayMs)
    {
        return;
    }

    _lastStepTime = now;
    _currentAngle += (_currentAngle < _targetAngle) ? 1 : -1;
    _currentPulseUs = angleToPulse(_currentAngle);

    ledcWrite(_channel, pulseToDuty(_currentPulseUs));
}

bool LedcServo::isAttached() const
{
    return _attached;
}

bool LedcServo::isMoving() const
{
    return _currentAngle != _targetAngle;
}

uint32_t LedcServo::pulseToDuty(uint16_t pulseUs) const
{
    const uint32_t maxDuty = (1UL << _resolutionBits) - 1;
    const uint32_t periodUs = 1000000UL / _frequency;
    const uint32_t clampedPulseUs = clampPulse(pulseUs);
    const uint64_t fullScale = (1ULL << _resolutionBits);
    const uint64_t duty = (static_cast<uint64_t>(clampedPulseUs) * fullScale + (periodUs / 2)) / periodUs;
    return duty > maxDuty ? maxDuty : static_cast<uint32_t>(duty);
}

uint16_t LedcServo::angleToPulse(int angle) const
{
    const int safeAngle = clampAngle(angle);
    return map(safeAngle, kMinAngle, kMaxAngle, _minPulseUs, _maxPulseUs);
}

int LedcServo::pulseToAngle(uint16_t pulseUs) const
{
    const uint16_t safePulse = clampPulse(pulseUs);
    return clampAngle(map(safePulse, _minPulseUs, _maxPulseUs, kMinAngle, kMaxAngle));
}

int LedcServo::clampAngle(int angle) const
{
    if (angle < kMinAngle)
    {
        return kMinAngle;
    }

    if (angle > kMaxAngle)
    {
        return kMaxAngle;
    }

    return angle;
}

uint16_t LedcServo::clampPulse(uint16_t pulseUs) const
{
    if (pulseUs < _minPulseUs)
    {
        return _minPulseUs;
    }

    if (pulseUs > _maxPulseUs)
    {
        return _maxPulseUs;
    }

    return pulseUs;
}
