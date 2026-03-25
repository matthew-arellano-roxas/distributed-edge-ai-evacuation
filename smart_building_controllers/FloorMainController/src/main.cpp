#include <Arduino.h>
#include "ESP32Easy_WiFi.h"
#include "ESP32Easy_MQTT.h"
#include "ESP32Easy_Task.h"
#include "WifiCredentials.h"
#include "MQTTCredentials.h"
#include "ESP32Easy_Mux.h"
#include "network_config.h"
#include "FloorMainControllerPins.h"
#include <vector>
#include <ArduinoJson.h>
#include <string>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>

#define DEVICE_TYPE "esp32"
#define DEVICE_NAME "esp32-main-f3"
#define FLOOR "floor3"

#define FLAME_THRESHOLD 2000

struct LEDPath
{
    std::string path;
    int ledPin;
};

struct DeviceInfo
{
    std::string deviceType = DEVICE_TYPE;
    std::string deviceName = DEVICE_NAME;
    std::string floor = FLOOR;
};

struct FlameSensor
{
    int rawValue; // lower = more fire detected
    std::string location;
    std::string isFlameDetected;
};

struct FlameSensorInfo
{
    std::string location;
    boolean isPath;
};

const std::vector<LEDPath> PATH_TO_EXITS = {
    {"fire-exit-1", FIRE_EXIT1_LED_PIN},
    {"fire-exit-2", FIRE_EXIT2_LED_PIN},
    {"stairs", STAIRS_LED_PIN},
    {"hallway", HALLWAY_LED_PIN}};

const std::vector<std::string> ROOMS = {
    "room-1",
    "room-2",
    "room-3",
    "room-4"};

// END OF CONFIGURATION — Do not need to edit below this line
EasyWiFi wifi(WIFI_SSID, WIFI_PASS);
EasyMQTT mqtt(MQTT_BROKER, MQTT_PORT, ESP_MQTT_CLIENT_ID);
EasyMux mux(MUX_S0_PIN, MUX_S1_PIN, MUX_S2_PIN, MUX_S3_PIN, MUX_SIG_PIN);

DeviceInfo device;

// FIX 3: Use volatile + mutex for thread-safe access across tasks
volatile boolean EvacuationMode = false;
SemaphoreHandle_t evacuationMutex = NULL;

void setMqttCredentials();
std::vector<FlameSensor> readFlameSensors();
std::string setDeviceStatus(const std::string &status, bool includeHeartbeat = false);
std::string getFlameSensorTopic(const std::string &floor, const std::string &location);
boolean isFireDetected(int readings);
std::string getDeviceStatusTopic(const std::string &floor);
void publishSensorReadings(const FlameSensor &flameSensor, const DeviceInfo &deviceInfo);
void implementLEDGuide(const std::string &blockedLocation);
void setEvacuationMode(boolean isEvacuationModeOn, const std::string &blockedLocation = "");
void setupLED();
std::string getEvacuationCommandTopic();
void handleEvacuationCommand(const String &msg);

// Task
EasyTask FlameSensorTask("FlameSensorTask", []()
                         {
    if (!wifi.isConnected() || !mqtt.isConnected()) {
        EasyTask::sleep(1000);
        return;
    }

    std::vector<FlameSensor> flameSensorReadings = readFlameSensors();

    for (const FlameSensor &reading : flameSensorReadings)
    {
        publishSensorReadings(reading, device);

        if (reading.isFlameDetected == "true")
        {
            // FIX 1: Pass the blocked location into setEvacuationMode so LEDs
            // are set atomically — avoids the fragile two-call ordering issue.
            if (xSemaphoreTake(evacuationMutex, portMAX_DELAY) == pdTRUE)
            {
                setEvacuationMode(true, reading.location);
                xSemaphoreGive(evacuationMutex);
            }
        }
    }

    EasyTask::sleep(1000); }, 1, 4096, 1);

EasyTask heartbeatTask("HeartbeatTask", []()
                       {
    if (!wifi.isConnected() || !mqtt.isConnected()) {
        EasyTask::sleep(1000);
        return;
    }

    std::string statusTopic = getDeviceStatusTopic(device.floor);
    std::string payload = setDeviceStatus("online", true);
    mqtt.publish(statusTopic.c_str(), payload.c_str(), true);
    EasyTask::sleep(5000); }, 1, 3072, 1);

void setup()
{
    Serial.begin(115200);

    // FIX 3: Create mutex before any task starts
    evacuationMutex = xSemaphoreCreateMutex();

    setupLED();
    setMqttCredentials();
    mux.beginInput();
    mqtt.setWill(getDeviceStatusTopic(device.floor).c_str(), setDeviceStatus("offline").c_str(), true, 1);

    wifi.onConnect([]()
                   {
        Serial.print("WiFi IP: ");
        Serial.println(WiFi.localIP()); });

    wifi.onDisconnect([]()
                      { Serial.println("WiFi disconnected"); });

    mqtt.onConnect([]()
                   {
        Serial.println("MQTT connected");
        std::string statusTopic = getDeviceStatusTopic(device.floor);
        std::string onlinePayload = setDeviceStatus("online", true);
        mqtt.publish(statusTopic.c_str(), onlinePayload.c_str(), true); });

    mqtt.onDisconnect([]()
                      { Serial.println("MQTT disconnected"); });

    mqtt.subscribe(getEvacuationCommandTopic().c_str(), [](const String &topic, const String &msg)
                   { handleEvacuationCommand(msg); });

    wifi.setStaticIP(localIp, gateway, subnet, dns);
    wifi.connect();
    mqtt.startTask();

    FlameSensorTask.start();
    heartbeatTask.start();
}

