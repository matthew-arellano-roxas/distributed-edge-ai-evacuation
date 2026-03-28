#include "ethernet_setup.h"
#include "ESP32Easy_Ethernet.h"
#include "network_config.h"

namespace
{
EasyEthernet ethernet(W5500_CS);
}

bool setupEthernet()
{
    ethernet.onConnect([]() {
        Serial.print("Ethernet connected. IP: ");
        Serial.println(ethernet.localIP());
    });

    ethernet.onDisconnect([]() {
        Serial.println("Ethernet disconnected");
    });

    return ethernet.begin(mac, localIp, dns, gateway, subnet);
}

String ethernetIp()
{
    return ethernet.ip();
}

void ethernetLoop()
{
    ethernet.loop();
}
