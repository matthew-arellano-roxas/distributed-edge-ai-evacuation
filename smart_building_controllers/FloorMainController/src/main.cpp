#include <Arduino.h>
#include "ESP32Easy_WiFi.h"
#include "ESP32Easy_Ethernet.h"
#include "ESP32Easy_MQTT.h"
#include "ESP32Easy_Task.h"
#include "NetworkMode.h"
#include "WifiCredentials.h"
#include "MQTTCredentials.h"
#include "ESP32Easy_Mux.h"
#include "network_config.h"
#include "FloorMainControllerPins.h"
#include <Ethernet.h>
#include <vector>
#include <ArduinoJson.h>
#include <string>
#include <DHT22.h>
#include <EasyMQ2.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>

#define DEVICE_TYPE "esp32"
#define DEVICE_NAME "esp32-main-f3"
#define FLOOR "floor3"

#define FLAME_THRESHOLD 2000
#define DHT_STARTUP_DELAY_MS 2000UL
#define DHT_RETRY_DELAY_MS 50UL

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

struct DHTSensor
{
    float temperature;
    float humidity;
    boolean isValid;
};

struct GasSensor
{
    int level;
    boolean isDetected;
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
EasyEthernet ethernet(W5500_CS);
EthernetClient ethernetClient;
EasyMQTT mqttWifi(MQTT_BROKER, MQTT_PORT, ESP_MQTT_CLIENT_ID);
EasyMQTT mqttEthernet(
    MQTT_BROKER,
    MQTT_PORT,
    ESP_MQTT_CLIENT_ID,
    ethernetClient);
EasyMQTT &mqtt = USE_ETHERNET ? mqttEthernet : mqttWifi;
EasyMux mux(MUX_S0_PIN, MUX_S1_PIN, MUX_S2_PIN, MUX_S3_PIN, MUX_SIG_PIN);
DHT22 dht22(DHT22_PIN);
EasyMQ2 mq2(MQ2_A0_PIN, MQ2_D0_PIN);

DeviceInfo device;
unsigned long bootCompletedAt = 0;

// FIX 3: Use volatile + mutex for thread-safe access across tasks
volatile boolean EvacuationMode = false;
SemaphoreHandle_t evacuationMutex = NULL;

bool networkIsConnected()
{
    return USE_ETHERNET ? ethernet.isConnected() : wifi.isConnected();
}

void setupNetwork()
{
    Serial.printf(
        "[NET] setupNetwork start | mode=%s\n",
        USE_ETHERNET ? "Ethernet" : "WiFi");

    if (USE_ETHERNET)
    {
        Serial.printf(
            "[NET] Ethernet config | ip=%s gateway=%s subnet=%s dns=%s broker=%s:%d\n",
            localIp.toString().c_str(),
            gateway.toString().c_str(),
            subnet.toString().c_str(),
            dns.toString().c_str(),
            MQTT_BROKER,
            MQTT_PORT);
        ethernet.begin(mac, localIp, dns, gateway, subnet);
        return;
    }

    Serial.printf(
        "[NET] WiFi config | ssid=%s ip=%s gateway=%s subnet=%s dns=%s broker=%s:%d\n",
        WIFI_SSID,
        localIp.toString().c_str(),
        gateway.toString().c_str(),
        subnet.toString().c_str(),
        dns.toString().c_str(),
        MQTT_BROKER,
        MQTT_PORT);
    wifi.setStaticIP(localIp, gateway, subnet, dns);
    wifi.connect();
}

void loopNetwork()
{
    if (USE_ETHERNET)
    {
        ethernet.loop();
        return;
    }

    wifi.loop();
}

void registerNetworkEvents()
{
    if (USE_ETHERNET)
    {
        ethernet.onConnect([]()
                           {
            Serial.print("Floor main Ethernet IP: ");
            Serial.println(ethernet.localIP()); });

        ethernet.onDisconnect([]()
                              { Serial.println("Floor main Ethernet disconnected"); });
        return;
    }

    wifi.onConnect([]()
                   {
        Serial.print("WiFi IP: ");
        Serial.println(WiFi.localIP()); });

    wifi.onDisconnect([]()
                      { Serial.println("Floor main WiFi disconnected"); });
}

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
std::string getSensorTopic(const std::string &floor, const std::string &sensorType);
DHTSensor readDHT22TemperatureC();
GasSensor readMQ2Gas();
void publishTemperatureC(const DHTSensor &reading);
void publishGas(const GasSensor &gas);

// Task
EasyTask FlameSensorTask("FlameSensorTask", []()
                         {
    if (!networkIsConnected() || !mqtt.isConnected()) {
        static unsigned long lastWaitLog = 0;
        if (millis() - lastWaitLog >= 3000) {
            lastWaitLog = millis();
            Serial.printf(
                "[TASK] FlameSensorTask waiting | network=%s mqtt=%s mode=%s\n",
                networkIsConnected() ? "up" : "down",
                mqtt.isConnected() ? "up" : "down",
                USE_ETHERNET ? "Ethernet" : "WiFi");
        }
        EasyTask::sleep(1000);
        return;
    }

    Serial.println("[TASK] FlameSensorTask running");
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

EasyTask EnvironmentSensorTask("EnvironmentSensorTask", []()
                               {
    if (!networkIsConnected() || !mqtt.isConnected()) {
        static unsigned long lastWaitLog = 0;
        if (millis() - lastWaitLog >= 3000) {
            lastWaitLog = millis();
            Serial.printf(
                "[TASK] EnvironmentSensorTask waiting | network=%s mqtt=%s mode=%s\n",
                networkIsConnected() ? "up" : "down",
                mqtt.isConnected() ? "up" : "down",
                USE_ETHERNET ? "Ethernet" : "WiFi");
        }
        EasyTask::sleep(1000);
        return;
    }

    Serial.println("[TASK] EnvironmentSensorTask running");
    DHTSensor dhtReading = readDHT22TemperatureC();
    if (dhtReading.isValid)
    {
        publishTemperatureC(dhtReading);
    }
    else
    {
        Serial.println("DHT22 reading invalid, skipping publish");
    }

    GasSensor gasReading = readMQ2Gas();
    publishGas(gasReading);

    EasyTask::sleep(5000); }, 1, 4096, 1);

EasyTask heartbeatTask("HeartbeatTask", []()
                       {
    if (!networkIsConnected() || !mqtt.isConnected()) {
        static unsigned long lastWaitLog = 0;
        if (millis() - lastWaitLog >= 3000) {
            lastWaitLog = millis();
            Serial.printf(
                "[TASK] HeartbeatTask waiting | network=%s mqtt=%s mode=%s\n",
                networkIsConnected() ? "up" : "down",
                mqtt.isConnected() ? "up" : "down",
                USE_ETHERNET ? "Ethernet" : "WiFi");
        }
        EasyTask::sleep(1000);
        return;
    }

    std::string statusTopic = getDeviceStatusTopic(device.floor);
    std::string payload = setDeviceStatus("online", true);
    Serial.printf("[MQTT] Publishing heartbeat -> %s\n", statusTopic.c_str());
    mqtt.publish(statusTopic.c_str(), String(payload.c_str()), true);
    EasyTask::sleep(5000); }, 1, 3072, 1);

void setup()
{
    Serial.begin(115200);
    delay(300);
    Serial.println("[BOOT] FloorMainController setup start");
    Serial.printf("[BOOT] Network mode = %s\n", USE_ETHERNET ? "Ethernet" : "WiFi");
    Serial.printf("[BOOT] MQTT broker = %s:%d\n", MQTT_BROKER, MQTT_PORT);

    // FIX 3: Create mutex before any task starts
    evacuationMutex = xSemaphoreCreateMutex();
    Serial.println("[BOOT] Evacuation mutex created");

    setupLED();
    Serial.println("[BOOT] LEDs initialized");
    setMqttCredentials();
    Serial.println("[BOOT] MQTT credentials configured");
    mux.beginInput();
    Serial.println("[BOOT] Mux initialized");
    mq2.begin();
    Serial.println("[BOOT] MQ2 initialized");
    mqtt.setWill(getDeviceStatusTopic(device.floor).c_str(), setDeviceStatus("offline").c_str(), true, 1);
    Serial.println("[BOOT] MQTT last will configured");
    registerNetworkEvents();
    Serial.println("[BOOT] Network events registered");

    mqtt.onConnect([]()
                   {
        Serial.println("MQTT connected");
        std::string statusTopic = getDeviceStatusTopic(device.floor);
        std::string onlinePayload = setDeviceStatus("online", true);
        Serial.printf("[MQTT] Publishing online status -> %s\n", statusTopic.c_str());
        mqtt.publish(statusTopic.c_str(), onlinePayload.c_str(), true); });

    mqtt.onDisconnect([]()
                      { Serial.println("Floor main MQTT disconnected"); });

    mqtt.subscribe(getEvacuationCommandTopic().c_str(), [](const String &topic, const String &msg)
                   { handleEvacuationCommand(msg); });
    Serial.printf("[BOOT] Subscribed to evacuation topic -> %s\n", getEvacuationCommandTopic().c_str());

    Serial.println("[BOOT] Starting network");
    setupNetwork();
    Serial.println("[BOOT] Starting MQTT task");
    mqtt.startTask();

    Serial.println("[BOOT] Starting flame task");
    FlameSensorTask.start();
    Serial.println("[BOOT] Starting environment task");
    EnvironmentSensorTask.start();
    Serial.println("[BOOT] Starting heartbeat task");
    heartbeatTask.start();
    bootCompletedAt = millis();
    Serial.println("[BOOT] Setup complete");
}

void loop()
{
    loopNetwork();
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
        Serial.printf(
            "[SENSOR] Flame channel=%d location=%s raw=%d detected=%s\n",
            ch,
            flameSensors[ch].location.c_str(),
            raw,
            isFireDetected(raw) ? "true" : "false");
        flameSensorReadings.push_back({raw,
                                       flameSensors[ch].location,
                                       isFireDetected(raw) ? "true" : "false"});
    }

    return flameSensorReadings;
}

std::string setDeviceStatus(const std::string &status, bool includeHeartbeat)
{
    JsonDocument doc;
    doc["deviceId"] = device.deviceName;
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

std::string getSensorTopic(const std::string &floor, const std::string &sensorType)
{
    return "building/sensors/" + floor + "/" + sensorType;
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
    Serial.printf("[MQTT] Publishing flame -> %s | %s\n", topic.c_str(), payload.c_str());
    mqtt.publish(topic.c_str(), String(payload.c_str()));
}

DHTSensor readDHT22TemperatureC()
{
    if (millis() - bootCompletedAt < DHT_STARTUP_DELAY_MS)
    {
        Serial.println("DHT22 warming up, skipping read");
        return {0.0f, 0.0f, false};
    }

    auto readOnce = []() -> DHTSensor
    {
        float temperatureC = dht22.getTemperature();
        float humidity = dht22.getHumidity();

        const bool validReading =
            !isnan(temperatureC) &&
            !isnan(humidity) &&
            temperatureC > -100.0f &&
            temperatureC < 100.0f &&
            humidity >= 0.0f &&
            humidity <= 100.0f &&
            temperatureC != -273.0f;

        if (validReading)
        {
            Serial.print("Temperature: ");
            Serial.println(temperatureC);
            Serial.print("Humidity: ");
            Serial.println(humidity);
            return {temperatureC, humidity, true};
        }

        return {0.0f, 0.0f, false};
    };

    DHTSensor reading = readOnce();
    if (reading.isValid)
    {
        return reading;
    }

    delay(DHT_RETRY_DELAY_MS);
    reading = readOnce();
    if (reading.isValid)
    {
        Serial.println("DHT22 second read succeeded");
        return reading;
    }

    Serial.print("DHT22 read invalid after retry, error=");
    Serial.println(dht22.getLastError());
    return {0.0f, 0.0f, false};
}

GasSensor readMQ2Gas()
{
    EasyMQ2Reading gas = mq2.read();

    Serial.print("MQ2 analog: ");
    Serial.println(gas.analogValue);
    Serial.print("MQ2 digital detected: ");
    Serial.println(gas.digitalDetected);

    return {gas.analogValue, gas.digitalDetected};
}

void publishTemperatureC(const DHTSensor &reading)
{
    JsonDocument doc;
    doc["temperature"] = reading.temperature;
    doc["humidity"] = reading.humidity;
    std::string payload;
    serializeJson(doc, payload);
    std::string topic = getSensorTopic(device.floor, "temperature");
    Serial.printf("[MQTT] Publishing temperature -> %s | %s\n", topic.c_str(), payload.c_str());
    mqtt.publish(topic.c_str(), String(payload.c_str()));
}

void publishGas(const GasSensor &gas)
{
    JsonDocument doc;
    doc["level"] = gas.level;
    doc["isDetected"] = gas.isDetected;
    std::string payload;
    serializeJson(doc, payload);
    std::string topic = getSensorTopic(device.floor, "gas");
    Serial.printf("[MQTT] Publishing gas -> %s | %s\n", topic.c_str(), payload.c_str());
    mqtt.publish(topic.c_str(), String(payload.c_str()));
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
    Serial.printf("[MQTT] Evacuation command received -> %s\n", evacuationMode.c_str());

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
