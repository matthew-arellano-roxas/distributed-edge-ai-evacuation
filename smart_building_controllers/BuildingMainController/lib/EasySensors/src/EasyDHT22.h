#pragma once

#include <Arduino.h>
#include <DHT.h>

struct EasyDHT22Reading
{
    float temperatureC = NAN;
    float humidity = NAN;

    bool isValid() const
    {
        return !isnan(temperatureC) && !isnan(humidity);
    }
};

class EasyDHT22
{
public:
    explicit EasyDHT22(uint8_t pin) : _pin(pin), _dht(pin, DHT22) {}

    void begin()
    {
        _dht.begin();
    }

    EasyDHT22Reading read()
    {
        EasyDHT22Reading reading;
        reading.humidity = _dht.readHumidity();
        reading.temperatureC = _dht.readTemperature();
        return reading;
    }

    float readTemperatureC()
    {
        return _dht.readTemperature();
    }

    float readHumidity()
    {
        return _dht.readHumidity();
    }

private:
    uint8_t _pin;
    DHT _dht;
};
