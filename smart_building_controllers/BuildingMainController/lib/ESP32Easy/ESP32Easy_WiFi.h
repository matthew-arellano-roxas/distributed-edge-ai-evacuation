#pragma once
#include <WiFi.h>
#include <functional>

// ============================================================
//  ESP32Easy_WiFi.h
//  Simple WiFi connection helper
//
//  Usage:
//    EasyWiFi wifi("MySSID", "mypassword");
//    wifi.connect();         // blocking connect
//    wifi.connectAsync();    // non-blocking, use in task
//
//    wifi.onConnect([]() { Serial.println("WiFi up!"); });
// ============================================================

class EasyWiFi {
public:
    using ConnectFn = std::function<void()>;

    EasyWiFi(const char* ssid, const char* password)
        : _ssid(ssid), _password(password) {}

    void onConnect(ConnectFn fn)    { _onConnect = fn; }
    void onDisconnect(ConnectFn fn) { _onDisconnect = fn; }

    // Blocking connect — waits until connected or timeout
    bool connect(uint32_t timeoutMs = 15000) {
        WiFi.mode(WIFI_STA);
        WiFi.begin(_ssid, _password);

        uint32_t start = millis();
        while (WiFi.status() != WL_CONNECTED) {
            if (millis() - start > timeoutMs) return false;
            delay(250);
        }

        if (_onConnect) _onConnect();
        return true;
    }

    // Non-blocking — call in a task loop
    void loop() {
        bool connected = WiFi.status() == WL_CONNECTED;
        if (connected && !_wasConnected) {
            _wasConnected = true;
            if (_onConnect) _onConnect();
        } else if (!connected && _wasConnected) {
            _wasConnected = false;
            WiFi.reconnect();
            if (_onDisconnect) _onDisconnect();
        }
    }

    bool isConnected() { return WiFi.status() == WL_CONNECTED; }
    String ip()        { return WiFi.localIP().toString(); }
    int rssi()         { return WiFi.RSSI(); }

    // Block until connected (use inside a task)
    void waitUntilConnected() {
        while (!isConnected()) delay(250);
    }

private:
    const char* _ssid;
    const char* _password;
    ConnectFn   _onConnect    = nullptr;
    ConnectFn   _onDisconnect = nullptr;
    bool        _wasConnected = false;
};