void loop()
{
    wifi.loop();
    delay(100);
}

void setMqttCredentials()
{
    if (ESP_MQTT_USER[0] != '\0')
    {
        mqtt.setCredentials(ESP_MQTT_USER, ESP_MQTT_PASS);
    }
}

std::vector<FlameSensorInfo> getFlameSensorInfo()
{
    std::vector<FlameSensorInfo> flameSensorInfos;

    for (const auto &exit : PATH_TO_EXITS)
    {
        flameSensorInfos.push_back({exit.path, true});
    }

    for (const auto &room : ROOMS)
    {
        flameSensorInfos.push_back({room, false});
    }

    return flameSensorInfos;
}

std::vector<FlameSensor> readFlameSensors()
{
    std::vector<FlameSensorInfo> flameSensors = getFlameSensorInfo();
    std::vector<FlameSensor> flameSensorReadings;

    for (int ch = 0; ch < (int)flameSensors.size(); ch++)
    {
        int raw = mux.readAnalog(ch);
        flameSensorReadings.push_back({raw,
                                       flameSensors[ch].location,
                                       isFireDetected(raw) ? "true" : "false"});
    }

    return flameSensorReadings;
}

std::string setDeviceStatus(const std::string &status, bool includeHeartbeat)
{
    JsonDocument doc;
    doc["deviceType"] = device.deviceType;
    doc["deviceName"] = device.deviceName;
    doc["floor"] = device.floor;
    doc["status"] = status;
    if (includeHeartbeat)
    {
        doc["heartbeat"] = millis();
    }
    std::string payload;
    serializeJson(doc, payload);
    return payload;
}

// FIX 2: Removed the empty-location branch that produced a double-slash topic.
// Location is always expected to be non-empty from sensor readings.
std::string getFlameSensorTopic(const std::string &floor, const std::string &location)
{
    if (!location.empty())
    {
        return "building/sensors/" + floor + "/" + location + "/flame";
    }
    // Fallback with a clean topic — no double slash
    return "building/sensors/" + floor + "/unknown/flame";
}

std::string getDeviceStatusTopic(const std::string &floor)
{
    return "building/" + floor + "/devices";
}

void publishSensorReadings(const FlameSensor &flameSensor, const DeviceInfo &deviceInfo)
{
    std::string topic = getFlameSensorTopic(deviceInfo.floor, flameSensor.location);
    JsonDocument doc;
    doc["rawValue"] = flameSensor.rawValue;
    doc["location"] = flameSensor.location;
    doc["isFlameDetected"] = flameSensor.isFlameDetected;
    std::string payload;
    serializeJson(doc, payload);
    mqtt.publish(topic.c_str(), payload.c_str());
}

// FIX 1: Merged setEvacuationMode + implementLEDGuide into one atomic function.
// When evacuation is ON, all exit LEDs turn ON, then the blocked path (if any) turns OFF.
// When evacuation is OFF, all LEDs turn OFF, no blocked paths.
void setEvacuationMode(boolean isEvacuationModeOn, const std::string &blockedLocation)
{
    EvacuationMode = isEvacuationModeOn;

    for (const auto &exit : PATH_TO_EXITS)
    {
        if (isEvacuationModeOn && exit.path == blockedLocation)
        {
            // Turn OFF the LED for the fire location — it's blocked
            digitalWrite(exit.ledPin, LOW);
        }
        else
        {
            digitalWrite(exit.ledPin, isEvacuationModeOn ? HIGH : LOW);
        }
    }
}

void setupLED()
{
    for (const auto &exit : PATH_TO_EXITS)
    {
        pinMode(exit.ledPin, OUTPUT);
        digitalWrite(exit.ledPin, LOW); // All OFF at start
    }
}

std::string getEvacuationCommandTopic()
{
    return "building/command/evacuation";
}

std::string parseEvacuationCommand(const char *json)
{
    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, json);

    if (err)
    {
        Serial.print("deserializeJson failed: ");
        Serial.println(err.c_str());
        return "";
    }

    std::string evacuationMode = doc["evacuationMode"] | "";
    return evacuationMode;
}

void handleEvacuationCommand(const String &msg)
{
    const std::string evacuationMode = parseEvacuationCommand(msg.c_str());

    // FIX 3: Protect EvacuationMode reads/writes with mutex in MQTT callback
    if (xSemaphoreTake(evacuationMutex, portMAX_DELAY) == pdTRUE)
    {
        if (evacuationMode == "true" && !EvacuationMode)
        {
            // Remote command: turn on all exit LEDs, no specific blocked path
            setEvacuationMode(true);
        }
        else if (evacuationMode == "false" && EvacuationMode)
        {
            setEvacuationMode(false);
        }
        xSemaphoreGive(evacuationMutex);
    }
}

boolean isFireDetected(int readings)
{
    return readings < FLAME_THRESHOLD;
}
// Topics
// "building/" + floor + "/devices"
// doc["deviceType"] = device.deviceType;
// doc["deviceName"] = device.deviceName;
// doc["floor"] = device.floor;
// doc["status"] = status;

// "building/sensors/" + floor + "/" + location + "/flame"
// doc["rawValue"] = flameSensor.rawValue;  // lower = more fire detected
// doc["location"] = flameSensor.location;
// doc["isFlameDetected"] = flameSensor.isFlameDetected;

// "building/command/evacuation"
// doc["evacuationMode"] = "true" | "false";
