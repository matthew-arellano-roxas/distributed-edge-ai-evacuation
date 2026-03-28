#pragma once
#include <Arduino.h>

#define W5500_CS 5

extern uint8_t mac[6];
extern IPAddress localIp;
extern IPAddress gateway;
extern IPAddress subnet;
extern IPAddress dns;
