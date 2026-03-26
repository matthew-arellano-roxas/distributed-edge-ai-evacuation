#include <Arduino.h>
#include "ESP32Easy_WiFi.h"
#include "ESP32Easy_Ethernet.h"
#include "ESP32Easy_MQTT.h"
#include "ESP32Easy_Task.h"
#include "FloorSecondaryControllerPins.h"
#include "network_config.h"
#include "NetworkMode.h"
#include "MQTTCredentials.h"
#include "WifiCredentials.h"
#include <Ethernet.h>
#include <ArduinoJson.h>
#include <string>

#include <EasyUltrasonic.h>
#include <EasyDHT22.h>
#include <EasyMQ2.h>

#define DEVICE_TYPE "esp32"
#define DEVICE_NAME "esp32-secondary-f3"
#define FLOOR "floor3"

#define DISTANCE_THRESHOLD 30

struct DeviceInfo
{
  std::string deviceType = DEVICE_TYPE;
  std::string deviceName = DEVICE_NAME;
  std::string floor = FLOOR;
};

struct DHTSensor
{
  float temperature;
  float humidity;
  boolean isValid; // FIX 3: Track whether the reading is valid
};

struct PresenceSensor
{
  std::string location;
  int pin;
};

struct GasSensor
{
  int level;
  boolean isDetected;
};

DeviceInfo device;

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

bool networkIsConnected()
{
  return USE_ETHERNET ? ethernet.isConnected() : wifi.isConnected();
}

void setupNetwork()
{
  if (USE_ETHERNET)
  {
    ethernet.begin(mac, localIp, dns, gateway, subnet);
    return;
  }

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
        Serial.print("Secondary ESP32 Ethernet IP: ");
        Serial.println(ethernet.localIP()); });

    ethernet.onDisconnect([]()
                          { Serial.println("Secondary ESP32 Ethernet lost"); });
    return;
  }

  wifi.onConnect([]()
                 {
        Serial.print("Secondary ESP32 WiFi IP: ");
        Serial.println(WiFi.localIP()); });

  wifi.onDisconnect([]()
                    { Serial.println("Secondary ESP32 WiFi lost"); });
}

EasyDHT22 dht(DHT22_PIN);
EasyMQ2 mq2(MQ2_A0_PIN, MQ2_D0_PIN);
EasyUltrasonic ul1(UL1_TRIGGER_PIN, UL1_ECHO_PIN);
EasyUltrasonic ul2(UL2_TRIGGER_PIN, UL2_ECHO_PIN);

std::string getDeviceStatusTopic(const std::string &floor);
std::string setDeviceStatus(const std::string &status, bool includeHeartbeat = false);
std::string getSensorTopic(const std::string &floor, const std::string &sensorType, const std::string &location = "");
DHTSensor readDHT22TemperatureC();
void publishTemperatureC(DHTSensor dht);
void publishGas(GasSensor gas);
GasSensor readMQ2Gas();
boolean hasPresenceNearFireExit(EasyUltrasonic &ul, int threshold);
void publishUltrasonic(boolean hasPresence, const std::string &location);

EasyTask sensorTask("SensorTask", []()
                    {
    // FIX 1: Use || so we skip if EITHER WiFi or MQTT is disconnected
    if (!networkIsConnected() || !mqtt.isConnected()) {
        EasyTask::sleep(1000);
        return;
    }

    // FIX 3: Only publish DHT22 if the reading is valid
    DHTSensor dht22 = readDHT22TemperatureC();
    if (dht22.isValid) {
        publishTemperatureC(dht22);
    } else {
        Serial.println("DHT22 reading invalid, skipping publish");
    }

    // FIX 2: Renamed local variable from mq2 to gasReading to avoid shadowing global mq2
    GasSensor gasReading = readMQ2Gas();
    publishGas(gasReading);

    // FIX 4 & 5: Use lowercase slugified location names consistent with main ESP32
    boolean ul1Presence = hasPresenceNearFireExit(ul1, DISTANCE_THRESHOLD);
    publishUltrasonic(ul1Presence, "fire-exit-1");

    boolean ul2Presence = hasPresenceNearFireExit(ul2, DISTANCE_THRESHOLD);
    publishUltrasonic(ul2Presence, "fire-exit-2");

    EasyTask::sleep(5000); }, 1, 4096, 1);

