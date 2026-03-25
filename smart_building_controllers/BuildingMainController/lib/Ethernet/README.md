# Ethernet Library

Small Ethernet setup wrapper for ESP32 + W5500 using `EasyEthernet`.

## Files

- `src/network_config.h`
- `src/network_config.cpp`
- `src/ethernet_setup.h`
- `src/ethernet_setup.cpp`

## Purpose

This module keeps Ethernet configuration and startup logic out of `main.cpp`.

- `network_config.*` stores MAC and static IP settings
- `ethernet_setup.*` performs setup and exposes simple orchestration helpers

## Default W5500 Pin Mapping

Used by `EasyEthernet`:

- `CS = 5`
- `SCK = 18`
- `MISO = 19`
- `MOSI = 23`

## Static IP Configuration

Edit `src/network_config.cpp`:

```cpp
uint8_t mac[6] = {0x02, 0xAB, 0xCD, 0xEF, 0x12, 0x34};
IPAddress localIp(192, 168, 1, 50);
IPAddress gateway(192, 168, 1, 1);
IPAddress subnet(255, 255, 255, 0);
IPAddress dns(8, 8, 8, 8);
```

## Usage From main.cpp

```cpp
#include "ethernet_setup.h"

void setup() {
    Serial.begin(115200);

    if (!setupEthernet()) {
        Serial.println("Ethernet failed");
        return;
    }

    Serial.println(ethernetIp());
}

void loop() {
    ethernetLoop();
}
```

## Exposed Functions

- `bool setupEthernet()`
- `String ethernetIp()`
- `void ethernetLoop()`

## Notes

- current setup uses static IP
- `EasyEthernet` also supports DHCP if you want to switch later
- `EasyMQTT` is still WiFi-based, so Ethernet MQTT will need `EthernetClient + PubSubClient` or a future shared transport wrapper
