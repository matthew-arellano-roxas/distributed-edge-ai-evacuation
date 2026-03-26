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

#include <DHT22.h>
#include <EasyMQ2.h>

#define DEVICE_TYPE "esp32"
#define DEVICE_NAME "esp32-secondary-f3"
#define FLOOR "floor3"
#define DHT_STARTUP_DELAY_MS 2000UL
#define DHT_RETRY_DELAY_MS 50UL

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

struct GasSensor
{
  int level;
  boolean isDetected;
};

DeviceInfo device;
unsigned long bootCompletedAt = 0;

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

DHT22 dht22(DHT22_PIN);
EasyMQ2 mq2(MQ2_A0_PIN, MQ2_D0_PIN);

std::string getDeviceStatusTopic(const std::string &floor);
std::string setDeviceStatus(const std::string &status, bool includeHeartbeat = false);
std::string getSensorTopic(const std::string &floor, const std::string &sensorType, const std::string &location = "");
DHTSensor readDHT22TemperatureC();
void publishTemperatureC(DHTSensor dht);
void publishGas(GasSensor gas);
GasSensor readMQ2Gas();

EasyTask sensorTask("SensorTask", []()
                    {
    // FIX 1: Use || so we skip if EITHER WiFi or MQTT is disconnected
    if (!networkIsConnected() || !mqtt.isConnected()) {
        static unsigned long lastWaitLog = 0;
        if (millis() - lastWaitLog >= 3000) {
            lastWaitLog = millis();
            Serial.printf(
                "[TASK] SensorTask waiting | network=%s mqtt=%s mode=%s\n",
                networkIsConnected() ? "up" : "down",
                mqtt.isConnected() ? "up" : "down",
                USE_ETHERNET ? "Ethernet" : "WiFi");
        }
        EasyTask::sleep(1000);
        return;
    }

    Serial.println("[TASK] SensorTask running");

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
  Serial.println("[BOOT] FloorSecondaryController setup start");
  Serial.printf("[BOOT] Network mode = %s\n", USE_ETHERNET ? "Ethernet" : "WiFi");
  Serial.printf("[BOOT] MQTT broker = %s:%d\n", MQTT_BROKER, MQTT_PORT);
  mqtt.setWill(getDeviceStatusTopic(device.floor).c_str(), setDeviceStatus("offline").c_str(), true, 1);
  Serial.println("[BOOT] MQTT last will configured");
  Serial.println("[BOOT] DHT22 ready");
  mq2.begin();
  Serial.println("[BOOT] MQ2 initialized");

  Serial.println("[BOOT] Registering network events");
  registerNetworkEvents();

  Serial.println("[BOOT] Registering MQTT events");
  mqtt.onConnect([]()
                 {
        Serial.println("MQTT connected");
        std::string statusTopic = getDeviceStatusTopic(device.floor);
        std::string onlinePayload = setDeviceStatus("online", true);
        Serial.printf("[MQTT] Publishing online status -> %s\n", statusTopic.c_str());
        mqtt.publish(statusTopic.c_str(), onlinePayload.c_str(), true); });

  mqtt.onDisconnect([]()
                    { Serial.println("Secondary ESP32 MQTT disconnected"); });

  Serial.println("[BOOT] Starting network");
  setupNetwork();
  Serial.println("[BOOT] Starting MQTT task");
  mqtt.startTask();
  Serial.println("[BOOT] Starting sensor task");
  sensorTask.start();
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

std::string getDeviceStatusTopic(const std::string &floor)
{
  return "building/" + floor + "/devices";
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
  if (millis() - bootCompletedAt < DHT_STARTUP_DELAY_MS) {
    Serial.println("DHT22 warming up, skipping read");
    return {0.0f, 0.0f, false};
  }

  auto readOnce = []() -> DHTSensor {
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

void publishTemperatureC(DHTSensor dhtReading)
{
  JsonDocument doc;
  doc["temperature"] = dhtReading.temperature;
  doc["humidity"] = dhtReading.humidity;
  std::string payload;
  serializeJson(doc, payload);
  std::string topic = getSensorTopic(device.floor, "temperature");
  Serial.printf("[MQTT] Publishing temperature -> %s | %s\n", topic.c_str(), payload.c_str());
  mqtt.publish(topic.c_str(), String(payload.c_str()));
}

void publishGas(GasSensor gas)
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