EasyTask heartbeatTask("HeartbeatTask", []()
                       {
  if (!networkIsConnected() || !mqtt.isConnected()) {
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
  mqtt.setWill(getDeviceStatusTopic(device.floor).c_str(), setDeviceStatus("offline").c_str(), true, 1);
  dht.begin();
  mq2.begin();
  ul1.begin();
  ul2.begin();

  registerNetworkEvents();

  mqtt.onConnect([]()
                 {
        Serial.println("MQTT connected");
        std::string statusTopic = getDeviceStatusTopic(device.floor);
        std::string onlinePayload = setDeviceStatus("online", true);
        mqtt.publish(statusTopic.c_str(), onlinePayload.c_str(), true); });

  mqtt.onDisconnect([]()
                    { Serial.println("Secondary ESP32 MQTT disconnected"); });

  setupNetwork();
  mqtt.startTask();
  sensorTask.start();
  heartbeatTask.start();
}

void loop()
{
  loopNetwork();
  delay(100);
}

std::string getDeviceStatusTopic(const std::string &floor)
{
  return "building/" + floor + "/devices";
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

std::string getSensorTopic(const std::string &floor, const std::string &sensorType, const std::string &location)
{
  if (!location.empty())
  {
    return "building/sensors/" + floor + "/" + location + "/" + sensorType;
  }
  return "building/sensors/" + floor + "/" + sensorType;
}

DHTSensor readDHT22TemperatureC()
{
  EasyDHT22Reading reading = dht.read();

  if (reading.isValid())
  {
    Serial.print("Temperature: ");
    Serial.println(reading.temperatureC);
    Serial.print("Humidity: ");
    Serial.println(reading.humidity);

    // FIX 3: Pass isValid = true only when sensor confirms good data
    return {reading.temperatureC, reading.humidity, true};
  }

  Serial.println("DHT22 read failed");
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

void publishTemperatureC(DHTSensor dhtReading)
{
  JsonDocument doc;
  doc["temperature"] = dhtReading.temperature;
  doc["humidity"] = dhtReading.humidity;
  std::string payload;
  serializeJson(doc, payload);
  mqtt.publish(getSensorTopic(device.floor, "temperature").c_str(), payload.c_str());
}

void publishGas(GasSensor gas)
{
  JsonDocument doc;
  doc["level"] = gas.level;
  doc["isDetected"] = gas.isDetected;
  std::string payload;
  serializeJson(doc, payload);
  mqtt.publish(getSensorTopic(device.floor, "gas").c_str(), payload.c_str());
}

// FIX 2: Pass EasyUltrasonic by reference to avoid copying sensor object
boolean hasPresenceNearFireExit(EasyUltrasonic &ul, int threshold)
{
  float distance = ul.readDistanceCm();
  return distance < threshold;
}

void publishUltrasonic(boolean hasPresence, const std::string &location)
{
  JsonDocument doc;
  doc["presence"] = hasPresence;
  std::string payload;
  serializeJson(doc, payload);
  mqtt.publish(getSensorTopic(device.floor, "presence", location).c_str(), payload.c_str());
}

// Topics
// "building/" + floor + "/devices"
// doc["deviceType"] = device.deviceType;
// doc["deviceName"] = device.deviceName;
// doc["floor"] = device.floor;
// doc["status"] = status;

// "building/sensors/" + floor + "/temperature"
// doc["temperature"] = dht.temperature;
// doc["humidity"] = dht.humidity;

// "building/sensors/" + floor + "/gas"
// doc["level"] = gas.level;
// doc["isDetected"] = gas.isDetected;

// "building/sensors/" + floor + "/fire-exit-1/presence"
// "building/sensors/" + floor + "/fire-exit-2/presence"
// doc["presence"] = hasPresence;
