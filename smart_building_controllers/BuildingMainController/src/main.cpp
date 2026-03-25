#include <Arduino.h>
#include "ESP32Easy_WiFi.h"
#include "ESP32Easy_MQTT.h"
#include "ESP32Easy_Task.h"
#include "BuildingControllerPins.h"
#include "MQTTCredentials.h"
#include "WifiCredentials.h"
#include <ArduinoJson.h>
#include <string>
#include <Stepper.h>
#include <ESP32Servo.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>

// ─────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────
#define DEVICE_TYPE "esp32"
#define DEVICE_NAME "esp32-main-f1"
#define FLOOR "floor1"

// Stepper
#define STEPPER_STEPS_PER_REV 2048 // 28BYJ-48 via ULN2003
#define STEPPER_RPM 10
#define STEPS_PER_FLOOR 512 // tune to your physical setup

// DC motor (LN298N) — elevator door
#define DOOR_OPEN_DURATION_MS 2000 // how long motor runs to fully open/close

// Servo — emergency exit doors
#define SERVO_CLOSED_ANGLE 0
#define SERVO_OPEN_ANGLE 90

// Buzzer — smooth repeating tone on evacuation
#define BUZZER_FREQ_HZ 1000 // base tone frequency
#define BUZZER_CHANNEL 0    // LEDC channel

// ─────────────────────────────────────────────
// STRUCTS
// ─────────────────────────────────────────────
struct DeviceInfo
{
    std::string deviceType = DEVICE_TYPE;
    std::string deviceName = DEVICE_NAME;
    std::string floor = FLOOR;
};

struct ElevatorState
{
    int currentFloor = 1; // 1, 2, or 3
    int targetFloor = 1;
    bool isMoving = false;
};

struct ElevatorDoorState
{
    bool isOpen = false;
};

// ─────────────────────────────────────────────
// HARDWARE INSTANCES
// ─────────────────────────────────────────────
DeviceInfo device;

EasyWiFi wifi(WIFI_SSID, WIFI_PASS);
EasyMQTT mqtt(MQTT_BROKER, MQTT_PORT, ESP_MQTT_CLIENT_ID);

// Stepper: ULN2003 — IN1 IN2 IN3 IN4
Stepper elevatorStepper(STEPPER_STEPS_PER_REV,
                        STEPPER_IN1_PIN,
                        STEPPER_IN3_PIN,
                        STEPPER_IN2_PIN,
                        STEPPER_IN4_PIN);

// Servos — 5 emergency exit doors
Servo exitDoorServo[5];
const int EXIT_DOOR_PINS[5] = {
    SERVO1_PIN,
    SERVO2_PIN,
    SERVO3_PIN,
    SERVO4_PIN,
    SERVO5_PIN};
const std::string EXIT_DOOR_NAMES[5] = {
    "exit-door-1",
    "exit-door-2",
    "exit-door-3",
    "exit-door-4",
    "exit-door-5"};

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────
ElevatorState elevatorState;
ElevatorDoorState elevatorDoorState;
volatile bool evacuationMode = false;
volatile bool evacuationButtonPressed = false;

SemaphoreHandle_t stateMutex = NULL;

// ─────────────────────────────────────────────
// FUNCTION DECLARATIONS
// ─────────────────────────────────────────────
// Topics
std::string getDeviceStatusTopic();
std::string getControlTopic(const std::string &component);
std::string getStateTopic(const std::string &component);
std::string getEvacuationCommandTopic();
std::string getEvacuationPublishTopic();

// Device status
std::string buildDeviceStatusPayload(const std::string &status, bool includeHeartbeat = false);

// Elevator stepper
void moveElevatorToFloor(int targetFloor);
void publishElevatorState();
void handleElevatorCommand(const String &msg);

// Elevator door (LN298N DC motor)
void openElevatorDoor();
void closeElevatorDoor();
void stopElevatorDoor();
void publishElevatorDoorState();
void handleElevatorDoorCommand(const String &msg);

// Emergency exit servos
void openExitDoor(int index);
void closeExitDoor(int index);
void openAllExitDoors();
void closeAllExitDoors();
void publishExitDoorState(int index, bool isOpen);
void handleExitDoorCommand(int index, const String &msg);

// Buzzer
void startBuzzer();
void stopBuzzer();
void handleBuzzerCommand(const String &msg);

// Mist relay
void setMist(bool on);
void publishMistState(bool on);
void handleMistCommand(const String &msg);

