# Smart Building Evacuation Guidance System

An IoT and computer vision research prototype for intelligent building evacuation.

This system is built to guide people to safety during emergencies by combining occupancy monitoring, shortest-path routing, real-time path availability, floor-level controllers, backup power awareness, and light-based evacuation guidance.

## Why This Project Stands Out

This is not just a sensor demo. It is a full smart-building safety concept that combines:

- embedded systems
- IoT messaging with MQTT
- edge devices across multiple floors
- computer vision for occupancy detection
- real-time evacuation logic
- backend and app-based monitoring
- infrastructure exposure through NGINX

It reflects the kind of work used in real-world automation, safety systems, edge computing, and smart infrastructure platforms.

## What The Prototype Does

- Guides occupants using evacuation lights and floor-level actions
- Finds the shortest safe evacuation route
- Reroutes people when a path becomes blocked or unavailable
- Tracks available and unavailable exits or connections
- Monitors occupancy per floor
- Uses camera-based detection to estimate occupancy in real time
- Supports alternative power operation during outages
- Sends commands and updates through MQTT across devices
- Allows monitoring and control through an application layer

## System Architecture

### Floor Layer

Each floor uses an `ESP32` controller to:

- read local sensors
- control floor actions
- react to evacuation commands
- help drive smart evacuation guidance such as light direction or route indication

Each floor also uses a `Raspberry Pi Zero 2 W` to:

- receive RTSP camera streams
- support floor-level edge camera processing and communication

### Main / Ground Floor Layer

A `Raspberry Pi 5` acts as the central intelligence node and is responsible for:

- occupancy management
- people detection
- optional recognition logic
- publishing and coordinating MQTT messages
- sending commands to ESP32 and Raspberry Pi Zero 2 W devices

### Platform Layer

The wider system also includes:

- a `Node.js` server as the main backend publisher and coordinator
- a database layer for future or ongoing persistence work
- an application interface for monitoring and command control
- `NGINX` to expose backend API endpoints online for frontend access

## Technologies Used

### Embedded and Edge

- `ESP32`
- `Raspberry Pi Zero 2 W`
- `Raspberry Pi 5`
- `PlatformIO`
- `Arduino framework`
- `C++`

### Vision and Occupancy

- `Python`
- `OpenCV`
- `Ultralytics YOLO`
- RTSP camera streaming
- occupancy detection and floor-level monitoring

### Backend and Connectivity

- `Node.js`
- `MQTT`
- REST API architecture
- `NGINX`
- planned or in-progress database integration

### Engineering Areas Demonstrated

- embedded programming
- distributed device communication
- smart routing logic
- safety-focused system design
- edge AI / computer vision
- multi-device orchestration
- backend integration

## Evacuation Logic

The evacuation workflow is designed to adapt in real time:

1. Sensors and cameras collect occupancy and hazard data.
2. ESP32 controllers report local floor conditions.
3. The central system evaluates blocked, unavailable, or safe paths.
4. The routing logic selects the shortest available evacuation route.
5. Floor controllers guide people through lights and local control actions.
6. If a path becomes unavailable, the system recalculates and republishes a new route.

This allows the prototype to respond dynamically instead of relying on a fixed static evacuation map.

## Current Repository Contents

This repository currently contains the core prototype modules below:

```text
.
|-- evacuation_controller/
|   |-- src/
|   |-- lib/
|   `-- platformio.ini
|-- smart_building_vision/
|   |-- yolo_detect.py
|   |-- yolo_tracking.py
|   |-- yolo_ui.py
|   `-- yolo_config.py
`-- README.md
```

## Main Modules In This Repo

### `evacuation_controller`

An ESP32-based controller that:

- reads flame, temperature, humidity, and ultrasonic sensors
- models floor routes as a graph
- recalculates shortest evacuation routes
- blocks unsafe locations automatically
- receives and reacts to MQTT commands
- publishes route updates for each room or zone

### `smart_building_vision`

A Python-based occupancy and detection module that:

- runs YOLO-based detection
- tracks motion direction
- estimates entering and exiting activity
- supports floor occupancy awareness
- can be extended for recognition workflows

## MQTT-Centered Communication

MQTT is used as the messaging backbone of the prototype.

It enables:

- controller-to-server communication
- command publishing from the main node
- route updates to floor devices
- sensor and occupancy telemetry
- coordination between ESP32, Raspberry Pi devices, and backend services

## Example Engineering Value For Employers

This project demonstrates experience in:

- building systems that combine hardware and software
- designing real-time safety and automation logic
- integrating embedded devices with backend infrastructure
- working with edge AI and occupancy analytics
- coordinating multi-floor device communication
- preparing systems that can scale toward production-grade building monitoring

## Getting Started

### ESP32 Controller

Requirements:

- `PlatformIO`
- ESP32 development board
- MQTT broker

Build:

```bash
cd evacuation_controller
pio run
```

Upload:

```bash
cd evacuation_controller
pio run --target upload
```

### Vision Module

Requirements:

- Python 3.10+
- `opencv-python`
- `ultralytics`
- `numpy`

Install:

```bash
pip install ultralytics opencv-python numpy
```

Run:

```bash
cd smart_building_vision
python yolo_detect.py --model my_model.pt --source usb0 --thresh 0.5 --resolution 640x480
```

## Research Direction

This prototype is part of a smart building research effort focused on:

- safer emergency evacuation
- occupancy-aware routing
- resilient operation during power interruptions
- intelligent route guidance using floor lights and controllers
- practical integration of embedded systems, AI, and web infrastructure

## Future Expansion

- direct app dashboards for floor-by-floor occupancy and route state
- stronger recognition and analytics features on Raspberry Pi 5
- database-backed event history and reporting
- alternative power state monitoring and failover automation
- multi-floor unified evacuation visualization

## Suggested Repository Subtitle

If you want a strong GitHub subtitle, use:

`IoT, computer vision, and MQTT-based smart building evacuation with occupancy-aware route guidance`
