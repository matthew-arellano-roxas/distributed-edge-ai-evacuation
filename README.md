# Smart Building Evacuation Guidance System

An IoT, edge AI, and backend-driven prototype for smart building evacuation, hazard monitoring, and occupancy-aware response.

This project combines embedded devices, MQTT messaging, computer vision, and a TypeScript backend to simulate how a building can detect hazards, monitor occupancy, and coordinate evacuation actions in real time.

## Overview

The system is designed to:

- collect sensor readings such as flame, gas, temperature, and presence
- track occupancy using computer vision and movement analysis
- send evacuation commands to floor-level devices
- keep live state in Firebase Realtime Database
- store sensor event history in Firestore
- expose backend routes for simulation and manual control

## Main Modules

### `app/backend`

The backend service is responsible for:

- subscribing to MQTT topics
- processing sensor, occupancy, elevator, and device-status messages
- publishing evacuation and control commands
- storing latest state in Firebase Realtime Database
- storing sensor event history in Firestore
- exposing HTTP routes for simulation reset and control actions

Backend documentation:
[app/backend/README.md](c:\Users\Matthew\Videos\ai-iot-smart-building\app\backend\README.md)

### `evacuation_controller`

The ESP32 controller project is used for floor-level device behavior, including:

- reacting to evacuation commands
- publishing device and sensor data
- driving local control logic for smart evacuation behavior

### `smart_building_vision`

The computer vision module is used for:

- YOLO-based people detection
- movement and occupancy tracking
- edge-assisted monitoring workflows

## Architecture

### Device Layer

- ESP32 controllers publish sensor and control messages through MQTT
- floor devices react to evacuation actions and local hazard state

### Edge / Vision Layer

- Raspberry Pi devices process camera feeds and occupancy logic
- vision components support real-time movement and people monitoring

### Backend Layer

- the Node.js backend coordinates MQTT, API routes, Firebase, and simulation flows

### Data Layer

- Firebase Realtime Database stores latest live state
- Firestore stores event-style records such as `sensor_events`

## Example MQTT Topics

Sensor reading:

```text
building/sensors/2/room101/temperature
```

Device status:

```text
building/devices/2/esp32-temp-01
```

Evacuation action:

```text
building/evacuation/actions
```

## Repository Structure

```text
.
|-- app/
|   `-- backend/
|-- evacuation_controller/
|-- smart_building_vision/
|-- docker-compose.yaml
`-- README.md
```

## Setup After Cloning

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd ai-iot-smart-building
```

### 2. Start the MQTT broker

If you are using Docker:

```bash
docker compose up -d mqtt
```

If you already have a local broker like Mosquitto running on port `1883`, you can use that instead.

### 3. Set up the backend

```bash
cd app/backend
npm install
```

Create `app/backend/.env.development` and add your environment values:

```env
PORT=3000
MQTT_URL=mqtt://localhost:1883
REDIS_URL=redis://localhost:6379
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
FIREBASE_DATABASE_URL=https://your-project-default-rtdb.asia-southeast1.firebasedatabase.app/
```

Start the backend:

```bash
npm run dev
```

### 4. Set up the computer vision module

From the project root or inside `smart_building_vision`, install the required Python packages:

```bash
pip install ultralytics opencv-python numpy
```

To run detection, you need a YOLO model file available locally.

Example:

```bash
cd smart_building_vision
python yolo_detect.py --model my_model.pt --source usb0 --thresh 0.5 --resolution 640x480
```

Important:

- the `smart_building_vision/train/` folder is ignored and will not be cloned
- model files such as `.pt` may also be ignored depending on your `.gitignore`
- if the Raspberry Pi needs a model file for inference, copy that model separately after cloning

### 5. Set up the ESP32 controller

Requirements:

- PlatformIO
- supported ESP32 board
- access to the MQTT broker used by the backend

Basic workflow:

```bash
cd evacuation_controller
pio run
pio run --target upload
```

## Current Backend Features

- MQTT subscriptions for sensor readings, device status, occupancy, and elevator state
- evacuation trigger route
- simulation reset route for Realtime Database, Firestore, or both
- sensor alert generation for flame, gas, and high temperature
- Firestore event logging for alert-worthy sensor events

## Research Direction

This project focuses on:

- evacuation-aware smart building systems
- occupancy-informed routing
- MQTT-based distributed coordination
- edge AI and embedded integration
- simulation-driven emergency response workflows

## Future Work

- richer dashboards for occupancy, alerts, and route state
- deeper integration between backend, embedded devices, and vision modules
- expanded simulation and testing tools
- stronger route computation and failover behavior