// Evacuation
void handleEvacuationCommand(const String &msg);
void triggerEvacuationMode();
void publishEvacuationState(bool on);

// Setup helpers
void setupStepper();
void setupElevatorDoor();
void setupServos();
void setupBuzzer();
void setupMistRelay();
void setupEvacuationButton();
void setMqttCredentials();
void subscribeToAllTopics();

// ─────────────────────────────────────────────
// INTERRUPT — Evacuation button (IRAM safe)
// ─────────────────────────────────────────────
void IRAM_ATTR onEvacuationButtonPressed()
{
    evacuationButtonPressed = true;
}

// ─────────────────────────────────────────────
// TASKS
// ─────────────────────────────────────────────

// Handles elevator movement on a separate task so stepper doesn't block MQTT
EasyTask elevatorTask("ElevatorTask", []()
                      {
    if (xSemaphoreTake(stateMutex, portMAX_DELAY) == pdTRUE)
    {
        if (elevatorState.isMoving && elevatorState.currentFloor != elevatorState.targetFloor)
        {
            int stepsNeeded = (elevatorState.targetFloor - elevatorState.currentFloor) * STEPS_PER_FLOOR;
            xSemaphoreGive(stateMutex);

            elevatorStepper.step(stepsNeeded);  // positive = up, negative = down

            if (xSemaphoreTake(stateMutex, portMAX_DELAY) == pdTRUE)
            {
                elevatorState.currentFloor = elevatorState.targetFloor;
                elevatorState.isMoving     = false;
                xSemaphoreGive(stateMutex);
            }

            publishElevatorState();
            Serial.printf("Elevator arrived at floor %d\n", elevatorState.currentFloor);
        }
        else
        {
            xSemaphoreGive(stateMutex);
        }
    }

    EasyTask::sleep(100); }, 1, 4096, 1);

// Polls the evacuation button flag set by interrupt
EasyTask buttonTask("ButtonTask", []()
                    {
    if (evacuationButtonPressed)
    {
        evacuationButtonPressed = false;
        Serial.println("Evacuation button pressed");

        if (wifi.isConnected() && mqtt.isConnected())
        {
            triggerEvacuationMode();
        }
    }
    EasyTask::sleep(50); }, 1, 2048, 1);

EasyTask heartbeatTask("HeartbeatTask", []()
                       {
    if (!wifi.isConnected() || !mqtt.isConnected())
    {
        EasyTask::sleep(1000);
        return;
    }

    mqtt.publish(
        getDeviceStatusTopic().c_str(),
        buildDeviceStatusPayload("online", true).c_str(),
        true
    );
    EasyTask::sleep(5000); }, 1, 3072, 1);

// ─────────────────────────────────────────────
// SETUP
// ─────────────────────────────────────────────
void setup()
{
    Serial.begin(115200);

    stateMutex = xSemaphoreCreateMutex();

    setupStepper();
    setupElevatorDoor();
    setupServos();
    setupBuzzer();
    setupMistRelay();
    setupEvacuationButton();
    setMqttCredentials();

    mqtt.setWill(
        getDeviceStatusTopic().c_str(),
        buildDeviceStatusPayload("offline").c_str(),
        true, 1);

    wifi.onConnect([]()
                   {
        Serial.print("Tertiary ESP32 WiFi IP: ");
        Serial.println(WiFi.localIP()); });

    wifi.onDisconnect([]()
                      { Serial.println("Tertiary ESP32 WiFi lost"); });

    mqtt.onConnect([]()
                   {
        Serial.println("MQTT connected");
        mqtt.publish(
            getDeviceStatusTopic().c_str(),
            buildDeviceStatusPayload("online", true).c_str(),
            true
        );
        subscribeToAllTopics(); });

    mqtt.onDisconnect([]()
                      { Serial.println("Tertiary ESP32 MQTT disconnected"); });

    wifi.connect();
    mqtt.startTask();
    elevatorTask.start();
    buttonTask.start();
    heartbeatTask.start();
}

// ─────────────────────────────────────────────
// LOOP
// ─────────────────────────────────────────────
void loop()
{
    wifi.loop();
    delay(100);
}

// ─────────────────────────────────────────────
// SETUP HELPERS
// ─────────────────────────────────────────────
void setupStepper()
{
    elevatorStepper.setSpeed(STEPPER_RPM);
    Serial.println("Stepper ready");
}

