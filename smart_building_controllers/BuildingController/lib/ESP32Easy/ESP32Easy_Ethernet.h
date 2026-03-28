#pragma once
#include <Arduino.h>
#include <Ethernet.h>
#include <functional>

class EasyEthernet {
public:
    using ConnectFn = std::function<void()>;

    explicit EasyEthernet(uint8_t csPin)
        : _csPin(csPin) {}

    void onConnect(ConnectFn fn) { _onConnect = fn; }
    void onDisconnect(ConnectFn fn) { _onDisconnect = fn; }

    bool begin(
        uint8_t* mac,
        const IPAddress& localIp,
        const IPAddress& dns,
        const IPAddress& gateway,
        const IPAddress& subnet) {
        Ethernet.init(_csPin);
        Ethernet.begin(mac, localIp, dns, gateway, subnet);
        _wasConnected = isConnected();
        if (_wasConnected && _onConnect) {
            _onConnect();
        }
        return _wasConnected;
    }

    void loop() {
        const bool connected = isConnected();
        if (connected && !_wasConnected) {
            _wasConnected = true;
            if (_onConnect) _onConnect();
        } else if (!connected && _wasConnected) {
            _wasConnected = false;
            if (_onDisconnect) _onDisconnect();
        }
    }

    bool isConnected() const {
        return Ethernet.hardwareStatus() != EthernetNoHardware &&
               Ethernet.linkStatus() == LinkON;
    }

    IPAddress localIP() const { return Ethernet.localIP(); }
    String ip() const { return Ethernet.localIP().toString(); }

private:
    uint8_t   _csPin;
    ConnectFn _onConnect = nullptr;
    ConnectFn _onDisconnect = nullptr;
    bool      _wasConnected = false;
};
