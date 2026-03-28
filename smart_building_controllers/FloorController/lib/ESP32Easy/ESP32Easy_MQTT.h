#pragma once
#include <WiFi.h>
#include <Client.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <functional>
#include <map>
#include <string>
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"
#include "freertos/semphr.h"

// ============================================================
//  ESP32Easy_MQTT.h  (v2 — non-blocking)
//
//  publish() is now fire-and-forget — never blocks your task.
//  All sends go through an internal outbox queue and are
//  dispatched by a built-in background task.
//
//  Quickstart:
//    EasyMQTT mqtt("192.168.1.100", 1883, "esp32");
//    EthernetClient ethClient;
//    EasyMQTT ethMqtt("192.168.1.100", 1883, "esp32-eth", ethClient);
//    mqtt.onConnect([]() { Serial.println("connected!"); });
    //    mqtt.subscribe("home/cmd", [](const String& topic, const String& msg) { ... });
//    mqtt.startTask();   // one line — self-managing from here
//
//    // From ANY task, any time — never blocks:
//    mqtt.publish("home/temp", 25.3f);
//    mqtt.publishJson("home/sensor", doc);
// ============================================================

struct _MqttMsg {
    char  topic[64];
    char  payload[192];
    bool  retain;
};

class EasyMQTT {
public:
    using MessageFn = std::function<void(const String& topic, const String& payload)>;
    using ConnectFn = std::function<void()>;

    EasyMQTT(const char* broker, int port, const char* clientId,
             size_t outboxSize = 20)
        : _broker(broker), _port(port), _clientId(clientId),
          _username(""), _password(""),
          _client(_wifiClient), _outboxSize(outboxSize)
    {
        _outbox   = xQueueCreate(outboxSize, sizeof(_MqttMsg));
        _clientMu = xSemaphoreCreateMutex();
    }

    EasyMQTT(const char* broker, int port, const char* clientId,
             Client& networkClient,
             size_t outboxSize = 20)
        : _broker(broker), _port(port), _clientId(clientId),
          _username(""), _password(""),
          _client(networkClient), _outboxSize(outboxSize)
    {
        _outbox   = xQueueCreate(outboxSize, sizeof(_MqttMsg));
        _clientMu = xSemaphoreCreateMutex();
    }

    // ── Configuration (call before startTask) ─────────────────

    void setCredentials(const char* user, const char* pass) {
        _username = user; _password = pass;
    }

    void setWill(const char* topic, const char* message, bool retain = true, uint8_t qos = 0) {
        _willTopicStorage = topic ? topic : "";
        _willMessageStorage = message ? message : "";
        _willTopic = _willTopicStorage.c_str();
        _willMessage = _willMessageStorage.c_str();
        _willRetain = retain;
        _willQos = qos > 2 ? 2 : qos;
    }

    void onConnect(ConnectFn fn)    { _onConnect    = fn; }
    void onDisconnect(ConnectFn fn) { _onDisconnect = fn; }

    // ── Subscribe / Unsubscribe ────────────────────────────────

    void subscribe(const char* topic, MessageFn fn) {
        _subscriptions[topic] = fn;
        if (_isConnected()) _clientSubscribe(topic);
    }

    void unsubscribe(const char* topic) {
        _subscriptions.erase(topic);
        if (_isConnected()) {
            if (xSemaphoreTake(_clientMu, pdMS_TO_TICKS(50)) == pdTRUE) {
                _client.unsubscribe(topic);
                xSemaphoreGive(_clientMu);
            }
        }
    }

    // ── Non-blocking publish ───────────────────────────────────
    // Returns immediately. If outbox is full, drops the oldest message.