void setupElevatorDoor()
{
    pinMode(ELEVATOR_DOOR_IN1_PIN, OUTPUT);
    pinMode(ELEVATOR_DOOR_IN2_PIN, OUTPUT);
    pinMode(ELEVATOR_DOOR_ENA_PIN, OUTPUT);
    stopElevatorDoor();
    Serial.println("Elevator door motor ready");
}

void setupServos()
{
    for (int i = 0; i < 5; i++)
    {
        exitDoorServo[i].attach(EXIT_DOOR_PINS[i]);
        exitDoorServo[i].write(SERVO_CLOSED_ANGLE);
    }
    Serial.println("Exit door servos ready");
}

void setupBuzzer()
{
    ledcSetup(BUZZER_CHANNEL, BUZZER_FREQ_HZ, 8);
    ledcAttachPin(BUZZER_PIN, BUZZER_CHANNEL);
    ledcWrite(BUZZER_CHANNEL, 0); // silent at start
    Serial.println("Buzzer ready");
}

void setupMistRelay()
{
    pinMode(MIST_RELAY_PIN, OUTPUT);
    digitalWrite(MIST_RELAY_PIN, LOW); // off at start
    Serial.println("Mist relay ready");
}

void setupEvacuationButton()
{
    pinMode(EVACUATION_BUTTON_PIN, INPUT_PULLUP);
    attachInterrupt(
        digitalPinToInterrupt(EVACUATION_BUTTON_PIN),
        onEvacuationButtonPressed,
        FALLING // triggered when button is pressed (pulled LOW)
    );
    Serial.println("Evacuation button ready");
}

void setMqttCredentials()
{
    if (ESP_MQTT_USER[0] != '\0')
    {
        mqtt.setCredentials(ESP_MQTT_USER, ESP_MQTT_PASS);
    }
}

// ─────────────────────────────────────────────
// TOPIC HELPERS
// ─────────────────────────────────────────────
std::string getDeviceStatusTopic()
{
    return "building/" + device.floor + "/devices";
}

std::string getControlTopic(const std::string &component)
{
    return "building/control/" + device.floor + "/" + component;
}

std::string getStateTopic(const std::string &component)
{
    return "building/state/" + device.floor + "/" + component;
}

std::string getEvacuationCommandTopic()
{
    return "building/command/evacuation";
}

std::string getEvacuationPublishTopic()
{
    return "building/command/evacuation";
}

// ─────────────────────────────────────────────
// MQTT SUBSCRIPTIONS
// ─────────────────────────────────────────────
void subscribeToAllTopics()
{
    // Elevator floor
    mqtt.subscribe(getControlTopic("elevator").c_str(),
                   [](const String &topic, const String &msg)
                   { handleElevatorCommand(msg); });

    // Elevator door
    mqtt.subscribe(getControlTopic("elevator-door").c_str(),
                   [](const String &topic, const String &msg)
                   { handleElevatorDoorCommand(msg); });

    // Individual exit doors
    for (int i = 0; i < 5; i++)
    {
        std::string doorTopic = getControlTopic(EXIT_DOOR_NAMES[i]);
        // Capture index by value
        int idx = i;
        mqtt.subscribe(doorTopic.c_str(),
                       [idx](const String &topic, const String &msg)
                       { handleExitDoorCommand(idx, msg); });
    }

    // Buzzer
    mqtt.subscribe(getControlTopic("buzzer").c_str(),
                   [](const String &topic, const String &msg)
                   { handleBuzzerCommand(msg); });

    // Mist relay
    mqtt.subscribe(getControlTopic("mist").c_str(),
                   [](const String &topic, const String &msg)
                   { handleMistCommand(msg); });

    // Evacuation command from broker
    mqtt.subscribe(getEvacuationCommandTopic().c_str(),
                   [](const String &topic, const String &msg)
                   { handleEvacuationCommand(msg); });

    Serial.println("Subscribed to all control topics");
}

// ─────────────────────────────────────────────
// DEVICE STATUS
// ─────────────────────────────────────────────
std::string buildDeviceStatusPayload(const std::string &status, bool includeHeartbeat)
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

// ─────────────────────────────────────────────
// ELEVATOR — STEPPER (ULN2003)
// ─────────────────────────────────────────────
void moveElevatorToFloor(int targetFloor)
{
    if (targetFloor < 1 || targetFloor > 3)
    {
        Serial.printf("Invalid floor: %d\n", targetFloor);
        return;
    }

    if (xSemaphoreTake(stateMutex, portMAX_DELAY) == pdTRUE)
    {
        if (elevatorState.isMoving)
        {
            Serial.println("Elevator already moving, ignoring command");
            xSemaphoreGive(stateMutex);
            return;
        }
        elevatorState.targetFloor = targetFloor;
        elevatorState.isMoving = true;
        xSemaphoreGive(stateMutex);
    }

    Serial.printf("Elevator heading to floor %d\n", targetFloor);
}

