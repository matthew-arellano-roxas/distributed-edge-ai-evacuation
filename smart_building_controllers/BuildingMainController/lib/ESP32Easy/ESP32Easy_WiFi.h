#pragma once
#include <WiFi.h>
#include <functional>

// ============================================================
//  ESP32Easy_WiFi.h
//  Simple WiFi connection helper
//
//  Usage:
//    EasyWiFi wifi("MySSID", "mypassword");
//    wifi.setStaticIP(IPAddress(192,168,1,50), IPAddress(192,168,1,1), IPAddress(255,255,255,0));
//    wifi.connect();
// ============================================================

class EasyWiFi {
public:
    using ConnectFn = std::function<void()>;

    EasyWiFi(const char* ssid, const char* password)
        : _ssid(ssid), _password(password) {}

    void onConnect(ConnectFn fn)    { _onConnect = fn; }
    void onDisconnect(ConnectFn fn) { _onDisconnect = fn; }

    void setStaticIP(
        const IPAddress& localIP,
        const IPAddress& gateway,
        const IPAddress& subnet,
        const IPAddress& primaryDNS = IPAddress(0, 0, 0, 0),
        const IPAddress& secondaryDNS = IPAddress(0, 0, 0, 0)) {
        _useStaticIP = true;
        _localIP = localIP;
        _gateway = gateway;
        _subnet = subnet;
        _primaryDNS = primaryDNS;
        _secondaryDNS = secondaryDNS;
    }

    void clearStaticIP() { _useStaticIP = false; }

    bool connect(uint32_t timeoutMs = 15000) {
        WiFi.mode(WIFI_STA);
        if (_useStaticIP) {
            if (!WiFi.config(_localIP, _gateway, _subnet, _primaryDNS, _secondaryDNS)) {
                return false;
            }
        } else {
            WiFi.config(INADDR_NONE, INADDR_NONE, INADDR_NONE);
        }

        WiFi.begin(_ssid, _password);

        uint32_t start = millis();
        while (WiFi.status() != WL_CONNECTED) {
            if (millis() - start > timeoutMs) return false;
            delay(250);
        }

        if (_onConnect) _onConnect();
        return true;
    }

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

    void waitUntilConnected() {
        while (!isConnected()) delay(250);
    }

private:
    const char* _ssid;
    const char* _password;
    ConnectFn   _onConnect    = nullptr;
    ConnectFn   _onDisconnect = nullptr;
    bool        _wasConnected = false;
    bool        _useStaticIP  = false;
    IPAddress   _localIP;
    IPAddress   _gateway;
    IPAddress   _subnet;
    IPAddress   _primaryDNS;
    IPAddress   _secondaryDNS;
};