    bool publish(const char* topic, const String& payload, bool retain = false) {
        return _enqueue(topic, payload.c_str(), retain);
    }
    bool publish(const char* topic, float value, int decimals = 2, bool retain = false) {
        return _enqueue(topic, String(value, decimals).c_str(), retain);
    }
    bool publish(const char* topic, int value, bool retain = false) {
        return _enqueue(topic, String(value).c_str(), retain);
    }
    bool publish(const char* topic, bool value, bool retain = false) {
        return _enqueue(topic, value ? "true" : "false", retain);
    }
    bool publishJson(const char* topic, JsonDocument& doc, bool retain = false) {
        String out;
        serializeJson(doc, out);
        return _enqueue(topic, out.c_str(), retain);
    }

    // ── Lifecycle ──────────────────────────────────────────────

    // Recommended: call once in setup().
    // Starts a self-managing background task — handles connect,
    // reconnect with backoff, outbox draining, and keepalive.
    // You never need to call loop() or manage reconnects yourself.
    void startTask(int priority = 2, int stackSize = 6144, int core = 0) {
        _setup();
        xTaskCreatePinnedToCore(
            _taskEntry, "EasyMQTT", stackSize, this, priority, &_taskHandle, core
        );
    }

    // Advanced: manage the loop yourself instead of startTask()
    bool connect() { _setup(); return _reconnect(); }
    void loop()    { _tick(); }  // call every ~10ms in your own task

    // Status
    bool   isConnected()    { return _isConnected(); }
    size_t outboxPending()  { return uxQueueMessagesWaiting(_outbox); }
    bool   outboxFull()     { return uxQueueSpacesAvailable(_outbox) == 0; }

private:
    const char*       _broker;
    int               _port;
    const char*       _clientId;
    const char*       _username;
    const char*       _password;
    const char*       _willTopic   = nullptr;
    const char*       _willMessage = nullptr;
    String            _willTopicStorage;
    String            _willMessageStorage;
    bool              _willRetain  = true;
    uint8_t           _willQos     = 0;
    size_t            _outboxSize;

    WiFiClient        _wifiClient;
    PubSubClient      _client;
    QueueHandle_t     _outbox     = nullptr;
    SemaphoreHandle_t _clientMu   = nullptr;
    TaskHandle_t      _taskHandle = nullptr;

    std::map<std::string, MessageFn> _subscriptions;
    ConnectFn _onConnect    = nullptr;
    ConnectFn _onDisconnect = nullptr;

    uint32_t _lastReconnect  = 0;
    uint32_t _reconnectDelay = 2000;
    static const uint32_t _maxDelay = 60000;
    bool _wasConnected = false;

    // ── Internals ──────────────────────────────────────────────

    void _setup() {
        _client.setServer(_broker, _port);
        _client.setCallback([this](char* topic, uint8_t* payload, unsigned int len) {
            _handleMessage(topic, payload, len);
        });
    }

    bool _isConnected() {
        if (xSemaphoreTake(_clientMu, pdMS_TO_TICKS(10)) == pdTRUE) {
            bool c = _client.connected();
            xSemaphoreGive(_clientMu);
            return c;
        }
        return false;
    }

    bool _enqueue(const char* topic, const char* payload, bool retain) {
        _MqttMsg msg;
        strncpy(msg.topic,   topic,   sizeof(msg.topic)   - 1);
        strncpy(msg.payload, payload, sizeof(msg.payload) - 1);
        msg.topic  [sizeof(msg.topic)   - 1] = '\0';
        msg.payload[sizeof(msg.payload) - 1] = '\0';
        msg.retain = retain;

        if (xQueueSend(_outbox, &msg, 0) == pdTRUE) return true;

        // Outbox full — drop oldest, insert new
        _MqttMsg dropped;
        xQueueReceive(_outbox, &dropped, 0);
        return xQueueSend(_outbox, &msg, 0) == pdTRUE;
    }