void publishElevatorState()
{
    JsonDocument doc;
    doc["currentFloor"] = elevatorState.currentFloor;
    doc["targetFloor"] = elevatorState.targetFloor;
    doc["isMoving"] = elevatorState.isMoving;
    std::string payload;
    serializeJson(doc, payload);
    mqtt.publish(getStateTopic("elevator").c_str(), payload.c_str());
}

void handleElevatorCommand(const String &msg)
{
    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, msg.c_str());
    if (err)
    {
        Serial.println("Elevator command parse failed");
        return;
    }

    int floor = doc["floor"] | 0;
    if (floor >= 1 && floor <= 3)
    {
        moveElevatorToFloor(floor);
    }
}

// ─────────────────────────────────────────────
// ELEVATOR DOOR — DC MOTOR (LN298N)
// ─────────────────────────────────────────────
void openElevatorDoor()
{
    Serial.println("Elevator door opening");
    digitalWrite(ELEVATOR_DOOR_ENA_PIN, HIGH);
    digitalWrite(ELEVATOR_DOOR_IN1_PIN, HIGH);
    digitalWrite(ELEVATOR_DOOR_IN2_PIN, LOW);
    delay(DOOR_OPEN_DURATION_MS);
    stopElevatorDoor();
    elevatorDoorState.isOpen = true;
    publishElevatorDoorState();
}

void closeElevatorDoor()
{
    Serial.println("Elevator door closing");
    digitalWrite(ELEVATOR_DOOR_ENA_PIN, HIGH);
    digitalWrite(ELEVATOR_DOOR_IN1_PIN, LOW);
    digitalWrite(ELEVATOR_DOOR_IN2_PIN, HIGH);
    delay(DOOR_OPEN_DURATION_MS);
    stopElevatorDoor();
    elevatorDoorState.isOpen = false;
    publishElevatorDoorState();
}

void stopElevatorDoor()
{
    digitalWrite(ELEVATOR_DOOR_ENA_PIN, LOW);
    digitalWrite(ELEVATOR_DOOR_IN1_PIN, LOW);
    digitalWrite(ELEVATOR_DOOR_IN2_PIN, LOW);
}

void publishElevatorDoorState()
{
    JsonDocument doc;
    doc["isOpen"] = elevatorDoorState.isOpen;
    std::string payload;
    serializeJson(doc, payload);
    mqtt.publish(getStateTopic("elevator-door").c_str(), payload.c_str());
}

void handleElevatorDoorCommand(const String &msg)
{
    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, msg.c_str());
    if (err)
    {
        Serial.println("Elevator door command parse failed");
        return;
    }

    std::string action = doc["action"] | "";
    if (action == "open")
        openElevatorDoor();
    else if (action == "close")
        closeElevatorDoor();
}

// ─────────────────────────────────────────────
// EMERGENCY EXIT DOORS — SERVOS
// ─────────────────────────────────────────────
void openExitDoor(int index)
{
    if (index < 0 || index > 4)
        return;
    exitDoorServo[index].write(SERVO_OPEN_ANGLE);
    Serial.printf("Exit door %d opened\n", index + 1);
    publishExitDoorState(index, true);
}

void closeExitDoor(int index)
{
    if (index < 0 || index > 4)
        return;
    exitDoorServo[index].write(SERVO_CLOSED_ANGLE);
    Serial.printf("Exit door %d closed\n", index + 1);
    publishExitDoorState(index, false);
}

void openAllExitDoors()
{
    for (int i = 0; i < 5; i++)
        openExitDoor(i);
}

void closeAllExitDoors()
{
    for (int i = 0; i < 5; i++)
        closeExitDoor(i);
}

void publishExitDoorState(int index, bool isOpen)
{
    JsonDocument doc;
    doc["isOpen"] = isOpen;
    std::string payload;
    serializeJson(doc, payload);
    mqtt.publish(getStateTopic(EXIT_DOOR_NAMES[index]).c_str(), payload.c_str());
}

void handleExitDoorCommand(int index, const String &msg)
{
    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, msg.c_str());
    if (err)
    {
        Serial.printf("Exit door %d command parse failed\n", index + 1);
        return;
    }

    std::string action = doc["action"] | "";
    if (action == "open")
        openExitDoor(index);
    else if (action == "close")
        closeExitDoor(index);
}

