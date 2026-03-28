#pragma once

// ─────────────────────────────────────────────
// TertiaryESP32Pins.h
// Pin definitions for esp32-tertiary-f1
// Edit these to match your physical wiring
// ─────────────────────────────────────────────

// Stepper motor — ULN2003 (28BYJ-48)
#define STEPPER_IN1_PIN 19
#define STEPPER_IN2_PIN 21
#define STEPPER_IN3_PIN 22
#define STEPPER_IN4_PIN 23

// Elevator door — LN298N DC motor
#define ELEVATOR_DOOR_IN1_PIN 25
#define ELEVATOR_DOOR_IN2_PIN 26
#define ELEVATOR_DOOR_ENA_PIN 27

// Emergency exit door servos
#define SERVO1_PIN 13
#define SERVO2_PIN 12
#define SERVO3_PIN 14
#define SERVO4_PIN 4
#define SERVO5_PIN 5

// Buzzer
#define BUZZER_PIN 18

// Mist relay
#define MIST_RELAY_PIN 32

// Evacuation button
#define EVACUATION_BUTTON_PIN 33