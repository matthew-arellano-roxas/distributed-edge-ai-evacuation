#include <Arduino.h>
#pragma once

struct DeviceStatus
{
    String deviceId;
    String deviceName;
    String status;
};

struct Occupancy
{
    String occupancy;
};

struct Flame
{
    boolean detected;
    String type;
    int intensity;
    String deviceId;
    String updatedAt;
};

struct TemperaturePayload
{
    String type;
    float value;
    String unit;
    String deviceId;
    String updatedAt;
};

struct PresencePayload
{
    String type;
    boolean detected;
    String deviceId;
    String updatedAt;
};

struct MQ2Payload
{
    String type;
    boolean detected;
    float value;
    String deviceId;
    String updatedAt;
};