// ─────────────────────────────────────────────
// BUZZER — smooth tone via LEDC PWM
// ─────────────────────────────────────────────
void startBuzzer()
{
    // Smooth tone: 50% duty cycle on LEDC = clean sine-like tone
    ledcWriteTone(BUZZER_CHANNEL, BUZZER_FREQ_HZ);
    ledcWrite(BUZZER_CHANNEL, 128); // 50% duty cycle
    Serial.println("Buzzer on");
}

void stopBuzzer()
{
    ledcWrite(BUZZER_CHANNEL, 0);
    ledcWriteTone(BUZZER_CHANNEL, 0);
    Serial.println("Buzzer off");
}

void handleBuzzerCommand(const String &msg)
{
    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, msg.c_str());
    if (err)
    {
        Serial.println("Buzzer command parse failed");
        return;
    }

    std::string action = doc["action"] | "";
    if (action == "on")
        startBuzzer();
    else if (action == "off")
        stopBuzzer();
}

// ─────────────────────────────────────────────
// MIST — RELAY
// ─────────────────────────────────────────────
void setMist(bool on)
{
    digitalWrite(MIST_RELAY_PIN, on ? HIGH : LOW);
    Serial.printf("Mist relay %s\n", on ? "on" : "off");
    publishMistState(on);
}

void publishMistState(bool on)
{
    JsonDocument doc;
    doc["isOn"] = on;
    std::string payload;
    serializeJson(doc, payload);
    mqtt.publish(getStateTopic("mist").c_str(), payload.c_str());
}

void handleMistCommand(const String &msg)
{
    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, msg.c_str());
    if (err)
    {
        Serial.println("Mist command parse failed");
        return;
    }

    std::string action = doc["action"] | "";
    if (action == "on")
        setMist(true);
    else if (action == "off")
        setMist(false);
}

// ─────────────────────────────────────────────
// EVACUATION
// ─────────────────────────────────────────────
void triggerEvacuationMode()
{
    if (evacuationMode)
        return;

    evacuationMode = true;
    Serial.println("Evacuation mode activated");

    openAllExitDoors();
    startBuzzer();
    setMist(true);
    moveElevatorToFloor(1); // bring elevator to ground floor

    publishEvacuationState(true);
}

void publishEvacuationState(bool on)
{
    JsonDocument doc;
    doc["evacuationMode"] = on ? "true" : "false";
    std::string payload;
    serializeJson(doc, payload);
    mqtt.publish(getEvacuationPublishTopic().c_str(), payload.c_str(), true);
}

void handleEvacuationCommand(const String &msg)
{
    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, msg.c_str());
    if (err)
    {
        Serial.println("Evacuation command parse failed");
        return;
    }

    std::string mode = doc["evacuationMode"] | "";

    if (mode == "true" && !evacuationMode)
    {
        triggerEvacuationMode();
    }
    else if (mode == "false" && evacuationMode)
    {
        evacuationMode = false;
        closeAllExitDoors();
        stopBuzzer();
        setMist(false);
        publishEvacuationState(false);
        Serial.println("Evacuation mode deactivated");
    }
}

// ─────────────────────────────────────────────
// TOPICS REFERENCE
// ─────────────────────────────────────────────
// SUBSCRIBES TO:
// "building/control/floor1/elevator"
//   { "floor": 1 | 2 | 3 }
//
// "building/control/floor1/elevator-door"
//   { "action": "open" | "close" }
//
// "building/control/floor1/exit-door-1" ... "exit-door-5"
//   { "action": "open" | "close" }
//
// "building/control/floor1/buzzer"
//   { "action": "on" | "off" }
//
// "building/control/floor1/mist"
//   { "action": "on" | "off" }
//
// "building/command/evacuation"
//   { "evacuationMode": "true" | "false" }
//
// PUBLISHES TO:
// "building/floor1/devices"
//   { "deviceType", "deviceName", "floor", "status": "online" | "offline" }
//
// "building/state/floor1/elevator"
//   { "currentFloor": int, "targetFloor": int, "isMoving": bool }
//
// "building/state/floor1/elevator-door"
//   { "isOpen": bool }
//
// "building/state/floor1/exit-door-1" ... "exit-door-5"
//   { "isOpen": bool }
//
// "building/state/floor1/mist"
//   { "isOn": bool }
//
// "building/command/evacuation"
//   { "evacuationMode": "true" | "false" }
