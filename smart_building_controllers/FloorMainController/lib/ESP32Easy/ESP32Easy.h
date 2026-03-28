#pragma once

// ============================================================
//  ESP32Easy.h — All-in-one include
//
//  Drop the ESP32Easy/ folder into your project's lib/ directory.
//  PlatformIO will find it automatically. Dependencies are declared
//  in library.json and installed automatically on first build.
//
//  USAGE — include what you need:
//
//  Option A: everything
//    #include "ESP32Easy.h"
//
//  Option B: only what you use (faster compile, no extra deps)
//    #include "ESP32Easy_Task.h"   // EasyTask, EasyMutex, EasySemaphore
//    #include "ESP32Easy_Mux.h"    // EasyMux for 16-channel analog/digital muxes
//    #include "ESP32Easy_Queue.h"  // EasyQueue<T>
//    #include "ESP32Easy_WiFi.h"   // EasyWiFi
//    #include "ESP32Easy_Ethernet.h" // EasyEthernet for W5500
//    #include "ESP32Easy_MQTT.h"   // EasyMQTT  (needs PubSubClient + ArduinoJson)
//
//  Option C: disable MQTT in the all-in-one include
//    #define EASY_NO_MQTT
//    #include "ESP32Easy.h"
// ============================================================

#include "ESP32Easy_Task.h"
#include "ESP32Easy_Mux.h"
#include "ESP32Easy_Queue.h"
#include "ESP32Easy_WiFi.h"
#include "ESP32Easy_Ethernet.h"

#ifndef EASY_NO_MQTT
  #include "ESP32Easy_MQTT.h"
#endif
