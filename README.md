# Smart Building Evacuation Guidance System

An IoT, edge AI, and backend-driven smart building prototype for evacuation guidance, occupancy awareness, and hazard response.

The repository combines embedded devices, computer vision, MQTT communication, and a Node.js backend to simulate and coordinate evacuation behavior in a building environment.

## What The System Does

- reads building sensor data such as flame, gas, temperature, and presence
- tracks occupancy with computer vision and floor-level updates
- sends evacuation commands through MQTT
- stores latest device and sensor state in Firebase Realtime Database
- stores sensor event history in Firestore
- exposes backend routes for simulation control and evacuation actions
- supports floor-level ESP32 controllers and central coordination logic

## Main Repository Modules

### `app/backend`

TypeScript backend that:

- subscribes to MQTT topics
- processes sensor, occupancy, elevator, and device-status messages
- stores realtime state in Firebase Realtime Database
- stores `sensor_events` history in Firestore
- exposes HTTP routes for simulation reset and evacuation control

### `evacuation_controller`

ESP32 controller project that:

- handles local floor logic
- can react to evacuation commands
- integrates with MQTT-based communication
- is intended for embedded actuation and route guidance behavior

### `smart_building_vision`

Python computer vision module that:

- runs YOLO-based people detection
- tracks movement and occupancy-related behavior
- supports edge-assisted monitoring workflows

## High-Level Architecture

### Device Layer

- ESP32 controllers publish sensor and control data
- floor-level devices react to evacuation actions

### Edge / Vision Layer

- Raspberry Pi devices process camera feeds and occupancy logic

### Backend Layer

- Node.js backend coordinates MQTT, API routes, Firebase, and simulation workflows

### Data Layer

- Firebase Realtime Database stores latest live state
- Firestore stores event-oriented history such as `sensor_events`

## Current Backend Capabilities

- MQTT subscriptions for sensor readings, device status, occupancy, and elevator state
- evacuation trigger route
- simulation reset route for Realtime Database, Firestore, or both
- sensor alert generation for flame, gas, and high temperature
- Firestore event logging for alert-worthy sensor events

## Repository Structure

```text
.
|-- app/
|   `-- backend/
|-- evacuation_controller/
|-- smart_building_vision/
`-- README.md
```

## MQTT Examples

Sensor reading:

```text
building/sensors/2/room101/temperature
```

Device status:

```text
building/devices/2/esp32-temp-01
```

## Backend Quick Start

```bash
cd app/backend
npm install
npm run dev
```

See [app/backend/README.md](/c:/Users/Matthew/Videos/ai-iot-smart-building/app/backend/README.md) for backend setup details.

## Research Focus

This project is aimed at:

- evacuation-aware smart building control
- occupancy-informed routing
- edge AI and IoT integration
- MQTT-based distributed coordination
- simulation and emergency-response workflows

## Future Work

- richer dashboards for occupancy, alerts, and route state
- deeper integration between backend, embedded devices, and vision modules
- expanded testing and simulation tooling
- stronger route computation and failover logic

