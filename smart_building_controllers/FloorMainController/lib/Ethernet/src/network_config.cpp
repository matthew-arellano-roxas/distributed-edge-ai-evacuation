#include "network_config.h"

uint8_t mac[6] = {0x02, 0xAB, 0xCD, 0xEF, 0x12, 0x34};
IPAddress localIp(192, 168, 1, 50);
IPAddress gateway(192, 168, 1, 1);
IPAddress subnet(255, 255, 255, 0);
IPAddress dns(8, 8, 8, 8);
