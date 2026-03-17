# Building-Focused Smart Evacuation Guide

An intelligent smart building prototype that combines occupancy sensing, hazard detection, adaptive route planning, and evacuation lighting guidance.

This project is designed to help people evacuate safely by:

- detecting occupancy in building zones
- identifying unavailable or hazardous paths
- computing the shortest safe evacuation route
- updating available routes in real time
- supporting light-based evacuation guidance through the controller layer

## Project Overview

The repository contains two main parts:

### 1. `evacuation_controller`

An ESP32 + PlatformIO controller that:

- reads flame, temperature, humidity, and ultrasonic sensors
- tracks room and exit availability
- recalculates shortest evacuation paths using a graph model
- publishes route updates through MQTT
- reacts to fire events by blocking affected locations and paths

### 2. `smart_building_vision`

A Python + YOLO vision module that:

- detects and tracks people or objects in camera input
- estimates movement direction
- counts entry and exit activity
- supports occupancy-aware evacuation monitoring

## Key Features

- Real-time shortest-path evacuation routing
- Available-path and blocked-path management
- Occupancy sensing using vision and ultrasonic detection
- Fire-aware route recalculation
- MQTT-based command and telemetry messaging
- Modular structure for future multi-floor expansion

## Repository Name Suggestion

If you want a clear GitHub repository title, use:

`building-focused-smart-evacuation-guide`

Other good options:

- `smart-building-evacuation-guide`
- `intelligent-evacuation-guidance-system`
- `smart-evacuation-routing-with-occupancy`

## Architecture

Current floor graph nodes:

- `Room1`
- `Room2`
- `Room3`
- `Room4`
- `Stairs`
- `FireExit1`
- `FireExit2`

The controller chooses the nearest safe target from:

- `FireExit1`
- `FireExit2`
- `Stairs`

Routes are recalculated when:

- flame sensors detect fire
- a location is marked unavailable
- a path is marked unavailable
- occupancy-triggered route requests are made

## MQTT Topics

Command input:

- `building/commands`

Sensor outputs:

- `building/sensors/temperature`
- `building/sensors/flame`
- `building/sensors/ultrasonic`

Route outputs:

- `building/routes/Room1`
- `building/routes/Room2`
- `building/routes/Room3`
- `building/routes/Room4`

## Project Structure

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

## Getting Started

### ESP32 Controller

Requirements:

- VS Code with PlatformIO or PlatformIO Core
- ESP32 development board
- MQTT broker

Build the controller:

```bash
cd evacuation_controller
pio run
```

Upload to ESP32:

```bash
cd evacuation_controller
pio run --target upload
```

Before deployment, review the building-specific values in:

- `evacuation_controller/lib/BuildingConfig/src/building_config.h`

### Vision Module

Requirements:

- Python 3.10+
- OpenCV
- Ultralytics YOLO
- NumPy

Install dependencies:

```bash
pip install ultralytics opencv-python numpy
```

Run detection:

```bash
cd smart_building_vision
python yolo_detect.py --model my_model.pt --source usb0 --thresh 0.5 --resolution 640x480
```

## Future Improvements

- connect vision occupancy counts directly to route weighting
- drive physical directional lights from route outputs
- support multiple floors and stairwell transitions
- add dashboards for building operators
- persist evacuation events for analysis and reporting

## Status

This repository is an active prototype for a smart building evacuation guidance system focused on safe routing, path availability, occupancy awareness, and emergency light guidance.