    bool _reconnect() {
        if (xSemaphoreTake(_clientMu, pdMS_TO_TICKS(200)) != pdTRUE) return false;

        bool ok;
        if (_willTopic && _username[0]) {
            ok = _client.connect(_clientId, _username, _password,
                                 _willTopic, _willQos, _willRetain, _willMessage);
        } else if (_willTopic) {
            ok = _client.connect(_clientId, nullptr, nullptr,
                                 _willTopic, _willQos, _willRetain, _willMessage);
        } else if (_username[0]) {
            ok = _client.connect(_clientId, _username, _password);
        } else {
            ok = _client.connect(_clientId);
        }

        if (ok) {
            for (auto& kv : _subscriptions)
                _client.subscribe(kv.first.c_str());
            _reconnectDelay = 2000; // reset backoff
        }
        xSemaphoreGive(_clientMu);
        return ok;
    }

    void _clientSubscribe(const char* topic) {
        if (xSemaphoreTake(_clientMu, pdMS_TO_TICKS(50)) == pdTRUE) {
            _client.subscribe(topic);
            xSemaphoreGive(_clientMu);
        }
    }

    void _tick() {
        // 1. Run PubSubClient keepalive + receive incoming
        bool connected = false;
        if (xSemaphoreTake(_clientMu, pdMS_TO_TICKS(20)) == pdTRUE) {
            connected = _client.connected();
            if (connected) _client.loop();
            xSemaphoreGive(_clientMu);
        }

        // 2. Handle disconnect / reconnect with exponential backoff
        if (!connected) {
            if (_wasConnected) {
                _wasConnected = false;
                if (_onDisconnect) _onDisconnect();
            }
            uint32_t now = millis();
            if (now - _lastReconnect >= _reconnectDelay) {
                _lastReconnect = now;
                if (_reconnect()) {
                    _wasConnected = true;
                    if (_onConnect) _onConnect();
                } else {
                    // 2s → 4s → 8s → 16s → 32s → 60s (capped)
                    _reconnectDelay = min(_reconnectDelay * 2, _maxDelay);
                }
            }
            return; // don't drain outbox while offline — keep messages queued
        }

        if (!_wasConnected) {
            _wasConnected = true;
            if (_onConnect) _onConnect();
        }

        // 3. Drain outbox — send up to 5 per tick to stay responsive
        _MqttMsg msg;
        int sent = 0;
        while (sent < 5 && xQueueReceive(_outbox, &msg, 0) == pdTRUE) {
            if (xSemaphoreTake(_clientMu, pdMS_TO_TICKS(50)) == pdTRUE) {
                _client.publish(msg.topic, msg.payload, msg.retain);
                xSemaphoreGive(_clientMu);
            }
            sent++;
        }
    }

    void _handleMessage(char* topic, uint8_t* payload, unsigned int len) {
        String msg;
        msg.reserve(len);
        for (unsigned int i = 0; i < len; i++) msg += (char)payload[i];

        String topicStr(topic);

        auto it = _subscriptions.find(topic);
        if (it != _subscriptions.end()) { it->second(topicStr, msg); return; }

        for (auto& kv : _subscriptions)
            if (_matchTopic(kv.first, topic)) kv.second(topicStr, msg);
    }

    bool _matchTopic(const std::string& pat, const std::string& topic) {
        if (pat.back() == '#')
            return topic.compare(0, pat.size()-1, pat, 0, pat.size()-1) == 0;
        if (pat.find('+') == std::string::npos) return pat == topic;
        auto pp = pat.begin(), tp = topic.begin();
        while (pp != pat.end() && tp != topic.end()) {
            if (*pp == '+') {
                while (tp != topic.end() && *tp != '/') ++tp;
                ++pp;
            } else if (*pp == *tp) { ++pp; ++tp; }
            else return false;
        }
        return pp == pat.end() && tp == topic.end();
    }

    static void _taskEntry(void* arg) {
        EasyMQTT* self = static_cast<EasyMQTT*>(arg);
        for (;;) {
            self->_tick();
            vTaskDelay(pdMS_TO_TICKS(10));
        }
    }
};
